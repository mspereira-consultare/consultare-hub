import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';
import {
  EMPLOYEE_DOCUMENT_TYPE_MAP,
  EMPLOYEE_DOCUMENT_TYPES,
  type EducationLevel,
  type EmployeeDocumentTypeCode,
  type EmployeeStatus,
  type EmployeeTransportVoucherMode,
  type EmploymentRegime,
  type LifeInsuranceStatus,
  type MaritalStatus,
} from './constants';
import {
  computeAsoStatus,
  computeDocumentProgress,
  computeMissingDocuments,
} from './status';
import type {
  Employee,
  EmployeeDocument,
  EmployeeDocumentUploadInput,
  EmployeeListItem,
} from './types';

export class EmployeeValidationError extends Error {
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
  value === true ||
  value === 1 ||
  String(value) === '1' ||
  String(value ?? '').toLowerCase() === 'true';

const allowedDocTypes = new Set(EMPLOYEE_DOCUMENT_TYPES.map((item) => item.code));

const parsePositiveInt = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const parseDate = (value: unknown): string | null => {
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

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(msg) || /Duplicate key name/i.test(msg)) return;
    throw error;
  }
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

const insertAudit = async (
  db: DbInterface,
  action: string,
  actorUserId: string,
  employeeId: string | null,
  payload: Record<string, unknown> | null
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
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN education_institution VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN education_level VARCHAR(20) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN course_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN current_semester VARCHAR(40) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_employees_full_name ON employees (full_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employees_status ON employees (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_documents_employee ON employee_documents (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_documents_inactive_employee ON employee_documents_inactive (employee_id)`);

  tablesEnsured = true;
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

const ensureEmployeeExists = async (db: DbInterface, employeeId: string) => {
  const rows = await db.query(`SELECT id FROM employees WHERE id = ? LIMIT 1`, [employeeId]);
  if (!rows[0]) {
    throw new EmployeeValidationError('Colaborador nao encontrado.', 404);
  }
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

export const getEmployeeById = async (db: DbInterface, employeeId: string): Promise<EmployeeListItem | null> => {
  await ensureEmployeesTables(db);
  const rows = await db.query(`SELECT * FROM employees WHERE id = ? LIMIT 1`, [employeeId]);
  const row = rows[0];
  if (!row) return null;
  const documents = await listEmployeeDocuments(db, employeeId);
  return mergeEmployee(mapEmployee(row), documents);
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
    throw new EmployeeValidationError('Tipo de documento invalido.');
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
