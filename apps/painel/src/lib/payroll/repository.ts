import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { ensureEmployeesTables } from '@/lib/colaboradores/repository';
import {
  DEFAULT_PAYROLL_RULES,
  PAYROLL_LINE_STATUSES,
  PAYROLL_OCCURRENCE_TYPES,
  PAYROLL_PERIOD_STATUSES,
  PAYROLL_TRANSPORT_VOUCHER_MODES,
  type PayrollImportFileType,
  type PayrollImportStatus,
  type PayrollLineStatus,
  type PayrollOccurrenceType,
  type PayrollPeriodStatus,
  type PayrollSignatureStatus,
  type PayrollSyncJobStatus,
  type PayrollTransportVoucherMode,
} from '@/lib/payroll/constants';
import type {
  PayrollDataSource,
  PayrollBenefitIssue,
  PayrollBenefitIssueDetail,
  PayrollBenefitRow,
  PayrollBenefitsSummary,
  PayrollCreatePeriodInput,
  PayrollDailyControlRow,
  PayrollHoursBalanceMonthly,
  PayrollImportFile,
  PayrollLine,
  PayrollLineDetail,
  PayrollLineFilters,
  PayrollLinePatchInput,
  PayrollOccurrence,
  PayrollOccurrenceInput,
  PayrollOptions,
  PayrollPeriod,
  PayrollPeriodDetail,
  PayrollPointCoverage,
  PayrollPointDateRange,
  PayrollPointOverview,
  PayrollPeriodReadiness,
  PayrollPeriodSummary,
  PayrollPointDaily,
  PayrollPointSyncRun,
  PayrollPreviewRow,
  PayrollReadinessEmployeeSample,
  PayrollReadinessIssue,
  PayrollReadinessIssueCode,
  PayrollReadinessSeverity,
  PayrollReadinessStatus,
  PayrollRule,
  PayrollServiceHeartbeat,
  PayrollSignatureMonthly,
  PayrollVacationRow,
} from '@/lib/payroll/types';

export class PayrollValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;
const JUSTIFIED_OCCURRENCE_TYPES = new Set<PayrollOccurrenceType>(['ATESTADO', 'DECLARACAO', 'AJUSTE_BATIDA', 'AUSENCIA_AUTORIZADA', 'FERIAS']);

const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const textTypes = new Set(['tinytext', 'text', 'mediumtext', 'longtext']);
const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};
const bool = (value: unknown) =>
  value === true || value === 1 || String(value || '').trim() === '1' || String(value || '').toLowerCase() === 'true';

const uniqueSources = (sources: Array<PayrollDataSource | null | undefined>): PayrollDataSource[] => {
  const items = new Set<PayrollDataSource>();
  for (const source of sources) {
    if (source) items.add(source);
  }
  return Array.from(items);
};

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

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const raw = clean(value);
  if (!raw) return fallback;
  let normalized = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');

  if (hasDot && hasComma) {
    const lastDot = normalized.lastIndexOf('.');
    const lastComma = normalized.lastIndexOf(',');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

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

const buildComparisonKey = (employeeName: string, employeeCpf: string | null) => employeeCpf || normalizeSearch(employeeName);
const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeMonthRef = (value: unknown) => {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new PayrollValidationError('Competência inválida. Use o formato YYYY-MM.');
  }
  return raw;
};

const computePeriodWindow = (monthRef: string) => {
  const [yearRaw, monthRaw] = monthRef.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const start = new Date(Date.UTC(year, monthIndex - 1, 21));
  const end = new Date(Date.UTC(year, monthIndex, 20));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
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

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
};

const truncateText = (value: string | null | undefined, maxLength = 220) => {
  const text = clean(value);
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const overlapsDateRange = (targetDate: string, startDate: string | null, endDate: string | null) => {
  if (!startDate) return false;
  const effectiveEnd = endDate || startDate;
  return targetDate >= startDate && targetDate <= effectiveEnd;
};

const shiftUtcDate = (dateIso: string, deltaDays: number) => {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const getOperationalMonthRefForDate = (dateIso: string) => {
  const [yearRaw, monthRaw, dayRaw] = dateIso.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const base = day >= 21 ? new Date(Date.UTC(year, monthIndex + 1, 1)) : new Date(Date.UTC(year, monthIndex, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
};

const listOperationalMonthRefsInRange = (startDate: string, endDate: string) => {
  const refs = new Set<string>();
  let cursor = startDate;
  while (cursor <= endDate) {
    refs.add(getOperationalMonthRefForDate(cursor));
    cursor = shiftUtcDate(cursor, 1);
  }
  return Array.from(refs.values()).sort();
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

const ensureMysqlColumnDefinition = async (
  db: DbInterface,
  tableName: string,
  columnName: string,
  definitionSql: string,
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
    [tableName, columnName],
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

const mapRule = (row: any): PayrollRule => ({
  id: clean(row.id),
  monthRef: clean(row.month_ref),
  minWageAmount: toNumber(row.min_wage_amount),
  lateToleranceMinutes: Number(row.late_tolerance_minutes || 0),
  vtDiscountCapPercent: toNumber(row.vt_discount_cap_percent),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapImportFile = (row: any): PayrollImportFile => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  fileType: upper(row.file_type) as PayrollImportFile['fileType'],
  fileName: clean(row.file_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  processingStatus: upper(row.processing_status) as PayrollImportStatus,
  processingLog: clean(row.processing_log) || null,
  uploadedBy: clean(row.uploaded_by) || null,
  createdAt: clean(row.created_at),
  processedAt: clean(row.processed_at) || null,
});

const resolvePointRowSource = (row: any): PayrollDataSource => {
  if (clean(row.sync_run_id)) return 'SOLIDES';
  if (clean(row.source_file_id)) return 'LEGADO';
  return 'SOLIDES';
};

const mapPointDaily = (row: any): PayrollPointDaily => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
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
  sourceFileId: clean(row.source_file_id) || null,
  sourcePayloadJson: clean(row.source_payload_json) || null,
  syncRunId: clean(row.sync_run_id) || null,
  source: resolvePointRowSource(row),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPointSyncRun = (row: any): PayrollPointSyncRun => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  jobId: clean(row.job_id) || null,
  status: upper(row.status) as PayrollSyncJobStatus,
  sourceLabel: clean(row.source_label) || 'API Sólides',
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

const mapHoursBalanceMonthly = (row: any): PayrollHoursBalanceMonthly => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
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

const mapSignatureMonthly = (row: any): PayrollSignatureMonthly => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  employeeId: clean(row.employee_id) || null,
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  status: upper(row.status || 'SEM_PENDENCIA') as PayrollSignatureStatus,
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

const mapOccurrence = (row: any): PayrollOccurrence => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  employeeId: clean(row.employee_id),
  occurrenceType: upper(row.occurrence_type) as PayrollOccurrenceType,
  dateStart: parseDate(row.date_start) || '',
  dateEnd: parseDate(row.date_end) || parseDate(row.date_start) || '',
  effectCode: clean(row.effect_code) || null,
  notes: clean(row.notes) || null,
  storageProvider: clean(row.storage_provider) || null,
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key) || null,
  originalName: clean(row.original_name) || null,
  mimeType: clean(row.mime_type) || null,
  sizeBytes: row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes || 0),
  createdBy: clean(row.created_by) || null,
  updatedBy: clean(row.updated_by) || null,
  source: upper(row.occurrence_type) === 'FERIAS' ? 'SOLIDES' : 'PAINEL',
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapLine = (row: any): PayrollLine => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  employeeId: clean(row.employee_id) || null,
  employeeName: clean(row.employee_name),
  employeeCpf: normalizeCpf(row.employee_cpf),
  centerCost: clean(row.center_cost) || null,
  unitName: clean(row.unit_name) || null,
  contractType: clean(row.contract_type) || null,
  salaryBase: toNumber(row.salary_base),
  insalubrityPercent: toNumber(row.insalubrity_percent),
  insalubrityAmount: toNumber(row.insalubrity_amount),
  daysWorked: Number(row.days_worked || 0),
  absencesCount: Number(row.absences_count || 0),
  absenceDiscount: toNumber(row.absence_discount),
  lateMinutes: Number(row.late_minutes || 0),
  lateDiscount: toNumber(row.late_discount),
  vtProvisioned: toNumber(row.vt_provisioned),
  vtDiscount: toNumber(row.vt_discount),
  totalpassDiscount: toNumber(row.totalpass_discount),
  otherFixedDiscount: toNumber(row.other_fixed_discount),
  otherFixedDiscountDescription: clean(row.other_fixed_discount_description) || null,
  adjustmentsAmount: toNumber(row.adjustments_amount),
  adjustmentsNotes: clean(row.adjustments_notes) || null,
  totalProvents: toNumber(row.total_provents),
  totalDiscounts: toNumber(row.total_discounts),
  netOperational: toNumber(row.net_operational),
  lineStatus: upper(row.line_status || 'RASCUNHO') as PayrollLineStatus,
  payrollNotes: clean(row.payroll_notes) || null,
  employeeSnapshotJson: clean(row.employee_snapshot_json) || null,
  calculationMemoryJson: clean(row.calculation_memory_json) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

type EmployeePayrollSource = {
  id: string;
  solidesEmployeeId: string | null;
  solidesExternalId: string | null;
  fullName: string;
  email: string | null;
  cpf: string | null;
  jobTitle: string | null;
  costCenter: string | null;
  units: string[];
  employmentRegime: string;
  salaryAmount: number;
  insalubrityPercent: number;
  mealVoucherPerDay: number;
  transportVoucherPerDay: number;
  transportVoucherMode: PayrollTransportVoucherMode;
  transportVoucherMonthlyFixed: number;
  totalpassDiscountFixed: number;
  otherFixedDiscountAmount: number;
  otherFixedDiscountDescription: string | null;
  payrollNotes: string | null;
  workSchedule: string | null;
  admissionDate: string | null;
  terminationDate: string | null;
};

type EmployeeLookupMaps = {
  byCpf: Map<string, EmployeePayrollSource>;
  byName: Map<string, EmployeePayrollSource>;
};

const mapEmployeePayrollSource = (row: any): EmployeePayrollSource => ({
  id: clean(row.id),
  solidesEmployeeId: clean(row.solides_employee_id) || null,
  solidesExternalId: clean(row.solides_external_id) || null,
  fullName: clean(row.full_name),
  email: clean(row.email) || null,
  cpf: normalizeCpf(row.cpf),
  jobTitle: clean(row.job_title) || null,
  costCenter: clean(row.cost_center) || null,
  units: parseUnitsJson(row.units_json),
  employmentRegime: upper(row.employment_regime || 'CLT'),
  salaryAmount: toNumber(row.salary_amount),
  insalubrityPercent: toNumber(row.insalubrity_percent),
  mealVoucherPerDay: toNumber(row.meal_voucher_per_day),
  transportVoucherPerDay: toNumber(row.transport_voucher_per_day),
  transportVoucherMode: upper(row.transport_voucher_mode || 'PER_DAY') as PayrollTransportVoucherMode,
  transportVoucherMonthlyFixed: toNumber(row.transport_voucher_monthly_fixed),
  totalpassDiscountFixed: toNumber(row.totalpass_discount_fixed),
  otherFixedDiscountAmount: toNumber(row.other_fixed_discount_amount),
  otherFixedDiscountDescription: clean(row.other_fixed_discount_description) || null,
  payrollNotes: clean(row.payroll_notes) || null,
  workSchedule: clean(row.work_schedule) || null,
  admissionDate: parseDate(row.admission_date),
  terminationDate: parseDate(row.termination_date),
});

const buildEmployeeLookupMaps = (employees: EmployeePayrollSource[]): EmployeeLookupMaps => {
  const byCpf = new Map<string, EmployeePayrollSource>();
  const byName = new Map<string, EmployeePayrollSource>();

  for (const employee of employees) {
    if (employee.cpf && !byCpf.has(employee.cpf)) byCpf.set(employee.cpf, employee);
    const normalizedName = normalizeSearch(employee.fullName);
    if (normalizedName && !byName.has(normalizedName)) byName.set(normalizedName, employee);
  }

  return { byCpf, byName };
};

const findMatchingEmployeeForPointRow = (
  employeeName: string,
  employeeCpf: string | null,
  lookup: EmployeeLookupMaps,
) => {
  if (employeeCpf) {
    const employeeByCpf = lookup.byCpf.get(employeeCpf);
    if (employeeByCpf) return employeeByCpf;
  }

  return lookup.byName.get(normalizeSearch(employeeName)) || null;
};

const buildSummaryFromLines = (lines: PayrollLine[], imports: PayrollImportFile[]): PayrollPeriodSummary => ({
  totalLines: lines.length,
  totalNet: roundMoney(lines.reduce((sum, line) => sum + line.netOperational, 0)),
  totalDiscounts: roundMoney(lines.reduce((sum, line) => sum + line.totalDiscounts, 0)),
  totalProvents: roundMoney(lines.reduce((sum, line) => sum + line.totalProvents, 0)),
  importsCompleted: imports.filter((item) => item.processingStatus === 'COMPLETED').length,
  syncCompleted: 0,
});

const parseScheduleMinutes = (scheduleStart: string | null, scheduleEnd: string | null, fallbackText: string | null) => {
  const parseTime = (value: string) => {
    const match = value.match(/(\d{2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const directStart = scheduleStart ? parseTime(scheduleStart) : null;
  const directEnd = scheduleEnd ? parseTime(scheduleEnd) : null;
  if (directStart !== null && directEnd !== null && directEnd > directStart) {
    return directEnd - directStart;
  }

  const matches = [...clean(fallbackText).matchAll(/(\d{2}:\d{2})/g)].map((match) => match[1]);
  if (matches.length >= 2) {
    const start = parseTime(matches[0]);
    const end = parseTime(matches[1]);
    if (start !== null && end !== null && end > start) return end - start;
  }

  return null;
};

export const ensurePayrollTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await ensureEmployeesTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_rules (
      id VARCHAR(64) PRIMARY KEY,
      month_ref VARCHAR(7) NOT NULL,
      min_wage_amount DECIMAL(12,2) NOT NULL,
      late_tolerance_minutes INTEGER NOT NULL DEFAULT 15,
      vt_discount_cap_percent DECIMAL(8,2) NOT NULL DEFAULT 6.00,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE(month_ref)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_periods (
      id VARCHAR(64) PRIMARY KEY,
      month_ref VARCHAR(7) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      rule_id VARCHAR(64) NULL,
      created_by VARCHAR(64) NULL,
      approved_by VARCHAR(64) NULL,
      approved_at VARCHAR(32) NULL,
      sent_at VARCHAR(32) NULL,
      reopened_at VARCHAR(32) NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE(month_ref)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_import_files (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      file_type VARCHAR(30) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      processing_status VARCHAR(20) NOT NULL,
      processing_log LONGTEXT NULL,
      uploaded_by VARCHAR(64) NULL,
      created_at VARCHAR(32) NOT NULL,
      processed_at VARCHAR(32) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_point_import_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      import_file_id VARCHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NULL,
      error_message LONGTEXT NULL,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32) NULL,
      finished_at VARCHAR(32) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_point_sync_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NULL,
      error_message LONGTEXT NULL,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32) NULL,
      finished_at VARCHAR(32) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_point_sync_runs (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      job_id VARCHAR(64) NULL,
      status VARCHAR(20) NOT NULL,
      source_label VARCHAR(120) NOT NULL,
      synchronized_employees INTEGER NOT NULL DEFAULT 0,
      synchronized_days INTEGER NOT NULL DEFAULT 0,
      unmatched_employees INTEGER NOT NULL DEFAULT 0,
      pending_adjustments INTEGER NOT NULL DEFAULT 0,
      pending_signatures INTEGER NOT NULL DEFAULT 0,
      details LONGTEXT NULL,
      started_at VARCHAR(32) NULL,
      finished_at VARCHAR(32) NULL,
      created_at VARCHAR(32) NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_point_daily (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_code VARCHAR(60) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      point_date DATE NOT NULL,
      department VARCHAR(180) NULL,
      schedule_label VARCHAR(180) NULL,
      schedule_start VARCHAR(10) NULL,
      schedule_end VARCHAR(10) NULL,
      marks_json LONGTEXT NULL,
      raw_day_text LONGTEXT NULL,
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
      justification_text LONGTEXT NULL,
      source_file_id VARCHAR(64) NULL,
      source_payload_json LONGTEXT NULL,
      sync_run_id VARCHAR(64) NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_hours_balance_monthly (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      balance_minutes INTEGER NOT NULL DEFAULT 0,
      reference_start DATE NULL,
      reference_end DATE NULL,
      source_payload_json LONGTEXT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_signature_monthly (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      solides_employee_id VARCHAR(80) NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'SEM_PENDENCIA',
      document_type VARCHAR(60) NULL,
      document_date DATE NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      signed_at VARCHAR(32) NULL,
      message LONGTEXT NULL,
      source_payload_json LONGTEXT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_occurrences (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NOT NULL,
      occurrence_type VARCHAR(30) NOT NULL,
      date_start DATE NOT NULL,
      date_end DATE NULL,
      effect_code VARCHAR(60) NULL,
      notes LONGTEXT NULL,
      storage_provider VARCHAR(30) NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NULL,
      original_name VARCHAR(255) NULL,
      mime_type VARCHAR(120) NULL,
      size_bytes BIGINT NULL,
      created_by VARCHAR(64) NULL,
      updated_by VARCHAR(64) NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_lines (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      comparison_key VARCHAR(255) NOT NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      center_cost VARCHAR(180) NULL,
      unit_name VARCHAR(180) NULL,
      contract_type VARCHAR(60) NULL,
      salary_base DECIMAL(12,2) NOT NULL DEFAULT 0,
      insalubrity_percent DECIMAL(8,2) NOT NULL DEFAULT 0,
      insalubrity_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      days_worked INTEGER NOT NULL DEFAULT 0,
      absences_count INTEGER NOT NULL DEFAULT 0,
      absence_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      late_minutes INTEGER NOT NULL DEFAULT 0,
      late_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      vt_provisioned DECIMAL(12,2) NOT NULL DEFAULT 0,
      vt_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      totalpass_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      other_fixed_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
      other_fixed_discount_description LONGTEXT NULL,
      adjustments_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      adjustments_notes LONGTEXT NULL,
      total_provents DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_discounts DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_operational DECIMAL(12,2) NOT NULL DEFAULT 0,
      line_status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
      payroll_notes LONGTEXT NULL,
      employee_snapshot_json LONGTEXT NULL,
      calculation_memory_json LONGTEXT NULL,
      comparison_status VARCHAR(20) NOT NULL DEFAULT 'SEM_BASE',
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE(period_id, comparison_key)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payroll_reference_rows (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_name VARCHAR(180) NOT NULL,
      employee_cpf VARCHAR(14) NULL,
      center_cost VARCHAR(180) NULL,
      role_name VARCHAR(180) NULL,
      contract_type VARCHAR(60) NULL,
      salary_base DECIMAL(12,2) NULL,
      insalubrity_percent DECIMAL(8,2) NULL,
      vt_day DECIMAL(12,2) NULL,
      vt_month DECIMAL(12,2) NULL,
      vt_discount DECIMAL(12,2) NULL,
      other_discounts DECIMAL(12,2) NULL,
      totalpass_discount DECIMAL(12,2) NULL,
      notes LONGTEXT NULL,
      raw_json LONGTEXT NULL,
      comparison_key VARCHAR(255) NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )
  `);

  await ensureMysqlColumnDefinition(db, 'payroll_rules', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_rules', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_periods', 'approved_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_periods', 'sent_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_periods', 'reopened_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_periods', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_periods', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_import_files', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_import_files', 'processed_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_import_jobs', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_import_jobs', 'started_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_import_jobs', 'finished_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_jobs', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_jobs', 'started_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_jobs', 'finished_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_runs', 'started_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_runs', 'finished_at', 'VARCHAR(32) NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_sync_runs', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_hours_balance_monthly', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_hours_balance_monthly', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_signature_monthly', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_signature_monthly', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_reference_rows', 'created_at', 'VARCHAR(32) NOT NULL');

  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_mode VARCHAR(20) NOT NULL DEFAULT 'PER_DAY'`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_monthly_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN totalpass_discount_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_amount DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_description TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN payroll_notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN solides_employee_id VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN solides_external_id VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN solides_employee_id VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN planned_minutes INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN day_balance_minutes INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN break_minutes INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN expected_break_minutes INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN break_overrun_minutes INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN pending_adjustments_count INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN source_payload_json LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE payroll_point_daily ADD COLUMN sync_run_id VARCHAR(64) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_payroll_periods_month_ref ON payroll_periods (month_ref)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_import_files_period ON payroll_import_files (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_status ON payroll_point_import_jobs (status, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_period ON payroll_point_import_jobs (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_import_file ON payroll_point_import_jobs (import_file_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_sync_jobs_status ON payroll_point_sync_jobs (status, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_sync_jobs_period ON payroll_point_sync_jobs (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_sync_runs_period ON payroll_point_sync_runs (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_daily_period ON payroll_point_daily (period_id, point_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_daily_employee ON payroll_point_daily (period_id, employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_daily_solides_employee ON payroll_point_daily (period_id, solides_employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_occurrences_period ON payroll_occurrences (period_id, employee_id, date_start)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_reference_rows_period ON payroll_reference_rows (period_id, comparison_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_lines_period ON payroll_lines (period_id, employee_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_hours_balance_period ON payroll_hours_balance_monthly (period_id, employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_signature_period ON payroll_signature_monthly (period_id, employee_id)`);

  tablesEnsured = true;
};

const getPeriodOrThrow = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(`SELECT * FROM payroll_periods WHERE id = ? LIMIT 1`, [periodId]);
  if (!rows[0]) throw new PayrollValidationError('Competência não encontrada.', 404);
  const ruleRows = await db.query(`SELECT * FROM payroll_rules WHERE id = ? LIMIT 1`, [clean(rows[0].rule_id)]);
  const rulesById = new Map<string, PayrollRule>();
  if (ruleRows[0]) {
    const rule = mapRule(ruleRows[0]);
    rulesById.set(rule.id, rule);
  }
  const row = rows[0];
  return {
    id: clean(row.id),
    monthRef: clean(row.month_ref),
    periodStart: parseDate(row.period_start) || '',
    periodEnd: parseDate(row.period_end) || '',
    status: upper(row.status) as PayrollPeriodStatus,
    ruleId: clean(row.rule_id) || null,
    createdBy: clean(row.created_by) || null,
    approvedBy: clean(row.approved_by) || null,
    approvedAt: clean(row.approved_at) || null,
    sentAt: clean(row.sent_at) || null,
    reopenedAt: clean(row.reopened_at) || null,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
    rules: clean(row.rule_id) ? rulesById.get(clean(row.rule_id)) || null : null,
  } satisfies PayrollPeriod;
};

const listImportsByPeriod = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(`SELECT * FROM payroll_import_files WHERE period_id = ? ORDER BY created_at DESC`, [periodId]);
  return rows.map(mapImportFile);
};

const listPointSyncRunsByPeriod = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(`SELECT * FROM payroll_point_sync_runs WHERE period_id = ? ORDER BY created_at DESC`, [periodId]);
  return rows.map(mapPointSyncRun);
};

const listLinesRaw = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(`SELECT * FROM payroll_lines WHERE period_id = ? ORDER BY employee_name ASC`, [periodId]);
  return rows.map(mapLine);
};


const listOccurrencesRaw = async (db: DbInterface, periodId: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_occurrences WHERE period_id = ? ${employeeId ? 'AND employee_id = ?' : ''} ORDER BY date_start ASC, created_at ASC`,
    employeeId ? [periodId, employeeId] : [periodId],
  );
  return rows.map(mapOccurrence);
};

const listOccurrencesByDateRangeRaw = async (db: DbInterface, startDate: string, endDate: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_occurrences
     WHERE date_start <= ?
       AND COALESCE(date_end, date_start) >= ?
       ${employeeId ? 'AND employee_id = ?' : ''}
     ORDER BY date_start ASC, created_at ASC`,
    employeeId ? [endDate, startDate, employeeId] : [endDate, startDate],
  );
  return rows.map(mapOccurrence);
};

const listPointRowsRaw = async (db: DbInterface, periodId: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_point_daily WHERE period_id = ? ${employeeId ? 'AND employee_id = ?' : ''} ORDER BY point_date ASC`,
    employeeId ? [periodId, employeeId] : [periodId],
  );
  return rows.map(mapPointDaily);
};

const listPointRowsByDateRangeRaw = async (db: DbInterface, startDate: string, endDate: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_point_daily
     WHERE point_date >= ?
       AND point_date <= ?
       ${employeeId ? 'AND employee_id = ?' : ''}
     ORDER BY point_date ASC`,
    employeeId ? [startDate, endDate, employeeId] : [startDate, endDate],
  );
  return rows.map(mapPointDaily);
};

const listHoursBalanceRaw = async (db: DbInterface, periodId: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_hours_balance_monthly WHERE period_id = ? ${employeeId ? 'AND employee_id = ?' : ''} ORDER BY employee_name ASC`,
    employeeId ? [periodId, employeeId] : [periodId],
  );
  return rows.map(mapHoursBalanceMonthly);
};

const listHoursBalanceByPeriodIdsRaw = async (db: DbInterface, periodIds: string[], employeeId?: string) => {
  if (!periodIds.length) return [] as PayrollHoursBalanceMonthly[];
  const placeholders = periodIds.map(() => '?').join(', ');
  const params = employeeId ? [...periodIds, employeeId] : [...periodIds];
  const rows = await db.query(
    `SELECT * FROM payroll_hours_balance_monthly
     WHERE period_id IN (${placeholders})
       ${employeeId ? 'AND employee_id = ?' : ''}
     ORDER BY employee_name ASC`,
    params,
  );
  return rows.map(mapHoursBalanceMonthly);
};

const listSignaturesRaw = async (db: DbInterface, periodId: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_signature_monthly WHERE period_id = ? ${employeeId ? 'AND employee_id = ?' : ''} ORDER BY employee_name ASC`,
    employeeId ? [periodId, employeeId] : [periodId],
  );
  return rows.map(mapSignatureMonthly);
};

const listSignaturesByPeriodIdsRaw = async (db: DbInterface, periodIds: string[], employeeId?: string) => {
  if (!periodIds.length) return [] as PayrollSignatureMonthly[];
  const placeholders = periodIds.map(() => '?').join(', ');
  const params = employeeId ? [...periodIds, employeeId] : [...periodIds];
  const rows = await db.query(
    `SELECT * FROM payroll_signature_monthly
     WHERE period_id IN (${placeholders})
       ${employeeId ? 'AND employee_id = ?' : ''}
     ORDER BY employee_name ASC`,
    params,
  );
  return rows.map(mapSignatureMonthly);
};

const getLatestRuleSeed = async (db: DbInterface) => {
  const rows = await db.query(`SELECT * FROM payroll_rules ORDER BY month_ref DESC LIMIT 1`);
  if (!rows[0]) return DEFAULT_PAYROLL_RULES;
  const latest = mapRule(rows[0]);
  return {
    minWageAmount: latest.minWageAmount,
    lateToleranceMinutes: latest.lateToleranceMinutes,
    vtDiscountCapPercent: latest.vtDiscountCapPercent,
  };
};


export const listPayrollPeriods = async (db: DbInterface) => {
  await ensurePayrollTables(db);
  const [periodRows, ruleRows] = await Promise.all([
    db.query(`SELECT * FROM payroll_periods ORDER BY month_ref DESC`),
    db.query(`SELECT * FROM payroll_rules ORDER BY month_ref DESC`),
  ]);
  const rulesById = new Map(
    ruleRows.map((row: any) => {
      const mapped = mapRule(row);
      return [mapped.id, mapped] as const;
    }),
  );

  return periodRows.map((row: any) => ({
    id: clean(row.id),
    monthRef: clean(row.month_ref),
    periodStart: parseDate(row.period_start) || '',
    periodEnd: parseDate(row.period_end) || '',
    status: upper(row.status) as PayrollPeriodStatus,
    ruleId: clean(row.rule_id) || null,
    createdBy: clean(row.created_by) || null,
    approvedBy: clean(row.approved_by) || null,
    approvedAt: clean(row.approved_at) || null,
    sentAt: clean(row.sent_at) || null,
    reopenedAt: clean(row.reopened_at) || null,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
    rules: clean(row.rule_id) ? rulesById.get(clean(row.rule_id)) || null : null,
  }));
};

export const createPayrollPeriod = async (db: DbInterface, input: PayrollCreatePeriodInput, actorUserId: string) => {
  await ensurePayrollTables(db);
  const monthRef = normalizeMonthRef(input.monthRef);
  const existing = await db.query(`SELECT id FROM payroll_periods WHERE month_ref = ? LIMIT 1`, [monthRef]);
  if (existing[0]) throw new PayrollValidationError('Já existe uma competência cadastrada para este mês.', 409);

  const seed = await getLatestRuleSeed(db);
  const periodWindow = computePeriodWindow(monthRef);
  const now = NOW();
  const ruleId = randomUUID();
  const periodId = randomUUID();

  await db.execute(
    `INSERT INTO payroll_rules (id, month_ref, min_wage_amount, late_tolerance_minutes, vt_discount_cap_percent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      ruleId,
      monthRef,
      toNullableNumber(input.minWageAmount) ?? seed.minWageAmount,
      Number(input.lateToleranceMinutes ?? seed.lateToleranceMinutes),
      toNullableNumber(input.vtDiscountCapPercent) ?? seed.vtDiscountCapPercent,
      now,
      now,
    ],
  );

  await db.execute(
    `INSERT INTO payroll_periods (id, month_ref, period_start, period_end, status, rule_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [periodId, monthRef, periodWindow.periodStart, periodWindow.periodEnd, 'ABERTA', ruleId, actorUserId, now, now],
  );

  return getPayrollPeriodDetail(db, periodId);
};

export const getPayrollOptions = async (db: DbInterface): Promise<PayrollOptions> => {
  await ensurePayrollTables(db);
  const periods = await listPayrollPeriods(db);
  const [centerRows, unitRows, contractRows] = await Promise.all([
    db.query(`SELECT DISTINCT TRIM(cost_center) AS value FROM employees WHERE cost_center IS NOT NULL AND TRIM(cost_center) <> '' ORDER BY value ASC`),
    db.query(`SELECT DISTINCT TRIM(units_json) AS value FROM employees WHERE units_json IS NOT NULL AND TRIM(units_json) <> ''`),
    db.query(`SELECT DISTINCT TRIM(employment_regime) AS value FROM employees WHERE employment_regime IS NOT NULL AND TRIM(employment_regime) <> '' ORDER BY value ASC`),
  ]);

  const units = Array.from(new Set(unitRows.flatMap((row: any) => parseUnitsJson(row.value)))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
  );

  return {
    periods,
    centersCost: centerRows.map((row: any) => clean(row.value)).filter(Boolean),
    units,
    contractTypes: contractRows.map((row: any) => clean(row.value)).filter(Boolean),
    periodStatuses: PAYROLL_PERIOD_STATUSES,
    lineStatuses: PAYROLL_LINE_STATUSES,
    transportVoucherModes: PAYROLL_TRANSPORT_VOUCHER_MODES,
    occurrenceTypes: PAYROLL_OCCURRENCE_TYPES,
  };
};

const buildReadinessSampleKey = (sample: PayrollReadinessEmployeeSample) =>
  clean(sample.employeeId) || sample.employeeCpf || normalizeSearch(sample.employeeName);

const uniqueEmployeeSamples = (samples: PayrollReadinessEmployeeSample[]) => {
  const unique = new Map<string, PayrollReadinessEmployeeSample>();
  for (const sample of samples) {
    const key = buildReadinessSampleKey(sample);
    if (!key || unique.has(key)) continue;
    unique.set(key, sample);
  }
  return Array.from(unique.values());
};

const employeeToReadinessSample = (employee: EmployeePayrollSource): PayrollReadinessEmployeeSample => ({
  employeeId: employee.id || null,
  employeeName: employee.fullName,
  employeeCpf: employee.cpf,
});

const pointRowToReadinessSample = (row: PayrollPointDaily): PayrollReadinessEmployeeSample => ({
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  employeeCpf: row.employeeCpf,
});

const resolvePointInconsistencyReason = (row: Pick<PayrollPointDaily, 'rawDayText' | 'marks'>) => {
  const text = upper(row.rawDayText || '');
  if (text.includes('BATIDAS INVAL') || text.includes('BATIDA INVAL')) return 'Batida inválida indicada no relatório.';
  if (text.includes('MARCACAO INCORRETA') || text.includes('MARCAÇÃO INCORRETA')) return 'Marcação incorreta indicada no relatório.';
  if (text.includes('INCONSIST')) return 'Inconsistência indicada no relatório de ponto.';
  if ((row.marks || []).length % 2 !== 0) return 'Quantidade ímpar de marcações no dia.';
  return 'Registro diário marcado como inconsistente no relatório.';
};

const buildPointInconsistencyDetail = (row: PayrollPointDaily): PayrollBenefitIssueDetail => ({
  date: row.pointDate || null,
  reason: resolvePointInconsistencyReason(row),
  rawText: truncateText(row.rawDayText, 260),
  marks: row.marks || [],
});

const createReadinessIssue = (params: {
  code: PayrollReadinessIssueCode;
  severity: PayrollReadinessSeverity;
  title: string;
  description: string;
  count: number;
  sampleEmployees?: PayrollReadinessEmployeeSample[];
  details?: PayrollBenefitIssueDetail[];
}): PayrollReadinessIssue => ({
  code: params.code,
  severity: params.severity,
  title: params.title,
  description: params.description,
  count: params.count,
  sampleEmployees: uniqueEmployeeSamples(params.sampleEmployees || []).slice(0, 5),
  details: (params.details || []).slice(0, 5),
});

const buildReadinessGuidance = (status: PayrollReadinessStatus) => {
  if (status === 'BLOCKED') {
    return 'Resolva os bloqueios críticos abaixo e use Gerar folha novamente para recalcular a competência.';
  }
  if (status === 'ATTENTION') {
    return 'A competência pode ser gerada, mas há alertas operacionais para revisar. Após qualquer correção, use Gerar folha novamente.';
  }
  return 'A competência está pronta para geração. Se houver ajuste posterior de cadastro ou importação, use Gerar folha novamente para recalcular.';
};

const buildReadinessBlockingMessage = (readiness: PayrollPeriodReadiness) => {
  const blockingIssues = readiness.issues.filter((issue) => issue.severity === 'BLOCKING');
  if (!blockingIssues.length) return readiness.guidance;
  const summary = blockingIssues
    .slice(0, 3)
    .map((issue) => issue.title)
    .join('; ');
  return `A competência possui bloqueios críticos: ${summary}. ${readiness.guidance}`;
};

const hasFullPeriodCoverageWithoutPoint = (
  employeeId: string,
  period: PayrollPeriod,
  occurrenceMap: Map<string, PayrollOccurrence[]>,
) => {
  const employeeOccurrences = occurrenceMap.get(employeeId) || [];
  return employeeOccurrences.some((occurrence) => {
    if (!JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType)) return false;
    const start = occurrence.dateStart || null;
    const end = occurrence.dateEnd || occurrence.dateStart || null;
    if (!start || !end) return false;
    return start <= period.periodStart && end >= period.periodEnd;
  });
};

const evaluatePayrollPeriodReadiness = (
  period: PayrollPeriod,
  imports: PayrollImportFile[],
  syncRuns: PayrollPointSyncRun[],
  employees: EmployeePayrollSource[],
  pointRows: PayrollPointDaily[],
  occurrences: PayrollOccurrence[],
  hoursBalances: PayrollHoursBalanceMonthly[],
  signatures: PayrollSignatureMonthly[],
): PayrollPeriodReadiness => {
  const issues: PayrollReadinessIssue[] = [];
  const pointImports = imports.filter((item) => item.fileType === 'POINT_PDF');
  const activeImport = pointImports.find((item) => item.processingStatus === 'COMPLETED') || null;
  const latestAttempt = pointImports[0] || null;
  const hasCompletedPointImport = Boolean(activeImport);
  const latestCompletedSync = syncRuns.find((item) => item.status === 'COMPLETED') || null;
  const hasCompletedPointSync = Boolean(latestCompletedSync);
  const hasPointBase = hasCompletedPointSync || hasCompletedPointImport || pointRows.length > 0;
  const expectedSyncedEmployees = employees.filter((employee) => employee.employmentRegime !== 'PJ' || Boolean(employee.solidesEmployeeId));

  const pointRowsByEmployee = new Map<string, PayrollPointDaily[]>();
  for (const row of pointRows) {
    if (!row.employeeId) continue;
    const list = pointRowsByEmployee.get(row.employeeId) || [];
    list.push(row);
    pointRowsByEmployee.set(row.employeeId, list);
  }

  const occurrenceMap = new Map<string, PayrollOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = clean(occurrence.employeeId);
    const list = occurrenceMap.get(key) || [];
    list.push(occurrence);
    occurrenceMap.set(key, list);
  }

  if (!hasCompletedPointSync && !hasCompletedPointImport) {
    issues.push(
      createReadinessIssue({
        code: 'NO_COMPLETED_POINT_SYNC',
        severity: 'BLOCKING',
        title: 'Sem sincronização concluída de ponto',
        description: 'Nenhuma sincronização concluída da Sólides está disponível como base ativa para esta competência.',
        count: 1,
      }),
    );
  }

  if (hasCompletedPointSync) {
    const missingSolidesLink = expectedSyncedEmployees.filter((employee) => !employee.solidesEmployeeId);
    if (missingSolidesLink.length > 0) {
      issues.push(
        createReadinessIssue({
          code: 'EMPLOYEE_MISSING_SOLIDES_LINK',
          severity: 'BLOCKING',
          title: 'Cadastro sem vínculo Sólides',
          description: `${missingSolidesLink.length} colaborador(es) exigem vínculo com a Sólides para sincronizar ponto nesta competência.`,
          count: missingSolidesLink.length,
          sampleEmployees: missingSolidesLink.map(employeeToReadinessSample),
        }),
      );
    }
  }

  const unmatchedPointRows = pointRows.filter((row) => !row.employeeId);
  if (unmatchedPointRows.length > 0) {
    const unmatchedSamples = uniqueEmployeeSamples(unmatchedPointRows.map(pointRowToReadinessSample));
    issues.push(
      createReadinessIssue({
        code: hasCompletedPointSync ? 'SOLIDES_EMPLOYEE_UNMATCHED' : 'POINT_ROWS_UNMATCHED',
        severity: 'BLOCKING',
        title: hasCompletedPointSync ? 'Colaborador sincronizado sem vínculo local' : 'Ponto sem vínculo com cadastro',
        description: hasCompletedPointSync
          ? `${unmatchedSamples.length} colaborador(es) retornados pela Sólides ainda não foram vinculados ao cadastro local.`
          : `${unmatchedSamples.length} colaborador(es) do relatório de ponto não foram vinculados ao cadastro de colaboradores.`,
        count: unmatchedSamples.length,
        sampleEmployees: unmatchedSamples,
      }),
    );
  }

  if (hasCompletedPointSync && latestCompletedSync?.unmatchedEmployees && unmatchedPointRows.length === 0) {
    issues.push(
      createReadinessIssue({
        code: 'SOLIDES_EMPLOYEE_UNMATCHED',
        severity: 'BLOCKING',
        title: 'Colaborador sincronizado sem vínculo local',
        description: `${latestCompletedSync.unmatchedEmployees} colaborador(es) retornados pela Sólides não puderam ser conciliados com o cadastro local nesta execução.`,
        count: latestCompletedSync.unmatchedEmployees,
      }),
    );
  }

  const employeesMissingSalary = employees.filter((employee) => employee.salaryAmount <= 0);
  if (employeesMissingSalary.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'EMPLOYEE_MISSING_SALARY',
        severity: 'BLOCKING',
        title: 'Cadastro sem salário base',
        description: `${employeesMissingSalary.length} colaborador(es) ativo(s) estão com salário base ausente ou zerado para esta competência.`,
        count: employeesMissingSalary.length,
        sampleEmployees: employeesMissingSalary.map(employeeToReadinessSample),
      }),
    );
  }

  if (hasPointBase) {
    const employeesWithoutPointRows = (hasCompletedPointSync ? expectedSyncedEmployees : employees).filter((employee) => {
      if (hasCompletedPointSync && !employee.solidesEmployeeId) return false;
      if ((pointRowsByEmployee.get(employee.id) || []).length > 0) return false;
      return !hasFullPeriodCoverageWithoutPoint(employee.id, period, occurrenceMap);
    });
    if (employeesWithoutPointRows.length > 0) {
      issues.push(
        createReadinessIssue({
          code: 'EMPLOYEE_WITHOUT_POINT_ROWS',
          severity: 'WARNING',
          title: 'Colaborador ativo sem ponto na competência',
          description: `${employeesWithoutPointRows.length} colaborador(es) ativo(s) não possuem registros de ponto nesta competência.`,
          count: employeesWithoutPointRows.length,
          sampleEmployees: employeesWithoutPointRows.map(employeeToReadinessSample),
        }),
      );
    }

    const inconsistentPointRows = pointRows.filter((row) => row.inconsistencyFlag);
    if (inconsistentPointRows.length > 0) {
      const details = inconsistentPointRows.map(buildPointInconsistencyDetail);
      issues.push(
        createReadinessIssue({
          code: 'POINT_INCONSISTENCY',
          severity: 'WARNING',
          title: 'Ponto com inconsistências',
          description: `${inconsistentPointRows.length} registro(s) diário(s) do ponto possuem inconsistência. Abra os exemplos para conferir data, motivo detectado e trecho do relatório.`,
          count: inconsistentPointRows.length,
          sampleEmployees: inconsistentPointRows.map(pointRowToReadinessSample),
          details,
        }),
      );
    }
  }

  const employeesMissingCostCenter = employees.filter((employee) => !clean(employee.costCenter));
  if (employeesMissingCostCenter.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'MISSING_COST_CENTER',
        severity: 'WARNING',
        title: 'Cadastro sem centro de custo',
        description: `${employeesMissingCostCenter.length} colaborador(es) ativo(s) estão sem centro de custo preenchido.`,
        count: employeesMissingCostCenter.length,
        sampleEmployees: employeesMissingCostCenter.map(employeeToReadinessSample),
      }),
    );
  }

  const fallbackScheduleEmployees = employees.filter((employee) => {
    const employeePointRows = pointRowsByEmployee.get(employee.id) || [];
    return parseScheduleMinutes(employeePointRows[0]?.scheduleStart || null, employeePointRows[0]?.scheduleEnd || null, employee.workSchedule) === null;
  });
  if (fallbackScheduleEmployees.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'FALLBACK_SCHEDULE_DIVISOR',
        severity: 'WARNING',
        title: 'Divisor padrão de jornada aplicado',
        description: `${fallbackScheduleEmployees.length} colaborador(es) usarão divisor padrão por falta de jornada identificável no cadastro ou no ponto.`,
        count: fallbackScheduleEmployees.length,
        sampleEmployees: fallbackScheduleEmployees.map(employeeToReadinessSample),
      }),
    );
  }

  if (latestAttempt && activeImport && latestAttempt.id !== activeImport.id && latestAttempt.processingStatus === 'FAILED') {
    issues.push(
      createReadinessIssue({
        code: 'LATEST_IMPORT_FAILED_WITH_ACTIVE_BASE',
        severity: 'WARNING',
        title: 'Última tentativa falhou com base ativa preservada',
        description: 'A tentativa mais recente falhou, mas a competência continua usando a última base de ponto concluída.',
        count: 1,
      }),
    );
  }

  if (latestCompletedSync?.pendingAdjustments) {
    issues.push(
      createReadinessIssue({
        code: 'PENDING_POINT_ADJUSTMENTS',
        severity: 'WARNING',
        title: 'Ponto com ajustes pendentes',
        description: `${latestCompletedSync.pendingAdjustments} ajuste(s) de ponto seguem pendentes na Sólides para esta competência.`,
        count: latestCompletedSync.pendingAdjustments,
      }),
    );
  }

  const pendingSignatures = signatures.filter((item) => ['PENDENTE', 'PROCESSANDO'].includes(item.status));
  if (pendingSignatures.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'PENDING_SIGNATURES',
        severity: 'WARNING',
        title: 'Folhas com assinatura pendente',
        description: `${pendingSignatures.length} colaborador(es) possuem pendência de assinatura de folha nesta competência.`,
        count: pendingSignatures.length,
        sampleEmployees: pendingSignatures.map((item) => ({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          employeeCpf: item.employeeCpf,
        })),
      }),
    );
  }

  const breakOverrunRows = pointRows.filter((row) => row.breakOverrunMinutes > 0);
  if (breakOverrunRows.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'BREAK_OVERRUN',
        severity: 'WARNING',
        title: 'Excesso de pausa/almoço detectado',
        description: `${breakOverrunRows.length} registro(s) diário(s) apresentam pausa acima da intrajornada prevista.`,
        count: breakOverrunRows.length,
        sampleEmployees: breakOverrunRows.map(pointRowToReadinessSample),
      }),
    );
  }

  const hoursBalanceAlerts = hoursBalances.filter((item) => Math.abs(item.balanceMinutes) > 0);
  if (hoursBalanceAlerts.length > 0) {
    issues.push(
      createReadinessIssue({
        code: 'HOURS_BALANCE_ALERT',
        severity: 'WARNING',
        title: 'Banco de horas com saldo na competência',
        description: `${hoursBalanceAlerts.length} colaborador(es) possuem saldo de banco de horas registrado no período sincronizado.`,
        count: hoursBalanceAlerts.length,
        sampleEmployees: hoursBalanceAlerts.map((item) => ({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          employeeCpf: item.employeeCpf,
        })),
      }),
    );
  }

  const blockingCount = issues.filter((issue) => issue.severity === 'BLOCKING').length;
  const warningCount = issues.filter((issue) => issue.severity === 'WARNING').length;
  const status: PayrollReadinessStatus = blockingCount > 0 ? 'BLOCKED' : warningCount > 0 ? 'ATTENTION' : 'READY';

  return {
    status,
    blockingCount,
    warningCount,
    issues,
    guidance: buildReadinessGuidance(status),
  };
};

export const getPayrollPeriodDetail = async (db: DbInterface, periodId: string): Promise<PayrollPeriodDetail> => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, periodId);
  const [imports, syncRuns, lines, employees, occurrenceRows] = await Promise.all([
    listImportsByPeriod(db, periodId),
    listPointSyncRunsByPeriod(db, periodId),
    listLinesRaw(db, periodId),
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listOccurrencesRaw(db, periodId),
  ]);
  await reconcilePointRowsEmployeeLinks(db, period.id, employees);
  const [pointRows, hoursBalances, signatures] = await Promise.all([
    listPointRowsRaw(db, periodId),
    listHoursBalanceRaw(db, periodId),
    listSignaturesRaw(db, periodId),
  ]);
  const summary = buildSummaryFromLines(lines, imports);
  summary.syncCompleted = syncRuns.filter((item) => item.status === 'COMPLETED').length;
  return {
    period,
    imports,
    syncRuns,
    summary,
    readiness: evaluatePayrollPeriodReadiness(period, imports, syncRuns, employees, pointRows, occurrenceRows, hoursBalances, signatures),
  };
};

export const getPayrollPointHeartbeat = async (db: DbInterface): Promise<PayrollServiceHeartbeat> => {
  const rows = await db.query(
    `
    SELECT service_name, status, last_run, details
    FROM system_status
    WHERE service_name = ?
    LIMIT 1
    `,
    ['payroll_point_sync'],
  );
  const row = rows?.[0] as any;
  return {
    serviceName: clean(row?.service_name) || 'payroll_point_sync',
    status: clean(row?.status) || 'UNKNOWN',
    lastRun: clean(row?.last_run) || null,
    details: clean(row?.details) || null,
  };
};

const buildPayrollPointCoverage = (expectedMonthRefs: string[], syncedMonthRefs: string[]): PayrollPointCoverage => {
  const coveredSet = new Set(syncedMonthRefs);
  const coveredMonthRefs = expectedMonthRefs.filter((item) => coveredSet.has(item));
  const missingMonthRefs = expectedMonthRefs.filter((item) => !coveredSet.has(item));
  const coveredPeriods = coveredMonthRefs.length;
  const totalPeriods = expectedMonthRefs.length;
  const status =
    coveredPeriods === 0 ? 'NONE' : coveredPeriods === totalPeriods ? 'FULL' : 'PARTIAL';
  const message =
    status === 'FULL'
      ? 'A base sincronizada cobre todo o intervalo selecionado.'
      : status === 'PARTIAL'
        ? 'A base sincronizada cobre apenas parte do intervalo selecionado.'
        : 'Não há sincronização concluída para o intervalo selecionado.';

  return {
    status,
    totalPeriods,
    coveredPeriods,
    expectedMonthRefs,
    coveredMonthRefs,
    missingMonthRefs,
    message,
  };
};

export const getPayrollPointOverview = async (db: DbInterface, dateRange: PayrollPointDateRange): Promise<PayrollPointOverview> => {
  await ensurePayrollTables(db);
  const [periods, heartbeat] = await Promise.all([listPayrollPeriods(db), getPayrollPointHeartbeat(db)]);
  const referenceMonthRef = getOperationalMonthRefForDate(dateRange.startDate);
  const expectedMonthRefs = listOperationalMonthRefsInRange(dateRange.startDate, dateRange.endDate);
  const periodByMonthRef = new Map(periods.map((period) => [period.monthRef, period] as const));
  const overlappingPeriods = expectedMonthRefs.map((monthRef) => periodByMonthRef.get(monthRef) || null);
  const syncTargetPeriod = periodByMonthRef.get(referenceMonthRef) || null;

  const completedSyncRefs = new Set<string>();
  await Promise.all(
    overlappingPeriods
      .filter((period): period is PayrollPeriod => Boolean(period))
      .map(async (period) => {
        const syncRuns = await listPointSyncRunsByPeriod(db, period.id);
        if (syncRuns.some((item) => item.status === 'COMPLETED')) {
          completedSyncRefs.add(period.monthRef);
        }
      }),
  );

  const coverage = buildPayrollPointCoverage(expectedMonthRefs, Array.from(completedSyncRefs.values()));
  const alerts: string[] = [];
  if (!syncTargetPeriod) {
    alerts.push(`Nenhuma competência operacional foi encontrada para ${referenceMonthRef}.`);
  }
  if (coverage.status !== 'FULL') {
    alerts.push(coverage.message);
  }

  return {
    dateRange,
    heartbeat,
    referenceMonthRef,
    syncTargetPeriod,
    coverage,
    alerts,
  };
};

const loadEmployeeRosterForPeriod = async (db: DbInterface, periodStart: string, periodEnd: string) => {
  const rows = await db.query(
    `
    SELECT *
    FROM employees
    WHERE (admission_date IS NULL OR admission_date <= ?)
      AND (termination_date IS NULL OR termination_date >= ?)
    ORDER BY full_name ASC
    `,
    [periodEnd, periodStart],
  );
  return rows.map(mapEmployeePayrollSource);
};

const reconcilePointRowsEmployeeLinks = async (
  db: DbInterface,
  periodId: string,
  employees: EmployeePayrollSource[],
) => {
  if (!employees.length) return 0;

  const unmatchedRows = await db.query(
    `
    SELECT id, employee_name, employee_cpf
    FROM payroll_point_daily
    WHERE period_id = ?
      AND (employee_id IS NULL OR TRIM(employee_id) = '')
    `,
    [periodId],
  );
  if (!unmatchedRows.length) return 0;

  const lookup = buildEmployeeLookupMaps(employees);
  let updatedCount = 0;

  for (const row of unmatchedRows) {
    const matchedEmployee = findMatchingEmployeeForPointRow(
      clean(row.employee_name),
      normalizeCpf(row.employee_cpf),
      lookup,
    );
    if (!matchedEmployee) continue;

    await db.execute(
      `UPDATE payroll_point_daily SET employee_id = ?, updated_at = ? WHERE id = ?`,
      [matchedEmployee.id, NOW(), clean(row.id)],
    );
    updatedCount += 1;
  }

  return updatedCount;
};

const createImportRecord = async (
  db: DbInterface,
  params: {
    periodId: string;
    fileType: PayrollImportFileType;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    uploadedBy: string;
    initialStatus?: PayrollImportStatus;
    initialLog?: string;
  },
) => {
  const id = randomUUID();
  const now = NOW();
  const initialStatus = params.initialStatus || 'PENDING';
  const initialLog = params.initialLog || 'Arquivo enviado e enfileirado para processamento.';
  await db.execute(
    `INSERT INTO payroll_import_files (id, period_id, file_type, file_name, mime_type, size_bytes, storage_provider, storage_bucket, storage_key, processing_status, processing_log, uploaded_by, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.periodId,
      params.fileType,
      params.fileName,
      params.mimeType,
      params.sizeBytes,
      params.storageProvider,
      params.storageBucket,
      params.storageKey,
      initialStatus,
      initialLog,
      params.uploadedBy,
      now,
      null,
    ],
  );
  return id;
};

const createPointImportJob = async (
  db: DbInterface,
  params: {
    periodId: string;
    importFileId: string;
    requestedBy: string;
    initialStatus?: PayrollSyncJobStatus;
    errorMessage?: string | null;
  },
) => {
  const id = randomUUID();
  const now = NOW();
  const initialStatus = params.initialStatus || 'PENDING';
  await db.execute(
    `INSERT INTO payroll_point_import_jobs (id, period_id, import_file_id, status, requested_by, error_message, created_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.periodId,
      params.importFileId,
      initialStatus,
      params.requestedBy,
      params.errorMessage || null,
      now,
      initialStatus === 'RUNNING' ? now : null,
      initialStatus === 'COMPLETED' || initialStatus === 'FAILED' ? now : null,
    ],
  );
  return { id, status: initialStatus, createdAt: now };
};

const createPointSyncJob = async (
  db: DbInterface,
  params: {
    periodId: string;
    requestedBy: string;
    initialStatus?: PayrollSyncJobStatus;
    errorMessage?: string | null;
  },
) => {
  const id = randomUUID();
  const now = NOW();
  const initialStatus = params.initialStatus || 'PENDING';
  await db.execute(
    `INSERT INTO payroll_point_sync_jobs (id, period_id, status, requested_by, error_message, created_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.periodId,
      initialStatus,
      params.requestedBy,
      params.errorMessage || null,
      now,
      initialStatus === 'RUNNING' ? now : null,
      initialStatus === 'COMPLETED' || initialStatus === 'FAILED' ? now : null,
    ],
  );
  return { id, status: initialStatus, createdAt: now };
};

const createPointSyncRun = async (
  db: DbInterface,
  params: {
    periodId: string;
    jobId: string;
    status?: PayrollSyncJobStatus;
    sourceLabel?: string;
    details?: string | null;
  },
) => {
  const id = randomUUID();
  const now = NOW();
  await db.execute(
    `INSERT INTO payroll_point_sync_runs (
      id, period_id, job_id, status, source_label, synchronized_employees, synchronized_days,
      unmatched_employees, pending_adjustments, pending_signatures, details, started_at, finished_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?, ?)`,
    [
      id,
      params.periodId,
      params.jobId,
      params.status || 'PENDING',
      params.sourceLabel || 'API Sólides',
      params.details || null,
      params.status === 'RUNNING' ? now : null,
      params.status === 'COMPLETED' || params.status === 'FAILED' ? now : null,
      now,
    ],
  );
  return id;
};

const countPointImportsInProgress = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(
    `SELECT COUNT(*) AS total
     FROM payroll_import_files
     WHERE period_id = ?
       AND file_type = 'POINT_PDF'
      AND processing_status IN ('PENDING', 'PROCESSING')`,
    [periodId],
  );
  const firstRow = rows?.[0] as any;
  if (!firstRow) return 0;
  return Number(firstRow.total ?? firstRow.TOTAL ?? Object.values(firstRow)[0] ?? 0);
};

const countPointSyncJobsInProgress = async (db: DbInterface, periodId: string) => {
  const rows = await db.query(
    `SELECT COUNT(*) AS total
     FROM payroll_point_sync_jobs
     WHERE period_id = ?
       AND status IN ('PENDING', 'RUNNING')`,
    [periodId],
  );
  const firstRow = rows?.[0] as any;
  if (!firstRow) return 0;
  return Number(firstRow.total ?? firstRow.TOTAL ?? Object.values(firstRow)[0] ?? 0);
};

export const enqueuePayrollPointImport = async (
  db: DbInterface,
  params: {
    periodId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    uploadedBy: string;
  },
) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, params.periodId);
  const importId = await createImportRecord(db, {
    ...params,
    fileType: 'POINT_PDF',
    initialStatus: 'PENDING',
    initialLog: 'Arquivo enviado e enfileirado para processamento.',
  });
  const job = await createPointImportJob(db, {
    periodId: params.periodId,
    importFileId: importId,
    requestedBy: params.uploadedBy,
  });

  const rows = await db.query(`SELECT * FROM payroll_import_files WHERE id = ? LIMIT 1`, [importId]);
  return {
    importFile: mapImportFile(rows[0]),
    job,
  };
};

export const enqueuePayrollPointSync = async (
  db: DbInterface,
  params: {
    periodId: string;
    requestedBy: string;
  },
) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, params.periodId);
  const running = await countPointSyncJobsInProgress(db, params.periodId);
  if (running > 0) {
    throw new PayrollValidationError('Já existe uma sincronização de ponto em andamento para esta competência.', 409);
  }

  const job = await createPointSyncJob(db, {
    periodId: params.periodId,
    requestedBy: params.requestedBy,
  });
  const runId = await createPointSyncRun(db, {
    periodId: params.periodId,
    jobId: job.id,
    status: 'PENDING',
    details: 'Sincronização aguardando execução pelo worker.',
  });

  const runRows = await db.query(`SELECT * FROM payroll_point_sync_runs WHERE id = ? LIMIT 1`, [runId]);

  return {
    job,
    run: mapPointSyncRun(runRows[0]),
  };
};

const buildLineRecord = (
  employee: EmployeePayrollSource,
  period: PayrollPeriod,
  rules: PayrollRule,
  pointRows: PayrollPointDaily[],
  occurrences: PayrollOccurrence[],
  existingLine: PayrollLine | null,
): PayrollLine => {
  const pointRowsInPeriod = pointRows.filter((item) => item.pointDate >= period.periodStart && item.pointDate <= period.periodEnd);

  const getOccurrenceForDate = (pointDate: string) =>
    occurrences.find((item) => overlapsDateRange(pointDate, item.dateStart, item.dateEnd || item.dateStart));

  const hasFullPeriodCoverageWithoutPoint = () => {
    return occurrences.some((occurrence) => {
      if (!JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType)) return false;
      const start = occurrence.dateStart || null;
      const end = occurrence.dateEnd || occurrence.dateStart || null;
      if (!start || !end) return false;
      return start <= period.periodStart && end >= period.periodEnd;
    });
  };

  let daysWorked = 0;
  let absencesCount = 0;
  let lateMinutes = 0;
  let workedMinutesTotal = 0;

  for (const row of pointRowsInPeriod) {
    const occurrence = getOccurrenceForDate(row.pointDate);
    const justified = Boolean(occurrence && JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType));
    const forcedAbsence = Boolean(occurrence && occurrence.occurrenceType === 'FALTA_INJUSTIFICADA');
    const isAbsence = forcedAbsence || (row.absenceFlag && !justified);

    if (isAbsence) {
      absencesCount += 1;
      continue;
    }

    if (row.workedMinutes > 0 || justified) {
      daysWorked += 1;
      workedMinutesTotal += Number(row.workedMinutes || 0);
    }

    if (!justified && !forcedAbsence) {
      lateMinutes += Math.max(0, Number(row.lateMinutes || 0) - rules.lateToleranceMinutes);
    }
  }

  const scheduleMinutes = parseScheduleMinutes(pointRowsInPeriod[0]?.scheduleStart || null, pointRowsInPeriod[0]?.scheduleEnd || null, employee.workSchedule);
  const monthlyDivisor = scheduleMinutes && scheduleMinutes > 0 ? (scheduleMinutes / 60) * 25 : employee.employmentRegime === 'ESTAGIO' ? 150 : 220;
  const salaryHour = monthlyDivisor > 0 ? employee.salaryAmount / monthlyDivisor : 0;
  const inconsistentPointRows = pointRowsInPeriod.filter((row) => row.inconsistencyFlag);
  const inconsistencyDetails = inconsistentPointRows.map(buildPointInconsistencyDetail).slice(0, 5);
  const inconsistencyCount = inconsistentPointRows.length;

  const warnings: Array<{ code: string; message: string; details?: PayrollBenefitIssueDetail[] }> = [];
  if (!pointRowsInPeriod.length && !hasFullPeriodCoverageWithoutPoint()) {
    warnings.push({
      code: 'EMPLOYEE_WITHOUT_POINT_ROWS',
      message: 'Colaborador ativo sem registros de ponto na competência.',
    });
  }
  if (!clean(employee.costCenter)) {
    warnings.push({
      code: 'MISSING_COST_CENTER',
      message: 'Centro de custo ausente no cadastro do colaborador.',
    });
  }
  if (scheduleMinutes === null) {
    warnings.push({
      code: 'FALLBACK_SCHEDULE_DIVISOR',
      message: `Jornada não identificada; divisor padrão ${monthlyDivisor} aplicado no cálculo do salário-hora.`,
    });
  }
  if (inconsistencyCount > 0) {
    warnings.push({
      code: 'POINT_INCONSISTENCY',
      message: `${inconsistencyCount} registro(s) diário(s) do ponto com inconsistência nesta competência. Confira os detalhes para revisar data e motivo detectado.`,
      details: inconsistencyDetails,
    });
  }

  const absenceDiscount = roundMoney((employee.salaryAmount / 30) * absencesCount);
  const lateDiscount = roundMoney((salaryHour * lateMinutes) / 60);
  const insalubrityAmount = roundMoney((rules.minWageAmount * employee.insalubrityPercent) / 100);

  let vtProvisioned = 0;
  if (employee.transportVoucherMode === 'MONTHLY_FIXED') {
    vtProvisioned = employee.transportVoucherMonthlyFixed;
  } else if (employee.transportVoucherMode === 'PER_DAY') {
    vtProvisioned = employee.transportVoucherPerDay * daysWorked;
  }
  vtProvisioned = roundMoney(vtProvisioned);

  const vtDiscountCap = roundMoney(employee.salaryAmount * (rules.vtDiscountCapPercent / 100));
  const vtDiscount = employee.employmentRegime === 'ESTAGIO' ? 0 : roundMoney(Math.min(vtProvisioned, vtDiscountCap));
  const totalpassDiscount = roundMoney(employee.totalpassDiscountFixed || 0);
  const otherFixedDiscount = roundMoney(employee.otherFixedDiscountAmount || 0);
  const adjustmentsAmount = roundMoney(existingLine?.adjustmentsAmount || 0);

  let totalProvents = employee.salaryAmount + insalubrityAmount;
  let totalDiscounts = absenceDiscount + lateDiscount + vtDiscount + totalpassDiscount + otherFixedDiscount;
  if (adjustmentsAmount >= 0) totalProvents += adjustmentsAmount;
  else totalDiscounts += Math.abs(adjustmentsAmount);

  totalProvents = roundMoney(totalProvents);
  totalDiscounts = roundMoney(totalDiscounts);

  const draftLine: PayrollLine = {
    id: existingLine?.id || randomUUID(),
    periodId: period.id,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCpf: employee.cpf,
    centerCost: employee.costCenter,
    unitName: employee.units[0] || null,
    contractType: employee.employmentRegime,
    salaryBase: roundMoney(employee.salaryAmount),
    insalubrityPercent: roundMoney(employee.insalubrityPercent),
    insalubrityAmount,
    daysWorked,
    absencesCount,
    absenceDiscount,
    lateMinutes,
    lateDiscount,
    vtProvisioned,
    vtDiscount,
    totalpassDiscount,
    otherFixedDiscount,
    otherFixedDiscountDescription: employee.otherFixedDiscountDescription,
    adjustmentsAmount,
    adjustmentsNotes: existingLine?.adjustmentsNotes || null,
    totalProvents,
    totalDiscounts,
    netOperational: roundMoney(totalProvents - totalDiscounts),
    lineStatus: existingLine?.lineStatus || 'RASCUNHO',
    payrollNotes: existingLine?.payrollNotes || employee.payrollNotes || null,
    employeeSnapshotJson: safeJson({
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      cpf: employee.cpf,
      jobTitle: employee.jobTitle,
      costCenter: employee.costCenter,
      units: employee.units,
      employmentRegime: employee.employmentRegime,
      salaryAmount: employee.salaryAmount,
      insalubrityPercent: employee.insalubrityPercent,
      mealVoucherPerDay: employee.mealVoucherPerDay,
      transportVoucherMode: employee.transportVoucherMode,
      transportVoucherPerDay: employee.transportVoucherPerDay,
      transportVoucherMonthlyFixed: employee.transportVoucherMonthlyFixed,
      totalpassDiscountFixed: employee.totalpassDiscountFixed,
      otherFixedDiscountAmount: employee.otherFixedDiscountAmount,
      otherFixedDiscountDescription: employee.otherFixedDiscountDescription,
      payrollNotes: employee.payrollNotes,
      workSchedule: employee.workSchedule,
    }),
    calculationMemoryJson: safeJson({
      competence: period.monthRef,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rules: {
        minWageAmount: rules.minWageAmount,
        lateToleranceMinutes: rules.lateToleranceMinutes,
        vtDiscountCapPercent: rules.vtDiscountCapPercent,
      },
      metrics: {
        workedMinutesTotal,
        daysWorked,
        absencesCount,
        lateMinutes,
        monthlyDivisor,
        salaryHour: roundMoney(salaryHour),
      },
      discounts: {
        absenceDiscount,
        lateDiscount,
        vtProvisioned,
        vtDiscountCap,
        vtDiscount,
        totalpassDiscount,
        otherFixedDiscount,
        adjustmentsAmount,
      },
      warnings,
    }),
    createdAt: existingLine?.createdAt || NOW(),
    updatedAt: NOW(),
  };

  return draftLine;
};

export const generatePayrollPeriod = async (db: DbInterface, periodId: string) => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, periodId);
  if (!period.rules) throw new PayrollValidationError('Regras da competência não encontradas.', 500);

  const importsInProgress = await countPointImportsInProgress(db, period.id);
  const syncJobsInProgress = await countPointSyncJobsInProgress(db, period.id);
  if (importsInProgress > 0 || syncJobsInProgress > 0) {
    throw new PayrollValidationError('Ainda há importações de ponto pendentes ou em processamento nesta competência. Aguarde a conclusão antes de gerar a folha.', 409);
  }

  const [employees, occurrenceRows, existingLines, syncRuns] = await Promise.all([
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listOccurrencesRaw(db, period.id),
    listLinesRaw(db, period.id),
    listPointSyncRunsByPeriod(db, period.id),
  ]);
  const imports = await listImportsByPeriod(db, period.id);
  await reconcilePointRowsEmployeeLinks(db, period.id, employees);
  const [pointRows, hoursBalances, signatures] = await Promise.all([
    listPointRowsRaw(db, period.id),
    listHoursBalanceRaw(db, period.id),
    listSignaturesRaw(db, period.id),
  ]);
  const readiness = evaluatePayrollPeriodReadiness(period, imports, syncRuns, employees, pointRows, occurrenceRows, hoursBalances, signatures);
  if (readiness.status === 'BLOCKED') {
    throw new PayrollValidationError(buildReadinessBlockingMessage(readiness), 409);
  }

  const pointMap = new Map<string, PayrollPointDaily[]>();
  for (const row of pointRows) {
    const key = row.employeeId || buildComparisonKey(row.employeeName, row.employeeCpf);
    const list = pointMap.get(key) || [];
    list.push(row);
    pointMap.set(key, list);
  }

  const occurrenceMap = new Map<string, PayrollOccurrence[]>();
  for (const row of occurrenceRows) {
    const list = occurrenceMap.get(row.employeeId) || [];
    list.push(row);
    occurrenceMap.set(row.employeeId, list);
  }

  const existingMap = new Map<string, PayrollLine>();
  for (const line of existingLines) {
    const key = line.employeeId || buildComparisonKey(line.employeeName, line.employeeCpf);
    if (!existingMap.has(key)) existingMap.set(key, line);
  }

  const generatedLines = employees.map((employee) =>
    buildLineRecord(
      employee,
      period,
      period.rules!,
      pointMap.get(employee.id) || pointMap.get(buildComparisonKey(employee.fullName, employee.cpf)) || [],
      occurrenceMap.get(employee.id) || [],
      existingMap.get(employee.id) || existingMap.get(buildComparisonKey(employee.fullName, employee.cpf)) || null,
    ),
  );

  await db.execute(`DELETE FROM payroll_lines WHERE period_id = ?`, [period.id]);

  for (const line of generatedLines) {
    await db.execute(
      `INSERT INTO payroll_lines (
        id, period_id, employee_id, comparison_key, employee_name, employee_cpf, center_cost, unit_name,
        contract_type, salary_base, insalubrity_percent, insalubrity_amount, days_worked, absences_count,
        absence_discount, late_minutes, late_discount, vt_provisioned, vt_discount, totalpass_discount,
        other_fixed_discount, other_fixed_discount_description, adjustments_amount, adjustments_notes,
        total_provents, total_discounts, net_operational, line_status, payroll_notes,
        employee_snapshot_json, calculation_memory_json, comparison_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        line.id,
        line.periodId,
        line.employeeId,
        buildComparisonKey(line.employeeName, line.employeeCpf),
        line.employeeName,
        line.employeeCpf,
        line.centerCost,
        line.unitName,
        line.contractType,
        line.salaryBase,
        line.insalubrityPercent,
        line.insalubrityAmount,
        line.daysWorked,
        line.absencesCount,
        line.absenceDiscount,
        line.lateMinutes,
        line.lateDiscount,
        line.vtProvisioned,
        line.vtDiscount,
        line.totalpassDiscount,
        line.otherFixedDiscount,
        line.otherFixedDiscountDescription,
        line.adjustmentsAmount,
        line.adjustmentsNotes,
        line.totalProvents,
        line.totalDiscounts,
        line.netOperational,
        line.lineStatus,
        line.payrollNotes,
        line.employeeSnapshotJson,
        line.calculationMemoryJson,
        'SEM_BASE',
        line.createdAt,
        line.updatedAt,
      ],
    );
  }

  await db.execute(`UPDATE payroll_periods SET status = ?, updated_at = ? WHERE id = ?`, ['EM_REVISAO', NOW(), period.id]);

  return listPayrollLines(db, period.id, {
    search: '',
    centerCost: 'all',
    unit: 'all',
    contractType: 'all',
    lineStatus: 'all',
  });
};

const matchesLineFilters = (line: PayrollLine, filters: PayrollLineFilters) => {
  if (filters.search) {
    const haystack = `${line.employeeName} ${line.employeeCpf || ''}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.centerCost !== 'all' && clean(line.centerCost) !== clean(filters.centerCost)) return false;
  if (filters.unit !== 'all' && clean(line.unitName) !== clean(filters.unit)) return false;
  if (filters.contractType !== 'all' && clean(line.contractType) !== clean(filters.contractType)) return false;
  if (filters.lineStatus !== 'all' && line.lineStatus !== filters.lineStatus) return false;
  return true;
};

type PayrollOperationalEmployeeRow = {
  key: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  unitName: string | null;
  contractType: string | null;
  lineStatus: PayrollLineStatus | null;
};

const matchesOperationalFilters = (row: PayrollOperationalEmployeeRow, filters: PayrollLineFilters) => {
  if (filters.search) {
    const haystack = `${row.employeeName} ${row.employeeCpf || ''}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.centerCost !== 'all' && clean(row.centerCost) !== clean(filters.centerCost)) return false;
  if (filters.unit !== 'all' && clean(row.unitName) !== clean(filters.unit)) return false;
  if (filters.contractType !== 'all' && clean(row.contractType) !== clean(filters.contractType)) return false;
  if (filters.lineStatus !== 'all' && row.lineStatus !== filters.lineStatus) return false;
  return true;
};

const buildOperationalComparisonKey = (employeeId: string | null, employeeName: string, employeeCpf: string | null) =>
  employeeId || buildComparisonKey(employeeName, employeeCpf);

const buildOperationalEmployeesCollection = ({
  employees,
  filters,
  lines = [],
  pointRows = [],
  hoursRows = [],
  signatureRows = [],
  occurrences = [],
}: {
  employees: EmployeePayrollSource[];
  filters: PayrollLineFilters;
  lines?: PayrollLine[];
  pointRows?: PayrollPointDaily[];
  hoursRows?: PayrollHoursBalanceMonthly[];
  signatureRows?: PayrollSignatureMonthly[];
  occurrences?: PayrollOccurrence[];
}) => {
  const items = new Map<string, PayrollOperationalEmployeeRow>();
  const employeeDetailsById = new Map<string, { name: string; cpf: string | null; centerCost: string | null; unitName: string | null; contractType: string | null }>();
  const employeeLookup = buildEmployeeLookupMaps(employees);

  const resolveEmployeeContext = (employeeId: string | null, employeeName: string, employeeCpf: string | null) => {
    if (employeeId) {
      const byId = employeeDetailsById.get(employeeId);
      if (byId) return byId;
    }
    const matched = findMatchingEmployeeForPointRow(employeeName, employeeCpf, employeeLookup);
    if (!matched) return null;
    return {
      name: matched.fullName,
      cpf: matched.cpf,
      centerCost: matched.costCenter,
      unitName: matched.units[0] || null,
      contractType: matched.employmentRegime,
    };
  };

  const register = (row: PayrollOperationalEmployeeRow) => {
    const resolved = resolveEmployeeContext(row.employeeId, row.employeeName, row.employeeCpf);
    const candidate: PayrollOperationalEmployeeRow = {
      ...row,
      employeeName: resolved?.name || row.employeeName,
      employeeCpf: resolved?.cpf || row.employeeCpf,
      centerCost: row.centerCost || resolved?.centerCost || null,
      unitName: row.unitName || resolved?.unitName || null,
      contractType: row.contractType || resolved?.contractType || null,
    };
    const key = buildOperationalComparisonKey(candidate.employeeId, candidate.employeeName, candidate.employeeCpf);
    if (!key || items.has(key)) return;
    items.set(key, candidate);
  };

  for (const line of lines) {
    if (line.employeeId) {
      employeeDetailsById.set(line.employeeId, {
        name: line.employeeName,
        cpf: line.employeeCpf,
        centerCost: line.centerCost,
        unitName: line.unitName,
        contractType: line.contractType,
      });
    }
    register({
      key: line.id,
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      employeeCpf: line.employeeCpf,
      centerCost: line.centerCost,
      unitName: line.unitName,
      contractType: line.contractType,
      lineStatus: line.lineStatus,
    });
  }

  for (const employee of employees) {
    employeeDetailsById.set(employee.id, {
      name: employee.fullName,
      cpf: employee.cpf,
      centerCost: employee.costCenter,
      unitName: employee.units[0] || null,
      contractType: employee.employmentRegime,
    });
    register({
      key: employee.id,
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCpf: employee.cpf,
      centerCost: employee.costCenter,
      unitName: employee.units[0] || null,
      contractType: employee.employmentRegime,
      lineStatus: null,
    });
  }

  for (const row of pointRows) {
    register({
      key: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCpf: row.employeeCpf,
      centerCost: null,
      unitName: null,
      contractType: null,
      lineStatus: null,
    });
  }

  for (const row of hoursRows) {
    register({
      key: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCpf: row.employeeCpf,
      centerCost: null,
      unitName: null,
      contractType: null,
      lineStatus: null,
    });
  }

  for (const row of signatureRows) {
    register({
      key: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCpf: row.employeeCpf,
      centerCost: null,
      unitName: null,
      contractType: null,
      lineStatus: null,
    });
  }

  for (const row of occurrences) {
    const employeeSnapshot = row.employeeId ? employeeDetailsById.get(row.employeeId) || null : null;
    register({
      key: row.id,
      employeeId: row.employeeId,
      employeeName: employeeSnapshot?.name || row.employeeId || 'Sem vínculo local',
      employeeCpf: employeeSnapshot?.cpf || null,
      centerCost: employeeSnapshot?.centerCost || null,
      unitName: employeeSnapshot?.unitName || null,
      contractType: employeeSnapshot?.contractType || null,
      lineStatus: null,
    });
  }

  return {
    items: Array.from(items.values())
      .filter((row) => matchesOperationalFilters(row, filters))
      .sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' })),
  };
};

const listPayrollOperationalEmployees = async (
  db: DbInterface,
  periodId: string,
  filters: PayrollLineFilters,
) => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, periodId);
  const [lines, employees, pointRows, hoursRows, signatureRows, occurrences] = await Promise.all([
    listLinesRaw(db, periodId),
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listPointRowsRaw(db, periodId),
    listHoursBalanceRaw(db, periodId),
    listSignaturesRaw(db, periodId),
    listOccurrencesRaw(db, periodId),
  ]);

  return buildOperationalEmployeesCollection({
    employees,
    filters,
    lines,
    pointRows,
    hoursRows,
    signatureRows,
    occurrences,
  });
};

const listPayrollOperationalEmployeesByDateRange = async (
  db: DbInterface,
  dateRange: PayrollPointDateRange,
  filters: PayrollLineFilters,
  monthlyPeriodIds: string[],
) => {
  await ensurePayrollTables(db);
  const [employees, pointRows, hoursRows, signatureRows, occurrences] = await Promise.all([
    loadEmployeeRosterForPeriod(db, dateRange.startDate, dateRange.endDate),
    listPointRowsByDateRangeRaw(db, dateRange.startDate, dateRange.endDate),
    listHoursBalanceByPeriodIdsRaw(db, monthlyPeriodIds),
    listSignaturesByPeriodIdsRaw(db, monthlyPeriodIds),
    listOccurrencesByDateRangeRaw(db, dateRange.startDate, dateRange.endDate),
  ]);

  return buildOperationalEmployeesCollection({
    employees,
    filters,
    pointRows,
    hoursRows,
    signatureRows,
    occurrences,
  });
};

export const listPayrollLines = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const lines = (await listLinesRaw(db, periodId)).filter((line) => matchesLineFilters(line, filters));
  return {
    items: lines,
    availableCentersCost: Array.from(new Set(lines.map((line) => clean(line.centerCost)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })),
    availableUnits: Array.from(new Set(lines.map((line) => clean(line.unitName)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })),
    availableContracts: Array.from(new Set(lines.map((line) => clean(line.contractType)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })),
  };
};

type PayrollEmployeePreviewSource = Pick<
  EmployeePayrollSource,
  'id' | 'fullName' | 'email' | 'cpf' | 'jobTitle' | 'costCenter' | 'units' | 'employmentRegime' | 'transportVoucherPerDay' | 'insalubrityPercent'
>;

type PayrollEmployeeBenefitsSource = Pick<
  EmployeePayrollSource,
  | 'id'
  | 'fullName'
  | 'cpf'
  | 'costCenter'
  | 'units'
  | 'employmentRegime'
  | 'mealVoucherPerDay'
  | 'transportVoucherMode'
  | 'transportVoucherPerDay'
  | 'transportVoucherMonthlyFixed'
  | 'totalpassDiscountFixed'
  | 'otherFixedDiscountAmount'
  | 'otherFixedDiscountDescription'
>;

type PayrollLineSnapshot = Partial<{
  id: string;
  fullName: string;
  email: string | null;
  cpf: string | null;
  jobTitle: string | null;
  costCenter: string | null;
  units: string[];
  employmentRegime: string;
  mealVoucherPerDay: number;
  transportVoucherMode: PayrollTransportVoucherMode;
  transportVoucherPerDay: number;
  transportVoucherMonthlyFixed: number;
  insalubrityPercent: number;
  totalpassDiscountFixed: number;
  otherFixedDiscountAmount: number;
  otherFixedDiscountDescription: string | null;
}>;

type PayrollCalculationWarning = {
  code: string;
  message: string;
  details?: PayrollBenefitIssueDetail[];
};

const occurrenceTypeLabelMap: Record<PayrollOccurrenceType, string> = {
  ATESTADO: 'Atestado',
  DECLARACAO: 'Declaração',
  AJUSTE_BATIDA: 'Ajuste de batida',
  AUSENCIA_AUTORIZADA: 'Ausência autorizada',
  FALTA_INJUSTIFICADA: 'Falta injustificada',
  FERIAS: 'Férias',
};

const parsePayrollLineSnapshot = (value: string | null | undefined): PayrollLineSnapshot => {
  const raw = clean(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const parsePayrollCalculationWarnings = (value: string | null | undefined): PayrollCalculationWarning[] => {
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const warnings: unknown[] = Array.isArray(parsed?.warnings) ? parsed.warnings : [];
    return warnings
      .map((warning: unknown) => {
        const warningRecord = warning as Record<string, unknown>;
        const detailRows: unknown[] = Array.isArray(warningRecord?.details) ? warningRecord.details : [];
        const details = detailRows
          .map((detail: unknown): PayrollBenefitIssueDetail => {
            const detailRecord = detail as Record<string, unknown>;
            return {
              date: parseDate(detailRecord.date) || null,
              reason: clean(detailRecord.reason) || 'Detalhe operacional do ponto.',
              rawText: truncateText(clean(detailRecord.rawText), 260),
              marks: Array.isArray(detailRecord.marks) ? detailRecord.marks.map((item) => clean(item)).filter(Boolean) : [],
            };
          })
          .filter((detail) => detail.reason || detail.rawText || detail.marks.length);
        return {
          code: clean(warningRecord?.code),
          message: clean(warningRecord?.message),
          details,
        };
      })
      .filter((warning) => warning.code && warning.message);
  } catch {
    return [];
  }
};

const formatShortDateBr = (value: string | null | undefined) => {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return `${parsed.slice(8, 10)}/${parsed.slice(5, 7)}`;
};

const normalizeInsalubrityForSheet = (value: number | null | undefined) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.0001) return null;
  return roundMoney(amount > 1 ? amount / 100 : amount);
};

const nullableSheetMoney = (value: number | null | undefined) => {
  const amount = roundMoney(Number(value || 0));
  return Math.abs(amount) < 0.01 ? null : amount;
};

const buildOccurrenceSummary = (occurrence: PayrollOccurrence) => {
  const start = formatShortDateBr(occurrence.dateStart);
  const end = formatShortDateBr(occurrence.dateEnd);
  const dateLabel = start && end && start !== end ? `${start} a ${end}` : start || end || '';
  const label = occurrenceTypeLabelMap[occurrence.occurrenceType] || occurrence.occurrenceType;
  const notes = clean(occurrence.notes);
  return [label, dateLabel ? `(${dateLabel})` : '', notes ? `- ${notes}` : ''].filter(Boolean).join(' ');
};

const buildPreviewObservation = (line: PayrollLine, occurrences: PayrollOccurrence[]) => {
  const parts: string[] = [];
  if (clean(line.payrollNotes)) parts.push(clean(line.payrollNotes));
  if (clean(line.adjustmentsNotes)) parts.push(`Ajuste: ${clean(line.adjustmentsNotes)}`);
  if (clean(line.otherFixedDiscountDescription)) parts.push(`Desconto: ${clean(line.otherFixedDiscountDescription)}`);

  const occurrenceText = occurrences.map(buildOccurrenceSummary).filter(Boolean).join('; ');
  if (occurrenceText) parts.push(occurrenceText);

  if (line.absencesCount > 0) parts.push(`Faltas consideradas: ${line.absencesCount}`);
  if (line.lateMinutes > 0) parts.push(`Atrasos considerados: ${line.lateMinutes} min`);

  return parts.join(' | ') || null;
};

const loadEmployeePreviewMap = async (db: DbInterface, employeeIds: string[]) => {
  const uniqueIds = Array.from(new Set(employeeIds.map((item) => clean(item)).filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, PayrollEmployeePreviewSource>();

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.query(
    `
      SELECT id, full_name, email, cpf, job_title, cost_center, units_json, employment_regime, transport_voucher_per_day, insalubrity_percent
      FROM employees
      WHERE id IN (${placeholders})
    `,
    uniqueIds,
  );

  return new Map(
    rows.map((row: any) => {
      const mapped: PayrollEmployeePreviewSource = {
        id: clean(row.id),
        fullName: clean(row.full_name),
        email: clean(row.email) || null,
        cpf: normalizeCpf(row.cpf),
        jobTitle: clean(row.job_title) || null,
        costCenter: clean(row.cost_center) || null,
        units: parseUnitsJson(row.units_json),
        employmentRegime: upper(row.employment_regime || 'CLT'),
        transportVoucherPerDay: toNumber(row.transport_voucher_per_day),
        insalubrityPercent: toNumber(row.insalubrity_percent),
      };
      return [mapped.id, mapped] as const;
    }),
  );
};

const loadEmployeeBenefitsMap = async (db: DbInterface, employeeIds: string[]) => {
  const uniqueIds = Array.from(new Set(employeeIds.map((item) => clean(item)).filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, PayrollEmployeeBenefitsSource>();

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.query(
    `
      SELECT
        id,
        full_name,
        cpf,
        cost_center,
        units_json,
        employment_regime,
        meal_voucher_per_day,
        transport_voucher_mode,
        transport_voucher_per_day,
        transport_voucher_monthly_fixed,
        totalpass_discount_fixed,
        other_fixed_discount_amount,
        other_fixed_discount_description
      FROM employees
      WHERE id IN (${placeholders})
    `,
    uniqueIds,
  );

  return new Map(
    rows.map((row: any) => {
      const mapped: PayrollEmployeeBenefitsSource = {
        id: clean(row.id),
        fullName: clean(row.full_name),
        cpf: normalizeCpf(row.cpf),
        costCenter: clean(row.cost_center) || null,
        units: parseUnitsJson(row.units_json),
        employmentRegime: upper(row.employment_regime || 'CLT'),
        mealVoucherPerDay: toNumber(row.meal_voucher_per_day),
        transportVoucherMode: upper(row.transport_voucher_mode || 'PER_DAY') as PayrollTransportVoucherMode,
        transportVoucherPerDay: toNumber(row.transport_voucher_per_day),
        transportVoucherMonthlyFixed: toNumber(row.transport_voucher_monthly_fixed),
        totalpassDiscountFixed: toNumber(row.totalpass_discount_fixed),
        otherFixedDiscountAmount: toNumber(row.other_fixed_discount_amount),
        otherFixedDiscountDescription: clean(row.other_fixed_discount_description) || null,
      };
      return [mapped.id, mapped] as const;
    }),
  );
};

const buildPayrollPreviewRow = (
  line: PayrollLine,
  employeeFallback: PayrollEmployeePreviewSource | null,
  occurrences: PayrollOccurrence[],
): PayrollPreviewRow => {
  const snapshot = parsePayrollLineSnapshot(line.employeeSnapshotJson);
  const email = clean(snapshot.email) || employeeFallback?.email || null;
  const roleName = clean(snapshot.jobTitle) || employeeFallback?.jobTitle || null;
  const centerCost = clean(snapshot.costCenter) || employeeFallback?.costCenter || line.centerCost || null;
  const contractType = clean(snapshot.employmentRegime) || employeeFallback?.employmentRegime || line.contractType || null;
  const vtPerDay = nullableSheetMoney(
    toNullableNumber(snapshot.transportVoucherPerDay) ?? employeeFallback?.transportVoucherPerDay ?? 0,
  );
  const insalubrityValue = normalizeInsalubrityForSheet(
    toNullableNumber(snapshot.insalubrityPercent) ?? employeeFallback?.insalubrityPercent ?? line.insalubrityPercent,
  );

  return {
    key: line.id,
    lineId: line.id,
    employeeName: line.employeeName,
    email,
    employeeCpf: line.employeeCpf,
    centerCost,
    roleName,
    contractType,
    salaryBase: roundMoney(line.salaryBase),
    insalubrityValue,
    vtPerDay,
    vtMonth: nullableSheetMoney(line.vtProvisioned),
    vtDiscount: nullableSheetMoney(line.vtDiscount),
    otherDiscounts: nullableSheetMoney(line.otherFixedDiscount),
    totalpassDiscount: nullableSheetMoney(line.totalpassDiscount),
    observation: buildPreviewObservation(line, occurrences),
  };
};

export const listPayrollPreviewRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [linesResult, occurrenceRows] = await Promise.all([
    listPayrollLines(db, periodId, filters),
    listOccurrencesRaw(db, periodId),
  ]);

  const employeeMap = await loadEmployeePreviewMap(
    db,
    linesResult.items.map((line) => line.employeeId || '').filter(Boolean),
  );

  const occurrenceMap = new Map<string, PayrollOccurrence[]>();
  for (const occurrence of occurrenceRows) {
    const list = occurrenceMap.get(occurrence.employeeId) || [];
    list.push(occurrence);
    occurrenceMap.set(occurrence.employeeId, list);
  }

  return {
    items: linesResult.items.map((line) =>
      buildPayrollPreviewRow(
        line,
        line.employeeId ? employeeMap.get(line.employeeId) || null : null,
        line.employeeId ? occurrenceMap.get(line.employeeId) || [] : [],
      ),
    ),
  };
};

const upsertBenefitIssue = (
  issues: PayrollBenefitIssue[],
  nextIssue: PayrollBenefitIssue,
) => {
  if (issues.some((issue) => issue.code === nextIssue.code)) return;
  issues.push(nextIssue);
};

const buildPayrollBenefitsSummary = (rows: PayrollBenefitRow[]): PayrollBenefitsSummary => {
  const costCenterMap = new Map<string, PayrollBenefitsSummary['costCenters'][number]>();

  for (const row of rows) {
    const centerCost = clean(row.centerCost) || 'Sem centro de custo';
    const current = costCenterMap.get(centerCost) || {
      centerCost,
      totalEmployees: 0,
      mealVoucherPurchaseTotal: 0,
      cashTransportBenefitTotal: 0,
      payrollDiscountsTotal: 0,
      pendingEmployees: 0,
    };
    current.totalEmployees += 1;
    current.mealVoucherPurchaseTotal = roundMoney(current.mealVoucherPurchaseTotal + row.mealVoucherPurchaseAmount);
    current.cashTransportBenefitTotal = roundMoney(current.cashTransportBenefitTotal + row.cashTransportBenefitAmount);
    current.payrollDiscountsTotal = roundMoney(current.payrollDiscountsTotal + row.payrollDiscountsTotal);
    if (row.status === 'PENDENTE_CADASTRO') current.pendingEmployees += 1;
    costCenterMap.set(centerCost, current);
  }

  const mealVoucherPurchaseTotal = roundMoney(rows.reduce((sum, row) => sum + row.mealVoucherPurchaseAmount, 0));
  const cashTransportBenefitTotal = roundMoney(rows.reduce((sum, row) => sum + row.cashTransportBenefitAmount, 0));
  const transportVoucherPayrollDiscountTotal = roundMoney(rows.reduce((sum, row) => sum + row.transportVoucherPayrollDiscount, 0));
  const totalpassPayrollDiscountTotal = roundMoney(rows.reduce((sum, row) => sum + row.totalpassPayrollDiscount, 0));
  const otherPayrollDiscountTotal = roundMoney(rows.reduce((sum, row) => sum + row.otherPayrollDiscount, 0));
  const payrollDiscountsTotal = roundMoney(transportVoucherPayrollDiscountTotal + totalpassPayrollDiscountTotal + otherPayrollDiscountTotal);

  return {
    totalEmployees: rows.length,
    totalMealVoucher: mealVoucherPurchaseTotal,
    totalTransportVoucher: cashTransportBenefitTotal,
    totalBenefitDiscounts: payrollDiscountsTotal,
    mealVoucherPurchaseTotal,
    cashTransportBenefitTotal,
    transportVoucherPayrollDiscountTotal,
    totalpassPayrollDiscountTotal,
    otherPayrollDiscountTotal,
    payrollDiscountsTotal,
    companyProvisionTotal: roundMoney(mealVoucherPurchaseTotal + cashTransportBenefitTotal),
    transportNetPayrollImpact: roundMoney(cashTransportBenefitTotal - transportVoucherPayrollDiscountTotal),
    pendingEmployees: rows.filter((row) => row.status === 'PENDENTE_CADASTRO').length,
    attentionEmployees: rows.filter((row) => row.status === 'ATENCAO').length,
    costCenters: Array.from(costCenterMap.values()).sort((a, b) =>
      a.centerCost.localeCompare(b.centerCost, 'pt-BR', { sensitivity: 'base' }),
    ),
  };
};

const buildPayrollBenefitRow = (
  line: PayrollLine,
  employeeFallback: PayrollEmployeeBenefitsSource | null,
  pointRowsInPeriod: PayrollPointDaily[],
): PayrollBenefitRow => {
  const snapshot = parsePayrollLineSnapshot(line.employeeSnapshotJson);
  const calculationWarnings = parsePayrollCalculationWarnings(line.calculationMemoryJson);
  const pointInconsistencyDetails = pointRowsInPeriod
    .filter((row) => row.inconsistencyFlag)
    .map(buildPointInconsistencyDetail)
    .slice(0, 5);
  const snapshotUnits = Array.isArray(snapshot.units) ? snapshot.units.map((item) => clean(item)).filter(Boolean) : [];
  const centerCost = clean(snapshot.costCenter) || employeeFallback?.costCenter || line.centerCost || null;
  const unitName = line.unitName || snapshotUnits[0] || employeeFallback?.units[0] || null;
  const contractType = clean(snapshot.employmentRegime) || employeeFallback?.employmentRegime || line.contractType || null;
  const mealVoucherPerDay = toNullableNumber(snapshot.mealVoucherPerDay) ?? employeeFallback?.mealVoucherPerDay ?? null;
  const transportVoucherMode = (
    clean(snapshot.transportVoucherMode) ||
    employeeFallback?.transportVoucherMode ||
    'PER_DAY'
  ) as PayrollTransportVoucherMode;
  const transportVoucherPerDay =
    toNullableNumber(snapshot.transportVoucherPerDay) ?? employeeFallback?.transportVoucherPerDay ?? null;
  const transportVoucherMonthlyFixed =
    toNullableNumber(snapshot.transportVoucherMonthlyFixed) ?? employeeFallback?.transportVoucherMonthlyFixed ?? null;
  const mealVoucherAmount = roundMoney((mealVoucherPerDay || 0) * line.daysWorked);
  const cashTransportBenefitAmount = roundMoney(line.vtProvisioned);
  const transportVoucherPayrollDiscount = roundMoney(line.vtDiscount);
  const totalpassPayrollDiscount = roundMoney(line.totalpassDiscount);
  const otherPayrollDiscount = roundMoney(line.otherFixedDiscount);
  const payrollDiscountsTotal = roundMoney(transportVoucherPayrollDiscount + totalpassPayrollDiscount + otherPayrollDiscount);

  const issues: PayrollBenefitIssue[] = [];

  if (!centerCost) {
    upsertBenefitIssue(issues, {
      code: 'MISSING_COST_CENTER',
      severity: 'CADASTRO',
      message: 'Centro de custo ausente no cadastro para conferência e agrupamento da compra.',
    });
  }

  if (line.daysWorked > 0 && (!mealVoucherPerDay || mealVoucherPerDay <= 0)) {
    upsertBenefitIssue(issues, {
      code: 'MISSING_MEAL_VOUCHER_RULE',
      severity: 'CADASTRO',
      message: `VR por dia ausente ou zerado para ${line.daysWorked} dia(s) elegível(is) nesta competência.`,
    });
  }

  if (transportVoucherMode === 'PER_DAY' && line.daysWorked > 0 && (!transportVoucherPerDay || transportVoucherPerDay <= 0)) {
    upsertBenefitIssue(issues, {
      code: 'MISSING_TRANSPORT_VOUCHER_RULE',
      severity: 'CADASTRO',
      message: `VT por dia ausente ou zerado para ${line.daysWorked} dia(s) elegível(is) nesta competência.`,
    });
  }

  if (transportVoucherMode === 'MONTHLY_FIXED' && (!transportVoucherMonthlyFixed || transportVoucherMonthlyFixed <= 0)) {
    upsertBenefitIssue(issues, {
      code: 'MISSING_TRANSPORT_VOUCHER_RULE',
      severity: 'CADASTRO',
      message: 'VT mensal fixo ausente ou zerado no cadastro do colaborador.',
    });
  }

  for (const warning of calculationWarnings) {
    if (warning.code === 'EMPLOYEE_WITHOUT_POINT_ROWS') {
      upsertBenefitIssue(issues, {
        code: warning.code,
        severity: 'OPERACIONAL',
        message: warning.message,
      });
    }
    if (warning.code === 'FALLBACK_SCHEDULE_DIVISOR') {
      upsertBenefitIssue(issues, {
        code: warning.code,
        severity: 'OPERACIONAL',
        message: warning.message,
      });
    }
    if (warning.code === 'POINT_INCONSISTENCY') {
      upsertBenefitIssue(issues, {
        code: warning.code,
        severity: 'OPERACIONAL',
        message: warning.message,
        details: warning.details?.length ? warning.details : pointInconsistencyDetails,
      });
    }
  }

  const status = issues.some((issue) => issue.severity === 'CADASTRO')
    ? 'PENDENTE_CADASTRO'
    : issues.some((issue) => issue.severity === 'OPERACIONAL')
      ? 'ATENCAO'
      : 'OK';

  return {
    key: line.id,
    lineId: line.id,
    employeeId: line.employeeId,
    employeeName: line.employeeName,
    employeeCpf: line.employeeCpf,
    centerCost,
    unitName,
    contractType,
    daysEligible: line.daysWorked,
    mealVoucherPerDay,
    mealVoucherAmount,
    mealVoucherPurchaseAmount: mealVoucherAmount,
    transportVoucherMode,
    transportVoucherPerDay,
    transportVoucherMonthlyFixed,
    transportVoucherAmount: cashTransportBenefitAmount,
    cashTransportBenefitAmount,
    transportVoucherDiscount: transportVoucherPayrollDiscount,
    transportVoucherPayrollDiscount,
    totalpassDiscount: totalpassPayrollDiscount,
    totalpassPayrollDiscount,
    otherFixedDiscount: otherPayrollDiscount,
    otherPayrollDiscount,
    payrollDiscountsTotal,
    companyProvisionAmount: roundMoney(mealVoucherAmount + cashTransportBenefitAmount),
    transportNetPayrollImpact: roundMoney(cashTransportBenefitAmount - transportVoucherPayrollDiscount),
    status,
    issues,
  };
};

export const listPayrollBenefitRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [linesResult, pointRows] = await Promise.all([
    listPayrollLines(db, periodId, filters),
    listPointRowsRaw(db, periodId),
  ]);
  const employeeMap = await loadEmployeeBenefitsMap(
    db,
    linesResult.items.map((line) => line.employeeId || '').filter(Boolean),
  );
  const pointMap = new Map<string, PayrollPointDaily[]>();
  for (const row of pointRows) {
    const keys = new Set<string>();
    if (row.employeeId) keys.add(row.employeeId);
    const comparisonKey = buildComparisonKey(row.employeeName, row.employeeCpf);
    if (comparisonKey) keys.add(comparisonKey);
    for (const key of keys) {
      const list = pointMap.get(key) || [];
      list.push(row);
      pointMap.set(key, list);
    }
  }

  const items = linesResult.items.map((line) =>
    buildPayrollBenefitRow(
      line,
      line.employeeId ? employeeMap.get(line.employeeId) || null : null,
      pointMap.get(line.employeeId || '') || pointMap.get(buildComparisonKey(line.employeeName, line.employeeCpf)) || [],
    ),
  );

  return {
    items,
    summary: buildPayrollBenefitsSummary(items),
  };
};

export const listPayrollDailyControlRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [operationalEmployees, pointRows, syncRuns] = await Promise.all([
    listPayrollOperationalEmployees(db, periodId, filters),
    listPointRowsRaw(db, periodId),
    listPointSyncRunsByPeriod(db, periodId),
  ]);

  const pointMap = new Map<string, PayrollPointDaily[]>();
  for (const row of pointRows) {
    const keys = new Set<string>();
    if (row.employeeId) keys.add(row.employeeId);
    const comparisonKey = buildComparisonKey(row.employeeName, row.employeeCpf);
    if (comparisonKey) keys.add(comparisonKey);
    for (const key of keys) {
      const list = pointMap.get(key) || [];
      list.push(row);
      pointMap.set(key, list);
    }
  }

  const latestCompletedSync = syncRuns.find((item) => item.status === 'COMPLETED') || null;
  const items: PayrollDailyControlRow[] = operationalEmployees.items.map((employee) => {
    const rows = pointMap.get(employee.employeeId || '') || pointMap.get(buildComparisonKey(employee.employeeName, employee.employeeCpf)) || [];
    const pointSources = uniqueSources(rows.map((row) => row.source));
    const plannedMinutes = rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
    const workedMinutes = rows.reduce((sum, row) => sum + row.workedMinutes, 0);
    const dayBalanceMinutes = rows.reduce((sum, row) => sum + row.dayBalanceMinutes, 0);
    const lateMinutes = rows.reduce((sum, row) => sum + row.lateMinutes, 0);
    const breakOverrunMinutes = rows.reduce((sum, row) => sum + row.breakOverrunMinutes, 0);
    const absenceDays = rows.filter((row) => row.absenceFlag).length;
    const workedDays = rows.filter((row) => row.workedMinutes > 0 || !row.absenceFlag).length;
    const pendingAdjustments = rows.reduce((sum, row) => sum + row.pendingAdjustmentsCount, 0);
    const status =
      pendingAdjustments > 0 || breakOverrunMinutes > 0 || rows.some((row) => row.inconsistencyFlag)
        ? 'ATENCAO'
        : rows.length === 0
          ? 'PENDENTE'
          : 'OK';

    return {
      key: employee.key,
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      employeeCpf: employee.employeeCpf,
      centerCost: employee.centerCost,
      contractType: employee.contractType,
      workedDays,
      absenceDays,
      lateMinutes,
      plannedMinutes,
      workedMinutes,
      dayBalanceMinutes,
      breakOverrunMinutes,
      pendingAdjustments,
      pointSource: pointSources[0] || (latestCompletedSync ? 'SOLIDES' : null),
      employeeSource: 'PAINEL',
      status,
    };
  });

  return { items };
};

export const listPayrollDailyControlRowsByDateRange = async (db: DbInterface, dateRange: PayrollPointDateRange, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  const overview = await getPayrollPointOverview(db, dateRange);
  const monthlyPeriodIds = overview.syncTargetPeriod ? [overview.syncTargetPeriod.id] : [];
  const [operationalEmployees, pointRows] = await Promise.all([
    listPayrollOperationalEmployeesByDateRange(db, dateRange, filters, monthlyPeriodIds),
    listPointRowsByDateRangeRaw(db, dateRange.startDate, dateRange.endDate),
  ]);

  if (overview.coverage.coveredPeriods === 0 && pointRows.length === 0) {
    return { items: [] as PayrollDailyControlRow[] };
  }

  const pointMap = new Map<string, PayrollPointDaily[]>();
  for (const row of pointRows) {
    const keys = new Set<string>();
    if (row.employeeId) keys.add(row.employeeId);
    const comparisonKey = buildComparisonKey(row.employeeName, row.employeeCpf);
    if (comparisonKey) keys.add(comparisonKey);
    for (const key of keys) {
      const list = pointMap.get(key) || [];
      list.push(row);
      pointMap.set(key, list);
    }
  }

  const items: PayrollDailyControlRow[] = operationalEmployees.items.map((employee) => {
    const rows = pointMap.get(employee.employeeId || '') || pointMap.get(buildComparisonKey(employee.employeeName, employee.employeeCpf)) || [];
    const pointSources = uniqueSources(rows.map((row) => row.source));
    const plannedMinutes = rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
    const workedMinutes = rows.reduce((sum, row) => sum + row.workedMinutes, 0);
    const dayBalanceMinutes = rows.reduce((sum, row) => sum + row.dayBalanceMinutes, 0);
    const lateMinutes = rows.reduce((sum, row) => sum + row.lateMinutes, 0);
    const breakOverrunMinutes = rows.reduce((sum, row) => sum + row.breakOverrunMinutes, 0);
    const absenceDays = rows.filter((row) => row.absenceFlag).length;
    const workedDays = rows.filter((row) => row.workedMinutes > 0 || !row.absenceFlag).length;
    const pendingAdjustments = rows.reduce((sum, row) => sum + row.pendingAdjustmentsCount, 0);
    const status =
      pendingAdjustments > 0 || breakOverrunMinutes > 0 || rows.some((row) => row.inconsistencyFlag)
        ? 'ATENCAO'
        : rows.length === 0
          ? 'PENDENTE'
          : 'OK';

    return {
      key: employee.key,
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      employeeCpf: employee.employeeCpf,
      centerCost: employee.centerCost,
      contractType: employee.contractType,
      workedDays,
      absenceDays,
      lateMinutes,
      plannedMinutes,
      workedMinutes,
      dayBalanceMinutes,
      breakOverrunMinutes,
      pendingAdjustments,
      pointSource: pointSources[0] || (overview.coverage.coveredPeriods > 0 ? 'SOLIDES' : null),
      employeeSource: 'PAINEL',
      status,
    };
  });

  return { items };
};

export const listPayrollHoursBalanceRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [operationalEmployees, rows] = await Promise.all([
    listPayrollOperationalEmployees(db, periodId, filters),
    listHoursBalanceRaw(db, periodId),
  ]);
  const allowed = new Set(operationalEmployees.items.map((item) => item.employeeId).filter(Boolean));
  return {
    items: rows.filter((row) => {
      if (row.employeeId) return allowed.has(row.employeeId);
      return matchesOperationalFilters(
        {
          key: row.id,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          employeeCpf: row.employeeCpf,
          centerCost: null,
          unitName: null,
          contractType: null,
          lineStatus: null,
        },
        filters,
      );
    }),
  };
};

export const listPayrollHoursBalanceRowsByDateRange = async (db: DbInterface, dateRange: PayrollPointDateRange, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  const overview = await getPayrollPointOverview(db, dateRange);
  const monthlyPeriodIds = overview.syncTargetPeriod ? [overview.syncTargetPeriod.id] : [];
  const [operationalEmployees, rows] = await Promise.all([
    listPayrollOperationalEmployeesByDateRange(db, dateRange, filters, monthlyPeriodIds),
    listHoursBalanceByPeriodIdsRaw(db, monthlyPeriodIds),
  ]);
  const allowed = new Set(operationalEmployees.items.map((item) => buildOperationalComparisonKey(item.employeeId, item.employeeName, item.employeeCpf)));
  return {
    items: rows.filter((row) => allowed.has(buildOperationalComparisonKey(row.employeeId, row.employeeName, row.employeeCpf))),
  };
};

export const listPayrollVacationRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [operationalEmployees, occurrences] = await Promise.all([
    listPayrollOperationalEmployees(db, periodId, filters),
    listOccurrencesRaw(db, periodId),
  ]);
  const operationalEmployeeMap = new Map(
    operationalEmployees.items
      .filter((item) => item.employeeId)
      .map((item) => [item.employeeId as string, item] as const),
  );
  const items: PayrollVacationRow[] = [];

  for (const occurrence of occurrences.filter((item) => item.occurrenceType === 'FERIAS')) {
    const employee = occurrence.employeeId ? operationalEmployeeMap.get(occurrence.employeeId) || null : null;
    if (!employee) continue;
    items.push({
      id: occurrence.id,
      employeeId: occurrence.employeeId,
      employeeName: employee.employeeName,
      employeeCpf: employee.employeeCpf,
      dateStart: occurrence.dateStart,
      dateEnd: occurrence.dateEnd || occurrence.dateStart,
      notes: occurrence.notes,
      source: 'SOLIDES',
    });
  }

  items.sort((left, right) => {
    if (left.dateStart !== right.dateStart) return left.dateStart.localeCompare(right.dateStart);
    return left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' });
  });

  return { items };
};

export const listPayrollVacationRowsByDateRange = async (db: DbInterface, dateRange: PayrollPointDateRange, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  const [operationalEmployees, occurrences] = await Promise.all([
    listPayrollOperationalEmployeesByDateRange(db, dateRange, filters, []),
    listOccurrencesByDateRangeRaw(db, dateRange.startDate, dateRange.endDate),
  ]);
  const operationalEmployeeById = new Map(
    operationalEmployees.items
      .filter((item) => item.employeeId)
      .map((item) => [item.employeeId as string, item] as const),
  );
  const items: PayrollVacationRow[] = [];

  for (const occurrence of occurrences.filter((item) => item.occurrenceType === 'FERIAS')) {
    const matched = occurrence.employeeId ? operationalEmployeeById.get(occurrence.employeeId) || null : null;
    if (!matched) continue;
    items.push({
      id: occurrence.id,
      employeeId: occurrence.employeeId,
      employeeName: matched.employeeName,
      employeeCpf: matched.employeeCpf,
      dateStart: occurrence.dateStart,
      dateEnd: occurrence.dateEnd || occurrence.dateStart,
      notes: occurrence.notes,
      source: 'SOLIDES',
    });
  }

  items.sort((left, right) => {
    if (left.dateStart !== right.dateStart) return left.dateStart.localeCompare(right.dateStart);
    return left.employeeName.localeCompare(right.employeeName, 'pt-BR', { sensitivity: 'base' });
  });

  return { items };
};

export const getPayrollImportFileById = async (db: DbInterface, importFileId: string) => {
  await ensurePayrollTables(db);
  const rows = await db.query(`SELECT * FROM payroll_import_files WHERE id = ? LIMIT 1`, [importFileId]);
  if (!rows[0]) return null;
  return mapImportFile(rows[0]);
};

export const listPayrollSignatureRows = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  const [operationalEmployees, rows] = await Promise.all([
    listPayrollOperationalEmployees(db, periodId, filters),
    listSignaturesRaw(db, periodId),
  ]);
  const allowed = new Set(operationalEmployees.items.map((item) => item.employeeId).filter(Boolean));
  return {
    items: rows.filter((row) => {
      if (row.employeeId) return allowed.has(row.employeeId);
      return matchesOperationalFilters(
        {
          key: row.id,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          employeeCpf: row.employeeCpf,
          centerCost: null,
          unitName: null,
          contractType: null,
          lineStatus: null,
        },
        filters,
      );
    }),
  };
};

export const listPayrollSignatureRowsByDateRange = async (db: DbInterface, dateRange: PayrollPointDateRange, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  const overview = await getPayrollPointOverview(db, dateRange);
  const monthlyPeriodIds = overview.syncTargetPeriod ? [overview.syncTargetPeriod.id] : [];
  const [operationalEmployees, rows] = await Promise.all([
    listPayrollOperationalEmployeesByDateRange(db, dateRange, filters, monthlyPeriodIds),
    listSignaturesByPeriodIdsRaw(db, monthlyPeriodIds),
  ]);
  const allowed = new Set(operationalEmployees.items.map((item) => buildOperationalComparisonKey(item.employeeId, item.employeeName, item.employeeCpf)));
  return {
    items: rows.filter((row) => allowed.has(buildOperationalComparisonKey(row.employeeId, row.employeeName, row.employeeCpf))),
  };
};

export const getPayrollLineDetail = async (db: DbInterface, lineId: string): Promise<PayrollLineDetail> => {
  await ensurePayrollTables(db);
  const rows = await db.query(`SELECT * FROM payroll_lines WHERE id = ? LIMIT 1`, [lineId]);
  if (!rows[0]) throw new PayrollValidationError('Linha da folha não encontrada.', 404);
  const line = mapLine(rows[0]);
  const [pointDays, occurrences, employeeMap, hoursBalanceRows, signatureRows] = await Promise.all([
    listPointRowsRaw(db, line.periodId, line.employeeId || undefined),
    line.employeeId ? listOccurrencesRaw(db, line.periodId, line.employeeId) : Promise.resolve([]),
    line.employeeId ? loadEmployeePreviewMap(db, [line.employeeId]) : Promise.resolve(new Map<string, PayrollEmployeePreviewSource>()),
    line.employeeId ? listHoursBalanceRaw(db, line.periodId, line.employeeId) : Promise.resolve([]),
    line.employeeId ? listSignaturesRaw(db, line.periodId, line.employeeId) : Promise.resolve([]),
  ]);

  const previewRow = buildPayrollPreviewRow(
    line,
    line.employeeId ? employeeMap.get(line.employeeId) || null : null,
    occurrences,
  );
  const pointSources = uniqueSources(pointDays.map((item) => item.source));
  const occurrenceSources = uniqueSources(occurrences.map((item) => item.source));
  const hoursBalanceSources = uniqueSources(hoursBalanceRows.map((item) => item.source));
  const signatureSources = uniqueSources(signatureRows.map((item) => item.source));

  return {
    line,
    pointDays,
    occurrences,
    previewRow,
    hoursBalance: hoursBalanceRows[0] || null,
    signature: signatureRows[0] || null,
    sources: {
      adjustments: ['PAINEL'],
      preview: ['PAINEL'],
      hoursBalance: hoursBalanceSources.length ? hoursBalanceSources : ['SOLIDES'],
      signature: signatureSources.length ? signatureSources : ['SOLIDES'],
      pointDays: pointSources.length ? pointSources : ['SOLIDES'],
      occurrences: occurrenceSources.length ? occurrenceSources : ['PAINEL'],
      calculationMemory: ['PAINEL'],
    },
  };
};

export const patchPayrollLine = async (db: DbInterface, lineId: string, input: PayrollLinePatchInput) => {
  await ensurePayrollTables(db);
  const detail = await getPayrollLineDetail(db, lineId);
  const nextAdjustmentsAmount = toNullableNumber(input.adjustmentsAmount) ?? detail.line.adjustmentsAmount;
  const nextAdjustmentsNotes = clean(input.adjustmentsNotes) || detail.line.adjustmentsNotes || null;
  const nextPayrollNotes = clean(input.payrollNotes) || detail.line.payrollNotes || null;
  const nextLineStatus = (clean(input.lineStatus) || detail.line.lineStatus) as PayrollLineStatus;

  let totalProvents = detail.line.salaryBase + detail.line.insalubrityAmount;
  let totalDiscounts = detail.line.absenceDiscount + detail.line.lateDiscount + detail.line.vtDiscount + detail.line.totalpassDiscount + detail.line.otherFixedDiscount;
  if (nextAdjustmentsAmount >= 0) totalProvents += nextAdjustmentsAmount;
  else totalDiscounts += Math.abs(nextAdjustmentsAmount);

  const currentMemory = detail.line.calculationMemoryJson ? JSON.parse(detail.line.calculationMemoryJson) : {};
  currentMemory.adjustments = { amount: nextAdjustmentsAmount, notes: nextAdjustmentsNotes };

  await db.execute(
    `UPDATE payroll_lines
     SET adjustments_amount = ?, adjustments_notes = ?, payroll_notes = ?, line_status = ?, total_provents = ?, total_discounts = ?, net_operational = ?, calculation_memory_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      nextAdjustmentsAmount,
      nextAdjustmentsNotes,
      nextPayrollNotes,
      nextLineStatus,
      roundMoney(totalProvents),
      roundMoney(totalDiscounts),
      roundMoney(totalProvents - totalDiscounts),
      safeJson(currentMemory),
      NOW(),
      lineId,
    ],
  );

  return getPayrollLineDetail(db, lineId);
};

export const createPayrollOccurrence = async (db: DbInterface, input: PayrollOccurrenceInput, actorUserId: string) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, input.periodId);
  const id = randomUUID();
  const now = NOW();
  const dateStart = parseDate(input.dateStart);
  const dateEnd = parseDate(input.dateEnd || input.dateStart);
  if (!dateStart || !dateEnd) throw new PayrollValidationError('Datas da ocorrência inválidas.');

  await db.execute(
    `INSERT INTO payroll_occurrences (id, period_id, employee_id, occurrence_type, date_start, date_end, effect_code, notes, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.periodId, input.employeeId, upper(input.occurrenceType), dateStart, dateEnd, clean(input.effectCode) || null, clean(input.notes) || null, actorUserId, actorUserId, now, now],
  );

  await generatePayrollPeriod(db, input.periodId);
  const rows = await db.query(`SELECT * FROM payroll_occurrences WHERE id = ? LIMIT 1`, [id]);
  return mapOccurrence(rows[0]);
};

export const updatePayrollOccurrence = async (db: DbInterface, occurrenceId: string, input: Partial<PayrollOccurrenceInput>, actorUserId: string) => {
  await ensurePayrollTables(db);
  const rows = await db.query(`SELECT * FROM payroll_occurrences WHERE id = ? LIMIT 1`, [occurrenceId]);
  if (!rows[0]) throw new PayrollValidationError('Ocorrência não encontrada.', 404);
  const current = mapOccurrence(rows[0]);
  const nextDateStart = parseDate(input.dateStart || current.dateStart);
  const nextDateEnd = parseDate(input.dateEnd || current.dateEnd || current.dateStart);
  if (!nextDateStart || !nextDateEnd) throw new PayrollValidationError('Datas da ocorrência inválidas.');

  await db.execute(
    `UPDATE payroll_occurrences
     SET occurrence_type = ?, date_start = ?, date_end = ?, effect_code = ?, notes = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
    [upper(input.occurrenceType || current.occurrenceType), nextDateStart, nextDateEnd, clean(input.effectCode) || current.effectCode || null, clean(input.notes) || current.notes || null, actorUserId, NOW(), occurrenceId],
  );

  await generatePayrollPeriod(db, current.periodId);
  const updatedRows = await db.query(`SELECT * FROM payroll_occurrences WHERE id = ? LIMIT 1`, [occurrenceId]);
  return mapOccurrence(updatedRows[0]);
};

const updatePeriodStatus = async (
  db: DbInterface,
  periodId: string,
  nextStatus: PayrollPeriodStatus,
  actorUserId: string,
  extra: Partial<Record<'approved_by' | 'approved_at' | 'sent_at' | 'reopened_at', string | null>> = {},
) => {
  await ensurePayrollTables(db);
  await getPeriodOrThrow(db, periodId);
  await db.execute(
    `UPDATE payroll_periods
     SET status = ?, approved_by = COALESCE(?, approved_by), approved_at = COALESCE(?, approved_at), sent_at = COALESCE(?, sent_at), reopened_at = COALESCE(?, reopened_at), updated_at = ?
     WHERE id = ?`,
    [nextStatus, extra.approved_by ?? null, extra.approved_at ?? null, extra.sent_at ?? null, extra.reopened_at ?? null, NOW(), periodId],
  );
  return getPayrollPeriodDetail(db, periodId);
};

export const approvePayrollPeriod = async (db: DbInterface, periodId: string, actorUserId: string) =>
  updatePeriodStatus(db, periodId, 'APROVADA', actorUserId, { approved_by: actorUserId, approved_at: NOW() });

export const markPayrollPeriodSent = async (db: DbInterface, periodId: string, actorUserId: string) =>
  updatePeriodStatus(db, periodId, 'ENVIADA', actorUserId, { sent_at: NOW() });

export const reopenPayrollPeriod = async (db: DbInterface, periodId: string, actorUserId: string) =>
  updatePeriodStatus(db, periodId, 'ABERTA', actorUserId, { reopened_at: NOW() });

export const buildPayrollExportData = async (db: DbInterface, periodId: string, filters: PayrollLineFilters) => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, periodId);
  const detail = await getPayrollPeriodDetail(db, periodId);
  const linesResult = await listPayrollLines(db, periodId, filters);
  const previewResult = await listPayrollPreviewRows(db, periodId, filters);
  return {
    period,
    summary: detail.summary,
    lines: linesResult.items,
    previewRows: previewResult.items,
  };
};
