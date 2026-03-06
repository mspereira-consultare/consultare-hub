import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import type {
  RepasseJobListFilters,
  RepassePdfJob,
  RepassePdfJobInput,
  RepassePdfScope,
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

const nowIso = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();

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

const normalizeScope = (value: unknown): RepassePdfScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi' || raw === 'all_with_data') {
    return raw;
  }
  return 'all_with_data';
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
  status: clean(row.status).toUpperCase() as RepasseSyncJob['status'],
  requestedBy: clean(row.requested_by),
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
  professionalIds: (() => {
    const raw = clean(row.professional_ids_json);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return normalizeProfessionalIds(parsed);
    } catch {
      return [];
    }
  })(),
  status: clean(row.status).toUpperCase() as RepassePdfJob['status'],
  requestedBy: clean(row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

export const ensureRepasseTables = async (db: DbInterface) => {
  if (repasseTablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_repasse_consolidado (
      id TEXT PRIMARY KEY,
      period_ref TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      professional_name TEXT NOT NULL,
      data_exec TEXT NOT NULL,
      paciente TEXT NOT NULL,
      descricao TEXT NOT NULL,
      funcao TEXT NOT NULL,
      convenio TEXT NOT NULL,
      repasse_value DECIMAL(14,2) NOT NULL,
      source_row_hash TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL,
      last_job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_jobs (
      id TEXT PRIMARY KEY,
      period_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_period ON repasse_sync_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_status ON repasse_sync_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_created ON repasse_sync_jobs(created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      professional_name TEXT NOT NULL,
      status TEXT NOT NULL,
      rows_count INTEGER NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      error_message TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_job ON repasse_sync_job_items(job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_prof ON repasse_sync_job_items(professional_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_status ON repasse_sync_job_items(status)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_jobs (
      id TEXT PRIMARY KEY,
      period_ref TEXT NOT NULL,
      scope TEXT NOT NULL,
      professional_ids_json TEXT,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_period ON repasse_pdf_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_status ON repasse_pdf_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_created ON repasse_pdf_jobs(created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_artifacts (
      id TEXT PRIMARY KEY,
      pdf_job_id TEXT NOT NULL,
      period_ref TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      professional_name TEXT NOT NULL,
      storage_provider TEXT NOT NULL,
      storage_bucket TEXT,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_job ON repasse_pdf_artifacts(pdf_job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_prof ON repasse_pdf_artifacts(professional_id)`);

  repasseTablesEnsured = true;
};

export const createRepasseSyncJob = async (
  db: DbInterface,
  input: RepasseSyncJobInput,
  actorUserId: string
): Promise<RepasseSyncJob> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_sync_jobs (
      id, period_ref, status, requested_by, started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [id, periodRef, 'PENDING', actorUserId, null, null, null, now, now]
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
    where.push('period_ref = ?');
    params.push(periodRef);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_sync_jobs
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_sync_jobs
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
    where.push('period_ref = ?');
    params.push(periodRef);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_jobs
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_pdf_jobs
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapPdfJob),
    total: readCount(countRows[0]),
  };
};
