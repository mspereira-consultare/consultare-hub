import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { withCache, buildCacheKey } from '@/lib/api_cache';
import { pickEffectiveSystemStatus } from '@/lib/system_status_health';
import { parseSystemStatusTimestamp } from '@/lib/system_status_time';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 8_000;
const SERIAL_SERVICES = ['faturamento', 'repasses', 'repasse_consolidacao', 'comercial'] as const;
type SerialServiceName = (typeof SERIAL_SERVICES)[number];

type QueueServiceRow = {
  serviceName: SerialServiceName;
  status: string;
  lastRun: string | null;
  details: string;
  position: number | null;
  queueSize: number;
  isRunning: boolean;
  isQueued: boolean;
};

type SessionUserShape = {
  role?: string | null;
};

type SystemStatusRow = {
  service_name?: string | null;
  status?: string | null;
  last_run?: string | null;
  details?: string | null;
};

const SERVICE_PAGE_MAP: Record<SerialServiceName, PageKey[]> = {
  faturamento: ['financeiro', 'propostas_pos_consulta'],
  repasses: ['repasses'],
  repasse_consolidacao: ['repasses'],
  comercial: ['propostas', 'propostas_pos_consulta'],
};
const SERVICE_ALIASES: Partial<Record<SerialServiceName, string[]>> = {
  faturamento: ['worker_faturamento_scraping'],
  comercial: ['propostas'],
};

const normalizeServices = (raw: string | null): SerialServiceName[] => {
  const input = String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set(SERIAL_SERVICES);
  const selected = input.filter((item): item is SerialServiceName => allowed.has(item as SerialServiceName));
  const dedup = Array.from(new Set(selected));
  return dedup.length > 0 ? dedup : [...SERIAL_SERVICES];
};

const isQueueActiveStatus = (status: string) => ['RUNNING', 'QUEUED', 'PENDING'].includes(status);

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    const userId = String(session.user.id);
    const sessionUser = session.user as SessionUserShape;
    const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
    const db = getDbConnection();
    const matrix = await loadUserPermissionMatrix(db, userId, role);

    const { searchParams } = new URL(request.url);
    const requestedServices = normalizeServices(searchParams.get('services'));
    const visibleServices = requestedServices.filter((service) =>
      SERVICE_PAGE_MAP[service].some((page) => hasPermission(matrix, page, 'view', role))
    );

    if (visibleServices.length === 0) {
      return NextResponse.json({ error: 'Sem permissao para consultar status da fila.' }, { status: 403 });
    }

    const key = buildCacheKey(
      'admin',
      `${request.url}|u=${userId}|s=${visibleServices.join(',')}`
    );

    const data = await withCache(key, CACHE_TTL_MS, async () => {
      const queryServices = Array.from(
        new Set(visibleServices.flatMap((service) => [service, ...(SERVICE_ALIASES[service] || [])])),
      );
      const placeholders = queryServices.map(() => '?').join(', ');
      const rows = await db.query(
        `
        SELECT service_name, status, last_run, details
        FROM system_status
        WHERE service_name IN (${placeholders})
        `,
        queryServices
      );

      const aliasToCanonical = new Map<string, SerialServiceName>();
      for (const service of visibleServices) {
        aliasToCanonical.set(service, service);
        for (const alias of SERVICE_ALIASES[service] || []) {
          aliasToCanonical.set(alias, service);
        }
      }

      const grouped = new Map<SerialServiceName, Array<{ serviceName: string; status: string; lastRun: string | null; details: string }>>();
      for (const row of rows as SystemStatusRow[]) {
        const rawServiceName = String(row.service_name || '').trim().toLowerCase();
        const serviceName = aliasToCanonical.get(rawServiceName);
        if (!serviceName) continue;
        const current = grouped.get(serviceName) || [];
        current.push({
          serviceName,
          status: String(row.status || 'UNKNOWN').trim().toUpperCase(),
          lastRun: String(row.last_run || '').trim() || null,
          details: String(row.details || '').trim(),
        });
        grouped.set(serviceName, current);
      }

      const byService = new Map<string, { status: string; lastRun: string | null; details: string; isActive: boolean }>();
      for (const serviceName of visibleServices) {
        const effective = pickEffectiveSystemStatus(grouped.get(serviceName) || [{ serviceName, status: 'UNKNOWN', lastRun: null, details: '' }]);
        byService.set(serviceName, {
          status: effective.status,
          lastRun: effective.lastRun,
          details: effective.details,
          isActive: effective.isActive,
        });
      }

      const queueCandidates = visibleServices
        .map((serviceName) => {
          const record = byService.get(serviceName) || {
            status: 'UNKNOWN',
            lastRun: null,
            details: '',
            isActive: false,
          };
          return {
            serviceName,
            ...record,
          };
        })
        .filter((item) => item.isActive && isQueueActiveStatus(item.status))
        .sort((a, b) => {
          const aRunning = a.status === 'RUNNING' ? 0 : 1;
          const bRunning = b.status === 'RUNNING' ? 0 : 1;
          if (aRunning !== bRunning) return aRunning - bRunning;
          return (parseSystemStatusTimestamp(a.lastRun)?.getTime() || 0) - (parseSystemStatusTimestamp(b.lastRun)?.getTime() || 0);
        });

      const queueSize = queueCandidates.length;
      const positionMap = new Map<string, number>();
      queueCandidates.forEach((item, index) => positionMap.set(item.serviceName, index + 1));

      const services: QueueServiceRow[] = visibleServices.map((serviceName) => {
        const record = byService.get(serviceName) || {
          status: 'UNKNOWN',
          lastRun: null,
          details: '',
          isActive: false,
        };
        const status = record.status;
        const position = positionMap.get(serviceName) ?? null;
        const isRunning = record.isActive && status === 'RUNNING';
        const isQueued = record.isActive && (status === 'QUEUED' || status === 'PENDING');
        return {
          serviceName,
          status,
          lastRun: record.lastRun,
          details: record.details,
          position,
          queueSize,
          isRunning,
          isQueued,
        };
      });

      return {
        global: {
          queueSize,
          active: queueSize > 0,
          orderedServices: queueCandidates.map((item) => item.serviceName),
        },
        services,
      };
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao consultar fila serial de scrapers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao consultar fila serial.' },
      {
        status:
          typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500,
      }
    );
  }
}
