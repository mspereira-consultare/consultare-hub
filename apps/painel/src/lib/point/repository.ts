import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { runInTransaction } from '@/lib/db';
import { ensureEmployeesTables } from '@/lib/colaboradores/repository';
import {
  buildDayOverrideLookup,
  buildOccurrenceOverrideLookup,
  buildPointEmployeeKey,
  type EffectiveResolvedOccurrence,
  findPrimaryOccurrenceForDate,
  resolveEffectiveDay,
  resolveEffectiveOccurrence,
  resolveOrphanedOccurrenceOverride,
  type PointDayOverrideLike,
  type PointOccurrenceOverrideLike,
} from '@/lib/point/effective';
import type { PayrollOccurrenceType, PayrollSignatureStatus, PayrollSyncJobStatus } from '@/lib/payroll/constants';
import type {
  PointArtifact,
  PointBulkOverrideInput,
  PointDailyControlRow,
  PointDailyAdjustmentRow,
  PointDayOverride,
  PointDayOverrideInput,
  PointDailyRecord,
  PointDateRange,
  PointEmployeeAdjustmentDetail,
  PointFilters,
  PointHoursBalanceMonthly,
  PointOccurrenceAdjustmentRow,
  PointOccurrenceOverride,
  PointOccurrenceOverrideInput,
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

const normalizeSyncWindow = (window?: Partial<PointDateRange> | null): PointDateRange => {
  if (!window?.startDate && !window?.endDate) {
    return buildLastThirtyDaysWindow();
  }

  const startDate = parseDate(window?.startDate || '');
  const endDate = parseDate(window?.endDate || '');
  if (!startDate || !endDate) {
    throw new PointValidationError('Janela de sincronização inválida. Informe data inicial e final em formato ISO.');
  }
  if (endDate < startDate) {
    throw new PointValidationError('A data final da sincronização não pode ser menor que a data inicial.');
  }

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
  totalEmployees: Number(row.total_employees || 0),
  processedEmployees: Number(row.processed_employees || 0),
  processedDays: Number(row.processed_days || 0),
  currentStage: clean(row.current_stage) || null,
  progressPercent: row.progress_percent === null || row.progress_percent === undefined || row.progress_percent === '' ? null : Number(row.progress_percent),
  lastProgressAt: clean(row.last_progress_at) || null,
  estimatedRemainingSeconds: row.estimated_remaining_seconds === null || row.estimated_remaining_seconds === undefined || row.estimated_remaining_seconds === '' ? null : Number(row.estimated_remaining_seconds),
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

const normalizeEligibilityMode = (value: unknown) => {
  const normalized = upper(value);
  if (normalized === 'INCLUDE' || normalized === 'EXCLUDE') return normalized;
  return 'DEFAULT';
};

const mapPointOccurrenceOverride = (row: any): PointOccurrenceOverride => ({
  id: clean(row.id),
  occurrenceId: clean(row.occurrence_id),
  employeeId: clean(row.employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  originalOccurrenceType: clean(row.original_occurrence_type) ? (upper(row.original_occurrence_type) as PayrollOccurrenceType) : null,
  originalDateStart: parseDate(row.original_date_start),
  originalDateEnd: parseDate(row.original_date_end),
  overrideOccurrenceType: clean(row.override_occurrence_type) ? (upper(row.override_occurrence_type) as PayrollOccurrenceType) : null,
  ignored: bool(row.ignored),
  notes: clean(row.notes) || null,
  sourceSnapshotJson: clean(row.source_snapshot_json) || null,
  createdBy: clean(row.created_by) || null,
  updatedBy: clean(row.updated_by) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPointDayOverride = (row: any): PointDayOverride => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  pointDate: parseDate(row.point_date) || '',
  payrollDayMode: normalizeEligibilityMode(row.payroll_day_mode),
  vtDayMode: normalizeEligibilityMode(row.vt_day_mode),
  vrDayMode: normalizeEligibilityMode(row.vr_day_mode),
  notes: clean(row.notes) || null,
  createdBy: clean(row.created_by) || null,
  updatedBy: clean(row.updated_by) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
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
  if (filters.contractTypes.length > 0 && !filters.contractTypes.some((item) => clean(row.contractType) === clean(item))) return false;
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

export const ensurePointTables = async (db: DbInterface) => {
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
      total_employees INTEGER NOT NULL DEFAULT 0,
      processed_employees INTEGER NOT NULL DEFAULT 0,
      processed_days INTEGER NOT NULL DEFAULT 0,
      current_stage VARCHAR(40) NULL,
      progress_percent DECIMAL(5,2) NULL,
      last_progress_at TEXT NULL,
      estimated_remaining_seconds INTEGER NULL,
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
    CREATE TABLE IF NOT EXISTS point_occurrence_overrides (
      id VARCHAR(64) PRIMARY KEY,
      occurrence_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      original_occurrence_type VARCHAR(30) NULL,
      original_date_start DATE NULL,
      original_date_end DATE NULL,
      override_occurrence_type VARCHAR(30) NULL,
      ignored INTEGER NOT NULL DEFAULT 0,
      notes TEXT NULL,
      source_snapshot_json LONGTEXT NULL,
      created_by VARCHAR(64) NULL,
      updated_by VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(occurrence_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS point_day_overrides (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      point_date DATE NOT NULL,
      payroll_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT',
      vt_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT',
      vr_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT',
      notes TEXT NULL,
      created_by VARCHAR(64) NULL,
      updated_by VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(employee_id, point_date)
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
  await safeCreateIndex(db, `CREATE INDEX idx_point_occurrence_overrides_employee ON point_occurrence_overrides (employee_id, original_date_start)`);
  await safeCreateIndex(db, `CREATE INDEX idx_point_day_overrides_employee ON point_day_overrides (employee_id, point_date)`);
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
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN employee_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN employee_name VARCHAR(180) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN employee_cpf VARCHAR(14) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN original_occurrence_type VARCHAR(30) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN original_date_start DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN original_date_end DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN override_occurrence_type VARCHAR(30) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN source_snapshot_json LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN created_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN updated_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN created_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_occurrence_overrides ADD COLUMN updated_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN payroll_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT'`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN vt_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT'`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN vr_day_mode VARCHAR(10) NOT NULL DEFAULT 'DEFAULT'`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN created_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN updated_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN created_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_day_overrides ADD COLUMN updated_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_hours_balance_monthly ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_signature_monthly ADD COLUMN last_sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_artifacts ADD COLUMN sync_run_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN total_employees INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN processed_employees INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN processed_days INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN current_stage VARCHAR(40) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN progress_percent DECIMAL(5,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN last_progress_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE point_sync_runs ADD COLUMN estimated_remaining_seconds INTEGER NULL`);

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

const listPointOccurrenceOverridesRaw = async (db: DbInterface, dateRange: PointDateRange, employeeId?: string) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM point_occurrence_overrides
    WHERE (
      (original_date_start IS NOT NULL AND original_date_start <= ? AND COALESCE(original_date_end, original_date_start) >= ?)
      OR original_date_start IS NULL
    )
      ${employeeId ? 'AND employee_id = ?' : ''}
    ORDER BY COALESCE(original_date_start, created_at) ASC, employee_name ASC
    `,
    employeeId ? [dateRange.endDate, dateRange.startDate, employeeId] : [dateRange.endDate, dateRange.startDate],
  );
  return rows.map(mapPointOccurrenceOverride);
};

const listPointDayOverridesRaw = async (db: DbInterface, dateRange: PointDateRange, employeeId?: string) => {
  await ensurePointTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM point_day_overrides
    WHERE point_date >= ?
      AND point_date <= ?
      ${employeeId ? 'AND employee_id = ?' : ''}
    ORDER BY point_date ASC
    `,
    employeeId ? [dateRange.startDate, dateRange.endDate, employeeId] : [dateRange.startDate, dateRange.endDate],
  );
  return rows.map(mapPointDayOverride);
};

const buildEffectiveOccurrenceRows = (
  rows: PointOccurrenceRecord[],
  overrides: PointOccurrenceOverride[],
): EffectiveResolvedOccurrence[] => {
  const overrideLookup = buildOccurrenceOverrideLookup(overrides as PointOccurrenceOverrideLike[]);
  const items: EffectiveResolvedOccurrence[] = rows.map((row) => resolveEffectiveOccurrence(row, overrideLookup.get(row.id) || null));
  const existingIds = new Set(rows.map((row) => row.id));
  for (const override of overrides) {
    if (existingIds.has(override.occurrenceId)) continue;
    items.push(resolveOrphanedOccurrenceOverride(override as PointOccurrenceOverrideLike));
  }
  return items.sort((left, right) => {
    if (left.dateStart !== right.dateStart) return left.dateStart.localeCompare(right.dateStart);
    return left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' });
  });
};

const buildEffectiveDailyRows = (
  rows: PointDailyRecord[],
  occurrences: EffectiveResolvedOccurrence[],
  dayOverrides: PointDayOverride[],
): PointDailyAdjustmentRow[] => {
  const occurrenceByEmployee = new Map<string, EffectiveResolvedOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = buildPointEmployeeKey(occurrence);
    const list = occurrenceByEmployee.get(key) || [];
    list.push(occurrence);
    occurrenceByEmployee.set(key, list);
  }
  const dayOverrideLookup = buildDayOverrideLookup(dayOverrides as PointDayOverrideLike[]);

  return rows.map((row) => {
    const employeeKey = buildPointEmployeeKey(row);
    const pointDate = row.pointDate;
    const dayOccurrenceList = occurrenceByEmployee.get(employeeKey) || [];
    const primaryOccurrence = findPrimaryOccurrenceForDate(pointDate, dayOccurrenceList);
    const dayOverride =
      row.employeeId
        ? (dayOverrideLookup.get(`${row.employeeId}:${pointDate}`) || null)
        : null;
    return resolveEffectiveDay(row, primaryOccurrence, dayOverride);
  });
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
  pointRows: PointDailyAdjustmentRow[],
  employees: PointEmployeeRosterRow[],
  filters: PointFilters,
) => {
  const lookup = buildEmployeeLookupMaps(employees);
  const grouped = new Map<string, { base: PointDailyAdjustmentRow; rows: PointDailyAdjustmentRow[]; employee: PointEmployeeRosterRow | null }>();

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

    const plannedMinutes = item.rows.reduce((sum, row) => sum + row.effectivePlannedMinutes, 0);
    const workedMinutes = item.rows.reduce((sum, row) => sum + row.effectiveWorkedMinutes, 0);
    const dayBalanceMinutes = item.rows.reduce((sum, row) => sum + row.effectiveDayBalanceMinutes, 0);
    const lateMinutes = item.rows.reduce((sum, row) => sum + row.effectiveLateMinutes, 0);
    const breakOverrunMinutes = item.rows.reduce((sum, row) => sum + row.effectiveBreakOverrunMinutes, 0);
    const absenceDays = item.rows.filter((row) => row.effectiveEligibility.absence).length;
    const workedDays = item.rows.filter((row) => row.effectiveEligibility.payrollDay).length;
    const pendingAdjustments = item.rows.reduce((sum, row) => sum + row.pendingAdjustmentsCount, 0);
    const hasOverride = item.rows.some((row) => row.hasOverride);
    const overrideSummaries = Array.from(new Set(item.rows.map((row) => row.overrideSummary).filter(Boolean)));
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
      hasOverride,
      overrideSummary: overrideSummaries[0] || null,
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
  const [effectivePointRows, employees] = await Promise.all([
    listPointDailyAdjustmentRowsByDateRange(db, dateRange),
    loadEmployeeRosterForRange(db, dateRange),
  ]);
  if (!effectivePointRows.length) return { items: [] as PointDailyControlRow[] };
  return { items: buildDailyDisplayRows(effectivePointRows, employees, filters) };
};

export const listPointDailyAdjustmentRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, employeeId?: string) => {
  await ensurePointTables(db);
  const [pointRows, occurrenceRows, dayOverrides, occurrenceOverrides] = await Promise.all([
    listPointDailyRecordsRaw(db, dateRange),
    listPointOccurrenceRecordsRaw(db, dateRange),
    listPointDayOverridesRaw(db, dateRange, employeeId),
    listPointOccurrenceOverridesRaw(db, dateRange, employeeId),
  ]);
  const filteredPointRows = employeeId ? pointRows.filter((row) => row.employeeId === employeeId) : pointRows;
  const filteredOccurrenceRows = employeeId ? occurrenceRows.filter((row) => row.employeeId === employeeId) : occurrenceRows;
  const effectiveOccurrences = buildEffectiveOccurrenceRows(filteredOccurrenceRows, occurrenceOverrides);
  return buildEffectiveDailyRows(filteredPointRows, effectiveOccurrences, dayOverrides)
    .sort((left, right) => left.pointDate.localeCompare(right.pointDate));
};

export const listPointOccurrenceAdjustmentRowsByDateRange = async (db: DbInterface, dateRange: PointDateRange, employeeId?: string) => {
  await ensurePointTables(db);
  const [rows, overrides] = await Promise.all([
    listPointOccurrenceRecordsRaw(db, dateRange),
    listPointOccurrenceOverridesRaw(db, dateRange, employeeId),
  ]);
  const filteredRows = employeeId ? rows.filter((row) => row.employeeId === employeeId) : rows;
  return buildEffectiveOccurrenceRows(filteredRows, overrides);
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
  const [effectiveRows, employees] = await Promise.all([
    listPointOccurrenceAdjustmentRowsByDateRange(db, dateRange),
    loadEmployeeRosterForRange(db, dateRange),
  ]);
  const lookup = buildEmployeeLookupMaps(employees);
  const items: PointVacationRow[] = effectiveRows
    .filter((row) => row.effectiveOccurrenceType === 'FERIAS')
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
        originalOccurrenceType: row.originalOccurrenceType,
        effectiveOccurrenceType: row.effectiveOccurrenceType,
        hasOverride: row.hasOverride,
        overrideSummary: row.overrideSummary,
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

export const getPointEmployeeAdjustmentDetail = async (
  db: DbInterface,
  params: { employeeId: string; dateRange: PointDateRange },
): Promise<PointEmployeeAdjustmentDetail> => {
  await ensurePointTables(db);
  const employeeId = clean(params.employeeId);
  if (!employeeId) throw new PointValidationError('Colaborador inválido para editar ajustes operacionais.', 400);

  const [employees, dailyRows, occurrenceRows, dayOverrides, occurrenceOverrides] = await Promise.all([
    loadEmployeeRosterForRange(db, params.dateRange),
    listPointDailyRecordsRaw(db, params.dateRange),
    listPointOccurrenceRecordsRaw(db, params.dateRange),
    listPointDayOverridesRaw(db, params.dateRange, employeeId),
    listPointOccurrenceOverridesRaw(db, params.dateRange, employeeId),
  ]);

  const lookup = buildEmployeeLookupMaps(employees);
  const employee = lookup.byId.get(employeeId) || null;
  const filteredDailyRows = dailyRows.filter((row) => row.employeeId === employeeId);
  const filteredOccurrenceRows = occurrenceRows.filter((row) => row.employeeId === employeeId);
  const effectiveOccurrences = buildEffectiveOccurrenceRows(filteredOccurrenceRows, occurrenceOverrides);
  const effectiveDailyRows = buildEffectiveDailyRows(filteredDailyRows, effectiveOccurrences, dayOverrides)
    .sort((left, right) => left.pointDate.localeCompare(right.pointDate));

  const baseName = employee?.fullName || effectiveDailyRows[0]?.employeeName || effectiveOccurrences[0]?.employeeName || 'Colaborador';
  const baseCpf = employee?.cpf || effectiveDailyRows[0]?.employeeCpf || effectiveOccurrences[0]?.employeeCpf || null;

  return {
    employee: {
      employeeId,
      solidesEmployeeId: employee?.solidesEmployeeId || effectiveDailyRows[0]?.solidesEmployeeId || effectiveOccurrences[0]?.solidesEmployeeId || null,
      employeeName: baseName,
      employeeCpf: baseCpf,
      centerCost: employee?.costCenter || null,
      unitName: employee?.units[0] || null,
      contractType: employee?.employmentRegime || null,
    },
    dateRange: params.dateRange,
    dailyRows: effectiveDailyRows,
    occurrenceRows: effectiveOccurrences,
    overrideSummary: {
      dayOverrides: dayOverrides.length,
      occurrenceOverrides: occurrenceOverrides.length,
      hasOverrides: dayOverrides.length > 0 || occurrenceOverrides.length > 0,
    },
  };
};

const serializeOccurrenceSnapshot = (occurrence: PointOccurrenceRecord) =>
  JSON.stringify({
    id: occurrence.id,
    employeeId: occurrence.employeeId,
    solidesEmployeeId: occurrence.solidesEmployeeId,
    employeeName: occurrence.employeeName,
    employeeCpf: occurrence.employeeCpf,
    occurrenceType: occurrence.occurrenceType,
    dateStart: occurrence.dateStart,
    dateEnd: occurrence.dateEnd,
    notes: occurrence.notes,
  });

const getPointOccurrenceOrThrow = async (db: DbInterface, occurrenceId: string) => {
  const rows = await db.query(`SELECT * FROM point_occurrences WHERE id = ? LIMIT 1`, [occurrenceId]);
  if (!rows[0]) throw new PointValidationError('Ocorrência sincronizada não encontrada.', 404);
  return mapPointOccurrence(rows[0]);
};

const getPointDayOrThrow = async (db: DbInterface, employeeId: string, pointDate: string) => {
  const rows = await db.query(
    `SELECT * FROM point_daily WHERE employee_id = ? AND point_date = ? LIMIT 1`,
    [employeeId, pointDate],
  );
  if (!rows[0]) throw new PointValidationError('Dia sincronizado não encontrado para este colaborador.', 404);
  return mapPointDailyRecord(rows[0]);
};

const getPointOccurrenceOverrideByOccurrenceId = async (db: DbInterface, occurrenceId: string) => {
  const rows = await db.query(`SELECT * FROM point_occurrence_overrides WHERE occurrence_id = ? LIMIT 1`, [occurrenceId]);
  return rows[0] ? mapPointOccurrenceOverride(rows[0]) : null;
};

const getPointDayOverrideByIdentity = async (db: DbInterface, employeeId: string, pointDate: string) => {
  const rows = await db.query(`SELECT * FROM point_day_overrides WHERE employee_id = ? AND point_date = ? LIMIT 1`, [employeeId, pointDate]);
  return rows[0] ? mapPointDayOverride(rows[0]) : null;
};

const normalizePointDateOrThrow = (value: unknown) => {
  const pointDate = parseDate(value);
  if (!pointDate) throw new PointValidationError('Data do ajuste inválida.', 400);
  return pointDate;
};

const normalizeOccurrenceOverrideInput = (input: PointOccurrenceOverrideInput) => {
  const overrideOccurrenceType = clean(input.overrideOccurrenceType)
    ? (upper(input.overrideOccurrenceType) as PayrollOccurrenceType)
    : null;
  return {
    overrideOccurrenceType,
    ignored: Boolean(input.ignored),
    notes: clean(input.notes) || null,
  };
};

const normalizeDayOverrideInput = (input: PointDayOverrideInput) => ({
  employeeId: clean(input.employeeId),
  pointDate: normalizePointDateOrThrow(input.pointDate),
  payrollDayMode: normalizeEligibilityMode(input.payrollDayMode),
  vtDayMode: normalizeEligibilityMode(input.vtDayMode),
  vrDayMode: normalizeEligibilityMode(input.vrDayMode),
  notes: clean(input.notes) || null,
});

export const upsertPointOccurrenceOverride = async (
  db: DbInterface,
  occurrenceId: string,
  input: PointOccurrenceOverrideInput,
  actorUserId: string,
) => {
  await ensurePointTables(db);
  const normalizedOccurrenceId = clean(occurrenceId);
  if (!normalizedOccurrenceId) throw new PointValidationError('Ocorrência inválida para ajuste.', 400);
  const occurrence = await getPointOccurrenceOrThrow(db, normalizedOccurrenceId);
  const normalized = normalizeOccurrenceOverrideInput(input);
  const now = NOW();
  const current = await getPointOccurrenceOverrideByOccurrenceId(db, normalizedOccurrenceId);

  if (current) {
    await db.execute(
      `
      UPDATE point_occurrence_overrides
      SET employee_id = ?, employee_name = ?, employee_cpf = ?, original_occurrence_type = ?, original_date_start = ?, original_date_end = ?,
          override_occurrence_type = ?, ignored = ?, notes = ?, source_snapshot_json = ?, updated_by = ?, updated_at = ?
      WHERE occurrence_id = ?
      `,
      [
        occurrence.employeeId,
        occurrence.employeeName,
        occurrence.employeeCpf,
        occurrence.occurrenceType,
        occurrence.dateStart,
        occurrence.dateEnd,
        normalized.overrideOccurrenceType,
        normalized.ignored ? 1 : 0,
        normalized.notes,
        serializeOccurrenceSnapshot(occurrence),
        actorUserId,
        now,
        normalizedOccurrenceId,
      ],
    );
  } else {
    await db.execute(
      `
      INSERT INTO point_occurrence_overrides (
        id, occurrence_id, employee_id, employee_name, employee_cpf, original_occurrence_type, original_date_start, original_date_end,
        override_occurrence_type, ignored, notes, source_snapshot_json, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        normalizedOccurrenceId,
        occurrence.employeeId,
        occurrence.employeeName,
        occurrence.employeeCpf,
        occurrence.occurrenceType,
        occurrence.dateStart,
        occurrence.dateEnd,
        normalized.overrideOccurrenceType,
        normalized.ignored ? 1 : 0,
        normalized.notes,
        serializeOccurrenceSnapshot(occurrence),
        actorUserId,
        actorUserId,
        now,
        now,
      ],
    );
  }

  const updated = await getPointOccurrenceOverrideByOccurrenceId(db, normalizedOccurrenceId);
  if (!updated) throw new PointValidationError('Falha ao persistir override da ocorrência.', 500);
  return updated;
};

export const deletePointOccurrenceOverride = async (db: DbInterface, occurrenceId: string) => {
  await ensurePointTables(db);
  const normalizedOccurrenceId = clean(occurrenceId);
  if (!normalizedOccurrenceId) throw new PointValidationError('Ocorrência inválida para exclusão do ajuste.', 400);
  await db.execute(`DELETE FROM point_occurrence_overrides WHERE occurrence_id = ?`, [normalizedOccurrenceId]);
  return { occurrenceId: normalizedOccurrenceId };
};

export const createPointDayOverride = async (db: DbInterface, input: PointDayOverrideInput, actorUserId: string) => {
  await ensurePointTables(db);
  const normalized = normalizeDayOverrideInput(input);
  if (!normalized.employeeId) throw new PointValidationError('Colaborador inválido para ajuste diário.', 400);
  await getPointDayOrThrow(db, normalized.employeeId, normalized.pointDate);
  const current = await getPointDayOverrideByIdentity(db, normalized.employeeId, normalized.pointDate);
  const now = NOW();

  if (current) {
    await db.execute(
      `
      UPDATE point_day_overrides
      SET payroll_day_mode = ?, vt_day_mode = ?, vr_day_mode = ?, notes = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        normalized.payrollDayMode,
        normalized.vtDayMode,
        normalized.vrDayMode,
        normalized.notes,
        actorUserId,
        now,
        current.id,
      ],
    );
  } else {
    await db.execute(
      `
      INSERT INTO point_day_overrides (
        id, employee_id, point_date, payroll_day_mode, vt_day_mode, vr_day_mode, notes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        normalized.employeeId,
        normalized.pointDate,
        normalized.payrollDayMode,
        normalized.vtDayMode,
        normalized.vrDayMode,
        normalized.notes,
        actorUserId,
        actorUserId,
        now,
        now,
      ],
    );
  }

  const updated = await getPointDayOverrideByIdentity(db, normalized.employeeId, normalized.pointDate);
  if (!updated) throw new PointValidationError('Falha ao persistir override diário.', 500);
  return updated;
};

export const updatePointDayOverride = async (db: DbInterface, overrideId: string, input: Partial<PointDayOverrideInput>, actorUserId: string) => {
  await ensurePointTables(db);
  const normalizedId = clean(overrideId);
  if (!normalizedId) throw new PointValidationError('Override diário inválido.', 400);
  const rows = await db.query(`SELECT * FROM point_day_overrides WHERE id = ? LIMIT 1`, [normalizedId]);
  if (!rows[0]) throw new PointValidationError('Override diário não encontrado.', 404);
  const current = mapPointDayOverride(rows[0]);
  const next = normalizeDayOverrideInput({
    employeeId: current.employeeId,
    pointDate: current.pointDate,
    payrollDayMode: input.payrollDayMode ?? current.payrollDayMode,
    vtDayMode: input.vtDayMode ?? current.vtDayMode,
    vrDayMode: input.vrDayMode ?? current.vrDayMode,
    notes: input.notes ?? current.notes,
  });
  await db.execute(
    `
    UPDATE point_day_overrides
    SET payroll_day_mode = ?, vt_day_mode = ?, vr_day_mode = ?, notes = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [next.payrollDayMode, next.vtDayMode, next.vrDayMode, next.notes, actorUserId, NOW(), normalizedId],
  );
  const updatedRows = await db.query(`SELECT * FROM point_day_overrides WHERE id = ? LIMIT 1`, [normalizedId]);
  return mapPointDayOverride(updatedRows[0]);
};

export const deletePointDayOverride = async (db: DbInterface, overrideId: string) => {
  await ensurePointTables(db);
  const normalizedId = clean(overrideId);
  if (!normalizedId) throw new PointValidationError('Override diário inválido para exclusão.', 400);
  await db.execute(`DELETE FROM point_day_overrides WHERE id = ?`, [normalizedId]);
  return { overrideId: normalizedId };
};

export const applyPointOverrideBulk = async (db: DbInterface, input: PointBulkOverrideInput, actorUserId: string) => {
  await ensurePointTables(db);
  if (input.target === 'DAY') {
    const items = Array.isArray(input.items) ? input.items : [];
    let applied = 0;
    let ignored = 0;
    const reasons: string[] = [];
    for (const item of items) {
      const employeeId = clean(item.employeeId);
      const pointDate = clean(item.pointDate);
      try {
        if (input.action === 'CLEAR') {
          const current = await getPointDayOverrideByIdentity(db, employeeId, normalizePointDateOrThrow(pointDate));
          if (current) {
            await db.execute(`DELETE FROM point_day_overrides WHERE id = ?`, [current.id]);
            applied += 1;
          } else {
            ignored += 1;
          }
        } else {
          await createPointDayOverride(
            db,
            {
              employeeId: item.employeeId,
              pointDate: item.pointDate,
              payrollDayMode: input.payrollDayMode,
              vtDayMode: input.vtDayMode,
              vrDayMode: input.vrDayMode,
              notes: input.notes,
            },
            actorUserId,
          );
          applied += 1;
        }
      } catch (error: any) {
        ignored += 1;
        reasons.push(`${employeeId || 'sem-colaborador'} ${pointDate || 'sem-data'}: ${String(error?.message || error)}`);
      }
    }
    return {
      totalRequested: items.length,
      totalApplied: applied,
      totalIgnored: ignored,
      reasons,
    };
  }

  const occurrenceIds = Array.isArray(input.occurrenceIds) ? input.occurrenceIds.map((item) => clean(item)).filter(Boolean) : [];
  let applied = 0;
  let ignored = 0;
  const reasons: string[] = [];
  for (const occurrenceId of occurrenceIds) {
    try {
      if (input.action === 'CLEAR') {
        await db.execute(`DELETE FROM point_occurrence_overrides WHERE occurrence_id = ?`, [occurrenceId]);
      } else {
        await upsertPointOccurrenceOverride(
          db,
          occurrenceId,
          {
            overrideOccurrenceType: input.overrideOccurrenceType,
            ignored: input.ignored,
            notes: input.notes,
          },
          actorUserId,
        );
      }
      applied += 1;
    } catch (error: any) {
      ignored += 1;
      reasons.push(`${occurrenceId}: ${String(error?.message || error)}`);
    }
  }

  return {
    totalRequested: occurrenceIds.length,
    totalApplied: applied,
    totalIgnored: ignored,
    reasons,
  };
};

export const getPointLatestOverrideByEmployeeForDateRange = async (db: DbInterface, dateRange: PointDateRange) => {
  await ensurePointTables(db);
  const [dailyRows, occurrenceRows, dayOverrideRows, occurrenceOverrideRows] = await Promise.all([
    db.query(
      `
      SELECT employee_id, MAX(updated_at) AS latest_at
      FROM point_daily
      WHERE point_date >= ?
        AND point_date <= ?
        AND employee_id IS NOT NULL
      GROUP BY employee_id
      `,
      [dateRange.startDate, dateRange.endDate],
    ),
    db.query(
      `
      SELECT employee_id, MAX(updated_at) AS latest_at
      FROM point_occurrences
      WHERE date_start <= ?
        AND COALESCE(date_end, date_start) >= ?
        AND employee_id IS NOT NULL
      GROUP BY employee_id
      `,
      [dateRange.endDate, dateRange.startDate],
    ),
    db.query(
      `
      SELECT employee_id, MAX(updated_at) AS latest_at
      FROM point_day_overrides
      WHERE point_date >= ?
        AND point_date <= ?
      GROUP BY employee_id
      `,
      [dateRange.startDate, dateRange.endDate],
    ),
    db.query(
      `
      SELECT employee_id, MAX(updated_at) AS latest_at
      FROM point_occurrence_overrides
      WHERE original_date_start <= ?
        AND COALESCE(original_date_end, original_date_start) >= ?
      GROUP BY employee_id
      `,
      [dateRange.endDate, dateRange.startDate],
    ),
  ]);

  const map = new Map<string, string>();
  for (const row of [...dailyRows, ...occurrenceRows, ...dayOverrideRows, ...occurrenceOverrideRows] as any[]) {
    const employeeId = clean(row.employee_id);
    const latestAt = clean(row.latest_at);
    if (!employeeId || !latestAt) continue;
    const current = map.get(employeeId);
    if (!current || latestAt > current) map.set(employeeId, latestAt);
  }
  return map;
};

export const enqueuePointSync = async (
  db: DbInterface,
  params: {
    requestedBy: string;
    window?: Partial<PointDateRange> | null;
  },
) => {
  await ensurePointTables(db);
  return runInTransaction(db, async (tx) => {
    const blockingRows = await tx.query(
      `SELECT id FROM point_sync_jobs WHERE status IN ('PENDING', 'RUNNING') ORDER BY created_at DESC LIMIT 1`,
    );
    if (blockingRows[0]) {
      throw new PointValidationError('Já existe uma sincronização de ponto em andamento.', 409);
    }

    const now = NOW();
    const { startDate, endDate } = normalizeSyncWindow(params.window);
    const jobId = randomUUID();
    const runId = randomUUID();

    await tx.execute(
      `
      INSERT INTO point_sync_jobs (id, window_start, window_end, status, requested_by, error_message, created_at, started_at, finished_at)
      VALUES (?, ?, ?, 'PENDING', ?, NULL, ?, NULL, NULL)
      `,
      [jobId, startDate, endDate, params.requestedBy, now],
    );

    await tx.execute(
      `
      INSERT INTO point_sync_runs (
        id, job_id, status, source_label, window_start, window_end, total_employees, processed_employees, processed_days,
        current_stage, progress_percent, last_progress_at, estimated_remaining_seconds, synchronized_employees, synchronized_days,
        unmatched_employees, pending_adjustments, pending_signatures, details, started_at, finished_at, created_at
      ) VALUES (?, ?, 'PENDING', 'API Sólides', ?, ?, 0, 0, 0, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, ?, NULL, NULL, ?)
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
        requestedBy: params.requestedBy,
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
        totalEmployees: 0,
        processedEmployees: 0,
        processedDays: 0,
        currentStage: null,
        progressPercent: null,
        lastProgressAt: null,
        estimatedRemainingSeconds: null,
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
