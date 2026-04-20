
import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import {
  ASO_STATUSES,
  DEFAULT_PAGE_SIZE,
  EMPLOYEE_DOCUMENT_TYPE_MAP,
  EMPLOYEE_DOCUMENT_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_TRANSPORT_VOUCHER_MODES,
  EMPLOYEE_UNITS,
  EMPLOYMENT_REGIMES,
  LIFE_INSURANCE_STATUSES,
  LOCKER_KEY_STATUSES,
  MARITAL_STATUSES,
  MAX_PAGE_SIZE,
  UNIFORM_DELIVERY_TYPES,
  UNIFORM_ITEM_STATUSES,
  type EducationLevel,
  type EmployeeDocumentTypeCode,
  type EmployeeStatus,
  type EmployeeTransportVoucherMode,
  type EmploymentRegime,
  type LifeInsuranceStatus,
  type LockerKeyStatus,
  type MaritalStatus,
  type UniformDeliveryType,
  type UniformItemStatus,
} from '@/lib/colaboradores/constants';
import {
  computeAsoStatus,
  computeDocumentProgress,
  computeMissingDocuments,
  getDocumentTypeLabel,
  getTodayInSaoPauloIso,
} from '@/lib/colaboradores/status';
import type {
  Employee,
  EmployeeDocument,
  EmployeeDocumentUploadInput,
  EmployeeFilters,
  EmployeeInput,
  EmployeeListItem,
  EmployeeLifecycleCase,
  EmployeeLifecycleCaseInput,
  EmployeeLifecycleCaseType,
  EmployeeLifecycleStage,
  EmployeeLifecycleTask,
  EmployeeLifecycleTaskSourceType,
  EmployeeLifecycleTaskStatus,
  EmployeeLifecycleTaskUpdateInput,
  EmployeeLockerAssignment,
  EmployeeLockerAssignmentInput,
  EmployeeRecessPeriod,
  EmployeeRecessPeriodInput,
  EmployeeUniformItem,
  EmployeeUniformItemInput,
} from '@/lib/colaboradores/types';

export class EmployeeValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const TODAY_SAO_PAULO = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};
const clean = (value: any) => String(value ?? '').trim();
const upper = (value: any) => clean(value).toUpperCase();
const bool = (value: any) =>
  value === true ||
  value === 1 ||
  String(value) === '1' ||
  String(value ?? '').toLowerCase() === 'true';

const allowedUnits = new Set(EMPLOYEE_UNITS);
const allowedDocTypes = new Set(EMPLOYEE_DOCUMENT_TYPES.map((item) => item.code));
const allowedRegimes = new Set(EMPLOYMENT_REGIMES.map((item) => item.value));
const allowedStatuses = new Set(EMPLOYEE_STATUSES.map((item) => item.value));
const allowedTransportVoucherModes = new Set(EMPLOYEE_TRANSPORT_VOUCHER_MODES.map((item) => item.value));
const allowedLifeInsurance = new Set(LIFE_INSURANCE_STATUSES.map((item) => item.value));
const allowedMaritalStatuses = new Set(MARITAL_STATUSES.map((item) => item.value));
const allowedUniformDeliveryTypes = new Set(UNIFORM_DELIVERY_TYPES.map((item) => item.value));
const allowedUniformStatuses = new Set(UNIFORM_ITEM_STATUSES.map((item) => item.value));
const allowedLockerKeyStatuses = new Set(LOCKER_KEY_STATUSES.map((item) => item.value));
const allowedEducationLevels = new Set(['MEDIO', 'TECNICO', 'SUPERIOR']);

const parseDate = (value: any): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = clean(value);
  if (!raw) return null;

  const isoWithTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoWithTime) return `${isoWithTime[1]}-${isoWithTime[2]}-${isoWithTime[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
};

const parsePositiveInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
};

const toMoneyNumber = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = clean(value);
  if (!raw) return null;
  let normalized = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');
  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCpf = (value: any): string | null => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizeRg = (value: any): string | null => {
  const raw = clean(value).replace(/\s+/g, ' ');
  return raw || null;
};

const normalizePhone = (value: any): string | null => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return null;
  if (digits.length < 10) {
    throw new EmployeeValidationError('Telefone inválido. Use DDD + número.');
  }
  return digits;
};

const normalizeUnits = (value: any): string[] => {
  const list = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      list
        .map((item) => upper(item))
        .filter((item) => allowedUnits.has(item as (typeof EMPLOYEE_UNITS)[number]))
    )
  );
};

const normalizeEmploymentRegime = (value: any): EmploymentRegime => {
  const normalized = upper(value);
  if (!allowedRegimes.has(normalized as EmploymentRegime)) {
    throw new EmployeeValidationError('Regime contratual inválido.');
  }
  return normalized as EmploymentRegime;
};

const normalizeEmployeeStatus = (value: any): EmployeeStatus => {
  const normalized = upper(value || 'ATIVO');
  if (!allowedStatuses.has(normalized as EmployeeStatus)) {
    throw new EmployeeValidationError('Status do colaborador inválido.');
  }
  return normalized as EmployeeStatus;
};

const normalizeEducationLevel = (value: any): EducationLevel | null => {
  const normalized = upper(value);
  if (!normalized) return null;
  if (!allowedEducationLevels.has(normalized)) {
    throw new EmployeeValidationError('Nível de escolaridade inválido.');
  }
  return normalized as EducationLevel;
};

const normalizeMaritalStatus = (value: any): MaritalStatus | null => {
  const normalized = upper(value);
  if (!normalized) return null;
  if (!allowedMaritalStatuses.has(normalized as MaritalStatus)) {
    throw new EmployeeValidationError('Estado civil inválido.');
  }
  return normalized as MaritalStatus;
};

const normalizeLifeInsuranceStatus = (value: any): LifeInsuranceStatus => {
  const normalized = upper(value || 'INATIVO');
  if (!allowedLifeInsurance.has(normalized as LifeInsuranceStatus)) {
    throw new EmployeeValidationError('Status do seguro de vida inválido.');
  }
  return normalized as LifeInsuranceStatus;
};

const normalizeTransportVoucherMode = (value: any): EmployeeTransportVoucherMode => {
  const normalized = upper(value || 'PER_DAY');
  if (!allowedTransportVoucherModes.has(normalized as EmployeeTransportVoucherMode)) {
    throw new EmployeeValidationError('Modo de vale-transporte inválido.');
  }
  return normalized as EmployeeTransportVoucherMode;
};

const normalizeUniformDeliveryType = (value: any): UniformDeliveryType => {
  const normalized = upper(value || 'PRIMEIRA_ENTREGA');
  if (!allowedUniformDeliveryTypes.has(normalized as UniformDeliveryType)) {
    throw new EmployeeValidationError('Tipo de entrega do uniforme inválido.');
  }
  return normalized as UniformDeliveryType;
};

const normalizeUniformStatus = (value: any): UniformItemStatus => {
  const normalized = upper(value || 'ATIVO');
  if (!allowedUniformStatuses.has(normalized as UniformItemStatus)) {
    throw new EmployeeValidationError('Status do item de uniforme inválido.');
  }
  return normalized as UniformItemStatus;
};

const normalizeLockerKeyStatus = (value: any): LockerKeyStatus => {
  const normalized = upper(value || 'COLABORADOR');
  if (!allowedLockerKeyStatuses.has(normalized as LockerKeyStatus)) {
    throw new EmployeeValidationError('Status da chave do armario invalido.');
  }
  return normalized as LockerKeyStatus;
};
const mapEmployee = (row: any): Employee => ({
  id: clean(row.id),
  fullName: clean(row.full_name),
  employmentRegime: upper(row.employment_regime) as EmploymentRegime,
  status: upper(row.status) as EmployeeStatus,
  rg: clean(row.rg) || null,
  cpf: clean(row.cpf) || null,
  email: clean(row.email) || null,
  phone: clean(row.phone) || null,
  birthDate: parseDate(row.birth_date),
  street: clean(row.street) || null,
  streetNumber: clean(row.street_number) || null,
  addressComplement: clean(row.address_complement) || null,
  district: clean(row.district) || null,
  city: clean(row.city) || null,
  stateUf: clean(row.state_uf) || null,
  zipCode: clean(row.zip_code) || null,
  educationInstitution: clean(row.education_institution) || null,
  educationLevel: clean(row.education_level) ? (upper(row.education_level) as EducationLevel) : null,
  courseName: clean(row.course_name) || null,
  currentSemester: clean(row.current_semester) || null,
  workSchedule: clean(row.work_schedule) || null,
  salaryAmount: row.salary_amount === null || row.salary_amount === undefined ? null : Number(row.salary_amount),
  contractDurationText: clean(row.contract_duration_text) || null,
  admissionDate: parseDate(row.admission_date),
  contractEndDate: parseDate(row.contract_end_date),
  terminationDate: parseDate(row.termination_date),
  terminationReason: clean(row.termination_reason) || null,
  terminationNotes: clean(row.termination_notes) || null,
  units: (() => {
    const raw = clean(row.units_json);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  })(),
  jobTitle: clean(row.job_title) || null,
  department: clean(row.department) || null,
  supervisorName: clean(row.supervisor_name) || null,
  costCenter: clean(row.cost_center) || null,
  insalubrityPercent: row.insalubrity_percent === null || row.insalubrity_percent === undefined ? null : Number(row.insalubrity_percent),
  transportVoucherPerDay: row.transport_voucher_per_day === null || row.transport_voucher_per_day === undefined ? null : Number(row.transport_voucher_per_day),
  transportVoucherMode: upper(row.transport_voucher_mode || 'PER_DAY') as EmployeeTransportVoucherMode,
  transportVoucherMonthlyFixed: row.transport_voucher_monthly_fixed === null || row.transport_voucher_monthly_fixed === undefined ? null : Number(row.transport_voucher_monthly_fixed),
  mealVoucherPerDay: row.meal_voucher_per_day === null || row.meal_voucher_per_day === undefined ? null : Number(row.meal_voucher_per_day),
  totalpassDiscountFixed: row.totalpass_discount_fixed === null || row.totalpass_discount_fixed === undefined ? null : Number(row.totalpass_discount_fixed),
  otherFixedDiscountAmount: row.other_fixed_discount_amount === null || row.other_fixed_discount_amount === undefined ? null : Number(row.other_fixed_discount_amount),
  otherFixedDiscountDescription: clean(row.other_fixed_discount_description) || null,
  payrollNotes: clean(row.payroll_notes) || null,
  lifeInsuranceStatus: upper(row.life_insurance_status || 'INATIVO') as LifeInsuranceStatus,
  maritalStatus: clean(row.marital_status) ? (upper(row.marital_status) as MaritalStatus) : null,
  hasChildren: bool(row.has_children),
  childrenCount: parsePositiveInt(row.children_count, 0),
  bankName: clean(row.bank_name) || null,
  bankAgency: clean(row.bank_agency) || null,
  bankAccount: clean(row.bank_account) || null,
  pixKey: clean(row.pix_key) || null,
  notes: clean(row.notes) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapDocument = (row: any): EmployeeDocument => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  docType: upper(row.doc_type) as EmployeeDocumentTypeCode,
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  issueDate: parseDate(row.issue_date),
  expiresAt: parseDate(row.expires_at),
  notes: clean(row.notes) || null,
  isActive: bool(row.is_active),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapUniformItem = (row: any): EmployeeUniformItem => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  withdrawalDate: parseDate(row.withdrawal_date),
  itemDescription: clean(row.item_description),
  quantity: parsePositiveInt(row.quantity, 0),
  signedReceipt: bool(row.signed_receipt),
  deliveryType: upper(row.delivery_type || 'PRIMEIRA_ENTREGA') as UniformDeliveryType,
  deliveredBy: clean(row.delivered_by) || null,
  status: upper(row.status || 'ATIVO') as UniformItemStatus,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapLockerAssignment = (row: any): EmployeeLockerAssignment => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  unitName: clean(row.unit_name),
  lockerCode: clean(row.locker_code),
  locationDetail: clean(row.location_detail) || null,
  keyStatus: upper(row.key_status || 'COLABORADOR') as LockerKeyStatus,
  assignedAt: parseDate(row.assigned_at),
  returnedAt: parseDate(row.returned_at),
  notes: clean(row.notes) || null,
  isActive: bool(row.is_active),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});


const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const deriveRecessSituation = (balance: number, leaveDeadlineDate: string | null) => {
  if (balance <= 0) return 'QUITADAS' as const;
  const today = getTodayInSaoPauloIso();
  if (leaveDeadlineDate && leaveDeadlineDate < today) return 'VENCIDAS' as const;
  return 'EM_ABERTO' as const;
};

const mapRecessPeriod = (row: any): EmployeeRecessPeriod => {
  const daysDue = parsePositiveInt(row.days_due, 0);
  const daysPaid = parsePositiveInt(row.days_paid, 0);
  const balance = Math.max(0, daysDue - daysPaid);
  const vacationStartDate = parseDate(row.vacation_start_date);
  const vacationDurationDays = parsePositiveInt(row.vacation_duration_days, 0);
  const vacationEndDate = vacationStartDate && vacationDurationDays > 0
    ? addDays(vacationStartDate, vacationDurationDays - 1)
    : null;
  const leaveDeadlineDate = parseDate(row.leave_deadline_date);
  const situation = deriveRecessSituation(balance, leaveDeadlineDate);

  return {
    id: clean(row.id),
    employeeId: clean(row.employee_id),
    acquisitionStartDate: parseDate(row.acquisition_start_date),
    acquisitionEndDate: parseDate(row.acquisition_end_date),
    daysDue,
    daysPaid,
    balance,
    situation,
    leaveDeadlineDate,
    vacationStartDate,
    vacationDurationDays,
    vacationEndDate,
    sellTenDays: bool(row.sell_ten_days),
    thirteenthOnVacation: bool(row.thirteenth_on_vacation),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const buildIn = (values: string[]) => {
  if (values.length === 0) return { clause: '(NULL)', params: [] as string[] };
  return {
    clause: `(${values.map(() => '?').join(',')})`,
    params: values,
  };
};

const insertAudit = async (
  db: DbInterface,
  action: string,
  actorUserId: string,
  employeeId: string | null,
  payload: Record<string, any> | null
) => {
  await db.execute(
    `
    INSERT INTO employee_audit_log (
      id, employee_id, action, actor_user_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      employeeId,
      action,
      actorUserId,
      payload ? JSON.stringify(payload) : null,
      NOW(),
    ]
  );
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_KEYNAME' ||
      code === 'ER_BLOB_KEY_WITHOUT_LENGTH' ||
      /already exists/i.test(msg) ||
      /Duplicate key name/i.test(msg) ||
      /BLOB\/TEXT column .* used in key specification without a key length/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const ensureEmployeeExists = async (db: DbInterface, employeeId: string) => {
  const rows = await db.query(`SELECT id FROM employees WHERE id = ? LIMIT 1`, [employeeId]);
  if (!rows[0]) {
    throw new EmployeeValidationError('Colaborador não encontrado.', 404);
  }
};

const normalizeInput = (payload: any): EmployeeInput => {
  const fullName = clean(payload?.fullName || payload?.full_name);
  if (!fullName) throw new EmployeeValidationError('Nome completo é obrigatório.');

  const employmentRegime = normalizeEmploymentRegime(payload?.employmentRegime || payload?.employment_regime || 'CLT');
  const status = normalizeEmployeeStatus(payload?.status || 'ATIVO');
  const cpf = normalizeCpf(payload?.cpf);
  if (!cpf) throw new EmployeeValidationError('CPF é obrigatório.');

  const email = clean(payload?.email) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EmployeeValidationError('Email inválido.');
  }

  const admissionDate = parseDate(payload?.admissionDate || payload?.admission_date);
  if (!admissionDate) {
    throw new EmployeeValidationError('Data de admissão é obrigatória.');
  }

  const contractEndDate = parseDate(payload?.contractEndDate || payload?.contract_end_date);
  if (contractEndDate && contractEndDate < admissionDate) {
    throw new EmployeeValidationError('Data de fim não pode ser menor que a data de admissão.');
  }

  const terminationDate = parseDate(payload?.terminationDate || payload?.termination_date);
  const terminationReason = clean(payload?.terminationReason || payload?.termination_reason) || null;
  const terminationNotes = clean(payload?.terminationNotes || payload?.termination_notes) || null;
  const notes = clean(payload?.notes) || null;
  if (status === 'DESLIGADO') {
    if (!terminationDate) throw new EmployeeValidationError('Informe a data de demissão.');
    if (!terminationReason) throw new EmployeeValidationError('Informe o motivo da demissão.');
  }

  const maritalStatus = normalizeMaritalStatus(payload?.maritalStatus || payload?.marital_status);
  const hasChildren = bool(payload?.hasChildren || payload?.has_children);
  const childrenCount = hasChildren ? parsePositiveInt(payload?.childrenCount || payload?.children_count, 0) : 0;

  const input: EmployeeInput = {
    fullName,
    employmentRegime,
    status,
    rg: normalizeRg(payload?.rg),
    cpf,
    email,
    phone: normalizePhone(payload?.phone),
    birthDate: parseDate(payload?.birthDate || payload?.birth_date),
    street: clean(payload?.street) || null,
    streetNumber: clean(payload?.streetNumber || payload?.street_number) || null,
    addressComplement: clean(payload?.addressComplement || payload?.address_complement) || null,
    district: clean(payload?.district) || null,
    city: clean(payload?.city) || null,
    stateUf: clean(payload?.stateUf || payload?.state_uf).toUpperCase() || null,
    zipCode: clean(payload?.zipCode || payload?.zip_code) || null,
    educationInstitution: clean(payload?.educationInstitution || payload?.education_institution) || null,
    educationLevel: normalizeEducationLevel(payload?.educationLevel || payload?.education_level),
    courseName: clean(payload?.courseName || payload?.course_name) || null,
    currentSemester: clean(payload?.currentSemester || payload?.current_semester) || null,
    workSchedule: clean(payload?.workSchedule || payload?.work_schedule) || null,
    salaryAmount: toMoneyNumber(payload?.salaryAmount || payload?.salary_amount),
    contractDurationText: clean(payload?.contractDurationText || payload?.contract_duration_text) || null,
    admissionDate,
    contractEndDate,
    terminationDate,
    terminationReason,
    terminationNotes,
    units: normalizeUnits(payload?.units),
    jobTitle: clean(payload?.jobTitle || payload?.job_title) || null,
    department: clean(payload?.department) || null,
    supervisorName: clean(payload?.supervisorName || payload?.supervisor_name) || null,
    costCenter: clean(payload?.costCenter || payload?.cost_center) || null,
    insalubrityPercent: toMoneyNumber(payload?.insalubrityPercent || payload?.insalubrity_percent),
    transportVoucherPerDay: toMoneyNumber(payload?.transportVoucherPerDay || payload?.transport_voucher_per_day),
    transportVoucherMode: normalizeTransportVoucherMode(payload?.transportVoucherMode || payload?.transport_voucher_mode || 'PER_DAY'),
    transportVoucherMonthlyFixed: toMoneyNumber(payload?.transportVoucherMonthlyFixed || payload?.transport_voucher_monthly_fixed),
    mealVoucherPerDay: toMoneyNumber(payload?.mealVoucherPerDay || payload?.meal_voucher_per_day),
    totalpassDiscountFixed: toMoneyNumber(payload?.totalpassDiscountFixed || payload?.totalpass_discount_fixed),
    otherFixedDiscountAmount: toMoneyNumber(payload?.otherFixedDiscountAmount || payload?.other_fixed_discount_amount),
    otherFixedDiscountDescription: clean(payload?.otherFixedDiscountDescription || payload?.other_fixed_discount_description) || null,
    payrollNotes: clean(payload?.payrollNotes || payload?.payroll_notes) || null,
    lifeInsuranceStatus: normalizeLifeInsuranceStatus(payload?.lifeInsuranceStatus || payload?.life_insurance_status || 'INATIVO'),
    maritalStatus,
    hasChildren,
    childrenCount,
    bankName: clean(payload?.bankName || payload?.bank_name) || null,
    bankAgency: clean(payload?.bankAgency || payload?.bank_agency) || null,
    bankAccount: clean(payload?.bankAccount || payload?.bank_account) || null,
    pixKey: clean(payload?.pixKey || payload?.pix_key) || null,
    notes,
  };

  if (employmentRegime !== 'ESTAGIO') {
    input.educationInstitution = null;
    input.educationLevel = null;
    input.courseName = null;
    input.currentSemester = null;
  } else {
    if (!input.educationInstitution) throw new EmployeeValidationError('Instituição de ensino é obrigatória para estágio.');
    if (!input.educationLevel) throw new EmployeeValidationError('Nível é obrigatório para estágio.');
    if (!input.courseName) throw new EmployeeValidationError('Curso é obrigatório para estágio.');
  }

  if (status !== 'DESLIGADO') {
    input.terminationDate = null;
    input.terminationReason = null;
    input.terminationNotes = null;
  }

  if (input.transportVoucherMode !== 'MONTHLY_FIXED') {
    input.transportVoucherMonthlyFixed = null;
  }
  if (input.transportVoucherMode === 'NONE') {
    input.transportVoucherPerDay = null;
    input.transportVoucherMonthlyFixed = null;
  }

  return input;
};
const loadDocumentsMap = async (db: DbInterface, employeeIds: string[]) => {
  const documentsByEmployee = new Map<string, EmployeeDocument[]>();
  if (employeeIds.length === 0) return documentsByEmployee;
  const idsIn = buildIn(employeeIds);
  const rows = await db.query(
    `
    SELECT *
    FROM employee_documents
    WHERE employee_id IN ${idsIn.clause}
    ORDER BY is_active DESC, created_at DESC
    `,
    idsIn.params
  );
  for (const row of rows) {
    const mapped = mapDocument(row);
    const list = documentsByEmployee.get(mapped.employeeId) || [];
    list.push(mapped);
    documentsByEmployee.set(mapped.employeeId, list);
  }
  return documentsByEmployee;
};

const mergeEmployee = (employee: Employee, documents: EmployeeDocument[]): EmployeeListItem => {
  const aso = computeAsoStatus(documents);
  const progress = computeDocumentProgress(employee, documents);
  const missingDocs = computeMissingDocuments(employee, documents);
  return {
    ...employee,
    documents,
    missingDocs,
    requiredDocsDone: progress.done,
    requiredDocsTotal: progress.total,
    pendingDocuments: missingDocs.length > 0,
    asoStatus: aso.status,
    asoExpiresAt: aso.expiresAt,
  };
};

export const ensureEmployeesTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(64) PRIMARY KEY,
      full_name VARCHAR(180) NOT NULL,
      employment_regime VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rg VARCHAR(40) NULL,
      cpf VARCHAR(14) NOT NULL,
      email VARCHAR(180) NULL,
      phone VARCHAR(40) NULL,
      birth_date DATE NULL,
      street VARCHAR(180) NULL,
      street_number VARCHAR(40) NULL,
      address_complement VARCHAR(180) NULL,
      district VARCHAR(120) NULL,
      city VARCHAR(120) NULL,
      state_uf VARCHAR(2) NULL,
      zip_code VARCHAR(20) NULL,
      education_institution VARCHAR(180) NULL,
      education_level VARCHAR(20) NULL,
      course_name VARCHAR(180) NULL,
      current_semester VARCHAR(40) NULL,
      work_schedule TEXT NULL,
      salary_amount DECIMAL(12,2) NULL,
      contract_duration_text VARCHAR(120) NULL,
      admission_date DATE NULL,
      contract_end_date DATE NULL,
      termination_date DATE NULL,
      termination_reason TEXT NULL,
      termination_notes TEXT NULL,
      units_json LONGTEXT NULL,
      job_title VARCHAR(180) NULL,
      department VARCHAR(180) NULL,
      supervisor_name VARCHAR(180) NULL,
      cost_center VARCHAR(180) NULL,
      insalubrity_percent DECIMAL(8,2) NULL,
      transport_voucher_per_day DECIMAL(12,2) NULL,
      transport_voucher_mode VARCHAR(20) NOT NULL DEFAULT 'PER_DAY',
      transport_voucher_monthly_fixed DECIMAL(12,2) NULL,
      meal_voucher_per_day DECIMAL(12,2) NULL,
      totalpass_discount_fixed DECIMAL(12,2) NULL,
      other_fixed_discount_amount DECIMAL(12,2) NULL,
      other_fixed_discount_description TEXT NULL,
      payroll_notes TEXT NULL,
      life_insurance_status VARCHAR(20) NOT NULL DEFAULT 'INATIVO',
      marital_status VARCHAR(20) NULL,
      has_children INTEGER NOT NULL DEFAULT 0,
      children_count INTEGER NOT NULL DEFAULT 0,
      bank_name VARCHAR(180) NULL,
      bank_agency VARCHAR(80) NULL,
      bank_account VARCHAR(80) NULL,
      pix_key VARCHAR(180) NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(60) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      issue_date DATE NULL,
      expires_at DATE NULL,
      notes TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_documents_inactive (
      id VARCHAR(64) PRIMARY KEY,
      source_document_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(60) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      issue_date DATE NULL,
      expires_at DATE NULL,
      notes TEXT NULL,
      inactive_reason VARCHAR(30) NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      original_created_at TEXT NOT NULL,
      archived_by VARCHAR(64) NOT NULL,
      archived_at TEXT NOT NULL,
      UNIQUE(source_document_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_uniform_items (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      withdrawal_date DATE NULL,
      item_description VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      signed_receipt INTEGER NOT NULL DEFAULT 0,
      delivery_type VARCHAR(30) NOT NULL,
      delivered_by VARCHAR(180) NULL,
      status VARCHAR(20) NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_locker_assignments (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      unit_name VARCHAR(180) NOT NULL,
      locker_code VARCHAR(120) NOT NULL,
      location_detail VARCHAR(180) NULL,
      key_status VARCHAR(30) NOT NULL,
      assigned_at DATE NULL,
      returned_at DATE NULL,
      notes TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_recess_periods (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      acquisition_start_date DATE NULL,
      acquisition_end_date DATE NULL,
      days_due INTEGER NOT NULL DEFAULT 0,
      days_paid INTEGER NOT NULL DEFAULT 0,
      leave_deadline_date DATE NULL,
      vacation_start_date DATE NULL,
      vacation_duration_days INTEGER NOT NULL DEFAULT 0,
      sell_ten_days INTEGER NOT NULL DEFAULT 0,
      thirteenth_on_vacation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_lifecycle_cases (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      case_type VARCHAR(20) NOT NULL,
      stage VARCHAR(40) NOT NULL,
      owner_name VARCHAR(180) NULL,
      target_date DATE NULL,
      closed_at TEXT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_lifecycle_tasks (
      id VARCHAR(64) PRIMARY KEY,
      case_id VARCHAR(64) NOT NULL,
      task_key VARCHAR(80) NOT NULL,
      title VARCHAR(180) NOT NULL,
      status VARCHAR(20) NOT NULL,
      owner_name VARCHAR(180) NULL,
      due_date DATE NULL,
      notes TEXT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_ref VARCHAR(120) NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NULL,
      action VARCHAR(60) NOT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      payload_json LONGTEXT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE employee_documents ADD COLUMN issue_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_documents ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN marital_status VARCHAR(20) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN has_children INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN children_count INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN bank_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN bank_agency VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN bank_account VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN pix_key VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_mode VARCHAR(20) NOT NULL DEFAULT 'PER_DAY'`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN transport_voucher_monthly_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN totalpass_discount_fixed DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_amount DECIMAL(12,2) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN other_fixed_discount_description TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN payroll_notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_locker_assignments ADD COLUMN location_detail VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_locker_assignments ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_locker_assignments ADD COLUMN returned_at DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_locker_assignments ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_cases ADD COLUMN owner_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_cases ADD COLUMN target_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_cases ADD COLUMN closed_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_cases ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN owner_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN due_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN source_type VARCHAR(40) NOT NULL DEFAULT 'MANUAL'`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN source_ref VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_lifecycle_tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);

  await safeCreateIndex(db, `CREATE INDEX idx_employees_full_name ON employees (full_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employees_status ON employees (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_documents_employee ON employee_documents (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_documents_inactive_employee ON employee_documents_inactive (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_uniform_items_employee ON employee_uniform_items (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_locker_assignments_employee ON employee_locker_assignments (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_locker_assignments_active ON employee_locker_assignments (unit_name, locker_code, is_active)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_recess_periods_employee ON employee_recess_periods (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_lifecycle_cases_employee ON employee_lifecycle_cases (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_lifecycle_cases_stage ON employee_lifecycle_cases (stage)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_lifecycle_tasks_case ON employee_lifecycle_tasks (case_id)`);

  tablesEnsured = true;
};

export const listEmployees = async (db: DbInterface, filters: EmployeeFilters) => {
  await ensureEmployeesTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.search) {
    const q = `%${upper(filters.search)}%`;
    where.push(`(UPPER(full_name) LIKE ? OR UPPER(COALESCE(cpf, '')) LIKE ? OR UPPER(COALESCE(email, '')) LIKE ?)`);
    params.push(q, q, q);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM employees
    WHERE ${where.join(' AND ')}
    ORDER BY full_name ASC
    `,
    params
  );

  const employees = rows.map(mapEmployee);
  const docsMap = await loadDocumentsMap(db, employees.map((item) => item.id));

  let list = employees.map((employee) => mergeEmployee(employee, docsMap.get(employee.id) || []));

  if (filters.status !== 'all') {
    list = list.filter((item) => item.status === filters.status);
  }
  if (filters.regime !== 'all') {
    list = list.filter((item) => item.employmentRegime === filters.regime);
  }
  if (filters.unit && filters.unit !== 'all') {
    const targetUnit = upper(filters.unit);
    list = list.filter((item) => item.units.some((unit) => upper(unit) === targetUnit));
  }
  if (filters.asoStatus !== 'all') {
    list = list.filter((item) => item.asoStatus === filters.asoStatus);
  }
  if (filters.pendencyStatus === 'pending') {
    list = list.filter((item) => item.pendingDocuments);
  }
  if (filters.pendencyStatus === 'complete') {
    list = list.filter((item) => !item.pendingDocuments);
  }

  const total = list.length;
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, filters.pageSize || DEFAULT_PAGE_SIZE);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return { items, total };
};

export const getEmployeeById = async (db: DbInterface, employeeId: string): Promise<EmployeeListItem | null> => {
  await ensureEmployeesTables(db);
  const rows = await db.query(`SELECT * FROM employees WHERE id = ? LIMIT 1`, [employeeId]);
  const row = rows[0];
  if (!row) return null;
  const employee = mapEmployee(row);
  const docsMap = await loadDocumentsMap(db, [employee.id]);
  return mergeEmployee(employee, docsMap.get(employee.id) || []);
};
export const createEmployee = async (db: DbInterface, payload: any, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const input = normalizeInput(payload);
  const id = randomUUID();
  const now = NOW();

  await db.execute(
    `
    INSERT INTO employees (
      id, full_name, employment_regime, status, rg, cpf, email, phone, birth_date,
      street, street_number, address_complement, district, city, state_uf, zip_code,
      education_institution, education_level, course_name, current_semester,
      work_schedule, salary_amount, contract_duration_text, admission_date, contract_end_date,
      termination_date, termination_reason, termination_notes, units_json, job_title, department,
      supervisor_name, cost_center, insalubrity_percent, transport_voucher_per_day,
      transport_voucher_mode, transport_voucher_monthly_fixed, meal_voucher_per_day,
      totalpass_discount_fixed, other_fixed_discount_amount, other_fixed_discount_description,
      payroll_notes, life_insurance_status, marital_status, has_children, children_count,
      bank_name, bank_agency, bank_account, pix_key, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.fullName,
      input.employmentRegime,
      input.status,
      input.rg,
      input.cpf,
      input.email,
      input.phone,
      input.birthDate,
      input.street,
      input.streetNumber,
      input.addressComplement,
      input.district,
      input.city,
      input.stateUf,
      input.zipCode,
      input.educationInstitution,
      input.educationLevel,
      input.courseName,
      input.currentSemester,
      input.workSchedule,
      input.salaryAmount,
      input.contractDurationText,
      input.admissionDate,
      input.contractEndDate,
      input.terminationDate,
      input.terminationReason,
      input.terminationNotes,
      JSON.stringify(input.units || []),
      input.jobTitle,
      input.department,
      input.supervisorName,
      input.costCenter,
      input.insalubrityPercent,
      input.transportVoucherPerDay,
      input.transportVoucherMode,
      input.transportVoucherMonthlyFixed,
      input.mealVoucherPerDay,
      input.totalpassDiscountFixed,
      input.otherFixedDiscountAmount,
      input.otherFixedDiscountDescription,
      input.payrollNotes,
      input.lifeInsuranceStatus,
      input.maritalStatus,
      input.hasChildren ? 1 : 0,
      input.childrenCount || 0,
      input.bankName,
      input.bankAgency,
      input.bankAccount,
      input.pixKey,
      input.notes,
      now,
      now,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_CREATED', actorUserId, id, {
    employmentRegime: input.employmentRegime,
    status: input.status,
  });

  const created = await getEmployeeById(db, id);
  if (!created) {
    throw new EmployeeValidationError('Falha ao carregar colaborador criado.', 500);
  }
  return created;
};

export const updateEmployee = async (db: DbInterface, employeeId: string, payload: any, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const existing = await getEmployeeById(db, employeeId);
  if (!existing) throw new EmployeeValidationError('Colaborador não encontrado.', 404);

  const input = normalizeInput(payload);
  const now = NOW();

  await db.execute(
    `
    UPDATE employees
    SET
      full_name = ?,
      employment_regime = ?,
      status = ?,
      rg = ?,
      cpf = ?,
      email = ?,
      phone = ?,
      birth_date = ?,
      street = ?,
      street_number = ?,
      address_complement = ?,
      district = ?,
      city = ?,
      state_uf = ?,
      zip_code = ?,
      education_institution = ?,
      education_level = ?,
      course_name = ?,
      current_semester = ?,
      work_schedule = ?,
      salary_amount = ?,
      contract_duration_text = ?,
      admission_date = ?,
      contract_end_date = ?,
      termination_date = ?,
      termination_reason = ?,
      termination_notes = ?,
      units_json = ?,
      job_title = ?,
      department = ?,
      supervisor_name = ?,
      cost_center = ?,
      insalubrity_percent = ?,
      transport_voucher_per_day = ?,
      transport_voucher_mode = ?,
      transport_voucher_monthly_fixed = ?,
      meal_voucher_per_day = ?,
      totalpass_discount_fixed = ?,
      other_fixed_discount_amount = ?,
      other_fixed_discount_description = ?,
      payroll_notes = ?,
      life_insurance_status = ?,
      marital_status = ?,
      has_children = ?,
      children_count = ?,
      bank_name = ?,
      bank_agency = ?,
      bank_account = ?,
      pix_key = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?
    `,
    [
      input.fullName,
      input.employmentRegime,
      input.status,
      input.rg,
      input.cpf,
      input.email,
      input.phone,
      input.birthDate,
      input.street,
      input.streetNumber,
      input.addressComplement,
      input.district,
      input.city,
      input.stateUf,
      input.zipCode,
      input.educationInstitution,
      input.educationLevel,
      input.courseName,
      input.currentSemester,
      input.workSchedule,
      input.salaryAmount,
      input.contractDurationText,
      input.admissionDate,
      input.contractEndDate,
      input.terminationDate,
      input.terminationReason,
      input.terminationNotes,
      JSON.stringify(input.units || []),
      input.jobTitle,
      input.department,
      input.supervisorName,
      input.costCenter,
      input.insalubrityPercent,
      input.transportVoucherPerDay,
      input.transportVoucherMode,
      input.transportVoucherMonthlyFixed,
      input.mealVoucherPerDay,
      input.totalpassDiscountFixed,
      input.otherFixedDiscountAmount,
      input.otherFixedDiscountDescription,
      input.payrollNotes,
      input.lifeInsuranceStatus,
      input.maritalStatus,
      input.hasChildren ? 1 : 0,
      input.childrenCount || 0,
      input.bankName,
      input.bankAgency,
      input.bankAccount,
      input.pixKey,
      input.notes,
      now,
      employeeId,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_UPDATED', actorUserId, employeeId, {
    employmentRegime: input.employmentRegime,
    status: input.status,
  });

  const updated = await getEmployeeById(db, employeeId);
  if (!updated) {
    throw new EmployeeValidationError('Falha ao carregar colaborador atualizado.', 500);
  }
  return updated;
};

export const listEmployeeDocuments = async (db: DbInterface, employeeId: string): Promise<EmployeeDocument[]> => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  const rows = await db.query(
    `
    SELECT *
    FROM employee_documents
    WHERE employee_id = ?
    ORDER BY is_active DESC, created_at DESC
    `,
    [employeeId]
  );
  return rows.map(mapDocument);
};

export const getEmployeeDocumentById = async (db: DbInterface, documentId: string): Promise<EmployeeDocument | null> => {
  await ensureEmployeesTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM employee_documents
    WHERE id = ?
    LIMIT 1
    `,
    [documentId]
  );
  if (!rows[0]) return null;
  return mapDocument(rows[0]);
};

const archiveEmployeeDocumentRows = async (
  db: DbInterface,
  documents: EmployeeDocument[],
  actorUserId: string,
  reason: 'REPLACED' | 'DELETED'
) => {
  const archivedAt = NOW();
  for (const document of documents) {
    const existing = await db.query(
      `SELECT source_document_id FROM employee_documents_inactive WHERE source_document_id = ? LIMIT 1`,
      [document.id]
    );
    if (existing[0]) continue;

    await db.execute(
      `
      INSERT INTO employee_documents_inactive (
        id, source_document_id, employee_id, doc_type, storage_provider, storage_bucket, storage_key,
        original_name, mime_type, size_bytes, issue_date, expires_at, notes, inactive_reason,
        uploaded_by, original_created_at, archived_by, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        document.id,
        document.employeeId,
        document.docType,
        document.storageProvider,
        document.storageBucket,
        document.storageKey,
        document.originalName,
        document.mimeType,
        document.sizeBytes,
        document.issueDate,
        document.expiresAt,
        document.notes,
        reason,
        document.uploadedBy,
        document.createdAt,
        actorUserId,
        archivedAt,
      ]
    );
  }
};

export const createEmployeeDocumentRecord = async (
  db: DbInterface,
  employeeId: string,
  input: EmployeeDocumentUploadInput,
  actorUserId: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);

  const docType = upper(input.docType) as EmployeeDocumentTypeCode;
  if (!allowedDocTypes.has(docType)) {
    throw new EmployeeValidationError('Tipo de documento inválido.');
  }

  const issueDate = parseDate(input.issueDate);
  const expiresAt = parseDate(input.expiresAt);
  const typeDef = EMPLOYEE_DOCUMENT_TYPE_MAP.get(docType);
  if (typeDef?.hasIssueDate && !issueDate) {
    throw new EmployeeValidationError('Este documento exige data de emissao.');
  }
  if (typeDef?.hasExpiration && !expiresAt) {
    throw new EmployeeValidationError('Este documento exige data de vencimento.');
  }

  const now = NOW();

  if (docType !== 'OUTRO') {
    const activeRows = await db.query(
      `
      SELECT *
      FROM employee_documents
      WHERE employee_id = ? AND doc_type = ? AND is_active = 1
      `,
      [employeeId, docType]
    );
    const activeDocuments = activeRows.map(mapDocument);
    await archiveEmployeeDocumentRows(db, activeDocuments, actorUserId, 'REPLACED');

    await db.execute(
      `
      UPDATE employee_documents
      SET is_active = 0
      WHERE employee_id = ? AND doc_type = ? AND is_active = 1
      `,
      [employeeId, docType]
    );
  }

  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO employee_documents (
      id, employee_id, doc_type, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, issue_date, expires_at, notes, is_active,
      uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
    [
      id,
      employeeId,
      docType,
      clean(input.storageProvider),
      clean(input.storageBucket) || null,
      clean(input.storageKey),
      clean(input.originalName),
      clean(input.mimeType),
      Number(input.sizeBytes || 0),
      issueDate,
      expiresAt,
      clean(input.notes) || null,
      clean(input.uploadedBy),
      now,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_DOCUMENT_UPLOADED', actorUserId, employeeId, {
    documentId: id,
    docType,
  });

  const created = await getEmployeeDocumentById(db, id);
  if (!created) {
    throw new EmployeeValidationError('Falha ao carregar documento criado.', 500);
  }
  return created;
};

export const deactivateEmployeeDocument = async (
  db: DbInterface,
  documentId: string,
  actorUserId: string
) => {
  await ensureEmployeesTables(db);
  const existing = await getEmployeeDocumentById(db, documentId);
  if (!existing) {
    throw new EmployeeValidationError('Documento não encontrado.', 404);
  }
  if (!existing.isActive) {
    return existing;
  }

  await archiveEmployeeDocumentRows(db, [existing], actorUserId, 'DELETED');
  await db.execute(`UPDATE employee_documents SET is_active = 0 WHERE id = ?`, [documentId]);
  await insertAudit(db, 'EMPLOYEE_DOCUMENT_DEACTIVATED', actorUserId, existing.employeeId, {
    documentId,
    docType: existing.docType,
  });

  const updated = await getEmployeeDocumentById(db, documentId);
  if (!updated) {
    throw new EmployeeValidationError('Falha ao carregar documento atualizado.', 500);
  }
  return updated;
};

export const deactivateEmployee = async (db: DbInterface, employeeId: string, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const existing = await getEmployeeById(db, employeeId);
  if (!existing) throw new EmployeeValidationError('Colaborador não encontrado.', 404);

  const now = NOW();
  const terminationDate = existing.terminationDate || TODAY_SAO_PAULO();
  const terminationReason = existing.terminationReason || 'Inativado pelo painel';
  const terminationNotes = existing.terminationNotes || 'Registro inativado pela listagem de colaboradores.';

  await db.execute(
    `
    UPDATE employees
    SET
      status = 'DESLIGADO',
      termination_date = ?,
      termination_reason = ?,
      termination_notes = ?,
      updated_at = ?
    WHERE id = ?
    `,
    [terminationDate, terminationReason, terminationNotes, now, employeeId]
  );

  await insertAudit(db, 'EMPLOYEE_DEACTIVATED', actorUserId, employeeId, {
    previousStatus: existing.status,
    nextStatus: 'DESLIGADO',
    terminationDate,
    terminationReason,
  });

  const updated = await getEmployeeById(db, employeeId);
  if (!updated) {
    throw new EmployeeValidationError('Falha ao carregar colaborador inativado.', 500);
  }
  return updated;
};

export const registerEmployeeDocumentDownloadAudit = async (
  db: DbInterface,
  employeeId: string,
  documentId: string,
  actorUserId: string
) => {
  await insertAudit(db, 'EMPLOYEE_DOCUMENT_DOWNLOADED', actorUserId, employeeId, {
    documentId,
  });
};
const normalizeUniformItemInput = (payload: any): EmployeeUniformItemInput => {
  const itemDescription = clean(payload?.itemDescription || payload?.item_description);
  if (!itemDescription) {
    throw new EmployeeValidationError('Descrição do item é obrigatória.');
  }
  return {
    withdrawalDate: parseDate(payload?.withdrawalDate || payload?.withdrawal_date),
    itemDescription,
    quantity: Math.max(1, parsePositiveInt(payload?.quantity, 1)),
    signedReceipt: bool(payload?.signedReceipt || payload?.signed_receipt),
    deliveryType: normalizeUniformDeliveryType(payload?.deliveryType || payload?.delivery_type || 'PRIMEIRA_ENTREGA'),
    deliveredBy: clean(payload?.deliveredBy || payload?.delivered_by) || null,
    status: normalizeUniformStatus(payload?.status || 'ATIVO'),
  };
};


const normalizeLockerAssignmentInput = (payload: any): EmployeeLockerAssignmentInput => {
  const unitName = upper(payload?.unitName || payload?.unit_name);
  if (!unitName || !allowedUnits.has(unitName as (typeof EMPLOYEE_UNITS)[number])) {
    throw new EmployeeValidationError('Unidade do armario invalida.');
  }

  const lockerCode = upper(payload?.lockerCode || payload?.locker_code);
  if (!lockerCode) {
    throw new EmployeeValidationError('Informe o numero ou codigo do armario.');
  }

  const assignedAt = parseDate(payload?.assignedAt || payload?.assigned_at);
  const returnedAt = parseDate(payload?.returnedAt || payload?.returned_at);
  if (assignedAt && returnedAt && returnedAt < assignedAt) {
    throw new EmployeeValidationError('A devolucao do armario nao pode ser anterior a entrega.');
  }

  const isActiveInput = payload?.isActive ?? payload?.is_active;
  const isActive = returnedAt ? false : isActiveInput === undefined ? true : bool(isActiveInput);

  return {
    unitName,
    lockerCode,
    locationDetail: clean(payload?.locationDetail || payload?.location_detail) || null,
    keyStatus: normalizeLockerKeyStatus(payload?.keyStatus || payload?.key_status || 'COLABORADOR'),
    assignedAt,
    returnedAt,
    notes: clean(payload?.notes) || null,
    isActive,
  };
};

export const listEmployeeUniformItems = async (db: DbInterface, employeeId: string): Promise<EmployeeUniformItem[]> => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);

  const rows = await db.query(
    `
    SELECT *
    FROM employee_uniform_items
    WHERE employee_id = ?
    ORDER BY withdrawal_date DESC, created_at DESC
    `,
    [employeeId]
  );
  return rows.map(mapUniformItem);
};

export const saveEmployeeUniformItem = async (
  db: DbInterface,
  employeeId: string,
  payload: any,
  actorUserId: string,
  entryId?: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  const input = normalizeUniformItemInput(payload);
  const now = NOW();

  if (entryId) {
    const rows = await db.query(
      `SELECT id FROM employee_uniform_items WHERE id = ? AND employee_id = ? LIMIT 1`,
      [entryId, employeeId]
    );
    if (!rows[0]) {
      throw new EmployeeValidationError('Registro de uniforme não encontrado.', 404);
    }
    await db.execute(
      `
      UPDATE employee_uniform_items
      SET withdrawal_date = ?, item_description = ?, quantity = ?, signed_receipt = ?,
          delivery_type = ?, delivered_by = ?, status = ?, updated_at = ?
      WHERE id = ? AND employee_id = ?
      `,
      [
        input.withdrawalDate,
        input.itemDescription,
        input.quantity || 1,
        input.signedReceipt ? 1 : 0,
        input.deliveryType,
        input.deliveredBy,
        input.status,
        now,
        entryId,
        employeeId,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_UNIFORM_UPDATED', actorUserId, employeeId, { entryId });
  } else {
    const id = randomUUID();
    await db.execute(
      `
      INSERT INTO employee_uniform_items (
        id, employee_id, withdrawal_date, item_description, quantity, signed_receipt,
        delivery_type, delivered_by, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        employeeId,
        input.withdrawalDate,
        input.itemDescription,
        input.quantity || 1,
        input.signedReceipt ? 1 : 0,
        input.deliveryType,
        input.deliveredBy,
        input.status,
        now,
        now,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_UNIFORM_CREATED', actorUserId, employeeId, { entryId: id });
  }

  return listEmployeeUniformItems(db, employeeId);
};

export const deleteEmployeeUniformItem = async (
  db: DbInterface,
  employeeId: string,
  entryId: string,
  actorUserId: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  await db.execute(`DELETE FROM employee_uniform_items WHERE id = ? AND employee_id = ?`, [entryId, employeeId]);
  await insertAudit(db, 'EMPLOYEE_UNIFORM_DELETED', actorUserId, employeeId, { entryId });
  return listEmployeeUniformItems(db, employeeId);
};


export const listEmployeeLockerAssignments = async (
  db: DbInterface,
  employeeId: string
): Promise<EmployeeLockerAssignment[]> => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);

  const rows = await db.query(
    `
    SELECT *
    FROM employee_locker_assignments
    WHERE employee_id = ?
    ORDER BY is_active DESC, assigned_at DESC, created_at DESC
    `,
    [employeeId]
  );
  return rows.map(mapLockerAssignment);
};

export const saveEmployeeLockerAssignment = async (
  db: DbInterface,
  employeeId: string,
  payload: any,
  actorUserId: string,
  entryId?: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);

  const input = normalizeLockerAssignmentInput(payload);
  const now = NOW();

  const conflictingLockerRows = await db.query(
    `
    SELECT id, employee_id
    FROM employee_locker_assignments
    WHERE unit_name = ?
      AND locker_code = ?
      AND is_active = 1
      AND employee_id <> ?
      ${entryId ? 'AND id <> ?' : ''}
    LIMIT 1
    `,
    entryId ? [input.unitName, input.lockerCode, employeeId, entryId] : [input.unitName, input.lockerCode, employeeId]
  );

  if (input.isActive && conflictingLockerRows[0]) {
    throw new EmployeeValidationError('Este armario ja esta ativo para outro colaborador.');
  }

  if (input.isActive) {
    await db.execute(
      `
      UPDATE employee_locker_assignments
      SET is_active = 0, updated_at = ?
      WHERE employee_id = ?
        AND is_active = 1
        ${entryId ? 'AND id <> ?' : ''}
      `,
      entryId ? [now, employeeId, entryId] : [now, employeeId]
    );
  }

  if (entryId) {
    const rows = await db.query(
      `SELECT id FROM employee_locker_assignments WHERE id = ? AND employee_id = ? LIMIT 1`,
      [entryId, employeeId]
    );
    if (!rows[0]) {
      throw new EmployeeValidationError('Registro de armario nao encontrado.', 404);
    }

    await db.execute(
      `
      UPDATE employee_locker_assignments
      SET unit_name = ?, locker_code = ?, location_detail = ?, key_status = ?,
          assigned_at = ?, returned_at = ?, notes = ?, is_active = ?, updated_at = ?
      WHERE id = ? AND employee_id = ?
      `,
      [
        input.unitName,
        input.lockerCode,
        input.locationDetail,
        input.keyStatus,
        input.assignedAt,
        input.returnedAt,
        input.notes,
        input.isActive ? 1 : 0,
        now,
        entryId,
        employeeId,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_LOCKER_UPDATED', actorUserId, employeeId, { entryId });
  } else {
    const id = randomUUID();
    await db.execute(
      `
      INSERT INTO employee_locker_assignments (
        id, employee_id, unit_name, locker_code, location_detail, key_status,
        assigned_at, returned_at, notes, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        employeeId,
        input.unitName,
        input.lockerCode,
        input.locationDetail,
        input.keyStatus,
        input.assignedAt,
        input.returnedAt,
        input.notes,
        input.isActive ? 1 : 0,
        now,
        now,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_LOCKER_CREATED', actorUserId, employeeId, { entryId: id });
  }

  return listEmployeeLockerAssignments(db, employeeId);
};

export const deleteEmployeeLockerAssignment = async (
  db: DbInterface,
  employeeId: string,
  entryId: string,
  actorUserId: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  await db.execute(`DELETE FROM employee_locker_assignments WHERE id = ? AND employee_id = ?`, [entryId, employeeId]);
  await insertAudit(db, 'EMPLOYEE_LOCKER_DELETED', actorUserId, employeeId, { entryId });
  return listEmployeeLockerAssignments(db, employeeId);
};

const normalizeRecessInput = (payload: any): EmployeeRecessPeriodInput => {
  const daysDue = parsePositiveInt(payload?.daysDue || payload?.days_due, 0);
  const daysPaid = parsePositiveInt(payload?.daysPaid || payload?.days_paid, 0);
  if (daysPaid > daysDue) {
    throw new EmployeeValidationError('Dias quitados não podem ser maiores que os dias devidos.');
  }
  return {
    acquisitionStartDate: parseDate(payload?.acquisitionStartDate || payload?.acquisition_start_date),
    acquisitionEndDate: parseDate(payload?.acquisitionEndDate || payload?.acquisition_end_date),
    daysDue,
    daysPaid,
    leaveDeadlineDate: parseDate(payload?.leaveDeadlineDate || payload?.leave_deadline_date),
    vacationStartDate: parseDate(payload?.vacationStartDate || payload?.vacation_start_date),
    vacationDurationDays: parsePositiveInt(payload?.vacationDurationDays || payload?.vacation_duration_days, 0),
    sellTenDays: bool(payload?.sellTenDays || payload?.sell_ten_days),
    thirteenthOnVacation: bool(payload?.thirteenthOnVacation || payload?.thirteenth_on_vacation),
  };
};

export const listEmployeeRecessPeriods = async (db: DbInterface, employeeId: string): Promise<EmployeeRecessPeriod[]> => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);

  const rows = await db.query(
    `
    SELECT *
    FROM employee_recess_periods
    WHERE employee_id = ?
    ORDER BY acquisition_start_date DESC, created_at DESC
    `,
    [employeeId]
  );
  return rows.map(mapRecessPeriod);
};

export const saveEmployeeRecessPeriod = async (
  db: DbInterface,
  employeeId: string,
  payload: any,
  actorUserId: string,
  entryId?: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  const input = normalizeRecessInput(payload);
  const now = NOW();

  if (entryId) {
    const rows = await db.query(
      `SELECT id FROM employee_recess_periods WHERE id = ? AND employee_id = ? LIMIT 1`,
      [entryId, employeeId]
    );
    if (!rows[0]) {
      throw new EmployeeValidationError('Registro de recesso não encontrado.', 404);
    }
    await db.execute(
      `
      UPDATE employee_recess_periods
      SET acquisition_start_date = ?, acquisition_end_date = ?, days_due = ?, days_paid = ?,
          leave_deadline_date = ?, vacation_start_date = ?, vacation_duration_days = ?,
          sell_ten_days = ?, thirteenth_on_vacation = ?, updated_at = ?
      WHERE id = ? AND employee_id = ?
      `,
      [
        input.acquisitionStartDate,
        input.acquisitionEndDate,
        input.daysDue || 0,
        input.daysPaid || 0,
        input.leaveDeadlineDate,
        input.vacationStartDate,
        input.vacationDurationDays || 0,
        input.sellTenDays ? 1 : 0,
        input.thirteenthOnVacation ? 1 : 0,
        now,
        entryId,
        employeeId,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_RECESS_UPDATED', actorUserId, employeeId, { entryId });
  } else {
    const id = randomUUID();
    await db.execute(
      `
      INSERT INTO employee_recess_periods (
        id, employee_id, acquisition_start_date, acquisition_end_date, days_due, days_paid,
        leave_deadline_date, vacation_start_date, vacation_duration_days, sell_ten_days,
        thirteenth_on_vacation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        employeeId,
        input.acquisitionStartDate,
        input.acquisitionEndDate,
        input.daysDue || 0,
        input.daysPaid || 0,
        input.leaveDeadlineDate,
        input.vacationStartDate,
        input.vacationDurationDays || 0,
        input.sellTenDays ? 1 : 0,
        input.thirteenthOnVacation ? 1 : 0,
        now,
        now,
      ]
    );
    await insertAudit(db, 'EMPLOYEE_RECESS_CREATED', actorUserId, employeeId, { entryId: id });
  }

  return listEmployeeRecessPeriods(db, employeeId);
};

export const deleteEmployeeRecessPeriod = async (
  db: DbInterface,
  employeeId: string,
  entryId: string,
  actorUserId: string
) => {
  await ensureEmployeesTables(db);
  await ensureEmployeeExists(db, employeeId);
  await db.execute(`DELETE FROM employee_recess_periods WHERE id = ? AND employee_id = ?`, [entryId, employeeId]);
  await insertAudit(db, 'EMPLOYEE_RECESS_DELETED', actorUserId, employeeId, { entryId });
  return listEmployeeRecessPeriods(db, employeeId);
};

const lifecycleCaseTypes = new Set<EmployeeLifecycleCaseType>(['ADMISSION', 'TERMINATION']);
const lifecycleStages = new Set<EmployeeLifecycleStage>(['PRE_ADMISSION', 'ADMISSION_IN_PROGRESS', 'TERMINATION_IN_PROGRESS', 'CLOSED']);
const lifecycleTaskStatuses = new Set<EmployeeLifecycleTaskStatus>(['PENDING', 'DONE', 'BLOCKED', 'WAIVED']);

const normalizeLifecycleCaseType = (value: any): EmployeeLifecycleCaseType => {
  const normalized = upper(value || 'ADMISSION') as EmployeeLifecycleCaseType;
  if (!lifecycleCaseTypes.has(normalized)) {
    throw new EmployeeValidationError('Tipo de processo inválido.');
  }
  return normalized;
};

const normalizeLifecycleStage = (value: any, caseType: EmployeeLifecycleCaseType): EmployeeLifecycleStage => {
  const fallback = caseType === 'TERMINATION' ? 'TERMINATION_IN_PROGRESS' : 'PRE_ADMISSION';
  const normalized = upper(value || fallback) as EmployeeLifecycleStage;
  if (!lifecycleStages.has(normalized)) {
    throw new EmployeeValidationError('Etapa do processo inválida.');
  }
  if (caseType === 'TERMINATION' && normalized === 'PRE_ADMISSION') {
    throw new EmployeeValidationError('Desligamento não pode usar etapa de pré-admissão.');
  }
  if (caseType === 'ADMISSION' && normalized === 'TERMINATION_IN_PROGRESS') {
    throw new EmployeeValidationError('Admissão não pode usar etapa de desligamento.');
  }
  return normalized;
};

const normalizeLifecycleTaskStatus = (value: any): EmployeeLifecycleTaskStatus => {
  const normalized = upper(value || 'PENDING') as EmployeeLifecycleTaskStatus;
  if (!lifecycleTaskStatuses.has(normalized)) {
    throw new EmployeeValidationError('Status da tarefa inválido.');
  }
  return normalized;
};

const defaultLifecycleTasks: Record<EmployeeLifecycleCaseType, Array<{
  key: string;
  title: string;
  sourceType: EmployeeLifecycleTaskSourceType;
  sourceRef: string | null;
}>> = {
  ADMISSION: [
    { key: 'contract_data', title: 'Cadastro contratual completo', sourceType: 'EMPLOYEE_FIELD', sourceRef: 'ADMISSION_DATA' },
    { key: 'required_documents', title: 'Documentos obrigatórios entregues', sourceType: 'DOCUMENT', sourceRef: 'REQUIRED_DOCUMENTS' },
    { key: 'aso', title: 'ASO admissional anexado e válido', sourceType: 'DOCUMENT', sourceRef: 'ASO' },
    { key: 'initial_benefits', title: 'Benefícios iniciais conferidos', sourceType: 'EMPLOYEE_FIELD', sourceRef: 'BENEFITS' },
    { key: 'uniform_delivery', title: 'Entrega de uniforme registrada', sourceType: 'UNIFORM', sourceRef: 'DELIVERY' },
    { key: 'locker_delivery', title: 'Armário e chave registrados', sourceType: 'LOCKER', sourceRef: 'ASSIGNMENT' },
    { key: 'final_notes', title: 'Observações finais da admissão', sourceType: 'MANUAL', sourceRef: null },
  ],
  TERMINATION: [
    { key: 'termination_data', title: 'Data e motivo de desligamento preenchidos', sourceType: 'EMPLOYEE_FIELD', sourceRef: 'TERMINATION_DATA' },
    { key: 'uniform_return', title: 'Devolução de uniforme conferida', sourceType: 'UNIFORM', sourceRef: 'RETURN' },
    { key: 'locker_return', title: 'Armário e chave devolvidos', sourceType: 'LOCKER', sourceRef: 'RETURN' },
    { key: 'final_documents', title: 'Documentos finais anexados ou dispensados', sourceType: 'DOCUMENT', sourceRef: 'TERMINATION_DOCUMENTS' },
    { key: 'benefits_review', title: 'Benefícios e descontos finais revisados', sourceType: 'EMPLOYEE_FIELD', sourceRef: 'BENEFITS' },
    { key: 'final_notes', title: 'Observações finais do desligamento', sourceType: 'MANUAL', sourceRef: null },
  ],
};

const mapLifecycleTaskRow = (row: any): Omit<EmployeeLifecycleTask, 'sourceReady' | 'sourceSummary'> => ({
  id: clean(row.id),
  caseId: clean(row.case_id),
  taskKey: clean(row.task_key),
  title: clean(row.title),
  status: upper(row.status || 'PENDING') as EmployeeLifecycleTaskStatus,
  ownerName: clean(row.owner_name) || null,
  dueDate: parseDate(row.due_date),
  notes: clean(row.notes) || null,
  sourceType: upper(row.source_type || 'MANUAL') as EmployeeLifecycleTaskSourceType,
  sourceRef: clean(row.source_ref) || null,
  sortOrder: parsePositiveInt(row.sort_order, 0),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const resolveLifecycleTaskSource = (
  task: Omit<EmployeeLifecycleTask, 'sourceReady' | 'sourceSummary'>,
  employee: EmployeeListItem,
  documents: EmployeeDocument[],
  uniforms: EmployeeUniformItem[],
  lockers: EmployeeLockerAssignment[],
) => {
  if (task.sourceType === 'DOCUMENT' && task.sourceRef === 'REQUIRED_DOCUMENTS') {
    const missing = computeMissingDocuments(employee, documents);
    return {
      sourceReady: missing.length === 0,
      sourceSummary: missing.length === 0
        ? 'Todos os documentos obrigatórios do perfil estão ativos.'
        : `${missing.length} documento(s) obrigatório(s) pendente(s): ${missing.slice(0, 3).map(getDocumentTypeLabel).join(', ')}${missing.length > 3 ? '...' : ''}`,
    };
  }

  if (task.sourceType === 'DOCUMENT' && task.sourceRef === 'ASO') {
    const asoStatus = computeAsoStatus(documents);
    return {
      sourceReady: asoStatus.status === 'OK' || asoStatus.status === 'VENCENDO',
      sourceSummary: asoStatus.expiresAt
        ? `ASO ${asoStatus.status.toLowerCase()} com vencimento em ${asoStatus.expiresAt}.`
        : 'ASO ativo não encontrado.',
    };
  }

  if (task.sourceType === 'DOCUMENT' && task.sourceRef === 'TERMINATION_DOCUMENTS') {
    return {
      sourceReady: task.status === 'DONE' || task.status === 'WAIVED',
      sourceSummary: 'Use a aba Documentos para anexar termo/arquivo final ou marque a tarefa como dispensada.',
    };
  }

  if (task.sourceType === 'EMPLOYEE_FIELD' && task.sourceRef === 'ADMISSION_DATA') {
    const missing = [
      !employee.fullName ? 'nome' : '',
      !employee.cpf ? 'CPF' : '',
      !employee.admissionDate ? 'admissão' : '',
      !employee.employmentRegime ? 'regime' : '',
      !employee.jobTitle ? 'cargo' : '',
      !employee.costCenter ? 'centro de custo' : '',
    ].filter(Boolean);
    return {
      sourceReady: missing.length === 0,
      sourceSummary: missing.length === 0 ? 'Cadastro contratual mínimo preenchido.' : `Campos pendentes: ${missing.join(', ')}.`,
    };
  }

  if (task.sourceType === 'EMPLOYEE_FIELD' && task.sourceRef === 'TERMINATION_DATA') {
    const ready = employee.status === 'DESLIGADO' && Boolean(employee.terminationDate && employee.terminationReason);
    return {
      sourceReady: ready,
      sourceSummary: ready
        ? `Desligado em ${employee.terminationDate} com motivo preenchido.`
        : 'Atualize o cadastro para status Desligado com data e motivo.',
    };
  }

  if (task.sourceType === 'EMPLOYEE_FIELD' && task.sourceRef === 'BENEFITS') {
    return {
      sourceReady: task.status === 'DONE' || task.status === 'WAIVED',
      sourceSummary: 'Conferência operacional: VR, VT, Totalpass, seguro, descontos fixos e observações de folha.',
    };
  }

  if (task.sourceType === 'UNIFORM' && task.sourceRef === 'DELIVERY') {
    return {
      sourceReady: uniforms.length > 0,
      sourceSummary: uniforms.length > 0 ? `${uniforms.length} registro(s) de uniforme encontrado(s).` : 'Nenhum registro de uniforme encontrado.',
    };
  }

  if (task.sourceType === 'UNIFORM' && task.sourceRef === 'RETURN') {
    const pending = uniforms.filter((item) => item.status !== 'DEVOLVIDO');
    return {
      sourceReady: pending.length === 0,
      sourceSummary: pending.length === 0 ? 'Sem uniforme pendente de devolução.' : `${pending.length} item(ns) de uniforme ainda não devolvido(s).`,
    };
  }

  if (task.sourceType === 'LOCKER' && task.sourceRef === 'ASSIGNMENT') {
    const active = lockers.find((item) => item.isActive);
    return {
      sourceReady: Boolean(active),
      sourceSummary: active ? `Armário ${active.lockerCode} ativo em ${active.unitName}.` : 'Nenhum armário/chave ativo registrado.',
    };
  }

  if (task.sourceType === 'LOCKER' && task.sourceRef === 'RETURN') {
    const active = lockers.filter((item) => item.isActive && !item.returnedAt);
    return {
      sourceReady: active.length === 0,
      sourceSummary: active.length === 0 ? 'Sem armário/chave pendente de devolução.' : `${active.length} armário(s)/chave(s) ainda ativo(s).`,
    };
  }

  return {
    sourceReady: task.status === 'DONE' || task.status === 'WAIVED',
    sourceSummary: 'Tarefa manual acompanhada pelo checklist.',
  };
};

const normalizeLifecycleCaseInput = (payload: any): EmployeeLifecycleCaseInput => {
  const caseType = normalizeLifecycleCaseType(payload?.caseType || payload?.case_type);
  return {
    employeeId: clean(payload?.employeeId || payload?.employee_id),
    caseType,
    stage: normalizeLifecycleStage(payload?.stage, caseType),
    ownerName: clean(payload?.ownerName || payload?.owner_name) || null,
    targetDate: parseDate(payload?.targetDate || payload?.target_date),
    notes: clean(payload?.notes) || null,
  };
};

export const listEmployeeLifecycleCases = async (db: DbInterface): Promise<EmployeeLifecycleCase[]> => {
  await ensureEmployeesTables(db);
  const rows = await db.query(`
    SELECT
      lc.id AS lifecycle_id,
      lc.employee_id AS lifecycle_employee_id,
      lc.case_type AS lifecycle_case_type,
      lc.stage AS lifecycle_stage,
      lc.owner_name AS lifecycle_owner_name,
      lc.target_date AS lifecycle_target_date,
      lc.closed_at AS lifecycle_closed_at,
      lc.notes AS lifecycle_notes,
      lc.created_at AS lifecycle_created_at,
      lc.updated_at AS lifecycle_updated_at,
      e.*
    FROM employee_lifecycle_cases lc
    INNER JOIN employees e ON e.id = lc.employee_id
    ORDER BY
      CASE lc.stage
        WHEN 'PRE_ADMISSION' THEN 1
        WHEN 'ADMISSION_IN_PROGRESS' THEN 2
        WHEN 'TERMINATION_IN_PROGRESS' THEN 3
        WHEN 'CLOSED' THEN 4
        ELSE 9
      END,
      COALESCE(lc.target_date, lc.created_at) ASC
  `);
  const caseIds = rows.map((row: any) => clean(row.lifecycle_id)).filter(Boolean);
  const employeeIds = rows.map((row: any) => clean(row.lifecycle_employee_id)).filter(Boolean);
  const taskRows = caseIds.length
    ? await db.query(
        `SELECT * FROM employee_lifecycle_tasks WHERE case_id IN (${caseIds.map(() => '?').join(',')}) ORDER BY sort_order ASC, created_at ASC`,
        caseIds,
      )
    : [];

  const [docsMap, uniformsMap, lockersMap] = await Promise.all([
    loadDocumentsMap(db, employeeIds),
    Promise.all(employeeIds.map(async (employeeId) => [employeeId, await listEmployeeUniformItems(db, employeeId)] as const)).then((entries) => new Map(entries)),
    Promise.all(employeeIds.map(async (employeeId) => [employeeId, await listEmployeeLockerAssignments(db, employeeId)] as const)).then((entries) => new Map(entries)),
  ]);

  const tasksByCase = new Map<string, Array<Omit<EmployeeLifecycleTask, 'sourceReady' | 'sourceSummary'>>>();
  for (const row of taskRows) {
    const task = mapLifecycleTaskRow(row);
    const list = tasksByCase.get(task.caseId) || [];
    list.push(task);
    tasksByCase.set(task.caseId, list);
  }

  return rows.map((row: any) => {
    const employee = mapEmployee(row);
    const documents = docsMap.get(employee.id) || [];
    const merged = mergeEmployee(employee, documents);
    const uniforms = uniformsMap.get(employee.id) || [];
    const lockers = lockersMap.get(employee.id) || [];
    const tasks = (tasksByCase.get(clean(row.lifecycle_id)) || []).map((task) => ({
      ...task,
      ...resolveLifecycleTaskSource(task, merged, documents, uniforms, lockers),
    }));
    const doneTasks = tasks.filter((task) => task.status === 'DONE' || task.status === 'WAIVED').length;
    const blockedTasks = tasks.filter((task) => task.status === 'BLOCKED').length;
    const sourcePendingTasks = tasks.filter((task) => !task.sourceReady).length;

    return {
      id: clean(row.lifecycle_id),
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCpf: employee.cpf,
      employeeStatus: employee.status,
      caseType: upper(row.lifecycle_case_type || 'ADMISSION') as EmployeeLifecycleCaseType,
      stage: upper(row.lifecycle_stage || 'PRE_ADMISSION') as EmployeeLifecycleStage,
      ownerName: clean(row.lifecycle_owner_name) || null,
      targetDate: parseDate(row.lifecycle_target_date),
      closedAt: clean(row.lifecycle_closed_at) || null,
      notes: clean(row.lifecycle_notes) || null,
      totalTasks: tasks.length,
      doneTasks,
      blockedTasks,
      sourcePendingTasks,
      tasks,
      createdAt: clean(row.lifecycle_created_at),
      updatedAt: clean(row.lifecycle_updated_at),
    };
  });
};

export const createEmployeeLifecycleCase = async (db: DbInterface, payload: any, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const input = normalizeLifecycleCaseInput(payload);
  if (!input.employeeId) throw new EmployeeValidationError('Selecione um colaborador para iniciar o processo.');
  await ensureEmployeeExists(db, input.employeeId);

  const existing = await db.query(
    `SELECT id FROM employee_lifecycle_cases WHERE employee_id = ? AND case_type = ? AND stage <> 'CLOSED' LIMIT 1`,
    [input.employeeId, input.caseType],
  );
  if (existing[0]) {
    throw new EmployeeValidationError('Já existe um processo aberto deste tipo para o colaborador.');
  }

  const caseId = randomUUID();
  const now = NOW();
  await db.execute(
    `
    INSERT INTO employee_lifecycle_cases (
      id, employee_id, case_type, stage, owner_name, target_date, closed_at, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [caseId, input.employeeId, input.caseType, input.stage, input.ownerName, input.targetDate, null, input.notes, now, now],
  );

  const templates = defaultLifecycleTasks[input.caseType];
  for (const [index, task] of templates.entries()) {
    await db.execute(
      `
      INSERT INTO employee_lifecycle_tasks (
        id, case_id, task_key, title, status, owner_name, due_date, notes, source_type, source_ref, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        caseId,
        task.key,
        task.title,
        'PENDING',
        input.ownerName,
        input.targetDate,
        null,
        task.sourceType,
        task.sourceRef,
        index + 1,
        now,
        now,
      ],
    );
  }

  await insertAudit(db, 'EMPLOYEE_LIFECYCLE_CREATED', actorUserId, input.employeeId, {
    caseId,
    caseType: input.caseType,
    stage: input.stage,
  });

  return listEmployeeLifecycleCases(db);
};

export const updateEmployeeLifecycleCase = async (db: DbInterface, caseId: string, payload: any, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const rows = await db.query(`SELECT * FROM employee_lifecycle_cases WHERE id = ? LIMIT 1`, [caseId]);
  const existing = rows[0];
  if (!existing) throw new EmployeeValidationError('Processo não encontrado.', 404);
  const caseType = upper(existing.case_type) as EmployeeLifecycleCaseType;
  const shouldClose = bool(payload?.closeCase);
  const stage = shouldClose ? 'CLOSED' : normalizeLifecycleStage(payload?.stage || existing.stage, caseType);
  const now = NOW();

  await db.execute(
    `
    UPDATE employee_lifecycle_cases
    SET stage = ?, owner_name = ?, target_date = ?, closed_at = ?, notes = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      stage,
      clean(payload?.ownerName || payload?.owner_name) || clean(existing.owner_name) || null,
      parseDate(payload?.targetDate || payload?.target_date) || parseDate(existing.target_date),
      shouldClose ? now : clean(existing.closed_at) || null,
      clean(payload?.notes) || clean(existing.notes) || null,
      now,
      caseId,
    ],
  );

  await insertAudit(db, 'EMPLOYEE_LIFECYCLE_UPDATED', actorUserId, clean(existing.employee_id), {
    caseId,
    stage,
  });

  return listEmployeeLifecycleCases(db);
};

export const deleteEmployeeLifecycleCase = async (db: DbInterface, caseId: string, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const rows = await db.query(`SELECT * FROM employee_lifecycle_cases WHERE id = ? LIMIT 1`, [caseId]);
  const existing = rows[0];
  if (!existing) throw new EmployeeValidationError('Processo não encontrado.', 404);

  await db.execute(`DELETE FROM employee_lifecycle_tasks WHERE case_id = ?`, [caseId]);
  await db.execute(`DELETE FROM employee_lifecycle_cases WHERE id = ?`, [caseId]);

  await insertAudit(db, 'EMPLOYEE_LIFECYCLE_DELETED', actorUserId, clean(existing.employee_id), {
    caseId,
    caseType: upper(existing.case_type || ''),
    stage: upper(existing.stage || ''),
  });

  return listEmployeeLifecycleCases(db);
};

export const updateEmployeeLifecycleTask = async (db: DbInterface, caseId: string, payload: any, actorUserId: string) => {
  await ensureEmployeesTables(db);
  const input: EmployeeLifecycleTaskUpdateInput = {
    taskId: clean(payload?.taskId || payload?.task_id),
    status: payload?.status ? normalizeLifecycleTaskStatus(payload.status) : undefined,
    ownerName: payload?.ownerName !== undefined || payload?.owner_name !== undefined ? clean(payload?.ownerName || payload?.owner_name) || null : undefined,
    dueDate: payload?.dueDate !== undefined || payload?.due_date !== undefined ? parseDate(payload?.dueDate || payload?.due_date) : undefined,
    notes: payload?.notes !== undefined ? clean(payload?.notes) || null : undefined,
  };
  if (!input.taskId) throw new EmployeeValidationError('Tarefa não informada.');

  const rows = await db.query(
    `
    SELECT t.*, c.employee_id
    FROM employee_lifecycle_tasks t
    INNER JOIN employee_lifecycle_cases c ON c.id = t.case_id
    WHERE t.id = ? AND t.case_id = ?
    LIMIT 1
    `,
    [input.taskId, caseId],
  );
  const existing = rows[0];
  if (!existing) throw new EmployeeValidationError('Tarefa não encontrada.', 404);
  const now = NOW();

  await db.execute(
    `
    UPDATE employee_lifecycle_tasks
    SET status = ?, owner_name = ?, due_date = ?, notes = ?, updated_at = ?
    WHERE id = ? AND case_id = ?
    `,
    [
      input.status || upper(existing.status || 'PENDING'),
      input.ownerName !== undefined ? input.ownerName : clean(existing.owner_name) || null,
      input.dueDate !== undefined ? input.dueDate : parseDate(existing.due_date),
      input.notes !== undefined ? input.notes : clean(existing.notes) || null,
      now,
      input.taskId,
      caseId,
    ],
  );

  await insertAudit(db, 'EMPLOYEE_LIFECYCLE_TASK_UPDATED', actorUserId, clean(existing.employee_id), {
    caseId,
    taskId: input.taskId,
    status: input.status,
  });

  return listEmployeeLifecycleCases(db);
};

const loadDistinctStrings = async (db: DbInterface, sql: string) => {
  const rows = await db.query(sql);
  return rows
    .map((row: any) => clean(row.value || row.name || row.v))
    .filter(Boolean)
    .filter((value: string, index: number, arr: string[]) => arr.indexOf(value) === index)
    .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
};

export const getEmployeesOptions = async (db: DbInterface) => {
  await ensureEmployeesTables(db);
  const [supervisors, departments, jobTitles, costCenters] = await Promise.all([
    loadDistinctStrings(db, `SELECT DISTINCT TRIM(name) AS value FROM users WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY value ASC`),
    loadDistinctStrings(db, `SELECT DISTINCT TRIM(department) AS value FROM employees WHERE department IS NOT NULL AND TRIM(department) <> '' ORDER BY value ASC`),
    loadDistinctStrings(db, `SELECT DISTINCT TRIM(job_title) AS value FROM employees WHERE job_title IS NOT NULL AND TRIM(job_title) <> '' ORDER BY value ASC`),
    loadDistinctStrings(db, `SELECT DISTINCT TRIM(cost_center) AS value FROM employees WHERE cost_center IS NOT NULL AND TRIM(cost_center) <> '' ORDER BY value ASC`),
  ]);

  return {
    units: EMPLOYEE_UNITS.map((value) => ({
      value,
      label: value === 'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS' ? 'Resolvecard' : value,
    })),
    regimes: EMPLOYMENT_REGIMES,
    statuses: EMPLOYEE_STATUSES,
    asoStatuses: ASO_STATUSES,
    maritalStatuses: MARITAL_STATUSES,
    lifeInsuranceStatuses: LIFE_INSURANCE_STATUSES,
    uniformDeliveryTypes: UNIFORM_DELIVERY_TYPES,
    uniformItemStatuses: UNIFORM_ITEM_STATUSES,
    lockerKeyStatuses: LOCKER_KEY_STATUSES,
    transportVoucherModes: EMPLOYEE_TRANSPORT_VOUCHER_MODES,
    documentTypes: EMPLOYEE_DOCUMENT_TYPES.map((item) => ({
      value: item.code,
      label: item.label,
      hasIssueDate: item.hasIssueDate,
      hasExpiration: item.hasExpiration,
      optional: item.optional,
    })),
    supervisors,
    departments,
    jobTitles,
    costCenters,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  };
};

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
