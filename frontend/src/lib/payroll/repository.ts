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
import { parsePointPdfBuffer } from '@/lib/payroll/parsers';
import type {
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
  PayrollPeriodSummary,
  PayrollPointDaily,
  PayrollPreviewRow,
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
  const normalized = raw.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
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
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_point_daily', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_occurrences', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'created_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_lines', 'updated_at', 'VARCHAR(32) NOT NULL');
  await ensureMysqlColumnDefinition(db, 'payroll_reference_rows', 'created_at', 'VARCHAR(32) NOT NULL');

  await safeCreateIndex(db, `CREATE INDEX idx_payroll_periods_month_ref ON payroll_periods (month_ref)`);
  await safeCreateIndex(db, `CREATE INDEX idx_payroll_import_files_period ON payroll_import_files (period_id, created_at)`);
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

export const getPayrollPeriodDetail = async (db: DbInterface, periodId: string): Promise<PayrollPeriodDetail> => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, periodId);
  const [imports, lines] = await Promise.all([listImportsByPeriod(db, periodId), listLinesRaw(db, periodId)]);
  return {
    period,
    imports,
    summary: buildSummaryFromLines(lines, imports),
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

const buildEmployeeLookup = (employees: EmployeePayrollSource[]) => {
  const byCpf = new Map<string, EmployeePayrollSource>();
  const byName = new Map<string, EmployeePayrollSource>();
  for (const employee of employees) {
    if (employee.cpf && !byCpf.has(employee.cpf)) byCpf.set(employee.cpf, employee);
    const key = normalizeSearch(employee.fullName);
    if (key && !byName.has(key)) byName.set(key, employee);
  }
  return { byCpf, byName };
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
  },
) => {
  const id = randomUUID();
  const now = NOW();
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
      'PROCESSING',
      'Arquivo recebido para processamento.',
      params.uploadedBy,
      now,
      null,
    ],
  );
  return id;
};

const finalizeImportRecord = async (db: DbInterface, importId: string, status: PayrollImportStatus, log: string) => {
  await db.execute(`UPDATE payroll_import_files SET processing_status = ?, processing_log = ?, processed_at = ? WHERE id = ?`, [
    status,
    log,
    NOW(),
    importId,
  ]);
};

export const processPayrollPointImport = async (
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
    buffer: Buffer;
  },
) => {
  await ensurePayrollTables(db);
  const period = await getPeriodOrThrow(db, params.periodId);
  const importId = await createImportRecord(db, { ...params, fileType: 'POINT_PDF' });

  try {
    const employees = await loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd);
    const lookup = buildEmployeeLookup(employees);
    const parsedEmployees = await parsePointPdfBuffer(params.buffer);

    await db.execute(`DELETE FROM payroll_point_daily WHERE period_id = ?`, [period.id]);

    let insertedDays = 0;
    for (const parsedEmployee of parsedEmployees) {
      const matchedEmployee =
        (parsedEmployee.employeeCpf ? lookup.byCpf.get(normalizeCpf(parsedEmployee.employeeCpf) || '') : null) ||
        lookup.byName.get(normalizeSearch(parsedEmployee.employeeName)) ||
        null;

      for (const day of parsedEmployee.days) {
        if (!day.pointDate || day.pointDate < period.periodStart || day.pointDate > period.periodEnd) continue;
        const now = NOW();
        await db.execute(
          `INSERT INTO payroll_point_daily (
            id, period_id, employee_id, employee_code, employee_name, employee_cpf, point_date,
            department, schedule_label, schedule_start, schedule_end, marks_json, raw_day_text,
            worked_minutes, late_minutes, absence_flag, inconsistency_flag, justification_text,
            source_file_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            period.id,
            matchedEmployee?.id || null,
            parsedEmployee.employeeCode,
            parsedEmployee.employeeName,
            normalizeCpf(parsedEmployee.employeeCpf),
            day.pointDate,
            parsedEmployee.department,
            parsedEmployee.scheduleLabel,
            parsedEmployee.scheduleStart,
            parsedEmployee.scheduleEnd,
            safeJson(day.marks || []),
            day.rawDayText,
            Number(day.workedMinutes || 0),
            Number(day.lateMinutes || 0),
            day.absenceFlag ? 1 : 0,
            day.inconsistencyFlag ? 1 : 0,
            day.justificationText || null,
            importId,
            now,
            now,
          ],
        );
        insertedDays += 1;
      }
    }

    await finalizeImportRecord(
      db,
      importId,
      'COMPLETED',
      `Relatório de ponto processado com ${parsedEmployees.length} colaboradores e ${insertedDays} registros diários.`,
    );
  } catch (error: any) {
    await finalizeImportRecord(db, importId, 'FAILED', String(error?.message || error || 'Falha no processamento do PDF.'));
    throw error;
  }

  const rows = await db.query(`SELECT * FROM payroll_import_files WHERE id = ? LIMIT 1`, [importId]);
  return mapImportFile(rows[0]);
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
  const justifiedTypes = new Set<PayrollOccurrenceType>(['ATESTADO', 'DECLARACAO', 'AJUSTE_BATIDA', 'AUSENCIA_AUTORIZADA', 'FERIAS']);
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

  let daysWorked = 0;
  let absencesCount = 0;
  let lateMinutes = 0;
  let workedMinutesTotal = 0;

  for (const row of pointRows.filter((item) => item.pointDate >= period.periodStart && item.pointDate <= period.periodEnd)) {
    const occurrence = getOccurrenceForDate(row.pointDate);
    const justified = Boolean(occurrence && justifiedTypes.has(occurrence.occurrenceType)) || isCoveredByRecess(row.pointDate);
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

  const scheduleMinutes = parseScheduleMinutes(pointRows[0]?.scheduleStart || null, pointRows[0]?.scheduleEnd || null, employee.workSchedule);
  const monthlyDivisor = scheduleMinutes && scheduleMinutes > 0 ? (scheduleMinutes / 60) * 25 : employee.employmentRegime === 'ESTAGIO' ? 150 : 220;
  const salaryHour = monthlyDivisor > 0 ? employee.salaryAmount / monthlyDivisor : 0;

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

  const [employees, pointRows, occurrenceRows, existingLines, recessRows] = await Promise.all([
    loadEmployeeRosterForPeriod(db, period.periodStart, period.periodEnd),
    listPointRowsRaw(db, period.id),
    listOccurrencesRaw(db, period.id),
    listLinesRaw(db, period.id),
    db.query(`SELECT * FROM employee_recess_periods ORDER BY vacation_start_date ASC`),
  ]);

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

type PayrollLineSnapshot = Partial<{
  id: string;
  fullName: string;
  email: string | null;
  cpf: string | null;
  jobTitle: string | null;
  costCenter: string | null;
  units: string[];
  employmentRegime: string;
  transportVoucherPerDay: number;
  insalubrityPercent: number;
}>;

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
