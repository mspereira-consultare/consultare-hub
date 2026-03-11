import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import type {
  RepasseAConferirLine,
  RepasseConsolidacaoBooleanFilter,
  RepasseConsolidacaoJob,
  RepasseConsolidacaoJobInput,
  RepasseConsolidacaoLineMark,
  RepasseConsolidacaoLineMarkColor,
  RepasseConsolidacaoMarkLegend,
  RepasseConsolidacaoProfessionalListFilters,
  RepasseConsolidacaoProfessionalListResult,
  RepasseConsolidacaoProfessionalStatus,
  RepasseConsolidacaoStatusFilter,
  RepasseConsolidacaoScope,
  RepasseJobListFilters,
  RepassePdfArtifact,
  RepassePdfArtifactListFilters,
  RepasseProfessionalListFilters,
  RepasseProfessionalListResult,
  RepasseProfessionalOption,
  RepasseProfessionalSummary,
  RepassePdfJob,
  RepassePdfJobInput,
  RepassePdfScope,
  RepasseSyncScope,
  RepasseSyncJob,
  RepasseSyncJobInput,
} from '@/lib/repasses/types';

export class RepasseValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let repasseTablesEnsured = false;
let repasseConsolidacaoTablesEnsured = false;

const nowIso = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const textTypes = new Set(['tinytext', 'text', 'mediumtext', 'longtext']);
const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const buildRequestedByUserJoin = (jobAlias: string) =>
  isMysqlProvider()
    ? `CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_bin = CONVERT(${jobAlias}.requested_by USING utf8mb4) COLLATE utf8mb4_bin`
    : `u.id = ${jobAlias}.requested_by`;

const readCount = (row: any): number => {
  if (!row || typeof row !== 'object') return 0;
  if (row.total !== undefined) return Number(row.total) || 0;
  const key = Object.keys(row).find((k) => /count|total/i.test(k));
  return key ? Number((row as any)[key]) || 0 : 0;
};

const previousMonthRef = () => {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = prev.getUTCFullYear();
  const month = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const normalizePeriodRef = (value?: unknown) => {
  const raw = clean(value);
  if (!raw) return previousMonthRef();
  const normalized = raw.match(/^(\d{4})-(\d{2})$/);
  if (!normalized) {
    throw new RepasseValidationError('Periodo invalido. Use o formato YYYY-MM.');
  }
  const month = Number(normalized[2]);
  if (month < 1 || month > 12) {
    throw new RepasseValidationError('Mes invalido no periodo informado.');
  }
  return `${normalized[1]}-${normalized[2]}`;
};

const normalizeLimit = (value: unknown, fallback = 20) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
};

const normalizeOptionLimit = (value: unknown, fallback = 500) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(3000, Math.floor(n)));
};

const normalizePage = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
};

const normalizeScope = (value: unknown): RepassePdfScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi' || raw === 'all_with_data') {
    return raw;
  }
  return 'all_with_data';
};

const normalizeSyncScope = (value: unknown, hasProfessionalIds: boolean): RepasseSyncScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  if (raw === 'all') return 'all';
  return hasProfessionalIds ? 'multi' : 'all';
};

const normalizeConsolidacaoScope = (
  value: unknown,
  hasProfessionalIds: boolean
): RepasseConsolidacaoScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  if (raw === 'all') return 'all';
  return hasProfessionalIds ? 'multi' : 'all';
};

const normalizeProfessionalIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const id = clean(item);
    if (id) unique.add(id);
  }
  return Array.from(unique);
};

const parseProfessionalIdsJson = (value: unknown): string[] => {
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeProfessionalIds(parsed);
  } catch {
    return [];
  }
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_DUP_KEYNAME' ||
      /duplicate/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const mapSyncJob = (row: any): RepasseSyncJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeSyncScope(row.scope, parseProfessionalIdsJson(row.professional_ids_json).length > 0),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepasseSyncJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPdfJob = (row: any): RepassePdfJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeScope(row.scope),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepassePdfJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapConsolidacaoJob = (row: any): RepasseConsolidacaoJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeConsolidacaoScope(
    row.scope,
    parseProfessionalIdsJson(row.professional_ids_json).length > 0
  ),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepasseConsolidacaoJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPdfArtifact = (row: any): RepassePdfArtifact => ({
  id: clean(row.id),
  pdfJobId: clean(row.pdf_job_id),
  periodRef: clean(row.period_ref),
  professionalId: clean(row.professional_id),
  professionalName: clean(row.professional_name),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  fileName: clean(row.file_name),
  sizeBytes: Number(row.size_bytes) || 0,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const normalizeProfessionalStatusFilter = (
  value: unknown
): RepasseProfessionalListFilters['status'] => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'success' ||
    raw === 'no_data' ||
    raw === 'error' ||
    raw === 'not_processed' ||
    raw === 'all'
  ) {
    return raw;
  }
  return 'all';
};

const mapProfessionalStatus = (
  rowStatus: string | null | undefined
): RepasseProfessionalSummary['status'] => {
  const normalized = clean(rowStatus).toUpperCase();
  if (normalized === 'SUCCESS') return 'SUCCESS';
  if (normalized === 'NO_DATA') return 'NO_DATA';
  if (normalized === 'ERROR') return 'ERROR';
  return 'NOT_PROCESSED';
};

const normalizeConsolidacaoProfessionalStatusFilter = (
  value: unknown
): RepasseConsolidacaoProfessionalListFilters['status'] => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'success' ||
    raw === 'no_data' ||
    raw === 'skipped' ||
    raw === 'error' ||
    raw === 'not_processed' ||
    raw === 'all'
  ) {
    return raw;
  }
  return 'all';
};

const normalizeConsolidacaoStatusFilter = (
  value: unknown
): RepasseConsolidacaoStatusFilter => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'all' ||
    raw === 'consolidado' ||
    raw === 'nao_consolidado' ||
    raw === 'nao_recebido'
  ) {
    return raw;
  }
  return 'all';
};

const normalizeBooleanFilter = (value: unknown): RepasseConsolidacaoBooleanFilter => {
  const raw = clean(value).toLowerCase();
  if (raw === 'yes' || raw === 'no' || raw === 'all') return raw;
  return 'all';
};

const normalizeIsoDate = (value: unknown): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new RepasseValidationError('Data invalida. Use o formato YYYY-MM-DD.');
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const normalizeTextKey = (value: unknown): string =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

const normalizeBrDate = (value: unknown): string => {
  const raw = clean(value);
  if (!raw) return '';
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
};

const buildConsolidadoMatchKey = (
  executionDate: unknown,
  patientName: unknown,
  procedureName: unknown
): string => `${normalizeBrDate(executionDate)}|${normalizeTextKey(patientName)}|${normalizeTextKey(procedureName)}`;

const getDateExpr = (column: string): string =>
  isMysqlProvider()
    ? `STR_TO_DATE(${column}, '%d/%m/%Y')`
    : `date(substr(${column}, 7, 4) || '-' || substr(${column}, 4, 2) || '-' || substr(${column}, 1, 2))`;

const mapConsolidacaoProfessionalStatus = (
  rowStatus: string | null | undefined
): RepasseConsolidacaoProfessionalStatus => {
  const normalized = clean(rowStatus).toUpperCase();
  if (normalized === 'SUCCESS') return 'SUCCESS';
  if (normalized === 'NO_DATA') return 'NO_DATA';
  if (normalized === 'SKIPPED_NOT_IN_FILTER' || normalized === 'SKIPPED_AMBIGUOUS_NAME') {
    return 'SKIPPED';
  }
  if (normalized === 'ERROR') return 'ERROR';
  return 'NOT_PROCESSED';
};

const normalizeLineMarkColor = (value: unknown): RepasseConsolidacaoLineMarkColor | null => {
  const raw = clean(value).toLowerCase();
  if (raw === 'green' || raw === 'yellow' || raw === 'red') return raw;
  return null;
};

const loadRepasseProfessionalSummaries = async (
  db: DbInterface,
  input: { periodRef: string; search: string }
): Promise<{ items: RepasseProfessionalSummary[]; stats: RepasseProfessionalListResult['stats'] }> => {
  const periodRef = normalizePeriodRef(input.periodRef);
  const search = clean(input.search);

  const where: string[] = ['is_active = 1'];
  const whereParams: any[] = [];
  if (search) {
    where.push('UPPER(name) LIKE ?');
    whereParams.push(`%${search.toUpperCase()}%`);
  }

  const professionals = await db.query(
    `
    SELECT id, name, payment_minimum_text
    FROM professionals
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC
    `,
    whereParams
  );

  const repasseWhere: string[] = ['period_ref = ?', 'is_active = 1'];
  const repasseWhereParams: any[] = [periodRef];
  if (search) {
    repasseWhere.push('UPPER(professional_name) LIKE ?');
    repasseWhereParams.push(`%${search.toUpperCase()}%`);
  }
  const repasseProfessionals = await db.query(
    `
    SELECT DISTINCT professional_id, professional_name
    FROM feegow_repasse_consolidado
    WHERE ${repasseWhere.join(' AND ')}
    `,
    repasseWhereParams
  );

  const professionalMap = new Map<string, string>();
  const paymentMinimumByProfessional = new Map<string, string | null>();
  for (const row of professionals) {
    const id = clean((row as any).id);
    const name = clean((row as any).name);
    if (!id || !name) continue;
    professionalMap.set(id, name);
    paymentMinimumByProfessional.set(id, clean((row as any).payment_minimum_text) || null);
  }
  for (const row of repasseProfessionals) {
    const id = clean((row as any).professional_id);
    const name = clean((row as any).professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  const professionalPairs = Array.from(professionalMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));
  professionalPairs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const professionalIds = professionalPairs.map((pair) => pair.id);

  const aggregateByProfessional = new Map<
    string,
    { rowsCount: number; totalValue: number }
  >();
  const latestByProfessional = new Map<
    string,
    { status: RepasseProfessionalSummary['status']; errorMessage: string | null; updatedAt: string | null }
  >();
  const noteByProfessional = new Map<string, string | null>();
  const latestPdfByProfessional = new Map<
    string,
    { createdAt: string | null; artifactId: string | null }
  >();

  if (professionalIds.length > 0) {
    const placeholders = professionalIds.map(() => '?').join(', ');

    const aggregateRows = await db.query(
      `
      SELECT professional_id, COUNT(*) as rows_count, COALESCE(SUM(repasse_value), 0) as total_value
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds]
    );

    for (const row of aggregateRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      aggregateByProfessional.set(id, {
        rowsCount: Number((row as any).rows_count) || 0,
        totalValue: Number((row as any).total_value) || 0,
      });
    }

    const latestRows = await db.query(
      `
      SELECT
        i.professional_id,
        i.status,
        i.error_message,
        i.updated_at,
        j.created_at as job_created_at
      FROM repasse_sync_job_items i
      INNER JOIN repasse_sync_jobs j ON j.id = i.job_id
      WHERE j.period_ref = ?
        AND i.professional_id IN (${placeholders})
      ORDER BY j.created_at DESC, i.updated_at DESC
      `,
      [periodRef, ...professionalIds]
    );

    for (const row of latestRows) {
      const id = clean((row as any).professional_id);
      if (!id || latestByProfessional.has(id)) continue;
      latestByProfessional.set(id, {
        status: mapProfessionalStatus((row as any).status),
        errorMessage: clean((row as any).error_message) || null,
        updatedAt: clean((row as any).updated_at) || null,
      });
    }

    const noteRows = await db.query(
      `
      SELECT professional_id, note
      FROM repasse_professional_notes
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of noteRows) {
      noteByProfessional.set(clean((row as any).professional_id), clean((row as any).note) || null);
    }

    const latestPdfRows = await db.query(
      `
      SELECT a.professional_id, a.id as artifact_id, a.created_at
      FROM repasse_pdf_artifacts a
      INNER JOIN (
        SELECT professional_id, MAX(created_at) as max_created_at
        FROM repasse_pdf_artifacts
        WHERE period_ref = ?
          AND professional_id IN (${placeholders})
        GROUP BY professional_id
      ) latest
        ON latest.professional_id = a.professional_id
       AND latest.max_created_at = a.created_at
      WHERE a.period_ref = ?
      `,
      [periodRef, ...professionalIds, periodRef]
    );
    for (const row of latestPdfRows) {
      const professionalId = clean((row as any).professional_id);
      if (!professionalId || latestPdfByProfessional.has(professionalId)) continue;
      latestPdfByProfessional.set(professionalId, {
        createdAt: clean((row as any).created_at) || null,
        artifactId: clean((row as any).artifact_id) || null,
      });
    }
  }

  const items: RepasseProfessionalSummary[] = professionalPairs.map((pair) => {
    const professionalId = pair.id;
    const professionalName = pair.name;
    const aggregate = aggregateByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
    };
    const latest = latestByProfessional.get(professionalId);

    const status = latest?.status
      ? latest.status
      : aggregate.rowsCount > 0
        ? 'SUCCESS'
        : 'NOT_PROCESSED';

    return {
      professionalId,
      professionalName,
      status,
      rowsCount: aggregate.rowsCount,
      totalValue: aggregate.totalValue,
      lastProcessedAt: latest?.updatedAt || null,
      errorMessage: status === 'ERROR' ? latest?.errorMessage || null : null,
      note: noteByProfessional.get(professionalId) || null,
      paymentMinimumText: paymentMinimumByProfessional.get(professionalId) || null,
      lastPdfAt: latestPdfByProfessional.get(professionalId)?.createdAt || null,
      lastPdfArtifactId: latestPdfByProfessional.get(professionalId)?.artifactId || null,
    };
  });

  const stats = items.reduce(
    (acc, item) => {
      acc.totalRows += item.rowsCount;
      acc.totalValue += item.totalValue;

      if (item.status === 'SUCCESS') acc.success += 1;
      else if (item.status === 'NO_DATA') acc.noData += 1;
      else if (item.status === 'ERROR') acc.error += 1;
      else acc.notProcessed += 1;

      return acc;
    },
    {
      totalProfessionals: items.length,
      success: 0,
      noData: 0,
      error: 0,
      notProcessed: 0,
      totalRows: 0,
      totalValue: 0,
    }
  );

  return { items, stats };
};

const loadRepasseConsolidacaoProfessionalSummaries = async (
  db: DbInterface,
  input: {
    periodRef: string;
    search: string;
    hasPaymentMinimum: RepasseConsolidacaoBooleanFilter;
    consolidacaoStatus: RepasseConsolidacaoStatusFilter;
    hasDivergence: RepasseConsolidacaoBooleanFilter;
    attendanceDateStart: string | null;
    attendanceDateEnd: string | null;
    patientName: string;
  }
): Promise<{
  items: RepasseConsolidacaoProfessionalListResult['items'];
  stats: RepasseConsolidacaoProfessionalListResult['stats'];
}> => {
  const periodRef = normalizePeriodRef(input.periodRef);
  const search = clean(input.search);
  const hasPaymentMinimumFilter = normalizeBooleanFilter(input.hasPaymentMinimum);
  const consolidacaoStatusFilter = normalizeConsolidacaoStatusFilter(input.consolidacaoStatus);
  const hasDivergenceFilter = normalizeBooleanFilter(input.hasDivergence);
  const attendanceDateStart = input.attendanceDateStart ? normalizeIsoDate(input.attendanceDateStart) : null;
  const attendanceDateEnd = input.attendanceDateEnd ? normalizeIsoDate(input.attendanceDateEnd) : null;
  const patientName = clean(input.patientName);

  if (attendanceDateStart && attendanceDateEnd && attendanceDateStart > attendanceDateEnd) {
    throw new RepasseValidationError('Data inicial maior que a data final nos filtros.');
  }

  const where: string[] = ['is_active = 1'];
  const whereParams: any[] = [];
  if (search) {
    where.push('UPPER(name) LIKE ?');
    whereParams.push(`%${search.toUpperCase()}%`);
  }

  const professionals = await db.query(
    `
    SELECT id, name, payment_minimum_text
    FROM professionals
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC
    `,
    whereParams
  );

  const repasseWhere: string[] = ['period_ref = ?', 'is_active = 1'];
  const repasseWhereParams: any[] = [periodRef];
  if (search) {
    repasseWhere.push('UPPER(professional_name) LIKE ?');
    repasseWhereParams.push(`%${search.toUpperCase()}%`);
  }
  if (patientName) {
    repasseWhere.push('UPPER(patient_name) LIKE ?');
    repasseWhereParams.push(`%${patientName.toUpperCase()}%`);
  }
  if (attendanceDateStart) {
    repasseWhere.push(`${getDateExpr('execution_date')} >= ?`);
    repasseWhereParams.push(attendanceDateStart);
  }
  if (attendanceDateEnd) {
    repasseWhere.push(`${getDateExpr('execution_date')} <= ?`);
    repasseWhereParams.push(attendanceDateEnd);
  }

  const repasseProfessionals = await db.query(
    `
    SELECT DISTINCT professional_id, professional_name
    FROM feegow_repasse_a_conferir
    WHERE ${repasseWhere.join(' AND ')}
    `,
    repasseWhereParams
  );

  const professionalMap = new Map<string, string>();
  const paymentMinimumByProfessional = new Map<string, string | null>();
  for (const row of professionals) {
    const id = clean((row as any).id);
    const name = clean((row as any).name);
    if (!id || !name) continue;
    professionalMap.set(id, name);
    paymentMinimumByProfessional.set(id, clean((row as any).payment_minimum_text) || null);
  }
  for (const row of repasseProfessionals) {
    const id = clean((row as any).professional_id);
    const name = clean((row as any).professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  let professionalPairs = Array.from(professionalMap.entries()).map(([id, name]) => ({ id, name }));
  const hasLineFilter = Boolean(patientName || attendanceDateStart || attendanceDateEnd);
  if (hasLineFilter) {
    const eligibleByLine = new Set(
      repasseProfessionals
        .map((row) => clean((row as any).professional_id))
        .filter(Boolean)
    );
    professionalPairs = professionalPairs.filter((pair) => eligibleByLine.has(pair.id));
  }
  professionalPairs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const professionalIds = professionalPairs.map((pair) => pair.id);

  const aggregateByProfessional = new Map<
    string,
    {
      rowsCount: number;
      totalValue: number;
      consolidadoQty: number;
      consolidadoValue: number;
      naoConsolidadoQty: number;
      naoConsolidadoValue: number;
      naoRecebidoQty: number;
      naoRecebidoValue: number;
    }
  >();
  const totalConsolidadoTabelaByProfessional = new Map<string, number>();
  const latestByProfessional = new Map<
    string,
    { status: RepasseConsolidacaoProfessionalStatus; errorMessage: string | null; updatedAt: string | null }
  >();
  const noteByProfessional = new Map<string, { note: string | null; internalNote: string | null }>();

  if (professionalIds.length > 0) {
    const placeholders = professionalIds.map(() => '?').join(', ');
    const lineFilterClauses: string[] = [];
    const lineFilterParams: any[] = [];
    if (patientName) {
      lineFilterClauses.push('UPPER(patient_name) LIKE ?');
      lineFilterParams.push(`%${patientName.toUpperCase()}%`);
    }
    if (attendanceDateStart) {
      lineFilterClauses.push(`${getDateExpr('execution_date')} >= ?`);
      lineFilterParams.push(attendanceDateStart);
    }
    if (attendanceDateEnd) {
      lineFilterClauses.push(`${getDateExpr('execution_date')} <= ?`);
      lineFilterParams.push(attendanceDateEnd);
    }

    const aggregateRows = await db.query(
      `
      SELECT
        professional_id,
        COUNT(*) as rows_count,
        COALESCE(SUM(detail_repasse_value), 0) as total_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN 1 ELSE 0 END), 0) as consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN detail_repasse_value ELSE 0 END), 0) as consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('OUTRO', 'SEM_DETALHE') THEN 1 ELSE 0 END), 0) as nao_consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('OUTRO', 'SEM_DETALHE') THEN detail_repasse_value ELSE 0 END), 0) as nao_consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN 1 ELSE 0 END), 0) as nao_recebido_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN detail_repasse_value ELSE 0 END), 0) as nao_recebido_value
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        ${lineFilterClauses.length ? `AND ${lineFilterClauses.join(' AND ')}` : ''}
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...lineFilterParams]
    );
    for (const row of aggregateRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      aggregateByProfessional.set(id, {
        rowsCount: Number((row as any).rows_count) || 0,
        totalValue: Number((row as any).total_value) || 0,
        consolidadoQty: Number((row as any).consolidado_qty) || 0,
        consolidadoValue: Number((row as any).consolidado_value) || 0,
        naoConsolidadoQty: Number((row as any).nao_consolidado_qty) || 0,
        naoConsolidadoValue: Number((row as any).nao_consolidado_value) || 0,
        naoRecebidoQty: Number((row as any).nao_recebido_qty) || 0,
        naoRecebidoValue: Number((row as any).nao_recebido_value) || 0,
      });
    }

    const consolidadoWhereClauses: string[] = [];
    const consolidadoWhereParams: any[] = [];
    if (patientName) {
      consolidadoWhereClauses.push('UPPER(paciente) LIKE ?');
      consolidadoWhereParams.push(`%${patientName.toUpperCase()}%`);
    }
    if (attendanceDateStart) {
      consolidadoWhereClauses.push(`${getDateExpr('data_exec')} >= ?`);
      consolidadoWhereParams.push(attendanceDateStart);
    }
    if (attendanceDateEnd) {
      consolidadoWhereClauses.push(`${getDateExpr('data_exec')} <= ?`);
      consolidadoWhereParams.push(attendanceDateEnd);
    }

    const totalConsolidadoRows = await db.query(
      `
      SELECT
        professional_id,
        COALESCE(SUM(repasse_value), 0) as total_consolidado
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        ${consolidadoWhereClauses.length ? `AND ${consolidadoWhereClauses.join(' AND ')}` : ''}
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...consolidadoWhereParams]
    );
    for (const row of totalConsolidadoRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      totalConsolidadoTabelaByProfessional.set(id, Number((row as any).total_consolidado) || 0);
    }

    const latestRows = await db.query(
      `
      SELECT
        i.professional_id,
        i.status,
        i.error_message,
        i.updated_at,
        j.created_at as job_created_at
      FROM repasse_consolidacao_job_items i
      INNER JOIN repasse_consolidacao_jobs j ON j.id = i.job_id
      WHERE j.period_ref = ?
        AND i.professional_id IN (${placeholders})
      ORDER BY j.created_at DESC, i.updated_at DESC
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of latestRows) {
      const id = clean((row as any).professional_id);
      if (!id || latestByProfessional.has(id)) continue;
      latestByProfessional.set(id, {
        status: mapConsolidacaoProfessionalStatus((row as any).status),
        errorMessage: clean((row as any).error_message) || null,
        updatedAt: clean((row as any).updated_at) || null,
      });
    }

    const noteRows = await db.query(
      `
      SELECT professional_id, note, internal_note
      FROM repasse_consolidacao_notes
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of noteRows) {
      noteByProfessional.set(clean((row as any).professional_id), {
        note: clean((row as any).note) || null,
        internalNote: clean((row as any).internal_note) || null,
      });
    }
  }

  const items = professionalPairs.map((pair) => {
    const professionalId = pair.id;
    const professionalName = pair.name;
    const aggregate = aggregateByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
    };
    const latest = latestByProfessional.get(professionalId);

    const status = latest?.status
      ? latest.status
      : aggregate.rowsCount > 0
        ? 'SUCCESS'
        : 'NOT_PROCESSED';
    const repasseTotalConsolidadoTabela = totalConsolidadoTabelaByProfessional.get(professionalId) || 0;
    const repasseTotalConsolidadoAConferir = aggregate.consolidadoValue;
    const divergenciaValue = repasseTotalConsolidadoTabela - repasseTotalConsolidadoAConferir;
    const hasDivergencia = Math.abs(divergenciaValue) > 0.01;

    return {
      professionalId,
      professionalName,
      status,
      rowsCount: aggregate.rowsCount,
      totalValue: aggregate.totalValue,
      consolidadoQty: aggregate.consolidadoQty,
      consolidadoValue: aggregate.consolidadoValue,
      naoConsolidadoQty: aggregate.naoConsolidadoQty,
      naoConsolidadoValue: aggregate.naoConsolidadoValue,
      naoRecebidoQty: aggregate.naoRecebidoQty,
      naoRecebidoValue: aggregate.naoRecebidoValue,
      repasseTotalConsolidadoTabela,
      repasseTotalConsolidadoAConferir,
      hasDivergencia,
      divergenciaValue,
      lastProcessedAt: latest?.updatedAt || null,
      errorMessage: status === 'ERROR' ? latest?.errorMessage || null : null,
      note: noteByProfessional.get(professionalId)?.note || null,
      internalNote: noteByProfessional.get(professionalId)?.internalNote || null,
      paymentMinimumText: paymentMinimumByProfessional.get(professionalId) || null,
    };
  });

  let filteredItems = items;
  if (hasPaymentMinimumFilter === 'yes') {
    filteredItems = filteredItems.filter((item) => Boolean(clean(item.paymentMinimumText)));
  } else if (hasPaymentMinimumFilter === 'no') {
    filteredItems = filteredItems.filter((item) => !clean(item.paymentMinimumText));
  }

  if (consolidacaoStatusFilter === 'consolidado') {
    filteredItems = filteredItems.filter((item) => item.consolidadoQty > 0);
  } else if (consolidacaoStatusFilter === 'nao_consolidado') {
    filteredItems = filteredItems.filter((item) => item.naoConsolidadoQty > 0);
  } else if (consolidacaoStatusFilter === 'nao_recebido') {
    filteredItems = filteredItems.filter((item) => item.naoRecebidoQty > 0);
  }

  if (hasDivergenceFilter === 'yes') {
    filteredItems = filteredItems.filter((item) => item.hasDivergencia);
  } else if (hasDivergenceFilter === 'no') {
    filteredItems = filteredItems.filter((item) => !item.hasDivergencia);
  }

  const stats = filteredItems.reduce(
    (acc, item) => {
      acc.totalRows += item.rowsCount;
      acc.totalValue += item.totalValue;
      acc.consolidadoQty += item.consolidadoQty;
      acc.consolidadoValue += item.consolidadoValue;
      acc.naoConsolidadoQty += item.naoConsolidadoQty;
      acc.naoConsolidadoValue += item.naoConsolidadoValue;
      acc.naoRecebidoQty += item.naoRecebidoQty;
      acc.naoRecebidoValue += item.naoRecebidoValue;
      if (item.hasDivergencia) acc.divergenceCount += 1;
      if (item.status === 'SUCCESS') acc.success += 1;
      else if (item.status === 'NO_DATA') acc.noData += 1;
      else if (item.status === 'SKIPPED') acc.skipped += 1;
      else if (item.status === 'ERROR') acc.error += 1;
      else acc.notProcessed += 1;
      return acc;
    },
    {
      totalProfessionals: filteredItems.length,
      success: 0,
      noData: 0,
      skipped: 0,
      error: 0,
      notProcessed: 0,
      totalRows: 0,
      totalValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
      divergenceCount: 0,
    }
  );

  return { items: filteredItems, stats };
};

export const ensureRepasseTables = async (db: DbInterface) => {
  if (repasseTablesEnsured) return;

  const ensureMysqlColumnDefinition = async (
    tableName: string,
    columnName: string,
    definitionSql: string
  ) => {
    if (!isMysqlProvider()) return;
    const rows = await db.query(
      `
      SELECT DATA_TYPE as data_type, COLUMN_TYPE as column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows?.[0] as any;
    if (!row) return;
    const dataType = clean(row.data_type).toLowerCase();
    const currentType = clean(row.column_type).toLowerCase();
    const targetType = clean(definitionSql).toLowerCase();
    if (currentType === targetType) return;
    if (textTypes.has(dataType) || !currentType.startsWith(targetType.split(' ')[0])) {
      await db.execute(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definitionSql}`);
    }
  };

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_repasse_consolidado (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      data_exec VARCHAR(32) NOT NULL,
      paciente VARCHAR(180) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      funcao VARCHAR(120) NOT NULL,
      convenio VARCHAR(180) NOT NULL,
      repasse_value DECIMAL(14,2) NOT NULL,
      source_row_hash VARCHAR(64) NOT NULL UNIQUE,
      is_active INTEGER NOT NULL,
      last_job_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidado_period_prof ON feegow_repasse_consolidado(period_ref, professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidado_data_exec ON feegow_repasse_consolidado(data_exec)`
  );
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'professional_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'source_row_hash', 'VARCHAR(64) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_period ON repasse_sync_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_status ON repasse_sync_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_created ON repasse_sync_jobs(created_at)`);
  await safeExecute(db, `ALTER TABLE repasse_sync_jobs ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'all'`);
  await safeExecute(db, `ALTER TABLE repasse_sync_jobs ADD COLUMN professional_ids_json TEXT`);
  await ensureMysqlColumnDefinition('repasse_sync_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_sync_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rows_count INTEGER NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      error_message TEXT,
      duration_ms INTEGER,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_job ON repasse_sync_job_items(job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_prof ON repasse_sync_job_items(professional_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_status ON repasse_sync_job_items(status)`);
  await ensureMysqlColumnDefinition('repasse_sync_job_items', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_sync_job_items', 'job_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'repasse_sync_job_items',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_professional_notes (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      note TEXT,
      internal_note TEXT,
      updated_by VARCHAR(64) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id)
    )
  `);
  await safeExecute(
    db,
    `ALTER TABLE repasse_professional_notes ADD COLUMN internal_note TEXT NULL`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_prof_notes_prof ON repasse_professional_notes(professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_period ON repasse_pdf_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_status ON repasse_pdf_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_created ON repasse_pdf_jobs(created_at)`);
  await ensureMysqlColumnDefinition('repasse_pdf_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_pdf_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_artifacts (
      id VARCHAR(64) PRIMARY KEY,
      pdf_job_id VARCHAR(64) NOT NULL,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_job ON repasse_pdf_artifacts(pdf_job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_prof ON repasse_pdf_artifacts(professional_id)`);
  await ensureMysqlColumnDefinition('repasse_pdf_artifacts', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_pdf_artifacts', 'pdf_job_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'repasse_pdf_artifacts',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  repasseTablesEnsured = true;
};

export const ensureRepasseConsolidacaoTables = async (db: DbInterface) => {
  if (repasseConsolidacaoTablesEnsured) return;

  const ensureMysqlColumnDefinition = async (
    tableName: string,
    columnName: string,
    definitionSql: string
  ) => {
    if (!isMysqlProvider()) return;
    const rows = await db.query(
      `
      SELECT DATA_TYPE as data_type, COLUMN_TYPE as column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows?.[0] as any;
    if (!row) return;
    const dataType = clean(row.data_type).toLowerCase();
    const currentType = clean(row.column_type).toLowerCase();
    const targetType = clean(definitionSql).toLowerCase();
    if (currentType === targetType) return;
    if (textTypes.has(dataType) || !currentType.startsWith(targetType.split(' ')[0])) {
      await db.execute(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definitionSql}`);
    }
  };

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_repasse_a_conferir (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      invoice_id VARCHAR(64),
      execution_date VARCHAR(32),
      patient_name VARCHAR(180),
      unit_name VARCHAR(120),
      account_date VARCHAR(32),
      requester_name VARCHAR(180),
      specialty_name VARCHAR(180),
      procedure_name VARCHAR(255),
      attendance_value DECIMAL(14,2) NOT NULL,
      detail_status VARCHAR(32),
      detail_status_text VARCHAR(255),
      role_code VARCHAR(32),
      role_name VARCHAR(120),
      detail_professional_name VARCHAR(180),
      detail_repasse_value DECIMAL(14,2) NOT NULL,
      executante_option_value VARCHAR(64),
      executante_option_title VARCHAR(255),
      source_row_hash VARCHAR(64) NOT NULL UNIQUE,
      is_active INTEGER NOT NULL,
      last_job_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_period_prof ON feegow_repasse_a_conferir(period_ref, professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_exec_date ON feegow_repasse_a_conferir(execution_date)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_status ON feegow_repasse_a_conferir(detail_status)`
  );
  await ensureMysqlColumnDefinition('feegow_repasse_a_conferir', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'feegow_repasse_a_conferir',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'feegow_repasse_a_conferir',
    'source_row_hash',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_period ON repasse_consolidacao_jobs(period_ref)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_status ON repasse_consolidacao_jobs(status)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_created ON repasse_consolidacao_jobs(created_at)`
  );
  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_jobs ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'all'`
  );
  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_jobs ADD COLUMN professional_ids_json TEXT`
  );
  await ensureMysqlColumnDefinition('repasse_consolidacao_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_consolidacao_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      status VARCHAR(40) NOT NULL,
      rows_count INTEGER NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      error_message TEXT,
      duration_ms INTEGER,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_job ON repasse_consolidacao_job_items(job_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_prof ON repasse_consolidacao_job_items(professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_status ON repasse_consolidacao_job_items(status)`
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'job_id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_notes (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      note TEXT,
      internal_note TEXT,
      updated_by VARCHAR(64) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id)
    )
  `);

  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_notes ADD COLUMN internal_note TEXT NULL`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_notes_prof ON repasse_consolidacao_notes(professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_line_marks (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      source_row_hash VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      color_key VARCHAR(16) NOT NULL,
      note TEXT,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id, source_row_hash, user_id)
    )
  `);
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_line_marks_user ON repasse_consolidacao_line_marks(user_id, updated_at)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_line_marks_period_prof ON repasse_consolidacao_line_marks(period_ref, professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_mark_legends (
      user_id VARCHAR(64) NOT NULL,
      color_key VARCHAR(16) NOT NULL,
      label VARCHAR(120) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (user_id, color_key)
    )
  `);
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_legends_updated ON repasse_consolidacao_mark_legends(updated_at)`
  );

  repasseConsolidacaoTablesEnsured = true;
};

export const createRepasseSyncJob = async (
  db: DbInterface,
  input: RepasseSyncJobInput,
  actorUserId: string
): Promise<RepasseSyncJob> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  const scope = normalizeSyncScope(input?.scope, professionalIds.length > 0);
  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }
  if (scope === 'single' && professionalIds.length !== 1) {
    throw new RepasseValidationError('Escopo single exige exatamente um profissional.');
  }
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_sync_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by, started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_sync_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapSyncJob(rows[0]);
};

export const listRepasseSyncJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepasseSyncJob[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_sync_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_sync_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapSyncJob),
    total: readCount(countRows[0]),
  };
};

export const createRepassePdfJob = async (
  db: DbInterface,
  input: RepassePdfJobInput,
  actorUserId: string
): Promise<RepassePdfJob> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const scope = normalizeScope(input?.scope);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }

  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_pdf_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by,
      started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapPdfJob(rows[0]);
};

export const listRepassePdfJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepassePdfJob[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_pdf_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_pdf_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapPdfJob),
    total: readCount(countRows[0]),
  };
};

export const listRepasseProfessionalSummaries = async (
  db: DbInterface,
  filters: RepasseProfessionalListFilters = {}
): Promise<RepasseProfessionalListResult> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeProfessionalStatusFilter(filters.status);
  const page = normalizePage(filters.page);
  const pageSize = normalizeLimit(filters.pageSize, 50);

  const loaded = await loadRepasseProfessionalSummaries(db, { periodRef, search });
  const allItems = loaded.items;
  const stats = loaded.stats;

  const filteredItems =
    statusFilter === 'all'
      ? allItems
      : allItems.filter((item) => item.status.toLowerCase() === statusFilter);

  const total = filteredItems.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filteredItems.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
    stats,
  };
};

export const listRepasseProfessionalIds = async (
  db: DbInterface,
  filters: Pick<RepasseProfessionalListFilters, 'periodRef' | 'search' | 'status'> = {}
): Promise<string[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeProfessionalStatusFilter(filters.status);

  const loaded = await loadRepasseProfessionalSummaries(db, { periodRef, search });
  const filteredItems =
    statusFilter === 'all'
      ? loaded.items
      : loaded.items.filter((item) => item.status.toLowerCase() === statusFilter);
  return filteredItems.map((item) => item.professionalId);
};

export const listRepasseProfessionalOptions = async (
  db: DbInterface,
  input: { search?: string; limit?: number } = {}
): Promise<RepasseProfessionalOption[]> => {
  await ensureRepasseTables(db);
  const search = clean(input.search);
  const limit = normalizeOptionLimit(input.limit, 500);
  const searchPattern = `%${search.toUpperCase()}%`;

  const rows = await db.query(
    `
    SELECT professional_id, professional_name
    FROM (
      SELECT id as professional_id, name as professional_name
      FROM professionals
      WHERE is_active = 1
        AND (? = '' OR UPPER(name) LIKE ?)
      UNION
      SELECT professional_id, professional_name
      FROM feegow_repasse_consolidado
      WHERE is_active = 1
        AND (? = '' OR UPPER(professional_name) LIKE ?)
    ) unioned
    ORDER BY professional_name ASC
    LIMIT ?
    `,
    [search, searchPattern, search, searchPattern, limit]
  );

  return rows
    .map((row) => ({
      professionalId: clean((row as any).professional_id),
      professionalName: clean((row as any).professional_name),
    }))
    .filter((row) => row.professionalId && row.professionalName);
};

export const upsertRepasseProfessionalNote = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    note?: string | null;
    internalNote?: string | null;
  },
  actorUserId: string
): Promise<{
  periodRef: string;
  professionalId: string;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
}> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    throw new RepasseValidationError('Profissional invalido para salvar observacao.');
  }
  const hasNote = Object.prototype.hasOwnProperty.call(input, 'note');
  const hasInternalNote = Object.prototype.hasOwnProperty.call(input, 'internalNote');
  if (!hasNote && !hasInternalNote) {
    throw new RepasseValidationError(
      'Informe ao menos um campo para atualizacao (note ou internalNote).'
    );
  }

  const currentRows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_professional_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  const current = (currentRows?.[0] as any) || null;
  const currentNote = current ? clean(current.note) || null : null;
  const currentInternalNote = current ? clean(current.internal_note) || null : null;

  const note = hasNote ? clean(input.note) || null : currentNote;
  const internalNote = hasInternalNote ? clean(input.internalNote) || null : currentInternalNote;
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO repasse_professional_notes (
      period_ref, professional_id, note, internal_note, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      note = ?,
      internal_note = ?,
      updated_by = ?,
      updated_at = ?
    `,
    [
      periodRef,
      professionalId,
      note,
      internalNote,
      clean(actorUserId),
      now,
      note,
      internalNote,
      clean(actorUserId),
      now,
    ]
  );

  return { periodRef, professionalId, note, internalNote, updatedAt: now };
};

export const getRepasseProfessionalNote = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{ note: string | null; internalNote: string | null }> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return { note: null, internalNote: null };
  const rows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_professional_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  if (!rows?.length) return { note: null, internalNote: null };
  return {
    note: clean((rows[0] as any).note) || null,
    internalNote: clean((rows[0] as any).internal_note) || null,
  };
};

export const getRepasseProfessionalPaymentMinimum = async (
  db: DbInterface,
  professionalIdRaw: string
): Promise<string | null> => {
  await ensureRepasseTables(db);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return null;
  const rows = await db.query(
    `
    SELECT payment_minimum_text
    FROM professionals
    WHERE id = ?
    LIMIT 1
    `,
    [professionalId]
  );
  if (!rows?.length) return null;
  return clean((rows[0] as any).payment_minimum_text) || null;
};

export type RepassePdfJobRow = RepassePdfJob;

export type RepassePdfJobTargetProfessional = {
  professionalId: string;
  professionalName: string;
};

export type RepasseConsolidatedLine = {
  dataExec: string;
  paciente: string;
  descricao: string;
  funcao: string;
  convenio: string;
  repasseValue: number;
};

export const getNextPendingRepassePdfJob = async (
  db: DbInterface
): Promise<RepassePdfJobRow | null> => {
  await ensureRepasseTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_jobs
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 1
    `
  );
  if (!rows.length) return null;
  return mapPdfJob(rows[0]);
};

export const markRepassePdfJobRunning = async (db: DbInterface, jobId: string) => {
  await ensureRepasseTables(db);
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_pdf_jobs
    SET status = 'RUNNING',
        started_at = ?,
        finished_at = NULL,
        error = NULL,
        updated_at = ?
    WHERE id = ?
    `,
    [now, now, clean(jobId)]
  );
};

export const markRepassePdfJobFinished = async (
  db: DbInterface,
  jobId: string,
  status: RepassePdfJob['status'],
  errorMessage?: string | null
) => {
  await ensureRepasseTables(db);
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_pdf_jobs
    SET status = ?,
        finished_at = ?,
        error = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [status, now, clean(errorMessage) || null, now, clean(jobId)]
  );
};

export const listRepassePdfTargetProfessionals = async (
  db: DbInterface,
  job: RepassePdfJobRow
): Promise<RepassePdfJobTargetProfessional[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(job.periodRef);

  if (job.scope === 'all_with_data') {
    const rows = await db.query(
      `
      SELECT professional_id, professional_name
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
      GROUP BY professional_id, professional_name
      ORDER BY professional_name ASC
      `,
      [periodRef]
    );
    return rows.map((row) => ({
      professionalId: clean(row.professional_id),
      professionalName: clean(row.professional_name),
    }));
  }

  const ids = normalizeProfessionalIds(job.professionalIds);
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT id, name
    FROM professionals
    WHERE id IN (${placeholders})
    ORDER BY name ASC
    `,
    ids
  );

  const byId = new Map(
    rows.map((row) => [clean(row.id), clean(row.name)] as const)
  );
  return ids.map((id) => ({
    professionalId: id,
    professionalName: byId.get(id) || id,
  }));
};

export const listRepasseConsolidatedLinesByProfessional = async (
  db: DbInterface,
  periodRefRaw: string,
  professionalIdRaw: string
): Promise<RepasseConsolidatedLine[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(periodRefRaw);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return [];

  const rows = await db.query(
    `
    SELECT data_exec, paciente, descricao, funcao, convenio, repasse_value
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    ORDER BY data_exec DESC, paciente ASC
    `,
    [periodRef, professionalId]
  );

  return rows.map((row) => ({
    dataExec: clean(row.data_exec),
    paciente: clean(row.paciente),
    descricao: clean(row.descricao),
    funcao: clean(row.funcao),
    convenio: clean(row.convenio),
    repasseValue: Number(row.repasse_value) || 0,
  }));
};

export const createRepassePdfArtifact = async (
  db: DbInterface,
  payload: {
    pdfJobId: string;
    periodRef: string;
    professionalId: string;
    professionalName: string;
    storageProvider: string;
    storageBucket?: string | null;
    storageKey: string;
    fileName: string;
    sizeBytes: number;
  }
): Promise<RepassePdfArtifact> => {
  await ensureRepasseTables(db);
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_pdf_artifacts (
      id, pdf_job_id, period_ref, professional_id, professional_name,
      storage_provider, storage_bucket, storage_key, file_name, size_bytes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      clean(payload.pdfJobId),
      normalizePeriodRef(payload.periodRef),
      clean(payload.professionalId),
      clean(payload.professionalName),
      clean(payload.storageProvider),
      clean(payload.storageBucket) || null,
      clean(payload.storageKey),
      clean(payload.fileName),
      Math.max(0, Math.floor(Number(payload.sizeBytes) || 0)),
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapPdfArtifact(rows[0]);
};

export const listRepassePdfArtifactsByPeriodProfessional = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<RepassePdfArtifact[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return [];

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE period_ref = ?
      AND professional_id = ?
    ORDER BY created_at DESC
    `,
    [periodRef, professionalId]
  );
  return rows.map(mapPdfArtifact);
};

export const deleteRepassePdfArtifactsByIds = async (
  db: DbInterface,
  artifactIds: string[]
): Promise<number> => {
  await ensureRepasseTables(db);
  const ids = Array.from(new Set((artifactIds || []).map((id) => clean(id)).filter(Boolean)));
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  await db.execute(
    `
    DELETE FROM repasse_pdf_artifacts
    WHERE id IN (${placeholders})
    `,
    ids
  );
  return ids.length;
};

export const listRepassePdfArtifacts = async (
  db: DbInterface,
  filters: RepassePdfArtifactListFilters = {}
): Promise<{ items: RepassePdfArtifact[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const professionalId = clean(filters.professionalId);
  const limit = normalizeLimit(filters.limit, 50);

  if (periodRef) {
    where.push('period_ref = ?');
    params.push(periodRef);
  }
  if (professionalId) {
    where.push('professional_id = ?');
    params.push(professionalId);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_pdf_artifacts
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapPdfArtifact),
    total: readCount(countRows[0]),
  };
};

export const getRepassePdfArtifactById = async (
  db: DbInterface,
  artifactId: string
): Promise<RepassePdfArtifact | null> => {
  await ensureRepasseTables(db);
  const cleanId = clean(artifactId);
  if (!cleanId) return null;

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE id = ?
    LIMIT 1
    `,
    [cleanId]
  );
  if (!rows.length) return null;
  return mapPdfArtifact(rows[0]);
};

export const createRepasseConsolidacaoJob = async (
  db: DbInterface,
  input: RepasseConsolidacaoJobInput,
  actorUserId: string
): Promise<RepasseConsolidacaoJob> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  const scope = normalizeConsolidacaoScope(input?.scope, professionalIds.length > 0);

  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }
  if (scope === 'single' && professionalIds.length !== 1) {
    throw new RepasseValidationError('Escopo single exige exatamente um profissional.');
  }

  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_consolidacao_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by, started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_consolidacao_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  return mapConsolidacaoJob(rows[0]);
};

export const listRepasseConsolidacaoJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepasseConsolidacaoJob[]; total: number }> => {
  await ensureRepasseConsolidacaoTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_consolidacao_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_consolidacao_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapConsolidacaoJob),
    total: readCount(countRows[0]),
  };
};

export const listRepasseConsolidacaoProfessionalSummaries = async (
  db: DbInterface,
  filters: RepasseConsolidacaoProfessionalListFilters = {}
): Promise<RepasseConsolidacaoProfessionalListResult> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeConsolidacaoProfessionalStatusFilter(filters.status);
  const hasPaymentMinimum = normalizeBooleanFilter(filters.hasPaymentMinimum);
  const consolidacaoStatus = normalizeConsolidacaoStatusFilter(filters.consolidacaoStatus);
  const hasDivergence = normalizeBooleanFilter(filters.hasDivergence);
  const attendanceDateStart = filters.attendanceDateStart
    ? normalizeIsoDate(filters.attendanceDateStart)
    : null;
  const attendanceDateEnd = filters.attendanceDateEnd ? normalizeIsoDate(filters.attendanceDateEnd) : null;
  const patientName = clean(filters.patientName);
  const page = normalizePage(filters.page);
  const pageSize = normalizeLimit(filters.pageSize, 50);

  const loaded = await loadRepasseConsolidacaoProfessionalSummaries(db, {
    periodRef,
    search,
    hasPaymentMinimum,
    consolidacaoStatus,
    hasDivergence,
    attendanceDateStart,
    attendanceDateEnd,
    patientName,
  });
  const allItems = loaded.items;
  const stats = loaded.stats;

  const filteredItems =
    statusFilter === 'all'
      ? allItems
      : allItems.filter((item) => item.status.toLowerCase() === statusFilter);

  const resolvedStats =
    statusFilter === 'all'
      ? stats
      : filteredItems.reduce(
          (acc, item) => {
            acc.totalRows += item.rowsCount;
            acc.totalValue += item.totalValue;
            acc.consolidadoQty += item.consolidadoQty;
            acc.consolidadoValue += item.consolidadoValue;
            acc.naoConsolidadoQty += item.naoConsolidadoQty;
            acc.naoConsolidadoValue += item.naoConsolidadoValue;
            acc.naoRecebidoQty += item.naoRecebidoQty;
            acc.naoRecebidoValue += item.naoRecebidoValue;
            if (item.hasDivergencia) acc.divergenceCount += 1;
            if (item.status === 'SUCCESS') acc.success += 1;
            else if (item.status === 'NO_DATA') acc.noData += 1;
            else if (item.status === 'SKIPPED') acc.skipped += 1;
            else if (item.status === 'ERROR') acc.error += 1;
            else acc.notProcessed += 1;
            return acc;
          },
          {
            totalProfessionals: filteredItems.length,
            success: 0,
            noData: 0,
            skipped: 0,
            error: 0,
            notProcessed: 0,
            totalRows: 0,
            totalValue: 0,
            consolidadoQty: 0,
            consolidadoValue: 0,
            naoConsolidadoQty: 0,
            naoConsolidadoValue: 0,
            naoRecebidoQty: 0,
            naoRecebidoValue: 0,
            divergenceCount: 0,
          }
        );

  const total = filteredItems.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filteredItems.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
    stats: resolvedStats,
  };
};

export const listRepasseConsolidacaoProfessionalIds = async (
  db: DbInterface,
  filters: Pick<
    RepasseConsolidacaoProfessionalListFilters,
    | 'periodRef'
    | 'search'
    | 'status'
    | 'hasPaymentMinimum'
    | 'consolidacaoStatus'
    | 'hasDivergence'
    | 'attendanceDateStart'
    | 'attendanceDateEnd'
    | 'patientName'
  > = {}
): Promise<string[]> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeConsolidacaoProfessionalStatusFilter(filters.status);
  const hasPaymentMinimum = normalizeBooleanFilter(filters.hasPaymentMinimum);
  const consolidacaoStatus = normalizeConsolidacaoStatusFilter(filters.consolidacaoStatus);
  const hasDivergence = normalizeBooleanFilter(filters.hasDivergence);
  const attendanceDateStart = filters.attendanceDateStart
    ? normalizeIsoDate(filters.attendanceDateStart)
    : null;
  const attendanceDateEnd = filters.attendanceDateEnd ? normalizeIsoDate(filters.attendanceDateEnd) : null;
  const patientName = clean(filters.patientName);

  const loaded = await loadRepasseConsolidacaoProfessionalSummaries(db, {
    periodRef,
    search,
    hasPaymentMinimum,
    consolidacaoStatus,
    hasDivergence,
    attendanceDateStart,
    attendanceDateEnd,
    patientName,
  });
  const filteredItems =
    statusFilter === 'all'
      ? loaded.items
      : loaded.items.filter((item) => item.status.toLowerCase() === statusFilter);
  return filteredItems.map((item) => item.professionalId);
};

export const listRepasseConsolidacaoProfessionalOptions = async (
  db: DbInterface,
  input: { search?: string; limit?: number } = {}
): Promise<RepasseProfessionalOption[]> => {
  await ensureRepasseConsolidacaoTables(db);

  const search = clean(input.search);
  const limit = normalizeOptionLimit(input.limit, 500);
  const searchPattern = `%${search.toUpperCase()}%`;

  const rows = await db.query(
    `
    SELECT professional_id, professional_name
    FROM (
      SELECT id as professional_id, name as professional_name
      FROM professionals
      WHERE is_active = 1
        AND (? = '' OR UPPER(name) LIKE ?)
      UNION
      SELECT professional_id, professional_name
      FROM feegow_repasse_a_conferir
      WHERE is_active = 1
        AND (? = '' OR UPPER(professional_name) LIKE ?)
    ) unioned
    ORDER BY professional_name ASC
    LIMIT ?
    `,
    [search, searchPattern, search, searchPattern, limit]
  );

  return rows
    .map((row) => ({
      professionalId: clean((row as any).professional_id),
      professionalName: clean((row as any).professional_name),
    }))
    .filter((row) => row.professionalId && row.professionalName);
};

export const listRepasseAConferirLinesByProfessional = async (
  db: DbInterface,
  periodRefRaw: string,
  professionalIdRaw: string
): Promise<RepasseAConferirLine[]> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(periodRefRaw);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return [];

  const rows = await db.query(
    `
    SELECT
      source_row_hash,
      invoice_id,
      execution_date,
      patient_name,
      unit_name,
      account_date,
      requester_name,
      specialty_name,
      procedure_name,
      attendance_value,
      detail_status,
      detail_status_text,
      role_code,
      role_name,
      detail_professional_name,
      detail_repasse_value
    FROM feegow_repasse_a_conferir
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    ORDER BY execution_date DESC, patient_name ASC
    `,
    [periodRef, professionalId]
  );

  const consolidatedRows = await db.query(
    `
    SELECT data_exec, paciente, descricao
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    `,
    [periodRef, professionalId]
  );
  const consolidatedKeys = new Set(
    consolidatedRows.map((row) =>
      buildConsolidadoMatchKey((row as any).data_exec, (row as any).paciente, (row as any).descricao)
    )
  );

  return rows.map((row) => ({
    sourceRowHash: clean((row as any).source_row_hash),
    invoiceId: clean((row as any).invoice_id),
    executionDate: clean((row as any).execution_date),
    patientName: clean((row as any).patient_name),
    unitName: clean((row as any).unit_name),
    accountDate: clean((row as any).account_date),
    requesterName: clean((row as any).requester_name),
    specialtyName: clean((row as any).specialty_name),
    procedureName: clean((row as any).procedure_name),
    attendanceValue: Number((row as any).attendance_value) || 0,
    detailStatus: clean((row as any).detail_status),
    detailStatusText: clean((row as any).detail_status_text),
    roleCode: clean((row as any).role_code),
    roleName: clean((row as any).role_name),
    detailProfessionalName: clean((row as any).detail_professional_name),
    detailRepasseValue: Number((row as any).detail_repasse_value) || 0,
    isInConsolidado: consolidatedKeys.has(
      buildConsolidadoMatchKey(
        (row as any).execution_date,
        (row as any).patient_name,
        (row as any).procedure_name
      )
    ),
  }));
};

export const upsertRepasseConsolidacaoNote = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    note?: string | null;
    internalNote?: string | null;
  },
  actorUserId: string
): Promise<{
  periodRef: string;
  professionalId: string;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
}> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    throw new RepasseValidationError('Profissional invalido para salvar observacao.');
  }

  const hasNote = Object.prototype.hasOwnProperty.call(input, 'note');
  const hasInternalNote = Object.prototype.hasOwnProperty.call(input, 'internalNote');
  if (!hasNote && !hasInternalNote) {
    throw new RepasseValidationError(
      'Informe ao menos um campo para atualizacao (note ou internalNote).'
    );
  }

  const currentRows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_consolidacao_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  const current = (currentRows?.[0] as any) || null;
  const currentNote = current ? clean(current.note) || null : null;
  const currentInternalNote = current ? clean(current.internal_note) || null : null;

  const note = hasNote ? clean(input.note) || null : currentNote;
  const internalNote = hasInternalNote ? clean(input.internalNote) || null : currentInternalNote;
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO repasse_consolidacao_notes (
      period_ref, professional_id, note, internal_note, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      note = ?,
      internal_note = ?,
      updated_by = ?,
      updated_at = ?
    `,
    [
      periodRef,
      professionalId,
      note,
      internalNote,
      clean(actorUserId),
      now,
      note,
      internalNote,
      clean(actorUserId),
      now,
    ]
  );

  return { periodRef, professionalId, note, internalNote, updatedAt: now };
};

export const getRepasseConsolidacaoNote = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{ note: string | null; internalNote: string | null }> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return { note: null, internalNote: null };

  const rows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_consolidacao_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  if (!rows?.length) return { note: null, internalNote: null };
  return {
    note: clean((rows[0] as any).note) || null,
    internalNote: clean((rows[0] as any).internal_note) || null,
  };
};

const defaultConsolidacaoLegend: RepasseConsolidacaoMarkLegend = {
  green: 'OK',
  yellow: 'Revisar',
  red: 'Problema',
};

export const getRepasseConsolidacaoMarkLegend = async (
  db: DbInterface,
  userIdRaw: string
): Promise<RepasseConsolidacaoMarkLegend> => {
  await ensureRepasseConsolidacaoTables(db);
  const userId = clean(userIdRaw);
  if (!userId) return { ...defaultConsolidacaoLegend };

  const rows = await db.query(
    `
    SELECT color_key, label
    FROM repasse_consolidacao_mark_legends
    WHERE user_id = ?
    `,
    [userId]
  );

  const legend: RepasseConsolidacaoMarkLegend = { ...defaultConsolidacaoLegend };
  for (const row of rows) {
    const color = normalizeLineMarkColor((row as any).color_key);
    if (!color) continue;
    const label = clean((row as any).label);
    legend[color] = label || defaultConsolidacaoLegend[color];
  }
  return legend;
};

export const upsertRepasseConsolidacaoMarkLegend = async (
  db: DbInterface,
  userIdRaw: string,
  input: Partial<RepasseConsolidacaoMarkLegend>
): Promise<RepasseConsolidacaoMarkLegend> => {
  await ensureRepasseConsolidacaoTables(db);
  const userId = clean(userIdRaw);
  if (!userId) throw new RepasseValidationError('Usuario invalido para salvar legenda.');
  const now = nowIso();

  const entries = (Object.keys(defaultConsolidacaoLegend) as Array<keyof RepasseConsolidacaoMarkLegend>)
    .filter((color) => Object.prototype.hasOwnProperty.call(input, color))
    .map((color) => [color, clean(input[color]) || defaultConsolidacaoLegend[color]] as const);

  if (!entries.length) {
    throw new RepasseValidationError('Informe ao menos uma legenda para atualizar.');
  }

  for (const [color, label] of entries) {
    await db.execute(
      `
      INSERT INTO repasse_consolidacao_mark_legends (user_id, color_key, label, updated_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = ?,
        updated_at = ?
      `,
      [userId, color, label, now, label, now]
    );
  }

  return getRepasseConsolidacaoMarkLegend(db, userId);
};

export const listRepasseConsolidacaoLineMarks = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    userId: string;
  }
): Promise<RepasseConsolidacaoLineMark[]> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  const userId = clean(input.userId);
  if (!professionalId || !userId) return [];

  const rows = await db.query(
    `
    SELECT source_row_hash, color_key, note, updated_at
    FROM repasse_consolidacao_line_marks
    WHERE period_ref = ?
      AND professional_id = ?
      AND user_id = ?
    `,
    [periodRef, professionalId, userId]
  );

  return rows
    .map((row) => {
      const color = normalizeLineMarkColor((row as any).color_key);
      if (!color) return null;
      return {
        sourceRowHash: clean((row as any).source_row_hash),
        colorKey: color,
        note: clean((row as any).note) || null,
        updatedAt: clean((row as any).updated_at),
      } as RepasseConsolidacaoLineMark;
    })
    .filter((row): row is RepasseConsolidacaoLineMark => Boolean(row && row.sourceRowHash));
};

export const upsertRepasseConsolidacaoLineMarks = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    userId: string;
    marks: Array<{
      sourceRowHash: string;
      colorKey?: RepasseConsolidacaoLineMarkColor | null;
      note?: string | null;
    }>;
  }
): Promise<RepasseConsolidacaoLineMark[]> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  const userId = clean(input.userId);
  if (!professionalId || !userId) {
    throw new RepasseValidationError('Profissional/usuario invalido para salvar marcacoes.');
  }
  if (!Array.isArray(input.marks) || input.marks.length === 0) {
    throw new RepasseValidationError('Nenhuma marcacao informada.');
  }

  const now = nowIso();
  for (const entry of input.marks) {
    const sourceRowHash = clean(entry?.sourceRowHash);
    if (!sourceRowHash) continue;
    const color = normalizeLineMarkColor(entry?.colorKey);
    const note = clean(entry?.note) || null;
    if (!color) {
      await db.execute(
        `
        DELETE FROM repasse_consolidacao_line_marks
        WHERE period_ref = ?
          AND professional_id = ?
          AND user_id = ?
          AND source_row_hash = ?
        `,
        [periodRef, professionalId, userId, sourceRowHash]
      );
      continue;
    }

    await db.execute(
      `
      INSERT INTO repasse_consolidacao_line_marks (
        period_ref, professional_id, source_row_hash, user_id, color_key, note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        color_key = ?,
        note = ?,
        updated_at = ?
      `,
      [
        periodRef,
        professionalId,
        sourceRowHash,
        userId,
        color,
        note,
        now,
        color,
        note,
        now,
      ]
    );
  }

  return listRepasseConsolidacaoLineMarks(db, { periodRef, professionalId, userId });
};
