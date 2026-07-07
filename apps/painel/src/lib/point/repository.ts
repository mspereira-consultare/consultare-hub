import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { runInTransaction } from '@/lib/db';
import { ensureEmployeesTables } from '@/lib/colaboradores/repository';
import type { PayrollOccurrenceType, PayrollSignatureStatus, PayrollSyncJobStatus } from '@/lib/payroll/constants';
import type {
  PointArtifact,
  PointDailyControlRow,
  PointDailyRecord,
  PointDateRange,
  PointFilters,
  PointHoursBalanceMonthly,
  PointOptions,
  PointOverview,
  PointServiceHeartbeat,
  PointSignatureMonthly,
  PointSyncRun,
  PointVacationRow,
} from '@/lib/point/types';

export class PointValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const bool = (value: unknown) =>
  value === true || value === 1 || String(value || '').trim() === '1' || String(value || '').toLowerCase() === 'true';

const normalizeCpf = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizeSearch = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const parseDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = clean(value);
  if (!raw) return null;
  const isoWithTime = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoWithTime) return isoWithTime[1];
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
};

const parseJsonList = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => clean(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseUnitsJson = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => clean(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(message)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(message)) return;
    throw error;
  }
};

const toMonthRef = (dateIso: string | null | undefined) => {
  const normalized = parseDate(dateIso || '');
  return normalized ? normalized.slice(0, 7) : null;
};

const toSaoPauloDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const shiftIsoDate = (dateIso: string, deltaDays: number) => {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const buildLastThirtyDaysWindow = () => {
  const endDate = toSaoPauloDate();
  const startDate = shiftIsoDate(endDate, -29);
  return { startDate, endDate };
};

const diffDaysInclusive = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
};

const listMonthRefsInRange = (startDate: string, endDate: string) => {
  const refs = new Set<string>();
  let cursor = `${startDate.slice(0, 7)}-01`;
  const last = `${endDate.slice(0, 7)}-01`;
  while (cursor <= last) {
    refs.add(cursor.slice(0, 7));
    const [yearRaw, monthRaw] = cursor.slice(0, 7).split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw) - 1;
    const next = new Date(Date.UTC(year, month + 1, 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return Array.from(refs.values()).sort();
};

type PointEmployeeRosterRow = {
  id: string;
  fullName: string;
  cpf: string | null;
  employmentRegime: string | null;
  costCenter: string | null;
  units: string[];
  solidesEmployeeId: string | null;
  solidesExternalId: string | null;
};

const mapEmployeeRosterRow = (row: any): PointEmployeeRosterRow => ({
  id: clean(row.id),
  fullName: clean(row.full_name),
  cpf: normalizeCpf(row.cpf),
  employmentRegime: clean(row.employment_regime) || null,
  costCenter: clean(row.cost_center) || null,
  units: parseUnitsJson(row.units_json),
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  solidesExternalId: clean(row.solides_external_id) || null,
});

const mapPointDailyRecord = (row: any): PointDailyRecord => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id) || null,
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  employeeCode: clean(row.employee_code) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  pointDate: parseDate(row.point_date) || '',
  department: clean(row.department) || null,
  scheduleLabel: clean(row.schedule_label) || null,
  scheduleStart: clean(row.schedule_start) || null,
  scheduleEnd: clean(row.schedule_end) || null,
  marks: parseJsonList(row.marks_json),
  rawDayText: clean(row.raw_day_text) || null,
  plannedMinutes: Number(row.planned_minutes || 0),
  workedMinutes: Number(row.worked_minutes || 0),
  lateMinutes: Number(row.late_minutes || 0),
  dayBalanceMinutes: Number(row.day_balance_minutes || 0),
  breakMinutes: Number(row.break_minutes || 0),
  expectedBreakMinutes: Number(row.expected_break_minutes || 0),
  breakOverrunMinutes: Number(row.break_overrun_minutes || 0),
  pendingAdjustmentsCount: Number(row.pending_adjustments_count || 0),
  absenceFlag: bool(row.absence_flag),
  inconsistencyFlag: bool(row.inconsistency_flag),
  justificationText: clean(row.justification_text) || null,
  sourcePayloadJson: clean(row.source_payload_json) || null,
  lastSyncRunId: clean(row.last_sync_run_id) || null,
  source: 'SOLIDES',
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPointHoursBalance = (row: any): PointHoursBalanceMonthly => ({
  id: clean(row.id),
  periodId: clean(row.reference_month),
  referenceMonth: clean(row.reference_month),
  employeeId: clean(row.employee_id) || null,
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  balanceMinutes: Number(row.balance_minutes || 0),
  referenceStart: parseDate(row.reference_start),
  referenceEnd: parseDate(row.reference_end),
  sourcePayloadJson: clean(row.source_payload_json) || null,
  source: 'SOLIDES',
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPointSignature = (row: any): PointSignatureMonthly => ({
  id: clean(row.id),
  periodId: clean(row.reference_month),
  referenceMonth: clean(row.reference_month),
  employeeId: clean(row.employee_id) || null,
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  status: (upper(row.status || 'SEM_PENDENCIA') || 'SEM_PENDENCIA') as PayrollSignatureStatus,
  documentType: clean(row.document_type) || null,
  documentDate: parseDate(row.document_date),
  startDate: parseDate(row.start_date),
  endDate: parseDate(row.end_date),
  signedAt: clean(row.signed_at) || null,
  message: clean(row.message) || null,
  sourcePayloadJson: clean(row.source_payload_json) || null,
  source: 'SOLIDES',
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPointArtifact = (row: any): PointArtifact => ({
  id: clean(row.id),
  syncRunId: clean(row.sync_run_id) || null,
  artifactType: 'TIMESHEET_REPORT',
  fileName: clean(row.file_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  windowStart: parseDate(row.window_start) || '',
  windowEnd: parseDate(row.window_end) || '',
  createdAt: clean(row.created_at),
});

const mapPointSyncRun = (row: any): PointSyncRun => ({
  id: clean(row.id),
  jobId: clean(row.job_id) || null,
  status: upper(row.status) as PayrollSyncJobStatus,
  sourceLabel: clean(row.source_label) || 'API Sólides',
  windowStart: parseDate(row.window_start) || '',
  windowEnd: parseDate(row.window_end) || '',
  synchronizedEmployees: Number(row.synchronized_employees || 0),
  synchronizedDays: Number(row.synchronized_days || 0),
  unmatchedEmployees: Number(row.unmatched_employees || 0),
  pendingAdjustments: Number(row.pending_adjustments || 0),
  pendingSignatures: Number(row.pending_signatures || 0),
  details: clean(row.details) || null,
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  createdAt: clean(row.created_at),
});

type PointOccurrenceRecord = {
  id: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  occurrenceType: PayrollOccurrenceType;
  dateStart: string;
  dateEnd: string;
  effectCode: string | null;
  notes: string | null;
};

const mapPointOccurrence = (row: any): PointOccurrenceRecord => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id) || null,
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  occurrenceType: upper(row.occurrence_type) as PayrollOccurrenceType,
  dateStart: parseDate(row.date_start) || '',
  dateEnd: parseDate(row.date_end) || parseDate(row.date_start) || '',
  effectCode: clean(row.effect_code) || null,
  notes: clean(row.notes) || null,
});

const buildComparisonKey = (employeeName: string, employeeCpf: string | null) => employeeCpf || normalizeSearch(employeeName);

const buildOperationalKey = ({
  employeeId,
  solidesEmployeeId,
  employeeName,
  employeeCpf,
}: {
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
}) => employeeId || solidesEmployeeId || buildComparisonKey(employeeName, employeeCpf);

const matchesPointFilters = (
  row: {
    employeeName: string;
    employeeCpf: string | null;
    centerCost: string | null;
    unitName: string | null;
    contractType: string | null;
  },
  filters: PointFilters,
) => {
  if (filters.search) {
    const haystack = `${row.employeeName} ${row.employeeCpf || ''}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.centerCost !== 'all' && clean(row.centerCost) !== clean(filters.centerCost)) return false;
  if (filters.unit !== 'all' && clean(row.unitName) !== clean(filters.unit)) return false;
  if (filters.contractType !== 'all' && clean(row.contractType) !== clean(filters.contractType)) return false;
  return true;
};

const buildEmployeeLookupMaps = (employees: PointEmployeeRosterRow[]) => {
  const byId = new Map<string, PointEmployeeRosterRow>();
  const bySolidesId = new Map<string, PointEmployeeRosterRow>();
  const byCpf = new Map<string, PointEmployeeRosterRow>();
  const duplicateCpfs = new Set<string>();

  for (const employee of employees) {
    if (employee.id) byId.set(employee.id, employee);
    if (employee.solidesEmployeeId && !bySolidesId.has(employee.solidesEmployeeId)) {
      bySolidesId.set(employee.solidesEmployeeId, employee);
    }
    if (employee.cpf) {
      if (byCpf.has(employee.cpf)) duplicateCpfs.add(employee.cpf);
      else byCpf.set(employee.cpf, employee);
    }
  }

  for (const cpf of duplicateCpfs) byCpf.delete(cpf);
  return { byId, bySolidesId, byCpf };
};

const resolveEmployeeForRow = (
  row: {
    employeeId: string | null;
    solidesEmployeeId: string | null;
    employeeCpf: string | null;
  },
  lookup: ReturnType<typeof buildEmployeeLookupMaps>,
) => {
  if (row.employeeId && lookup.byId.has(row.employeeId)) return lookup.byId.get(row.employeeId) || null;
  if (row.solidesEmployeeId && lookup.bySolidesId.has(row.solidesEmployeeId)) return lookup.bySolidesId.get(row.solidesEmployeeId) || null;
  if (row.employeeCpf && lookup.byCpf.has(row.employeeCpf)) return lookup.byCpf.get(row.employeeCpf) || null;
  return null;
};

const ensurePointTables = async (db: DbInterface) => {
  if (tablesEnsured) return;
  await ensureEmployeesTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_sync_jobs (
      id VARCHAR(64) PRIMARY KEY,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NULL,
      error_message LONGTEXT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT NULL,
      finished_at TEXT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_sync_runs (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NULL,
      status VARCHAR(20) NOT NULL,
      source_label VARCHAR(120) NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      synchronized_employees INTEGER NOT NULL DEFAULT 0,
      synchronized_days INTEGER NOT NULL DEFAULT 0,
      unmatched_employees INTEGER NOT NULL DEFAULT 0,
      pending_adjustments INTEGER NOT NULL DEFAULT 0,
      pending_signatures INTEGER NOT NULL DEFAULT 0,
      details LONGTEXT NULL,
      started_at TEXT NULL,
      finished_at TEXT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_daily (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_code VARCHAR(120) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      point_date DATE NOT NULL,
      department VARCHAR(180) NULL,
      schedule_label VARCHAR(180) NULL,
      schedule_start VARCHAR(10) NULL,
      schedule_end VARCHAR(10) NULL,
      marks_json LONGTEXT NULL,
      raw_day_text TEXT NULL,
      planned_minutes INTEGER NOT NULL DEFAULT 0,
      worked_minutes INTEGER NOT NULL DEFAULT 0,
      late_minutes INTEGER NOT NULL DEFAULT 0,
      day_balance_minutes INTEGER NOT NULL DEFAULT 0,
      break_minutes INTEGER NOT NULL DEFAULT 0,
      expected_break_minutes INTEGER NOT NULL DEFAULT 0,
      break_overrun_minutes INTEGER NOT NULL DEFAULT 0,
      pending_adjustments_count INTEGER NOT NULL DEFAULT 0,
      absence_flag INTEGER NOT NULL DEFAULT 0,
      inconsistency_flag INTEGER NOT NULL DEFAULT 0,
      justification_text TEXT NULL,
      source_payload_json LONGTEXT NULL,
      last_sync_run_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_occurrences (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      occurrence_type VARCHAR(30) NOT NULL,
      date_start DATE NOT NULL,
      date_end DATE NULL,
      effect_code VARCHAR(40) NULL,
      notes TEXT NULL,
      source_payload_json LONGTEXT NULL,
      last_sync_run_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_hours_balance_monthly (
      id VARCHAR(64) PRIMARY KEY,
      reference_month VARCHAR(7) NOT NULL,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      balance_minutes INTEGER NOT NULL DEFAULT 0,
      reference_start DATE NULL,
      reference_end DATE NULL,
      source_payload_json LONGTEXT NULL,
      last_sync_run_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_signature_monthly (
      id VARCHAR(64) PRIMARY KEY,
      reference_month VARCHAR(7) NOT NULL,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      status VARCHAR(30) NOT NULL,
      document_type VARCHAR(120) NULL,
      document_date DATE NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      signed_at TEXT NULL,
      message TEXT NULL,
      source_payload_json LONGTEXT NULL,
      last_sync_run_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_artifacts (
      id VARCHAR(64) PRIMARY KEY,
      sync_run_id VARCHAR(64) NULL,
      artifact_type VARCHAR(40) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeCreateIndex(db, `CREATE INDEX idx_point_sync_jobs_status ON point_sync_jobs (status, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_sync_runs_created ON point_sync_runs (created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_daily_date ON point_daily (point_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_daily_employee ON point_daily (employee_id, point_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_daily_solides ON point_daily (solides_employee_id, point_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_occurrences_date ON point_occurrences (date_start, date_end)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_occurrences_employee ON point_occurrences (employee_id, date_start)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_hours_balance_ref ON point_hours_balance_monthly (reference_month, employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_signature_ref ON point_signature_monthly (reference_month, employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_artifacts_created ON point_artifacts (created_at)`);

  await safeAddColumn(db, `ALTER TABLE point_daily ADD COLUMN employee_code VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_daily ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrences ADD COLUMN solides_employee_id VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrences ADD COLUMN employee_name VARCHAR(180) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE point_occurrences ADD COLUMN employee_cpf VARCHAR(14) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrences ADD COLUMN source_payload_json LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrences ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_hours_balance_monthly ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_signature_monthly ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_artifacts ADD COLUMN sync_run_id VARCHAR(64) NULL`);

  tablesEnsured = true;
};

const loadEmployeeRosterForRange = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT id, full_name, cpf, employment_regime, cost_center, units_json, solides_employee_id, solides_external_id
    FROM employees
    WHERE (admission_date IS NULL OR admission_date <= ?)
      AND (termination_date IS NULL OR termination_date >= ?)
    ORDER BY full_name ASC
    `,
    [dateRange.endDate, dateRange.startDate],
  );
  return rows.map(mapEmployeeRosterRow);
};

const listPointDailyRecordsRaw = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM point_daily
    WHERE point_date >= ?
      AND point_date <= ?
    ORDER BY point_date ASC, employee_name ASC
    `,
    [dateRange.startDate, dateRange.endDate],
  );
  return rows.map(mapPointDailyRecord);
};

const listPointOccurrenceRecordsRaw = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM point_occurrences
    WHERE date_start <= ?
      AND COALESCE(date_end, date_start) >= ?
    ORDER BY date_start ASC, employee_name ASC
    `,
    [dateRange.endDate, dateRange.startDate],
  );
  return rows.map(mapPointOccurrence);
};

const listPointHoursBalanceRaw = async (db: DbInterface, referenceMonth: string) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `SELECT * FROM point_hours_balance_monthly WHERE reference_month = ? ORDER BY employee_name ASC`,
    [referenceMonth],
  );
  return rows.map(mapPointHoursBalance);
};

const listPointSignatureRaw = async (db: DbInterface, referenceMonth: string) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `SELECT * FROM point_signature_monthly WHERE reference_month = ? ORDER BY employee_name ASC`,
    [referenceMonth],
  );
  return rows.map(mapPointSignature);
};

const getLatestPointSyncRun = async (db: DbInterface) => {
  await ensurePointTables(db);
  const rows = await db.query(`SELECT * FROM point_sync_runs ORDER BY created_at DESC LIMIT 1`);
  return rows[0] ? mapPointSyncRun(rows[0]) : null;
};

const getLatestPointArtifact = async (db: DbInterface) => {
  await ensurePointTables(db);
  const rows = await db.query(`SELECT * FROM point_artifacts ORDER BY created_at DESC LIMIT 1`);
  return rows[0] ? mapPointArtifact(rows[0]) : null;
};

const countCoveredDays = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT COUNT(DISTINCT point_date) AS covered_days
    FROM point_daily
    WHERE point_date >= ?
      AND point_date <= ?
    `,
    [dateRange.startDate, dateRange.endDate],
  );
  return Number((rows?.[0] as any)?.covered_days || 0);
};

export const getPointHeartbeat = async (db: DbInterface): Promise<PointServiceHeartbeat> => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT service_name, status, last_run, details
    FROM system_status
    WHERE service_name = ?
    LIMIT 1
    `,
    ['point_sync'],
  );
  const row = rows?.[0] as any;
  return {
    serviceName: clean(row?.service_name) || 'point_sync',
    status: clean(row?.status) || 'UNKNOWN',
    lastRun: clean(row?.last_run) || null,
    details: clean(row?.details) || null,
  };
};

export const getPointOptions = async (db: DbInterface): Promise<PointOptions> => {
  await ensurePointTables(db);
  const [centerRows, unitRows, contractRows] = await Promise.all([
    db.query(`SELECT DISTINCT TRIM(cost_center) AS value FROM employees WHERE cost_center IS NOT NULL AND TRIM(cost_center) <> '' ORDER BY value ASC`),
    db.query(`SELECT DISTINCT TRIM(units_json) AS value FROM employees WHERE units_json IS NOT NULL AND TRIM(units_json) <> ''`),
    db.query(`SELECT DISTINCT TRIM(employment_regime) AS value FROM employees WHERE employment_regime IS NOT NULL AND TRIM(employment_regime) <> '' ORDER BY value ASC`),
  ]);

  const units = Array.from(new Set(unitRows.flatMap((row: any) => parseUnitsJson(row.value)))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
  );

  return {
    centersCost: centerRows.map((row: any) => clean(row.value)).filter(Boolean),
    units,
    contractTypes: contractRows.map((row: any) => clean(row.value)).filter(Boolean),
  };
};

export const getPointOverview = async (db: DbInterface, dateRange: PointDateRange): Promise<PointOverview> => {
  await ensurePointTables(db);
  const [heartbeat, latestRun, latestArtifact, coveredDays] = await Promise.all([
    getPointHeartbeat(db),
    getLatestPointSyncRun(db),
    getLatestPointArtifact(db),
    countCoveredDays(db, dateRange),
  ]);

  const alerts: string[] = [];
  const requestedDays = diffDaysInclusive(dateRange.startDate, dateRange.endDate);

  if (!latestRun) {
    alerts.push('Nenhuma sincronização concluída foi registrada para a base de ponto.');
  }

  if (coveredDays === 0) {
    alerts.push('Não há dados sincronizados da Sólides para o intervalo selecionado.');
  } else if (coveredDays < requestedDays) {
    alerts.push('O intervalo selecionado está coberto apenas parcialmente pela base sincronizada.');
  }

  return {
    dateRange,
    heartbeat,
    syncWindow: latestRun ? { startDate: latestRun.windowStart, endDate: latestRun.windowEnd } : null,
    latestRun,
    latestArtifact,
    alerts,
  };
};

const buildDailyDisplayRows = (
  pointRows: PointDailyRecord[],
  employees: PointEmployeeRosterRow[],
  filters: PointFilters,
) => {
  const lookup = buildEmployeeLookupMaps(employees);
  const grouped = new Map<string, { base: PointDailyRecord; rows: PointDailyRecord[]; employee: PointEmployeeRosterRow | null }>();

  for (const row of pointRows) {
    const key = buildOperationalKey(row);
    if (!key) continue;
    const current = grouped.get(key);
    const employee = resolveEmployeeForRow(row, lookup);
    if (!current) {
      grouped.set(key, { base: row, rows: [row], employee });
      continue;
    }
    current.rows.push(row);
    if (!current.employee && employee) current.employee = employee;
  }

  const items: PointDailyControlRow[] = [];
  for (const item of grouped.values()) {
    const employeeName = item.employee?.fullName || item.base.employeeName;
    const employeeCpf = item.employee?.cpf || item.base.employeeCpf;
    const centerCost = item.employee?.costCenter || null;
    const contractType = item.employee?.employmentRegime || null;
    const unitName = item.employee?.units[0] || null;
    if (!matchesPointFilters({ employeeName, employeeCpf, centerCost, unitName, contractType }, filters)) continue;

    const plannedMinutes = item.rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
    const workedMinutes = item.rows.reduce((sum, row) => sum + row.workedMinutes, 0);
    const dayBalanceMinutes = item.rows.reduce((sum, row) => sum + row.dayBalanceMinutes, 0);
    const lateMinutes = item.rows.reduce((sum, row) => sum + row.lateMinutes, 0);
    const breakOverrunMinutes = item.rows.reduce((sum, row) => sum + row.breakOverrunMinutes, 0);
    const absenceDays = item.rows.filter((row) => row.absenceFlag).length;
    const workedDays = item.rows.filter((row) => row.workedMinutes > 0 || !row.absenceFlag).length;
    const pendingAdjustments = item.rows.reduce((sum, row) => sum + row.pendingAdjustmentsCount, 0);
    const status =
      pendingAdjustments > 0 || breakOverrunMinutes > 0 || item.rows.some((row) => row.inconsistencyFlag)
        ? 'ATENCAO'
        : item.rows.length === 0
          ? 'PENDENTE'
          : 'OK';

    items.push({
      key: buildOperationalKey({
        employeeId: item.base.employeeId,
        solidesEmployeeId: item.base.solidesEmployeeId,
        employeeName,
        employeeCpf,
      }),
      employeeId: item.employee?.id || item.base.employeeId,
      employeeName,
      employeeCpf,
      centerCost,
      contractType,
      workedDays,
      absenceDays,
      lateMinutes,
      plannedMinutes,
      workedMinutes,
      dayBalanceMinutes,
      breakOverrunMinutes,
      pendingAdjustments,
      pointSource: 'SOLIDES',
      employeeSource: 'PAINEL',
      status,
    });
  }

  return items.sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' }));
};

const buildMonthlyDisplayRows = <TRow extends { employeeId: string | null; solidesEmployeeId: string | null; employeeName: string; employeeCpf: string | null }>(
  rows: TRow[],
  employees: PointEmployeeRosterRow[],
  filters: PointFilters,
) => {
  const lookup = buildEmployeeLookupMaps(employees);
  return rows
    .map((row) => {
      const employee = resolveEmployeeForRow(row, lookup);
      return {
        row,
        employeeName: employee?.fullName || row.employeeName,
        employeeCpf: employee?.cpf || row.employeeCpf,
        centerCost: employee?.costCenter || null,
        unitName: employee?.units[0] || null,
        contractType: employee?.employmentRegime || null,
      };
    })
    .filter((item) =>
      matchesPointFilters(
        {
          employeeName: item.employeeName,
          employeeCpf: item.employeeCpf,
          centerCost: item.centerCost,
          unitName: item.unitName,
          contractType: item.contractType,
        },
        filters,
      ),
    )
    .map((item) => ({
      ...item.row,
      employeeName: item.employeeName,
      employeeCpf: item.employeeCpf,
    }))
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' }));
};

export const listPointDailyControlRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, filters: PointFilters) => {
  await ensurePointTables(db);
  const [pointRows, employees] = await Promise.all([listPointDailyRecordsRaw(db, dateRange), loadEmployeeRosterForRange(db, dateRange)]);
  if (!pointRows.length) return { items: [] as PointDailyControlRow[] };
  return { items: buildDailyDisplayRows(pointRows, employees, filters) };
};

export const listPointHoursBalanceRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, filters: PointFilters) => {
  await ensurePointTables(db);
  const referenceMonth = dateRange.startDate.slice(0, 7);
  const [rows, employees] = await Promise.all([listPointHoursBalanceRaw(db, referenceMonth), loadEmployeeRosterForRange(db, dateRange)]);
  return { items: buildMonthlyDisplayRows(rows, employees, filters) };
};

export const listPointSignatureRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, filters: PointFilters) => {
  await ensurePointTables(db);
  const referenceMonth = dateRange.startDate.slice(0, 7);
  const [rows, employees] = await Promise.all([listPointSignatureRaw(db, referenceMonth), loadEmployeeRosterForRange(db, dateRange)]);
  return { items: buildMonthlyDisplayRows(rows, employees, filters) };
};

export const listPointVacationRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, filters: PointFilters) => {
  await ensurePointTables(db);
  const [rows, employees] = await Promise.all([listPointOccurrenceRecordsRaw(db, dateRange), loadEmployeeRosterForRange(db, dateRange)]);
  const lookup = buildEmployeeLookupMaps(employees);
  const items: PointVacationRow[] = rows
    .filter((row) => row.occurrenceType === 'FERIAS')
    .map((row) => {
      const employee = resolveEmployeeForRow(row, lookup);
      return {
        id: row.id,
        employeeId: employee?.id || row.employeeId,
        employeeName: employee?.fullName || row.employeeName,
        employeeCpf: employee?.cpf || row.employeeCpf,
        centerCost: employee?.costCenter || null,
        unitName: employee?.units[0] || null,
        contractType: employee?.employmentRegime || null,
        dateStart: row.dateStart,
        dateEnd: row.dateEnd,
        notes: row.notes,
        source: 'SOLIDES' as const,
      };
    })
    .filter((row) =>
      matchesPointFilters(
        {
          employeeName: row.employeeName,
          employeeCpf: row.employeeCpf,
          centerCost: row.centerCost,
          unitName: row.unitName,
          contractType: row.contractType,
        },
        filters,
      ),
    )
    .map(({ centerCost: _centerCost, unitName: _unitName, contractType: _contractType, ...row }) => row)
    .sort((left, right) => {
      if (left.dateStart !== right.dateStart) return left.dateStart.localeCompare(right.dateStart);
      return left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' });
    });

  return { items };
};

export const enqueuePointSync = async (db: DbInterface, requestedBy: string) => {
  await ensurePointTables(db);
  return runInTransaction(db, async (tx) => {
    const blockingRows = await tx.query(
      `SELECT id FROM point_sync_jobs WHERE status IN ('PENDING', 'RUNNING') ORDER BY created_at DESC LIMIT 1`,
    );
    if (blockingRows[0]) {
      throw new PointValidationError('Já existe uma sincronização de ponto em andamento.', 409);
    }

    const now = NOW();
    const { startDate, endDate } = buildLastThirtyDaysWindow();
    const jobId = randomUUID();
    const runId = randomUUID();

    await tx.execute(
      `
      INSERT INTO point_sync_jobs (id, window_start, window_end, status, requested_by, error_message, created_at, started_at, finished_at)
      VALUES (?, ?, ?, 'PENDING', ?, NULL, ?, NULL, NULL)
      `,
      [jobId, startDate, endDate, requestedBy, now],
    );

    await tx.execute(
      `
      INSERT INTO point_sync_runs (
        id, job_id, status, source_label, window_start, window_end, synchronized_employees, synchronized_days,
        unmatched_employees, pending_adjustments, pending_signatures, details, started_at, finished_at, created_at
      ) VALUES (?, ?, 'PENDING', 'API Sólides', ?, ?, 0, 0, 0, 0, 0, ?, NULL, NULL, ?)
      `,
      [runId, jobId, startDate, endDate, `Janela enfileirada: ${startDate} a ${endDate}.`, now],
    );

    return {
      window: { startDate, endDate },
      job: {
        id: jobId,
        windowStart: startDate,
        windowEnd: endDate,
        status: 'PENDING' as PayrollSyncJobStatus,
        requestedBy,
        errorMessage: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      },
      run: {
        id: runId,
        jobId,
        status: 'PENDING' as PayrollSyncJobStatus,
        sourceLabel: 'API Sólides',
        windowStart: startDate,
        windowEnd: endDate,
        synchronizedEmployees: 0,
        synchronizedDays: 0,
        unmatchedEmployees: 0,
        pendingAdjustments: 0,
        pendingSignatures: 0,
        details: `Janela enfileirada: ${startDate} a ${endDate}.`,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
      },
    };
  });
};

export const getPointArtifactById = async (db: DbInterface, artifactId: string) => {
  await ensurePointTables(db);
  const rows = await db.query(`SELECT * FROM point_artifacts WHERE id = ? LIMIT 1`, [artifactId]);
  if (!rows[0]) return null;
  return mapPointArtifact(rows[0]);
};

export const getPointSyncReferenceMonths = async (db: DbInterface) => {
  await ensurePointTables(db);
  const rows = await db.query(`SELECT DISTINCT reference_month AS value FROM point_hours_balance_monthly ORDER BY value DESC`);
  return rows.map((row: any) => clean(row.value)).filter(Boolean);
};

export const getPointCoveredMonthRefsByDateRange = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const expected = listMonthRefsInRange(dateRange.startDate, dateRange.endDate);
  const rows = await db.query(
    `
    SELECT DISTINCT SUBSTR(point_date, 1, 7) AS value
    FROM point_daily
    WHERE point_date >= ?
      AND point_date <= ?
    ORDER BY value ASC
    `,
    [dateRange.startDate, dateRange.endDate],
  );
  const covered = rows.map((row: any) => clean(row.value)).filter(Boolean);
  return { expected, covered };
};
