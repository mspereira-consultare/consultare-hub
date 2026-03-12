import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 30 * 60 * 1000;
const WON_STATUSES = ['executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago'];

function parseNumber(value: any) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildBaseWhere(
  startDate: string,
  endDate: string,
  unitFilter: string | null,
  statusFilter: string | null,
  includeStatus = true,
) {
  let where = 'WHERE date BETWEEN ? AND ?';
  const params: any[] = [startDate, endDate];

  if (unitFilter && unitFilter !== 'all') {
    where += ' AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))';
    params.push(unitFilter);
  }

  if (includeStatus && statusFilter && statusFilter !== 'all') {
    where += " AND LOWER(TRIM(COALESCE(status, ''))) = LOWER(TRIM(?))";
    params.push(statusFilter);
  }

  return { where, params };
}

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const { searchParams } = new URL(request.url);
      const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
      const endDate = searchParams.get('endDate') || startDate;
      const unitFilter = searchParams.get('unit');
      const statusFilter = searchParams.get('status') || 'all';

      const db = getDbConnection();

      const summaryBase = buildBaseWhere(startDate, endDate, unitFilter, statusFilter, true);
      const wonInSql = WON_STATUSES.map(() => '?').join(',');
      const summaryRows = await db.query(
        `
          SELECT
            COUNT(*) as qtd,
            COALESCE(SUM(total_value), 0) as valor,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN 1 ELSE 0 END), 0) as won_qtd,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN total_value ELSE 0 END), 0) as won_value,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'aguardando aprovação do cliente' THEN total_value ELSE 0 END), 0) as awaiting_client_approval_value,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'aprovada pelo cliente' THEN total_value ELSE 0 END), 0) as approved_by_client_value,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'rejeitada pelo cliente' THEN total_value ELSE 0 END), 0) as rejected_by_client_value
          FROM feegow_proposals
          ${summaryBase.where}
        `,
        [...WON_STATUSES, ...WON_STATUSES, ...summaryBase.params],
      );

      const rawSummary = summaryRows[0] || {};
      const summary = {
        qtd: parseNumber(rawSummary.qtd),
        valor: parseNumber(rawSummary.valor),
        wonValue: parseNumber(rawSummary.won_value),
        wonQtd: parseNumber(rawSummary.won_qtd),
        awaitingClientApprovalValue: parseNumber(rawSummary.awaiting_client_approval_value),
        approvedByClientValue: parseNumber(rawSummary.approved_by_client_value),
        rejectedByClientValue: parseNumber(rawSummary.rejected_by_client_value),
        lostValue: parseNumber(rawSummary.rejected_by_client_value),
      };

      const unitBase = buildBaseWhere(startDate, endDate, unitFilter, statusFilter, true);
      const byUnit = await db.query(
        `
          SELECT
            unit_name,
            status,
            COUNT(*) as qtd,
            COALESCE(SUM(total_value), 0) as valor
          FROM feegow_proposals
          ${unitBase.where}
          GROUP BY unit_name, status
          ORDER BY unit_name, valor DESC
        `,
        unitBase.params,
      );

      const proposerBase = buildBaseWhere(startDate, endDate, unitFilter, statusFilter, true);
      const byProposer = await db.query(
        `
          SELECT
            professional_name,
            COUNT(*) as qtd,
            COALESCE(SUM(total_value), 0) as valor,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN 1 ELSE 0 END), 0) as qtd_executado,
            COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN total_value ELSE 0 END), 0) as valor_executado
          FROM feegow_proposals
          ${proposerBase.where}
          GROUP BY professional_name
          ORDER BY valor DESC
        `,
        [...WON_STATUSES, ...WON_STATUSES, ...proposerBase.params],
      );

      const availableStatusesBase = buildBaseWhere(startDate, endDate, unitFilter, null, false);
      const availableStatusesRows = await db.query(
        `
          SELECT DISTINCT TRIM(status) as status
          FROM feegow_proposals
          ${availableStatusesBase.where}
            AND status IS NOT NULL
            AND TRIM(status) <> ''
          ORDER BY status
        `,
        availableStatusesBase.params,
      );
      const availableStatuses = availableStatusesRows
        .map((row: any) => String(row?.status || '').trim())
        .filter(Boolean);

      const statusResult = await db.query(`
        SELECT status, last_run, details
        FROM system_status
        WHERE service_name = 'comercial'
      `);
      const heartbeat = statusResult[0] || { status: 'UNKNOWN', last_run: null, details: '' };

      return {
        summary,
        byUnit,
        byProposer,
        availableStatuses,
        heartbeat,
      };
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error('Erro API Propostas:', error);
    return NextResponse.json({ error: error.message }, { status: error?.status || 500 });
  }
}

export async function POST() {
  try {
    const db = getDbConnection();
    await db.execute(`
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES ('comercial', 'PENDING', datetime('now'), 'Solicitado via painel')
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'PENDING',
        details = 'Solicitado via painel',
        last_run = datetime('now')
    `);
    invalidateCache('admin:');
    return NextResponse.json({ success: true, message: 'Atualização solicitada' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error?.status || 500 });
  }
}
