import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import type {
  BlockedAgendaFilters,
  BlockedAgendaItem,
  BlockedAgendaJob,
  BlockedAgendaJobStatus,
  BlockedAgendaProfessionalSourceStatus,
  BlockedAgendaRecurrenceFilter,
  BlockedAgendaResult,
  BlockedAgendaSituationFilter,
} from '@/lib/agendas_bloqueadas/types';
import { BLOCKED_AGENDAS_DEFAULT_UNITS } from '@/lib/agendas_bloqueadas/types';

export class BlockedAgendasValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const clean = (value: unknown) => String(value ?? '').trim();

const nowIso = () => new Date().toISOString();

const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: unknown; code?: unknown };
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '').toUpperCase();
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_DUP_KEYNAME' ||
      msg.includes('duplicate') ||
      msg.includes('already exists')
    ) {
      return;
    }
    throw error;
  }
};

const normalizeDate = (value: unknown, fieldName: string) => {
  const raw = clean(value);
  if (!raw) throw new BlockedAgendasValidationError(`Campo ${fieldName} obrigatorio.`);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new BlockedAgendasValidationError(`Campo ${fieldName} invalido. Use YYYY-MM-DD.`);
  }
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) {
    throw new BlockedAgendasValidationError(`Campo ${fieldName} invalido.`);
  }
  return raw;
};

const normalizeUnitId = (value: unknown): 'all' | '2' | '3' | '12' => {
  const raw = clean(value || 'all');
  if (raw === '2' || raw === '3' || raw === '12') return raw;
  return 'all';
};

const normalizeSituation = (value: unknown): BlockedAgendaSituationFilter => {
  const raw = clean(value || 'active').toLowerCase();
  return raw === 'all' ? 'all' : 'active';
};

const normalizeRecurrence = (value: unknown): BlockedAgendaRecurrenceFilter => {
  const raw = clean(value || 'all').toLowerCase();
  if (raw === 'recurring') return 'recurring';
  if (raw === 'single') return 'single';
  return 'all';
};

const normalizeProfessionalId = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BlockedAgendasValidationError('professionalId invalido.');
  }
  return String(Math.trunc(n));
};

const normalizeSearch = (value: unknown) => clean(value).slice(0, 160);

const normalizeUnitScope = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    const unique = new Set<number>();
    for (const item of value) {
      const n = Number(item);
      if ([2, 3, 12].includes(n)) unique.add(n);
    }
    if (unique.size > 0) return Array.from(unique).sort((a, b) => a - b);
  }

  const raw = clean(value);
  if (!raw || raw === 'all') return [...BLOCKED_AGENDAS_DEFAULT_UNITS];
  if (['2', '3', '12'].includes(raw)) return [Number(raw)];
  return [...BLOCKED_AGENDAS_DEFAULT_UNITS];
};

const parseIntArray = (value: unknown) => {
  try {
    const parsed = JSON.parse(clean(value) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .map((item) => Math.trunc(item));
  } catch {
    return [];
  }
};

const mapJob = (row: Record<string, unknown>): BlockedAgendaJob => ({
  id: clean(row.id),
  status: clean(row.status).toUpperCase() as BlockedAgendaJobStatus,
  startDate: clean(row.start_date),
  endDate: clean(row.end_date),
  unitScope: parseIntArray(row.unit_scope_json).filter((item) => [2, 3, 12].includes(item)),
  requestedBy: clean(row.requested_by),
  errorMessage: clean(row.error_message) || null,
  createdAt: clean(row.created_at),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  updatedAt: clean(row.updated_at),
});

const toSourceStatus = (value: unknown): BlockedAgendaProfessionalSourceStatus => {
  const raw = clean(value).toUpperCase();
  if (raw === 'FEEGOW' || raw === 'LOCAL' || raw === 'FALLBACK') return raw;
  return 'FALLBACK';
};

const buildStatusLabels = (item: {
  isActiveInRange: boolean;
  isRecurring: boolean;
  isMultiUnit: boolean;
  professionalSourceStatus: BlockedAgendaProfessionalSourceStatus;
}) => {
  const labels: string[] = [];
  if (item.isActiveInRange) labels.push('Ativo no recorte');
  if (item.isRecurring) labels.push('Recorrente');
  if (item.isMultiUnit) labels.push('Multiunidade');
  if (item.professionalSourceStatus === 'FALLBACK') labels.push('Nome nao conciliado');
  return labels;
};

const mapItem = (row: Record<string, unknown>): BlockedAgendaItem => {
  const professionalSourceStatus = toSourceStatus(row.professional_source_status);
  const unitIds = parseIntArray(row.unit_ids_json);
  const weekDays = parseIntArray(row.week_days_json);
  const item: BlockedAgendaItem = {
    blockId: Number(row.block_id) || 0,
    professionalId: Number(row.professional_id) || 0,
    professionalName: clean(row.professional_name) || `Profissional ${clean(row.professional_id) || '0'}`,
    professionalSourceStatus,
    dateStart: clean(row.date_start),
    dateEnd: clean(row.date_end),
    timeStart: clean(row.time_start),
    timeEnd: clean(row.time_end),
    unitIds,
    unitNamesText: clean(row.unit_names_text),
    weekDays,
    description: clean(row.description),
    isActiveInRange: Number(row.is_active_in_range) === 1,
    isRecurring: Number(row.is_recurring) === 1,
    isMultiUnit: Number(row.is_multi_unit) === 1,
    statusLabels: [],
    lastSyncedAt: clean(row.last_synced_at),
  };
  item.statusLabels = buildStatusLabels(item);
  return item;
};

export const ensureBlockedAgendasTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_blocked_report_jobs (
      id VARCHAR(64) PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      start_date VARCHAR(10) NOT NULL,
      end_date VARCHAR(10) NOT NULL,
      unit_scope_json LONGTEXT,
      requested_by VARCHAR(64) NOT NULL,
      error_message TEXT,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, 'CREATE INDEX idx_agenda_blocked_jobs_status ON agenda_blocked_report_jobs(status)');
  await safeExecute(db, 'CREATE INDEX idx_agenda_blocked_jobs_created ON agenda_blocked_report_jobs(created_at)');

  if (isMysqlProvider()) {
    await safeExecute(
      db,
      'ALTER TABLE agenda_blocked_report_jobs MODIFY COLUMN id VARCHAR(64) NOT NULL'
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_blocked_report_items (
      job_id VARCHAR(64) NOT NULL,
      block_id INTEGER NOT NULL,
      date_start VARCHAR(10) NOT NULL,
      date_end VARCHAR(10) NOT NULL,
      time_start VARCHAR(8) NOT NULL,
      time_end VARCHAR(8) NOT NULL,
      professional_id INTEGER NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      professional_source_status VARCHAR(20) NOT NULL,
      unit_ids_json LONGTEXT NOT NULL,
      unit_names_text TEXT NOT NULL,
      unit_scope_key VARCHAR(120) NOT NULL,
      week_days_json LONGTEXT NOT NULL,
      description TEXT,
      is_active_in_range INTEGER NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      is_multi_unit INTEGER NOT NULL DEFAULT 0,
      last_synced_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (job_id, block_id)
    )
  `);

  await safeExecute(
    db,
    'CREATE INDEX idx_agenda_blocked_items_job_prof ON agenda_blocked_report_items(job_id, professional_id)'
  );
  await safeExecute(
    db,
    'CREATE INDEX idx_agenda_blocked_items_job_dates ON agenda_blocked_report_items(job_id, date_start, date_end)'
  );

  tablesEnsured = true;
};

export const createBlockedAgendasJob = async (
  db: DbInterface,
  input: {
    startDate?: unknown;
    endDate?: unknown;
    unitScope?: unknown;
  },
  actorUserId: string
): Promise<BlockedAgendaJob> => {
  await ensureBlockedAgendasTables(db);

  const startDate = normalizeDate(input.startDate, 'startDate');
  const endDate = normalizeDate(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw new BlockedAgendasValidationError('Data inicial nao pode ser maior que data final.');
  }

  const units = normalizeUnitScope(input.unitScope);
  const id = randomUUID().replace(/-/g, '');
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO agenda_blocked_report_jobs (
      id, status, start_date, end_date, unit_scope_json, requested_by,
      error_message, created_at, started_at, finished_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      'PENDING',
      startDate,
      endDate,
      JSON.stringify(units),
      clean(actorUserId) || 'unknown',
      null,
      now,
      null,
      null,
      now,
    ]
  );

  const rows = await db.query('SELECT * FROM agenda_blocked_report_jobs WHERE id = ? LIMIT 1', [id]);
  return mapJob(rows[0]);
};

const listJobs = async (db: DbInterface) => {
  await ensureBlockedAgendasTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM agenda_blocked_report_jobs
    ORDER BY created_at DESC
    LIMIT 100
    `
  );
  return (rows || []).map((row: Record<string, unknown>) => mapJob(row));
};

const jobMatchesFilters = (job: BlockedAgendaJob, filters: { startDate: string; endDate: string; unitId: 'all' | '2' | '3' | '12' }) => {
  if (job.startDate !== filters.startDate) return false;
  if (job.endDate !== filters.endDate) return false;
  if (filters.unitId !== 'all' && !job.unitScope.includes(Number(filters.unitId))) return false;
  return true;
};

export const getLatestBlockedAgendasJob = async (
  db: DbInterface,
  filters: BlockedAgendaFilters = {}
): Promise<BlockedAgendaJob | null> => {
  const normalized = normalizeBlockedAgendaFilters(filters);
  const jobs = await listJobs(db);
  return jobs.find((job) => jobMatchesFilters(job, normalized)) || null;
};

export const getLatestCompletedBlockedAgendasJob = async (
  db: DbInterface,
  filters: BlockedAgendaFilters = {}
): Promise<BlockedAgendaJob | null> => {
  const normalized = normalizeBlockedAgendaFilters(filters);
  const jobs = await listJobs(db);
  return jobs.find((job) => job.status === 'COMPLETED' && jobMatchesFilters(job, normalized)) || null;
};

const buildBaseWhere = (jobId: string, filters: ReturnType<typeof normalizeBlockedAgendaFilters>) => {
  const where = ['job_id = ?'];
  const params: unknown[] = [jobId];

  if (filters.unitId !== 'all') {
    where.push('unit_scope_key LIKE ?');
    params.push(`%|${filters.unitId}|%`);
  }

  if (filters.professionalId) {
    where.push('professional_id = ?');
    params.push(Number(filters.professionalId));
  }

  if (filters.search) {
    where.push('UPPER(COALESCE(description, \'\')) LIKE ?');
    params.push(`%${filters.search.toUpperCase()}%`);
  }

  return { where, params };
};

const buildListWhere = (
  jobId: string,
  filters: ReturnType<typeof normalizeBlockedAgendaFilters>
) => {
  const { where, params } = buildBaseWhere(jobId, filters);

  if (filters.situation === 'active') {
    where.push('is_active_in_range = 1');
  }
  if (filters.recurrence === 'recurring') {
    where.push('is_recurring = 1');
  } else if (filters.recurrence === 'single') {
    where.push('is_recurring = 0');
  }

  return { where, params };
};

export const listBlockedAgendaRows = async (
  db: DbInterface,
  filters: BlockedAgendaFilters
): Promise<BlockedAgendaResult> => {
  await ensureBlockedAgendasTables(db);
  const normalized = normalizeBlockedAgendaFilters(filters);

  const [latestJob, dataJob] = await Promise.all([
    getLatestBlockedAgendasJob(db, normalized),
    getLatestCompletedBlockedAgendasJob(db, normalized),
  ]);

  if (!dataJob) {
    return {
      rows: [],
      totals: {
        totalBlocks: 0,
        activeBlocks: 0,
        professionalsWithActiveBlocks: 0,
        recurringBlocks: 0,
      },
      professionals: [],
      dataJob: latestJob && latestJob.status === 'COMPLETED' ? latestJob : null,
    };
  }

  const base = buildBaseWhere(dataJob.id, normalized);
  const list = buildListWhere(dataJob.id, normalized);

  const [rows, totalsRows, professionalRows] = await Promise.all([
    db.query(
      `
      SELECT *
      FROM agenda_blocked_report_items
      WHERE ${list.where.join(' AND ')}
      ORDER BY
        is_active_in_range DESC,
        is_recurring DESC,
        date_start DESC,
        professional_name ASC,
        block_id DESC
      `,
      list.params
    ),
    db.query(
      `
      SELECT
        COUNT(*) AS total_blocks,
        SUM(CASE WHEN is_active_in_range = 1 THEN 1 ELSE 0 END) AS active_blocks,
        COUNT(DISTINCT CASE WHEN is_active_in_range = 1 THEN professional_id ELSE NULL END) AS professionals_with_active_blocks,
        SUM(CASE WHEN is_recurring = 1 THEN 1 ELSE 0 END) AS recurring_blocks
      FROM agenda_blocked_report_items
      WHERE ${base.where.join(' AND ')}
      `,
      base.params
    ),
    db.query(
      `
      SELECT DISTINCT professional_id, professional_name
      FROM agenda_blocked_report_items
      WHERE ${base.where.join(' AND ')}
      ORDER BY professional_name ASC, professional_id ASC
      `,
      base.params
    ),
  ]);

  const totalsRow = (totalsRows?.[0] as Record<string, unknown> | undefined) || {};

  return {
    rows: (rows || []).map((row: Record<string, unknown>) => mapItem(row)),
    totals: {
      totalBlocks: Number(totalsRow.total_blocks) || 0,
      activeBlocks: Number(totalsRow.active_blocks) || 0,
      professionalsWithActiveBlocks: Number(totalsRow.professionals_with_active_blocks) || 0,
      recurringBlocks: Number(totalsRow.recurring_blocks) || 0,
    },
    professionals: (professionalRows || []).map((row: Record<string, unknown>) => ({
      professionalId: Number(row.professional_id) || 0,
      professionalName: clean(row.professional_name) || `Profissional ${clean(row.professional_id) || '0'}`,
    })),
    dataJob,
  };
};

export const getBlockedAgendasHeartbeat = async (db: DbInterface) => {
  await ensureBlockedAgendasTables(db);
  const rows = await db.query(
    `
    SELECT status, last_run, details
    FROM system_status
    WHERE service_name = 'blocked_agendas'
    LIMIT 1
    `
  );

  const row = ((rows?.[0] as Record<string, unknown> | undefined) || {});
  return {
    status: clean(row?.status) || 'UNKNOWN',
    lastRun: clean(row?.last_run) || null,
    details: clean(row?.details) || '',
  };
};

export const normalizeBlockedAgendaFilters = (input: BlockedAgendaFilters) => {
  const startDate = normalizeDate(input.startDate, 'startDate');
  const endDate = normalizeDate(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw new BlockedAgendasValidationError('Data inicial nao pode ser maior que data final.');
  }
  const unitId = normalizeUnitId(input.unitId);
  const professionalId = normalizeProfessionalId(input.professionalId);
  const recurrence = normalizeRecurrence(input.recurrence);
  const situation = normalizeSituation(input.situation);
  const search = normalizeSearch(input.search);
  return { startDate, endDate, unitId, professionalId, recurrence, situation, search };
};
