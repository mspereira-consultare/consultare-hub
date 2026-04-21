import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import type { DbInterface } from '../db';
import {
  EMPLOYEE_DOCUMENT_TYPE_MAP,
  EMPLOYEE_DOCUMENT_TYPES,
  type EducationLevel,
  type EmployeeDocumentTypeCode,
  type MaritalStatus,
} from '../colaboradores/constants';
import {
  createEmployeeDocumentRecord,
  ensureEmployeesTables,
  getEmployeeById,
  listEmployeeDocuments,
} from '../colaboradores/portal_repository';
import { getExpectedDocumentTypes } from '../colaboradores/status';
import {
  EMPLOYEE_PORTAL_EXCLUDED_DOCUMENT_TYPES,
  EMPLOYEE_PORTAL_INVITE_TTL_DAYS,
  EMPLOYEE_PORTAL_LOCK_MINUTES,
  EMPLOYEE_PORTAL_MAX_ATTEMPTS,
  EMPLOYEE_PORTAL_PERSONAL_FIELDS,
  EMPLOYEE_PORTAL_SESSION_TTL_HOURS,
} from './constants';
import type {
  CreatePortalDocumentInput,
  EmployeePortalChecklistItem,
  EmployeePortalDocumentStatus,
  EmployeePortalInvite,
  EmployeePortalInviteStatus,
  EmployeePortalOverview,
  EmployeePortalPersonalData,
  EmployeePortalPersonalStatus,
  EmployeePortalSession,
  EmployeePortalSubmission,
  EmployeePortalSubmissionDocument,
  EmployeePortalSubmissionStatus,
} from './types';

export class EmployeePortalError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const clean = (value: any) => String(value ?? '').trim();
const upper = (value: any) => clean(value).toUpperCase();
const bool = (value: any) =>
  value === true ||
  value === 1 ||
  String(value) === '1' ||
  String(value ?? '').toLowerCase() === 'true';

const normalizeCpf = (value: any) => clean(value).replace(/\D/g, '').slice(0, 11);
const normalizePhone = (value: any): string | null => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return null;
  if (digits.length < 10) throw new EmployeePortalError('Telefone invalido. Use DDD + numero.');
  return digits;
};

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

const addDaysIso = (dateIso: string, days: number) => {
  const date = new Date(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const addHoursIso = (dateIso: string, hours: number) => {
  const date = new Date(dateIso);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
};

const addMinutesIso = (dateIso: string, minutes: number) => {
  const date = new Date(dateIso);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
};

const portalSecret = () =>
  clean(process.env.EMPLOYEE_PORTAL_SECRET) ||
  clean(process.env.NEXTAUTH_SECRET) ||
  'consultare-portal-development-secret';

export const generatePortalToken = () => randomBytes(32).toString('base64url');

export const hashPortalToken = (token: string) =>
  createHmac('sha256', portalSecret()).update(clean(token)).digest('hex');

export const checksumBuffer = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');

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

export const ensureEmployeePortalTables = async (db: DbInterface) => {
  if (tablesEnsured) return;
  await ensureEmployeesTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_invites (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      status VARCHAR(30) NOT NULL,
      expires_at TEXT NOT NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      revoked_by VARCHAR(64) NULL,
      revoked_at TEXT NULL,
      last_used_at TEXT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT NULL,
      UNIQUE(token_hash)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_sessions (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      invite_id VARCHAR(64) NOT NULL,
      session_hash VARCHAR(128) NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT NULL,
      ip_address VARCHAR(80) NULL,
      user_agent TEXT NULL,
      UNIQUE(session_hash)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_submissions (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      invite_id VARCHAR(64) NULL,
      status VARCHAR(30) NOT NULL,
      personal_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      personal_data_json LONGTEXT NULL,
      personal_rejection_reason TEXT NULL,
      consent_lgpd INTEGER NOT NULL DEFAULT 0,
      consent_lgpd_at TEXT NULL,
      submitted_at TEXT NULL,
      reviewed_by VARCHAR(64) NULL,
      reviewed_at TEXT NULL,
      review_notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_submission_documents (
      id VARCHAR(64) PRIMARY KEY,
      submission_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(60) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      checksum VARCHAR(128) NULL,
      issue_date DATE NULL,
      expires_at DATE NULL,
      notes TEXT NULL,
      status VARCHAR(30) NOT NULL,
      rejection_reason TEXT NULL,
      reviewed_by VARCHAR(64) NULL,
      reviewed_at TEXT NULL,
      promoted_document_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE employee_portal_submissions ADD COLUMN personal_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_submissions ADD COLUMN personal_rejection_reason TEXT NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_invites_employee ON employee_portal_invites (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_invites_status ON employee_portal_invites (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_sessions_employee ON employee_portal_sessions (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submissions_employee ON employee_portal_submissions (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submission_documents_submission ON employee_portal_submission_documents (submission_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submission_documents_employee ON employee_portal_submission_documents (employee_id)`);

  tablesEnsured = true;
};

const parseJsonObject = (value: any): Record<string, any> => {
  const raw = clean(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const mapInvite = (row: any): EmployeePortalInvite => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  status: upper(row.status || 'ACTIVE') as EmployeePortalInviteStatus,
  expiresAt: clean(row.expires_at),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  revokedBy: clean(row.revoked_by) || null,
  revokedAt: clean(row.revoked_at) || null,
  lastUsedAt: clean(row.last_used_at) || null,
  attemptCount: Number(row.attempt_count || 0),
  lockedUntil: clean(row.locked_until) || null,
});

const mapSession = (row: any): EmployeePortalSession => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  inviteId: clean(row.invite_id),
  createdAt: clean(row.created_at),
  expiresAt: clean(row.expires_at),
  revokedAt: clean(row.revoked_at) || null,
  ipAddress: clean(row.ip_address) || null,
  userAgent: clean(row.user_agent) || null,
});

const mapSubmission = (row: any): EmployeePortalSubmission => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  inviteId: clean(row.invite_id) || null,
  status: upper(row.status || 'DRAFT') as EmployeePortalSubmissionStatus,
  personalStatus: upper(row.personal_status || 'DRAFT') as EmployeePortalPersonalStatus,
  personalData: parseJsonObject(row.personal_data_json) as EmployeePortalPersonalData,
  personalRejectionReason: clean(row.personal_rejection_reason) || null,
  consentLgpd: bool(row.consent_lgpd),
  consentLgpdAt: clean(row.consent_lgpd_at) || null,
  submittedAt: clean(row.submitted_at) || null,
  reviewedBy: clean(row.reviewed_by) || null,
  reviewedAt: clean(row.reviewed_at) || null,
  reviewNotes: clean(row.review_notes) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapSubmissionDocument = (row: any): EmployeePortalSubmissionDocument => ({
  id: clean(row.id),
  submissionId: clean(row.submission_id),
  employeeId: clean(row.employee_id),
  docType: upper(row.doc_type) as EmployeeDocumentTypeCode,
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  checksum: clean(row.checksum) || null,
  issueDate: parseDate(row.issue_date),
  expiresAt: parseDate(row.expires_at),
  notes: clean(row.notes) || null,
  status: upper(row.status || 'PENDING') as EmployeePortalDocumentStatus,
  rejectionReason: clean(row.rejection_reason) || null,
  reviewedBy: clean(row.reviewed_by) || null,
  reviewedAt: clean(row.reviewed_at) || null,
  promotedDocumentId: clean(row.promoted_document_id) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const getLatestSubmission = async (db: DbInterface, employeeId: string): Promise<EmployeePortalSubmission | null> => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_submissions
    WHERE employee_id = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [employeeId]
  );
  return rows[0] ? mapSubmission(rows[0]) : null;
};

const listSubmissionDocuments = async (
  db: DbInterface,
  submissionId: string
): Promise<EmployeePortalSubmissionDocument[]> => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_submission_documents
    WHERE submission_id = ?
    ORDER BY created_at DESC
    `,
    [submissionId]
  );
  return rows.map(mapSubmissionDocument);
};

const listInvites = async (db: DbInterface, employeeId: string): Promise<EmployeePortalInvite[]> => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_invites
    WHERE employee_id = ?
    ORDER BY created_at DESC
    LIMIT 20
    `,
    [employeeId]
  );
  return rows.map(mapInvite);
};

const getActiveInvite = async (db: DbInterface, employeeId: string): Promise<EmployeePortalInvite | null> => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_invites
    WHERE employee_id = ? AND status = 'ACTIVE' AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [employeeId]
  );
  const invite = rows[0] ? mapInvite(rows[0]) : null;
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt <= NOW()) return null;
  return invite;
};

const createSubmission = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string | null
): Promise<EmployeePortalSubmission> => {
  const now = NOW();
  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO employee_portal_submissions (
      id, employee_id, invite_id, status, personal_status, personal_data_json,
      consent_lgpd, created_at, updated_at
    ) VALUES (?, ?, ?, 'DRAFT', 'DRAFT', ?, 0, ?, ?)
    `,
    [id, employeeId, inviteId, JSON.stringify({}), now, now]
  );
  const created = await getLatestSubmission(db, employeeId);
  if (!created) throw new EmployeePortalError('Falha ao criar submissao do portal.', 500);
  return created;
};

const getEditableSubmission = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string | null
): Promise<EmployeePortalSubmission> => {
  const existing = await getLatestSubmission(db, employeeId);
  if (!existing) return createSubmission(db, employeeId, inviteId);
  if (existing.status === 'DRAFT' || existing.status === 'CHANGES_REQUESTED') return existing;
  if (existing.status === 'APPROVED' || existing.status === 'REJECTED' || existing.status === 'CANCELED') {
    return createSubmission(db, employeeId, inviteId);
  }
  throw new EmployeePortalError('A submissao ja foi enviada e aguarda revisao do DP.', 409);
};

export const getOrCreateEmployeePortalSubmission = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string | null
) => {
  await ensureEmployeePortalTables(db);
  return getEditableSubmission(db, employeeId, inviteId);
};

const normalizePersonalData = (payload: any): EmployeePortalPersonalData => {
  const data: EmployeePortalPersonalData = {};
  const source = payload && typeof payload === 'object' ? payload : {};

  for (const field of EMPLOYEE_PORTAL_PERSONAL_FIELDS) {
    if (!(field in source)) continue;
    const value = source[field];
    switch (field) {
      case 'fullName':
      case 'rg':
      case 'street':
      case 'streetNumber':
      case 'addressComplement':
      case 'district':
      case 'city':
      case 'zipCode':
      case 'educationInstitution':
      case 'courseName':
      case 'currentSemester':
      case 'bankName':
      case 'bankAgency':
      case 'bankAccount':
      case 'pixKey':
        data[field] = clean(value) || null;
        break;
      case 'email': {
        const email = clean(value).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new EmployeePortalError('E-mail invalido.');
        }
        data[field] = email || null;
        break;
      }
      case 'phone':
        data[field] = normalizePhone(value);
        break;
      case 'stateUf': {
        const uf = upper(value).slice(0, 2);
        data[field] = uf || null;
        break;
      }
      case 'educationLevel': {
        const level = upper(value);
        if (level && !['MEDIO', 'TECNICO', 'SUPERIOR'].includes(level)) {
          throw new EmployeePortalError('Nivel de escolaridade invalido.');
        }
        data[field] = level || null;
        break;
      }
      case 'maritalStatus': {
        const status = upper(value);
        if (status && !['SOLTEIRO', 'CASADO', 'UNIAO_ESTAVEL', 'DIVORCIADO', 'VIUVO'].includes(status)) {
          throw new EmployeePortalError('Estado civil invalido.');
        }
        data[field] = status || null;
        break;
      }
      case 'hasChildren':
        data[field] = bool(value);
        break;
      case 'childrenCount':
        data[field] = Math.max(0, Math.trunc(Number(value || 0)));
        break;
    }
  }

  if (data.hasChildren === false) {
    data.childrenCount = 0;
  }

  return data;
};

const applyPersonalDataForChecklist = (employee: any, personalData: EmployeePortalPersonalData) => ({
  employmentRegime: employee.employmentRegime,
  maritalStatus: (personalData.maritalStatus || employee.maritalStatus || null) as MaritalStatus | null,
  hasChildren:
    typeof personalData.hasChildren === 'boolean'
      ? personalData.hasChildren
      : Boolean(employee.hasChildren),
});

const getPortalExpectedDocumentTypes = (employee: any, personalData: EmployeePortalPersonalData) =>
  getExpectedDocumentTypes(applyPersonalDataForChecklist(employee, personalData))
    .filter((docType) => !EMPLOYEE_PORTAL_EXCLUDED_DOCUMENT_TYPES.has(docType));

const buildChecklist = (
  employee: any,
  submission: EmployeePortalSubmission | null,
  portalDocuments: EmployeePortalSubmissionDocument[],
  officialDocuments: any[]
): EmployeePortalChecklistItem[] => {
  const expected = getPortalExpectedDocumentTypes(employee, submission?.personalData || {});
  const officialByType = new Map<string, any>();
  for (const doc of officialDocuments) {
    if (!doc.isActive || doc.docType === 'OUTRO') continue;
    if (!officialByType.has(doc.docType)) officialByType.set(doc.docType, doc);
  }

  const latestPortalByType = new Map<string, EmployeePortalSubmissionDocument>();
  for (const doc of portalDocuments) {
    if (doc.docType === 'OUTRO') continue;
    if (doc.status === 'REMOVED_BY_COLLABORATOR' || doc.status === 'REPLACED_BY_COLLABORATOR') continue;
    if (!latestPortalByType.has(doc.docType)) latestPortalByType.set(doc.docType, doc);
  }

  return expected.map((docType) => {
    const meta = EMPLOYEE_DOCUMENT_TYPE_MAP.get(docType);
    const officialDocument = officialByType.get(docType) || null;
    const portalDocument = latestPortalByType.get(docType) || null;
    let status: EmployeePortalChecklistItem['status'] = 'PENDING';

    if (portalDocument?.status === 'APPROVED') status = 'APPROVED';
    else if (portalDocument?.status === 'REJECTED') status = 'REJECTED';
    else if (portalDocument?.status === 'PENDING') {
      status = submission?.status === 'DRAFT' || submission?.status === 'CHANGES_REQUESTED'
        ? 'DRAFT'
        : 'PENDING_REVIEW';
    } else if (officialDocument) status = 'OFFICIAL';

    return {
      docType,
      label: meta?.label || docType,
      status,
      required: !meta?.optional,
      officialDocument,
      portalDocument,
    };
  });
};

export const getEmployeePortalOverview = async (
  db: DbInterface,
  employeeId: string
): Promise<EmployeePortalOverview> => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador nao encontrado.', 404);

  const [invites, submission, officialDocuments] = await Promise.all([
    listInvites(db, employeeId),
    getLatestSubmission(db, employeeId),
    listEmployeeDocuments(db, employeeId),
  ]);
  const activeInvite = await getActiveInvite(db, employeeId);
  const documents = submission ? await listSubmissionDocuments(db, submission.id) : [];
  const checklist = buildChecklist(employee, submission, documents, officialDocuments);

  return {
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      cpf: employee.cpf,
      birthDate: employee.birthDate,
      email: employee.email,
      phone: employee.phone,
      employmentRegime: employee.employmentRegime,
      status: employee.status,
      rg: employee.rg,
      street: employee.street,
      streetNumber: employee.streetNumber,
      addressComplement: employee.addressComplement,
      district: employee.district,
      city: employee.city,
      stateUf: employee.stateUf,
      zipCode: employee.zipCode,
      educationInstitution: employee.educationInstitution,
      educationLevel: employee.educationLevel,
      courseName: employee.courseName,
      currentSemester: employee.currentSemester,
      maritalStatus: employee.maritalStatus,
      hasChildren: employee.hasChildren,
      childrenCount: employee.childrenCount,
      bankName: employee.bankName,
      bankAgency: employee.bankAgency,
      bankAccount: employee.bankAccount,
      pixKey: employee.pixKey,
    },
    activeInvite,
    invites,
    submission,
    documents,
    officialDocuments,
    checklist,
    pendingCount: checklist.filter((item) => item.status === 'PENDING' || item.status === 'DRAFT').length,
    rejectedCount: checklist.filter((item) => item.status === 'REJECTED').length,
    approvedCount: checklist.filter((item) => ['APPROVED', 'OFFICIAL'].includes(item.status)).length,
  };
};

export const buildPortalInviteUrl = (baseUrl: string, token: string) => {
  const normalizedBase = clean(baseUrl).replace(/\/+$/g, '');
  const target = normalizedBase || '/';
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}convite=${encodeURIComponent(token)}`;
};

export const createEmployeePortalInvite = async (
  db: DbInterface,
  employeeId: string,
  actorUserId: string,
  baseUrl: string
) => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador nao encontrado.', 404);
  if (!normalizeCpf(employee.cpf)) throw new EmployeePortalError('Informe o CPF do colaborador antes de gerar o convite.');
  if (!employee.birthDate) throw new EmployeePortalError('Informe a data de nascimento antes de gerar o convite.');

  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_invites
    SET status = 'REVOKED', revoked_by = ?, revoked_at = ?
    WHERE employee_id = ? AND status = 'ACTIVE' AND revoked_at IS NULL
    `,
    [actorUserId, now, employeeId]
  );

  const token = generatePortalToken();
  const tokenHash = hashPortalToken(token);
  const id = randomUUID();
  const expiresAt = addDaysIso(now, EMPLOYEE_PORTAL_INVITE_TTL_DAYS);

  await db.execute(
    `
    INSERT INTO employee_portal_invites (
      id, employee_id, token_hash, status, expires_at, created_by, created_at,
      attempt_count
    ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, 0)
    `,
    [id, employeeId, tokenHash, expiresAt, actorUserId, now]
  );

  await insertAudit(db, 'EMPLOYEE_PORTAL_INVITE_CREATED', actorUserId, employeeId, {
    inviteId: id,
    expiresAt,
  });

  const invite = (await listInvites(db, employeeId)).find((item) => item.id === id);
  if (!invite) throw new EmployeePortalError('Falha ao carregar convite criado.', 500);
  return {
    invite,
    token,
    url: buildPortalInviteUrl(baseUrl, token),
  };
};

export const revokeEmployeePortalInvite = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string,
  actorUserId: string
) => {
  await ensureEmployeePortalTables(db);
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_invites
    SET status = 'REVOKED', revoked_by = ?, revoked_at = ?
    WHERE id = ? AND employee_id = ?
    `,
    [actorUserId, now, inviteId, employeeId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_INVITE_REVOKED', actorUserId, employeeId, { inviteId });
  return getEmployeePortalOverview(db, employeeId);
};

const registerFailedInviteAttempt = async (db: DbInterface, invite: EmployeePortalInvite) => {
  const nextAttemptCount = invite.attemptCount + 1;
  const lockedUntil = nextAttemptCount >= EMPLOYEE_PORTAL_MAX_ATTEMPTS
    ? addMinutesIso(NOW(), EMPLOYEE_PORTAL_LOCK_MINUTES)
    : null;
  await db.execute(
    `
    UPDATE employee_portal_invites
    SET attempt_count = ?, locked_until = ?, status = CASE WHEN ? IS NULL THEN status ELSE 'LOCKED' END
    WHERE id = ?
    `,
    [nextAttemptCount, lockedUntil, lockedUntil, invite.id]
  );
};

export const authenticateEmployeePortal = async (
  db: DbInterface,
  payload: { token: string; cpf: string; birthDate: string },
  context: { ipAddress?: string | null; userAgent?: string | null }
) => {
  await ensureEmployeePortalTables(db);
  const tokenHash = hashPortalToken(payload.token);
  const rows = await db.query(
    `SELECT * FROM employee_portal_invites WHERE token_hash = ? LIMIT 1`,
    [tokenHash]
  );
  const invite = rows[0] ? mapInvite(rows[0]) : null;
  const genericError = new EmployeePortalError('Nao foi possivel validar o acesso. Confira os dados ou fale com o RH.', 401);
  const now = NOW();

  if (!invite) throw genericError;
  if (invite.status === 'REVOKED' || invite.revokedAt || invite.expiresAt <= now) throw genericError;
  if (invite.lockedUntil && invite.lockedUntil > now) throw genericError;

  const employee = await getEmployeeById(db, invite.employeeId);
  if (!employee) throw genericError;

  const inputCpf = normalizeCpf(payload.cpf);
  const employeeCpf = normalizeCpf(employee.cpf);
  const inputBirth = parseDate(payload.birthDate);
  const employeeBirth = parseDate(employee.birthDate);

  if (!inputCpf || inputCpf !== employeeCpf || !inputBirth || inputBirth !== employeeBirth) {
    await registerFailedInviteAttempt(db, invite);
    await insertAudit(db, 'EMPLOYEE_PORTAL_LOGIN_FAILED', `portal:${invite.employeeId}`, invite.employeeId, {
      inviteId: invite.id,
    });
    throw genericError;
  }

  const sessionToken = generatePortalToken();
  const sessionHash = hashPortalToken(sessionToken);
  const sessionId = randomUUID();
  const expiresAt = addHoursIso(now, EMPLOYEE_PORTAL_SESSION_TTL_HOURS);

  await db.execute(
    `
    INSERT INTO employee_portal_sessions (
      id, employee_id, invite_id, session_hash, created_at, expires_at,
      ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      sessionId,
      employee.id,
      invite.id,
      sessionHash,
      now,
      expiresAt,
      clean(context.ipAddress) || null,
      clean(context.userAgent) || null,
    ]
  );

  await db.execute(
    `
    UPDATE employee_portal_invites
    SET last_used_at = ?, attempt_count = 0, locked_until = NULL, status = 'ACTIVE'
    WHERE id = ?
    `,
    [now, invite.id]
  );

  await insertAudit(db, 'EMPLOYEE_PORTAL_LOGIN_SUCCESS', `portal:${employee.id}`, employee.id, {
    inviteId: invite.id,
    sessionId,
  });

  return {
    sessionToken,
    session: {
      id: sessionId,
      employeeId: employee.id,
      inviteId: invite.id,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      ipAddress: clean(context.ipAddress) || null,
      userAgent: clean(context.userAgent) || null,
    } satisfies EmployeePortalSession,
  };
};

export const getEmployeePortalSessionByToken = async (
  db: DbInterface,
  sessionToken: string
): Promise<EmployeePortalSession | null> => {
  await ensureEmployeePortalTables(db);
  const token = clean(sessionToken);
  if (!token) return null;
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_sessions
    WHERE session_hash = ? AND revoked_at IS NULL
    LIMIT 1
    `,
    [hashPortalToken(token)]
  );
  const session = rows[0] ? mapSession(rows[0]) : null;
  if (!session) return null;
  if (session.expiresAt <= NOW()) return null;
  return session;
};

export const revokeEmployeePortalSession = async (
  db: DbInterface,
  sessionToken: string
) => {
  await ensureEmployeePortalTables(db);
  const token = clean(sessionToken);
  if (!token) return;
  await db.execute(
    `UPDATE employee_portal_sessions SET revoked_at = ? WHERE session_hash = ?`,
    [NOW(), hashPortalToken(token)]
  );
};

export const savePortalPersonalDraft = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string | null,
  payload: any
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getEditableSubmission(db, employeeId, inviteId);
  const currentData = submission.personalData || {};
  const nextData = {
    ...currentData,
    ...normalizePersonalData(payload),
  };
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET personal_data_json = ?, personal_status = 'DRAFT', personal_rejection_reason = NULL, updated_at = ?
    WHERE id = ?
    `,
    [JSON.stringify(nextData), now, submission.id]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_PERSONAL_DRAFT_SAVED', `portal:${employeeId}`, employeeId, {
    submissionId: submission.id,
  });
  return getEmployeePortalOverview(db, employeeId);
};

export const createPortalSubmissionDocument = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string | null,
  input: CreatePortalDocumentInput
) => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador nao encontrado.', 404);

  const submission = await getEditableSubmission(db, employeeId, inviteId);
  const docType = upper(input.docType) as EmployeeDocumentTypeCode;
  const allowedTypes = new Set(getPortalExpectedDocumentTypes(employee, submission.personalData || {}));
  allowedTypes.add('OUTRO');
  if (!allowedTypes.has(docType) || EMPLOYEE_PORTAL_EXCLUDED_DOCUMENT_TYPES.has(docType)) {
    throw new EmployeePortalError('Documento nao solicitado para este portal.');
  }

  const typeDef = EMPLOYEE_DOCUMENT_TYPE_MAP.get(docType);
  const issueDate = parseDate(input.issueDate);
  const expiresAt = parseDate(input.expiresAt);
  if (typeDef?.hasIssueDate && !issueDate) throw new EmployeePortalError('Este documento exige data de emissao.');
  if (typeDef?.hasExpiration && !expiresAt) throw new EmployeePortalError('Este documento exige data de vencimento.');

  const now = NOW();
  if (docType !== 'OUTRO') {
    await db.execute(
      `
      UPDATE employee_portal_submission_documents
      SET status = 'REPLACED_BY_COLLABORATOR', updated_at = ?
      WHERE submission_id = ? AND doc_type = ? AND status IN ('PENDING', 'REJECTED')
      `,
      [now, submission.id, docType]
    );
  }

  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO employee_portal_submission_documents (
      id, submission_id, employee_id, doc_type, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, checksum, issue_date, expires_at, notes,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `,
    [
      id,
      submission.id,
      employeeId,
      docType,
      clean(input.storageProvider),
      clean(input.storageBucket) || null,
      clean(input.storageKey),
      clean(input.originalName),
      clean(input.mimeType),
      Number(input.sizeBytes || 0),
      clean(input.checksum) || null,
      issueDate,
      expiresAt,
      clean(input.notes) || null,
      now,
      now,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_PORTAL_DOCUMENT_UPLOADED', `portal:${employeeId}`, employeeId, {
    submissionId: submission.id,
    documentId: id,
    docType,
  });
  return getEmployeePortalOverview(db, employeeId);
};

export const removePortalSubmissionDocument = async (
  db: DbInterface,
  employeeId: string,
  documentId: string
) => {
  await ensureEmployeePortalTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_submission_documents
    WHERE id = ? AND employee_id = ?
    LIMIT 1
    `,
    [documentId, employeeId]
  );
  const document = rows[0] ? mapSubmissionDocument(rows[0]) : null;
  if (!document) throw new EmployeePortalError('Documento nao encontrado.', 404);
  if (document.status === 'APPROVED') throw new EmployeePortalError('Documento aprovado nao pode ser removido pelo portal.', 409);

  await db.execute(
    `
    UPDATE employee_portal_submission_documents
    SET status = 'REMOVED_BY_COLLABORATOR', updated_at = ?
    WHERE id = ?
    `,
    [NOW(), document.id]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_DOCUMENT_REMOVED', `portal:${employeeId}`, employeeId, {
    documentId: document.id,
    docType: document.docType,
  });
  return getEmployeePortalOverview(db, employeeId);
};

export const submitPortalSubmissionForReview = async (
  db: DbInterface,
  employeeId: string,
  consentLgpd: boolean
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getLatestSubmission(db, employeeId);
  if (!submission || !['DRAFT', 'CHANGES_REQUESTED'].includes(submission.status)) {
    throw new EmployeePortalError('Nao ha rascunho liberado para envio.', 409);
  }
  if (!consentLgpd) throw new EmployeePortalError('Aceite a declaracao de privacidade para enviar.');

  const overview = await getEmployeePortalOverview(db, employeeId);
  const missing = overview.checklist.filter((item) => item.status === 'PENDING');
  if (missing.length > 0) {
    throw new EmployeePortalError(`Ainda existem documentos pendentes: ${missing.map((item) => item.label).join(', ')}.`);
  }

  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET status = 'SUBMITTED', personal_status = 'PENDING_REVIEW',
      consent_lgpd = 1, consent_lgpd_at = ?, submitted_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [now, now, now, submission.id]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_SUBMISSION_SENT', `portal:${employeeId}`, employeeId, {
    submissionId: submission.id,
  });
  return getEmployeePortalOverview(db, employeeId);
};

const getSubmissionById = async (db: DbInterface, submissionId: string): Promise<EmployeePortalSubmission | null> => {
  const rows = await db.query(
    `SELECT * FROM employee_portal_submissions WHERE id = ? LIMIT 1`,
    [submissionId]
  );
  return rows[0] ? mapSubmission(rows[0]) : null;
};

export const getPortalSubmissionDocumentById = async (
  db: DbInterface,
  documentId: string
): Promise<EmployeePortalSubmissionDocument | null> => {
  await ensureEmployeePortalTables(db);
  const rows = await db.query(
    `SELECT * FROM employee_portal_submission_documents WHERE id = ? LIMIT 1`,
    [documentId]
  );
  return rows[0] ? mapSubmissionDocument(rows[0]) : null;
};

const maybeFinishSubmission = async (
  db: DbInterface,
  submissionId: string,
  actorUserId: string
) => {
  const submission = await getSubmissionById(db, submissionId);
  if (!submission) return null;
  const overview = await getEmployeePortalOverview(db, submission.employeeId);
  const hasRejected = overview.documents.some((doc) => doc.status === 'REJECTED') || submission.personalStatus === 'REJECTED';
  const hasPending = overview.documents.some((doc) => doc.status === 'PENDING') || submission.personalStatus === 'PENDING_REVIEW';
  const allDocsResolved = overview.checklist.every((item) => ['APPROVED', 'OFFICIAL'].includes(item.status));
  const now = NOW();
  let nextStatus: EmployeePortalSubmissionStatus = submission.status;

  if (hasRejected) nextStatus = 'CHANGES_REQUESTED';
  else if (!hasPending && submission.personalStatus === 'APPROVED' && allDocsResolved) nextStatus = 'APPROVED';
  else if (submission.status !== 'DRAFT') nextStatus = 'PARTIALLY_APPROVED';

  if (nextStatus !== submission.status) {
    await db.execute(
      `
      UPDATE employee_portal_submissions
      SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
      `,
      [nextStatus, actorUserId, now, now, submissionId]
    );
  }

  return getSubmissionById(db, submissionId);
};

export const approvePortalPersonalData = async (
  db: DbInterface,
  submissionId: string,
  actorUserId: string
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getSubmissionById(db, submissionId);
  if (!submission) throw new EmployeePortalError('Submissao nao encontrada.', 404);
  const employee = await getEmployeeById(db, submission.employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador nao encontrado.', 404);
  const data = normalizePersonalData(submission.personalData || {});
  const assignments: string[] = [];
  const values: any[] = [];

  const add = (column: string, value: any) => {
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  if ('fullName' in data) add('full_name', clean(data.fullName) || employee.fullName);
  if ('rg' in data) add('rg', clean(data.rg) || null);
  if ('email' in data) add('email', clean(data.email) || null);
  if ('phone' in data) add('phone', clean(data.phone) || null);
  if ('street' in data) add('street', clean(data.street) || null);
  if ('streetNumber' in data) add('street_number', clean(data.streetNumber) || null);
  if ('addressComplement' in data) add('address_complement', clean(data.addressComplement) || null);
  if ('district' in data) add('district', clean(data.district) || null);
  if ('city' in data) add('city', clean(data.city) || null);
  if ('stateUf' in data) add('state_uf', clean(data.stateUf).toUpperCase() || null);
  if ('zipCode' in data) add('zip_code', clean(data.zipCode) || null);
  if ('educationInstitution' in data) add('education_institution', clean(data.educationInstitution) || null);
  if ('educationLevel' in data) add('education_level', clean(data.educationLevel) as EducationLevel || null);
  if ('courseName' in data) add('course_name', clean(data.courseName) || null);
  if ('currentSemester' in data) add('current_semester', clean(data.currentSemester) || null);
  if ('maritalStatus' in data) add('marital_status', clean(data.maritalStatus) as MaritalStatus || null);
  if ('hasChildren' in data) add('has_children', bool(data.hasChildren) ? 1 : 0);
  if ('childrenCount' in data) add('children_count', Math.max(0, Math.trunc(Number(data.childrenCount || 0))));
  if ('bankName' in data) add('bank_name', clean(data.bankName) || null);
  if ('bankAgency' in data) add('bank_agency', clean(data.bankAgency) || null);
  if ('bankAccount' in data) add('bank_account', clean(data.bankAccount) || null);
  if ('pixKey' in data) add('pix_key', clean(data.pixKey) || null);

  const now = NOW();
  if (assignments.length > 0) {
    assignments.push('updated_at = ?');
    values.push(now);
    values.push(submission.employeeId);
    await db.execute(
      `
      UPDATE employees
      SET ${assignments.join(', ')}
      WHERE id = ?
      `,
      values
    );
  }

  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET personal_status = 'APPROVED', personal_rejection_reason = NULL,
      reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, now, now, submissionId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_PERSONAL_APPROVED', actorUserId, submission.employeeId, {
    submissionId,
    fields: Object.keys(data),
  });
  await maybeFinishSubmission(db, submissionId, actorUserId);
  return getEmployeePortalOverview(db, submission.employeeId);
};

export const rejectPortalPersonalData = async (
  db: DbInterface,
  submissionId: string,
  actorUserId: string,
  reason: string
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getSubmissionById(db, submissionId);
  if (!submission) throw new EmployeePortalError('Submissao nao encontrada.', 404);
  const rejectionReason = clean(reason);
  if (!rejectionReason) throw new EmployeePortalError('Informe o motivo da rejeicao.');
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET status = 'CHANGES_REQUESTED', personal_status = 'REJECTED',
      personal_rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [rejectionReason, actorUserId, now, now, submissionId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_PERSONAL_REJECTED', actorUserId, submission.employeeId, {
    submissionId,
    reason: rejectionReason,
  });
  return getEmployeePortalOverview(db, submission.employeeId);
};

export const approvePortalDocument = async (
  db: DbInterface,
  documentId: string,
  actorUserId: string
) => {
  await ensureEmployeePortalTables(db);
  const document = await getPortalSubmissionDocumentById(db, documentId);
  if (!document) throw new EmployeePortalError('Documento nao encontrado.', 404);
  if (document.status !== 'PENDING') throw new EmployeePortalError('Apenas documentos pendentes podem ser aprovados.', 409);

  const created = await createEmployeeDocumentRecord(
    db,
    document.employeeId,
    {
      docType: document.docType,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      issueDate: document.issueDate,
      expiresAt: document.expiresAt,
      notes: document.notes,
      storageProvider: document.storageProvider,
      storageBucket: document.storageBucket,
      storageKey: document.storageKey,
      uploadedBy: `portal:${document.employeeId}`,
    },
    actorUserId
  );

  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submission_documents
    SET status = 'APPROVED', rejection_reason = NULL, reviewed_by = ?, reviewed_at = ?,
      promoted_document_id = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, now, created.id, now, documentId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_DOCUMENT_APPROVED', actorUserId, document.employeeId, {
    submissionId: document.submissionId,
    documentId,
    promotedDocumentId: created.id,
    docType: document.docType,
  });
  await maybeFinishSubmission(db, document.submissionId, actorUserId);
  return getEmployeePortalOverview(db, document.employeeId);
};

export const rejectPortalDocument = async (
  db: DbInterface,
  documentId: string,
  actorUserId: string,
  reason: string
) => {
  await ensureEmployeePortalTables(db);
  const document = await getPortalSubmissionDocumentById(db, documentId);
  if (!document) throw new EmployeePortalError('Documento nao encontrado.', 404);
  const rejectionReason = clean(reason);
  if (!rejectionReason) throw new EmployeePortalError('Informe o motivo da rejeicao.');
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submission_documents
    SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [rejectionReason, actorUserId, now, now, documentId]
  );
  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET status = 'CHANGES_REQUESTED', reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, now, now, document.submissionId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_DOCUMENT_REJECTED', actorUserId, document.employeeId, {
    submissionId: document.submissionId,
    documentId,
    docType: document.docType,
    reason: rejectionReason,
  });
  return getEmployeePortalOverview(db, document.employeeId);
};

export const requestPortalSubmissionChanges = async (
  db: DbInterface,
  submissionId: string,
  actorUserId: string,
  notes: string | null
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getSubmissionById(db, submissionId);
  if (!submission) throw new EmployeePortalError('Submissao nao encontrada.', 404);
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_submissions
    SET status = 'CHANGES_REQUESTED', review_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [clean(notes) || null, actorUserId, now, now, submissionId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_CHANGES_REQUESTED', actorUserId, submission.employeeId, {
    submissionId,
    notes: clean(notes) || null,
  });
  return getEmployeePortalOverview(db, submission.employeeId);
};

export const validatePortalDocumentType = (docTypeRaw: string): EmployeeDocumentTypeCode => {
  const docType = upper(docTypeRaw) as EmployeeDocumentTypeCode;
  const allowed = new Set(EMPLOYEE_DOCUMENT_TYPES.map((item) => item.code));
  if (!allowed.has(docType)) throw new EmployeePortalError('Tipo de documento invalido.');
  return docType;
};
