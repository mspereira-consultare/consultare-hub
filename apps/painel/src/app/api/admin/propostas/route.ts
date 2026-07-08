import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';
import { ensureProposalsSupportTables, normalizeProposalFilters } from '@/lib/proposals/repository';
import { AWAITING_CLIENT_APPROVAL_STATUS, PROPOSAL_WON_STATUSES } from '@/lib/proposals/constants';
import { requirePropostasGerencialPermission, requirePropostasPermission } from '@/lib/proposals/auth';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 30 * 60 * 1000;
const REJECTED_STATUS = 'Rejeitada pelo cliente';
const APPROVED_STATUS = 'Aprovada pelo cliente';

type ActorTypeFilter = 'all' | 'collaborator' | 'professional';
type ProposalActorType = 'COLLABORATOR' | 'PROFESSIONAL';

type AggregateRow = {
  professional_name: string | null;
  unit_name: string | null;
  status: string | null;
  qtd: number;
  valor: number;
  actorType: ProposalActorType;
};

type ProposalAggregateDbRow = {
  professional_name?: string | null;
  unit_name?: string | null;
  status?: string | null;
  qtd?: number | string | null;
  valor?: number | string | null;
};

type NameRow = {
  full_name?: string | null;
  name?: string | null;
};

type HeartbeatRow = {
  status?: string | null;
  last_run?: string | null;
  details?: string | null;
};

type SellerAggregate = {
  professional_name: string | null;
  qtd: number;
  valor: number;
  qtd_executado: number;
  valor_executado: number;
  actorType: ProposalActorType;
};

function parseNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const normalizeNameKey = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();

const normalizeActorTypeFilter = (value: string | null): ActorTypeFilter => {
  const normalized = lower(value);
  if (normalized === 'collaborator' || normalized === 'professional') return normalized;
  return 'all';
};

const toActorType = (
  professionalName: string | null,
  collaboratorNames: Set<string>,
  professionalNames: Set<string>,
): ProposalActorType => {
  const normalized = normalizeNameKey(professionalName);
  if (normalized && collaboratorNames.has(normalized)) return 'COLLABORATOR';
  if (normalized && professionalNames.has(normalized)) return 'PROFESSIONAL';
  return 'PROFESSIONAL';
};

const actorTypeMatches = (value: ProposalActorType, filter: ActorTypeFilter) => {
  if (filter === 'all') return true;
  if (filter === 'collaborator') return value === 'COLLABORATOR';
  return value === 'PROFESSIONAL';
};

const isWonStatus = (status: string | null) => PROPOSAL_WON_STATUSES.includes(lower(status) as (typeof PROPOSAL_WON_STATUSES)[number]);
const isApprovedStatus = (status: string | null) => lower(status) === lower(APPROVED_STATUS);
const isRejectedStatus = (status: string | null) => lower(status) === lower(REJECTED_STATUS);
const isAwaitingClientApprovalStatus = (status: string | null) => lower(status) === lower(AWAITING_CLIENT_APPROVAL_STATUS);

const filterAggregates = (
  rows: AggregateRow[],
  filters: {
    actorType: ActorTypeFilter;
    unit?: string;
    status?: string;
  },
) => {
  const unitFilter = lower(filters.unit || 'all');
  const statusFilter = lower(filters.status || 'all');

  return rows.filter((row) => {
    if (!actorTypeMatches(row.actorType, filters.actorType)) return false;
    if (unitFilter !== 'all' && lower(row.unit_name) !== unitFilter) return false;
    if (statusFilter !== 'all' && lower(row.status) !== statusFilter) return false;
    return true;
  });
};

const buildSummary = (rows: AggregateRow[]) => {
  let qtd = 0;
  let valor = 0;
  let wonQtd = 0;
  let wonValue = 0;
  let awaitingClientApprovalQtd = 0;
  let awaitingClientApprovalValue = 0;
  let approvedByClientQtd = 0;
  let approvedByClientValue = 0;
  let rejectedByClientQtd = 0;
  let rejectedByClientValue = 0;

  for (const row of rows) {
    qtd += row.qtd;
    valor += row.valor;

    if (isWonStatus(row.status)) {
      wonQtd += row.qtd;
      wonValue += row.valor;
    }
    if (isAwaitingClientApprovalStatus(row.status)) {
      awaitingClientApprovalQtd += row.qtd;
      awaitingClientApprovalValue += row.valor;
    }
    if (isApprovedStatus(row.status)) {
      approvedByClientQtd += row.qtd;
      approvedByClientValue += row.valor;
    }
    if (isRejectedStatus(row.status)) {
      rejectedByClientQtd += row.qtd;
      rejectedByClientValue += row.valor;
    }
  }

  return {
    qtd,
    valor,
    wonValue,
    wonQtd,
    lostValue: rejectedByClientValue,
    conversionRate: valor > 0 ? (wonValue / valor) * 100 : 0,
    awaitingClientApprovalQtd,
    awaitingClientApprovalValue,
    approvedByClientQtd,
    approvedByClientValue,
    rejectedByClientQtd,
    rejectedByClientValue,
  };
};

const buildSellerRows = (rows: AggregateRow[]): SellerAggregate[] => {
  const grouped = new Map<string, SellerAggregate>();

  for (const row of rows) {
    const key = `${row.actorType}::${clean(row.professional_name) || '__system__'}`;
    const current = grouped.get(key) || {
      professional_name: clean(row.professional_name) || null,
      qtd: 0,
      valor: 0,
      qtd_executado: 0,
      valor_executado: 0,
      actorType: row.actorType,
    };

    current.qtd += row.qtd;
    current.valor += row.valor;
    if (isWonStatus(row.status)) {
      current.qtd_executado += row.qtd;
      current.valor_executado += row.valor;
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values()).sort((left, right) => right.valor - left.valor);
};

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
const getErrorStatus = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isFinite(status)) return status;
  }
  return 500;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  return fallback;
};

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasGerencialPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const { searchParams } = new URL(request.url);
      const filters = normalizeProposalFilters(searchParams);
      const actorTypeFilter = normalizeActorTypeFilter(searchParams.get('actorType'));

      const db = getDbConnection();
      await ensureProposalsSupportTables(db);

      const [aggregateRows, employeeRows, professionalRows, statusRows] = await Promise.all([
        db.query(
          `
            SELECT
              TRIM(COALESCE(professional_name, '')) AS professional_name,
              TRIM(COALESCE(unit_name, '')) AS unit_name,
              TRIM(COALESCE(status, '')) AS status,
              COUNT(*) AS qtd,
              COALESCE(SUM(total_value), 0) AS valor
            FROM feegow_proposals
            WHERE date BETWEEN ? AND ?
            GROUP BY professional_name, unit_name, status
          `,
          [filters.startDate, filters.endDate],
        ),
        db.query(`SELECT full_name FROM employees`),
        db.query(`SELECT name FROM professionals`),
        db.query(`
          SELECT status, last_run, details
          FROM system_status
          WHERE service_name = 'comercial'
        `),
      ]);

      const collaboratorNames = new Set((employeeRows as NameRow[]).map((row) => normalizeNameKey(row?.full_name)).filter(Boolean));
      const professionalNames = new Set((professionalRows as NameRow[]).map((row) => normalizeNameKey(row?.name)).filter(Boolean));

      const classifiedRows = (aggregateRows as ProposalAggregateDbRow[]).map((row) => {
        const professionalName = clean(row?.professional_name) || null;
        return {
          professional_name: professionalName,
          unit_name: clean(row?.unit_name) || null,
          status: clean(row?.status) || null,
          qtd: parseNumber(row?.qtd),
          valor: parseNumber(row?.valor),
          actorType: toActorType(professionalName, collaboratorNames, professionalNames),
        } satisfies AggregateRow;
      });

      const rowsForUnits = filterAggregates(classifiedRows, {
        actorType: actorTypeFilter,
        status: filters.status,
      });
      const rowsForStatuses = filterAggregates(classifiedRows, {
        actorType: actorTypeFilter,
        unit: filters.unit,
      });
      const filteredRows = filterAggregates(classifiedRows, {
        actorType: actorTypeFilter,
        unit: filters.unit,
        status: filters.status,
      });

      const availableUnits = uniqueSorted(rowsForUnits.map((row) => clean(row.unit_name)));
      const availableStatuses = uniqueSorted(rowsForStatuses.map((row) => clean(row.status)));
      const byUnit = filteredRows.map((row) => ({
        unit_name: row.unit_name,
        status: row.status,
        qtd: row.qtd,
        valor: row.valor,
      }));
      const byProposer = buildSellerRows(filteredRows);
      const summary = buildSummary(filteredRows);
      const heartbeat = ((statusRows[0] as HeartbeatRow | undefined) || { status: 'UNKNOWN', last_run: null, details: '' });

      return {
        summary,
        byUnit,
        byProposer,
        availableUnits,
        availableStatuses,
        heartbeat,
      };
    });

    return NextResponse.json(cached);
  } catch (error: unknown) {
    console.error('Erro API Propostas:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Erro ao carregar propostas.') }, { status: getErrorStatus(error) });
  }
}

export async function POST() {
  try {
    let auth = await requirePropostasPermission('refresh');
    if (!auth.ok) {
      auth = await requirePropostasGerencialPermission('refresh');
    }
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const db = auth.db ?? getDbConnection();
    await upsertSystemStatus(db, {
      serviceName: 'comercial',
      status: 'PENDING',
      details: 'Solicitado via painel',
    });
    invalidateCache('admin:');
    return NextResponse.json({ success: true, message: 'Atualização solicitada' });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Erro ao solicitar atualização.') }, { status: getErrorStatus(error) });
  }
}
