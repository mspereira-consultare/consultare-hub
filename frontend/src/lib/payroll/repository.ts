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
  type PayrollTransportVoucherMode,
} from '@/lib/payroll/constants';
import type {
  PayrollBenefitIssue,
  PayrollBenefitIssueDetail,
  PayrollBenefitRow,
  PayrollBenefitsSummary,
  PayrollCreatePeriodInput,
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
  PayrollPeriodReadiness,
  PayrollPeriodSummary,
  PayrollPointDaily,
  PayrollPreviewRow,
  PayrollReadinessEmployeeSample,
  PayrollReadinessIssue,
  PayrollReadinessIssueCode,
  PayrollReadinessSeverity,
  PayrollReadinessStatus,
  PayrollRule,
} from '@/lib/payroll/types';

export class PayrollValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;
type PayrollPointImportJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
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

const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const overlapsDateRange = (targetDate: string, startDate: string | null, endDate: string | null) => {
  if (!startDate) return false;
  const effectiveEnd = endDate || startDate;
  return targetDate >= startDate && targetDate <= effectiveEnd;
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

const mapPointDaily = (row: any): PayrollPointDaily => ({
  id: clean(row.id),
  periodId: clean(row.period_id),
  employeeId: clean(row.employee_id) || null,
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
  workedMinutes: Number(row.worked_minutes || 0),
  lateMinutes: Number(row.late_minutes || 0),
  absenceFlag: bool(row.absence_flag),
  inconsistencyFlag: bool(row.inconsistency_flag),
  justificationText: clean(row.justification_text) || null,
  sourceFileId: clean(row.source_file_id) || null,
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

const mapEmployeePayrollSource = (row: any): EmployeePayrollSource => ({
  id: clean(row.id),
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

const buildSummaryFromLines = (lines: PayrollLine[], imports: PayrollImportFile[]): PayrollPeriodSummary => ({
  totalLines: lines.length,
  totalNet: roundMoney(lines.reduce((sum, line) => sum + line.netOperational, 0)),
  totalDiscounts: roundMoney(lines.reduce((sum, line) => sum + line.totalDiscounts, 0)),
  totalProvents: roundMoney(lines.reduce((sum, line) => sum + line.totalProvents, 0)),
  importsCompleted: imports.filter((item) => item.processingStatus === 'COMPLETED').length,
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
    CREATE TABLE IF NOT EXISTS payroll_point_daily (
      id VARCHAR(64) PRIMARY KEY,
      period_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
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
      worked_minutes INTEGER NOT NULL DEFAULT 0,
      late_minutes INTEGER NOT NULL DEFAULT 0,
      absence_flag INTEGER NOT NULL DEFAULT 0,
      inconsistency_flag INTEGER NOT NULL DEFAULT 0,
      justification_text LONGTEXT NULL,
      source_file_id VARCHAR(64) NULL,
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
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_reference_rows', 'created_at', 'VARCHAR(32) NOT NULL');

  await safeCreateIndex(db, `CREATE INDEX idx_payroll_periods_month_ref ON payroll_periods (month_ref)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_import_files_period ON payroll_import_files (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_status ON payroll_point_import_jobs (status, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_period ON payroll_point_import_jobs (period_id, created_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_import_jobs_import_file ON payroll_point_import_jobs (import_file_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_daily_period ON payroll_point_daily (period_id, point_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_point_daily_employee ON payroll_point_daily (period_id, employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_occurrences_period ON payroll_occurrences (period_id, employee_id, date_start)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_reference_rows_period ON payroll_reference_rows (period_id, comparison_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_lines_period ON payroll_lines (period_id, employee_name)`);

  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_mode VARCHAR(20) NOT NULL DEFAULT 'PER_DAY'`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_monthly_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN totalpass_discount_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_amount DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_description TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN payroll_notes TEXT NULL`);

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

const listPointRowsRaw = async (db: DbInterface, periodId: string, employeeId?: string) => {
  const rows = await db.query(
    `SELECT * FROM payroll_point_daily WHERE period_id = ? ${employeeId ? 'AND employee_id = ?' : ''} ORDER BY point_date ASC`,
    employeeId ? [periodId, employeeId] : [periodId],
  );
  return rows.map(mapPointDaily);
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
  recessMap: Map<string, any[]>,
) => {
  const employeeOccurrences = occurrenceMap.get(employeeId) || [];
  const hasOccurrenceCoverage = employeeOccurrences.some((occurrence) => {
    if (!JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType)) return false;
    const start = occurrence.dateStart || null;
    const end = occurrence.dateEnd || occurrence.dateStart || null;
    if (!start || !end) return false;
    return start <= period.periodStart && end >= period.periodEnd;
  });
  if (hasOccurrenceCoverage) return true;

  const employeeRecessRows = recessMap.get(employeeId) || [];
  return employeeRecessRows.some((row) => {
    const start = parseDate(row.vacation_start_date);
    const duration = Number(row.vacation_duration_days || 0);
    if (!start || duration <= 0) return false;
    const end = addDays(start, duration - 1);
    return start <= period.periodStart && end >= period.periodEnd;
  });
};

const evaluatePayrollPeriodReadiness = (
  period: PayrollPeriod,
  imports: PayrollImportFile[],
  employees: EmployeePayrollSource[],
  pointRows: PayrollPointDaily[],
  occurrences: PayrollOccurrence[],
  recessRows: any[],
): PayrollPeriodReadiness => {
  const issues: PayrollReadinessIssue[] = [];
  const pointImports = imports.filter((item) => item.fileType === 'POINT_PDF');
  const activeImport = pointImports.find((item) => item.processingStatus === 'COMPLETED') || null;
  const latestAttempt = pointImports[0] || null;
  const hasCompletedPointImport = Boolean(activeImport);
  const hasPointBase = hasCompletedPointImport || pointRows.length > 0;

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

  const recessMap = new Map<string, any[]>();
  for (const row of recessRows) {
    const key = clean(row.employee_id);
    const list = recessMap.get(key) || [];
    list.push(row);
    recessMap.set(key, list);
  }

  if (!hasCompletedPointImport) {
    issues.push(
      createReadinessIssue({
        code: 'NO_COMPLETED_POINT_IMPORT',
        severity: 'BLOCKING',
        title: 'Sem base de ponto concluída',
        description: 'Nenhum relatório de ponto concluído está disponível como base ativa para esta competência.',
        count: 1,
      }),
    );
  }

  const unmatchedPointRows = pointRows.filter((row) => !row.employeeId);
  if (unmatchedPointRows.length > 0) {
    const unmatchedSamples = uniqueEmployeeSamples(unmatchedPointRows.map(pointRowToReadinessSample));
    issues.push(
      createReadinessIssue({
        code: 'POINT_ROWS_UNMATCHED',
        severity: 'BLOCKING',
        title: 'Ponto sem vínculo com cadastro',
        description: `${unmatchedSamples.length} colaborador(es) do relatório de ponto não foram vinculados ao cadastro de colaboradores.`,
        count: unmatchedSamples.length,
        sampleEmployees: unmatchedSamples,
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
    const employeesWithoutPointRows = employees.filter((employee) => {
      if ((pointRowsByEmployee.get(employee.id) || []).length > 0) return false;
      return !hasFullPeriodCoverageWithoutPoint(employee.id, period, occurrenceMap, recessMap);
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
  const [imports, lines, employees, pointRows, occurrenceRows, recessRows] = await Promise.all([
    listImportsByPeriod(db, periodId),
    listLinesRaw(db, periodId),
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listPointRowsRaw(db, periodId),
    listOccurrencesRaw(db, periodId),
    db.query(`SELECT * FROM employee_recess_periods ORDER BY vacation_start_date ASC`),
  ]);
  return {
    period,
    imports,
    summary: buildSummaryFromLines(lines, imports),
    readiness: evaluatePayrollPeriodReadiness(period, imports, employees, pointRows, occurrenceRows, recessRows),
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
    initialStatus?: PayrollPointImportJobStatus;
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

const buildLineRecord = (
  employee: EmployeePayrollSource,
  period: PayrollPeriod,
  rules: PayrollRule,
  pointRows: PayrollPointDaily[],
  occurrences: PayrollOccurrence[],
  existingLine: PayrollLine | null,
  recessRows: any[],
): PayrollLine => {
  const pointRowsInPeriod = pointRows.filter((item) => item.pointDate >= period.periodStart && item.pointDate <= period.periodEnd);
  const isCoveredByRecess = (pointDate: string) =>
    recessRows.some((row) => {
      const vacationStart = parseDate(row.vacation_start_date);
      const duration = Number(row.vacation_duration_days || 0);
      if (!vacationStart || duration <= 0) return false;
      const vacationEnd = addDays(vacationStart, duration - 1);
      return pointDate >= vacationStart && pointDate <= vacationEnd;
    });

  const getOccurrenceForDate = (pointDate: string) =>
    occurrences.find((item) => overlapsDateRange(pointDate, item.dateStart, item.dateEnd || item.dateStart));

  const hasFullPeriodCoverageWithoutPoint = () => {
    const hasOccurrenceCoverage = occurrences.some((occurrence) => {
      if (!JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType)) return false;
      const start = occurrence.dateStart || null;
      const end = occurrence.dateEnd || occurrence.dateStart || null;
      if (!start || !end) return false;
      return start <= period.periodStart && end >= period.periodEnd;
    });
    if (hasOccurrenceCoverage) return true;

    return recessRows.some((row) => {
      const vacationStart = parseDate(row.vacation_start_date);
      const duration = Number(row.vacation_duration_days || 0);
      if (!vacationStart || duration <= 0) return false;
      const vacationEnd = addDays(vacationStart, duration - 1);
      return vacationStart <= period.periodStart && vacationEnd >= period.periodEnd;
    });
  };

  let daysWorked = 0;
  let absencesCount = 0;
  let lateMinutes = 0;
  let workedMinutesTotal = 0;

  for (const row of pointRowsInPeriod) {
    const occurrence = getOccurrenceForDate(row.pointDate);
    const justified = Boolean(occurrence && JUSTIFIED_OCCURRENCE_TYPES.has(occurrence.occurrenceType)) || isCoveredByRecess(row.pointDate);
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
  if (importsInProgress > 0) {
    throw new PayrollValidationError('Ainda há importações de ponto pendentes ou em processamento nesta competência. Aguarde a conclusão antes de gerar a folha.', 409);
  }

  const [employees, pointRows, occurrenceRows, existingLines, recessRows] = await Promise.all([
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listPointRowsRaw(db, period.id),
    listOccurrencesRaw(db, period.id),
    listLinesRaw(db, period.id),
    db.query(`SELECT * FROM employee_recess_periods ORDER BY vacation_start_date ASC`),
  ]);

  const imports = await listImportsByPeriod(db, period.id);
  const readiness = evaluatePayrollPeriodReadiness(period, imports, employees, pointRows, occurrenceRows, recessRows);
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

  const recessMap = new Map<string, any[]>();
  for (const row of recessRows) {
    const key = clean(row.employee_id);
    const list = recessMap.get(key) || [];
    list.push(row);
    recessMap.set(key, list);
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
      recessMap.get(employee.id) || [],
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

export const getPayrollLineDetail = async (db: DbInterface, lineId: string): Promise<PayrollLineDetail> => {
  await ensurePayrollTables(db);
  const rows = await db.query(`SELECT * FROM payroll_lines WHERE id = ? LIMIT 1`, [lineId]);
  if (!rows[0]) throw new PayrollValidationError('Linha da folha não encontrada.', 404);
  const line = mapLine(rows[0]);
  const [pointDays, occurrences, employeeMap] = await Promise.all([
    listPointRowsRaw(db, line.periodId, line.employeeId || undefined),
    line.employeeId ? listOccurrencesRaw(db, line.periodId, line.employeeId) : Promise.resolve([]),
    line.employeeId ? loadEmployeePreviewMap(db, [line.employeeId]) : Promise.resolve(new Map<string, PayrollEmployeePreviewSource>()),
  ]);

  const previewRow = buildPayrollPreviewRow(
    line,
    line.employeeId ? employeeMap.get(line.employeeId) || null : null,
    occurrences,
  );

  return { line, pointDays, occurrences, previewRow };
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
