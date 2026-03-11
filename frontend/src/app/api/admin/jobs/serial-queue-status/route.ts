import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { withCache, buildCacheKey } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 8_000;
const SERIAL_SERVICES = ['faturamento', 'repasses', 'repasse_consolidacao'] as const;
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

const SERVICE_PAGE_MAP: Record<SerialServiceName, PageKey> = {
  faturamento: 'financeiro',
  repasses: 'repasses',
  repasse_consolidacao: 'repasses',
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

const normalizeDbDate = (raw: string | null): number => {
  if (!raw) return 0;
  const iso = String(raw).replace(' ', 'T');
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    const userId = String(session.user.id);
    const role = String((session.user as any)?.role || 'OPERADOR').toUpperCase();
    const db = getDbConnection();
    const matrix = await loadUserPermissionMatrix(db, userId, role);

    const { searchParams } = new URL(request.url);
    const requestedServices = normalizeServices(searchParams.get('services'));
    const visibleServices = requestedServices.filter((service) =>
      hasPermission(matrix, SERVICE_PAGE_MAP[service], 'view', role)
    );

    if (visibleServices.length === 0) {
      return NextResponse.json({ error: 'Sem permissao para consultar status da fila.' }, { status: 403 });
    }

    const key = buildCacheKey(
      'admin',
      `${request.url}|u=${userId}|s=${visibleServices.join(',')}`
    );

    const data = await withCache(key, CACHE_TTL_MS, async () => {
      const placeholders = visibleServices.map(() => '?').join(', ');
      const rows = await db.query(
        `
        SELECT service_name, status, last_run, details
        FROM system_status
        WHERE service_name IN (${placeholders})
        `,
        visibleServices
      );

      const byService = new Map<string, { status: string; lastRun: string | null; details: string }>();
      for (const row of rows || []) {
        const serviceName = String((row as any).service_name || '').trim().toLowerCase();
        if (!serviceName) continue;
        byService.set(serviceName, {
          status: String((row as any).status || 'UNKNOWN').trim().toUpperCase(),
          lastRun: String((row as any).last_run || '').trim() || null,
          details: String((row as any).details || '').trim(),
        });
      }

      const queueCandidates = visibleServices
        .map((serviceName) => {
          const record = byService.get(serviceName) || {
            status: 'UNKNOWN',
            lastRun: null,
            details: '',
          };
          return {
            serviceName,
            ...record,
          };
        })
        .filter((item) => isQueueActiveStatus(item.status))
        .sort((a, b) => {
          const aRunning = a.status === 'RUNNING' ? 0 : 1;
          const bRunning = b.status === 'RUNNING' ? 0 : 1;
          if (aRunning !== bRunning) return aRunning - bRunning;
          return normalizeDbDate(a.lastRun) - normalizeDbDate(b.lastRun);
        });

      const queueSize = queueCandidates.length;
      const positionMap = new Map<string, number>();
      queueCandidates.forEach((item, index) => positionMap.set(item.serviceName, index + 1));

      const services: QueueServiceRow[] = visibleServices.map((serviceName) => {
        const record = byService.get(serviceName) || {
          status: 'UNKNOWN',
          lastRun: null,
          details: '',
        };
        const status = record.status;
        const position = positionMap.get(serviceName) ?? null;
        const isRunning = status === 'RUNNING';
        const isQueued = status === 'QUEUED' || status === 'PENDING';
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
  } catch (error: any) {
    console.error('Erro ao consultar fila serial de scrapers:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao consultar fila serial.' },
      { status: Number(error?.status) || 500 }
    );
  }
}

