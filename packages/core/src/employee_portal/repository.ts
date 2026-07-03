import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { compare } from 'bcryptjs';
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
  EMPLOYEE_PORTAL_PRODUCTION_EDIT_WINDOW_DAYS,
  EMPLOYEE_PORTAL_SESSION_TTL_HOURS,
} from './constants';
import {
  createOrRotatePortalCredential,
  ensureEmployeeUserAccount,
  getLatestPortalCredential,
  getLinkedUserByEmployeeId,
  markPortalCredentialAsViewed,
} from '../user_accounts';
import type {
  CreatePortalDocumentInput,
  EmployeePortalChecklistItem,
  EmployeePortalDocumentStatus,
  EmployeePortalInvite,
  EmployeePortalInviteStatus,
  EmployeePortalProductionDashboard,
  EmployeePortalProductionDashboardFilters,
  EmployeePortalProductionDaySummary,
  EmployeePortalProductionEntry,
  EmployeePortalProductionEntryType,
  EmployeePortalProductionLast7DaysSummary,
  EmployeePortalProductionMatchStatus,
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
const nowDate = () => NOW().slice(0, 10);
const clean = (value: any) => String(value ?? '').trim();
const upper = (value: any) => clean(value).toUpperCase();
const lower = (value: any) => clean(value).toLowerCase();
const bool = (value: any) =>
  value === true ||
  value === 1 ||
  String(value) === '1' ||
  String(value ?? '').toLowerCase() === 'true';

const normalizeCpf = (value: any) => clean(value).replace(/\D/g, '').slice(0, 11);
const normalizePatientName = (value: any) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const formatSaoPauloDate = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

const getEditablePortalProductionDates = () => {
  const today = new Date();
  const dates: string[] = [];
  for (let offset = 0; offset < EMPLOYEE_PORTAL_PRODUCTION_EDIT_WINDOW_DAYS; offset += 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - offset);
    dates.push(formatSaoPauloDate(current));
  }
  return dates;
};

const getRecentPortalProductionDates = (days = 7) => {
  const today = new Date();
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - offset);
    dates.push(formatSaoPauloDate(current));
  }
  return dates;
};

const isWithinPortalProductionEditWindow = (serviceDate: string | null | undefined) =>
  Boolean(serviceDate && getEditablePortalProductionDates().includes(String(serviceDate).slice(0, 10)));

const normalizePortalProductionEntryTypeFilter = (value: any): EmployeePortalProductionDashboardFilters['entryType'] => {
  const normalized = upper(value);
  return normalized === 'RESOLVE' || normalized === 'CHECKUP' ? normalized : 'ALL';
};

const normalizePortalProductionMatchStatusFilter = (value: any): EmployeePortalProductionDashboardFilters['matchStatus'] => {
  const normalized = upper(value);
  return ['MATCHED', 'NO_MATCH', 'MULTIPLE_MATCHES', 'PENDING_MATCH'].includes(normalized)
    ? (normalized as EmployeePortalProductionDashboardFilters['matchStatus'])
    : 'ALL';
};

const normalizePortalProductionServiceDateFilter = (value: any, availableDates: string[]) => {
  const normalized = parseDate(value);
  return normalized && availableDates.includes(normalized) ? normalized : null;
};

const normalizePhone = (value: any): string | null => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return null;
  if (digits.length < 10) throw new EmployeePortalError('Telefone inválido. Use DDD + número.');
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

const portalEncryptionKey = () => createHash('sha256').update(portalSecret()).digest();

const encryptPortalToken = (token: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', portalEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
};

const decryptPortalToken = (encryptedToken: unknown): string | null => {
  const raw = clean(encryptedToken);
  if (!raw) return null;
  const [version, ivRaw, tagRaw, encryptedRaw] = raw.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) return null;

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      portalEncryptionKey(),
      Buffer.from(ivRaw, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

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
      token_encrypted TEXT NULL,
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_production_entries (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      employee_name_snapshot VARCHAR(180) NOT NULL,
      service_date DATE NOT NULL,
      entry_type VARCHAR(20) NOT NULL,
      patient_name_raw VARCHAR(180) NOT NULL,
      patient_name_normalized VARCHAR(180) NOT NULL,
      match_status VARCHAR(30) NOT NULL,
      feegow_patient_id BIGINT NULL,
      feegow_patient_name VARCHAR(180) NULL,
      team_snapshot VARCHAR(120) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE employee_portal_submissions ADD COLUMN personal_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_submissions ADD COLUMN personal_rejection_reason TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_invites ADD COLUMN token_encrypted TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN employee_name_snapshot VARCHAR(180) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN patient_name_normalized VARCHAR(180) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN match_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_MATCH'`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN feegow_patient_id BIGINT NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN feegow_patient_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN team_snapshot VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE employee_portal_production_entries ADD COLUMN deleted_at TEXT NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_invites_employee ON employee_portal_invites (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_invites_status ON employee_portal_invites (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_sessions_employee ON employee_portal_sessions (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submissions_employee ON employee_portal_submissions (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submission_documents_submission ON employee_portal_submission_documents (submission_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_submission_documents_employee ON employee_portal_submission_documents (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_production_entries_employee_date ON employee_portal_production_entries (employee_id, service_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_production_entries_match_status ON employee_portal_production_entries (match_status, service_date)`);

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

const mapInvite = (row: any, baseUrl?: string): EmployeePortalInvite => {
  const token = baseUrl ? decryptPortalToken(row.token_encrypted) : null;
  return {
    id: clean(row.id),
    employeeId: clean(row.employee_id),
    status: upper(row.status || 'ACTIVE') as EmployeePortalInviteStatus,
    url: token ? buildPortalInviteUrl(baseUrl || '', token) : null,
    expiresAt: clean(row.expires_at),
    createdBy: clean(row.created_by),
    createdAt: clean(row.created_at),
    revokedBy: clean(row.revoked_by) || null,
    revokedAt: clean(row.revoked_at) || null,
    lastUsedAt: clean(row.last_used_at) || null,
    attemptCount: Number(row.attempt_count || 0),
    lockedUntil: clean(row.locked_until) || null,
  };
};

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

const mapProductionEntry = (row: any): EmployeePortalProductionEntry => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  employeeName: clean(row.employee_name_snapshot),
  serviceDate: parseDate(row.service_date) || clean(row.service_date),
  entryType: upper(row.entry_type) as EmployeePortalProductionEntryType,
  patientNameRaw: clean(row.patient_name_raw),
  patientNameNormalized: clean(row.patient_name_normalized),
  matchStatus: upper(row.match_status || 'PENDING_MATCH') as EmployeePortalProductionMatchStatus,
  feegowPatientId: Number.isFinite(Number(row.feegow_patient_id)) ? Number(row.feegow_patient_id) : null,
  feegowPatientName: clean(row.feegow_patient_name) || null,
  teamSnapshot: clean(row.team_snapshot) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
  deletedAt: clean(row.deleted_at) || null,
  canEdit: isWithinPortalProductionEditWindow(parseDate(row.service_date) || clean(row.service_date)) && !clean(row.deleted_at),
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

const listRecentProductionEntries = async (
  db: DbInterface,
  employeeId: string
): Promise<EmployeePortalProductionEntry[]> => {
  const editableDates = getEditablePortalProductionDates();
  const placeholders = editableDates.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_production_entries
    WHERE employee_id = ?
      AND deleted_at IS NULL
      AND service_date IN (${placeholders})
    ORDER BY service_date DESC, created_at DESC
    `,
    [employeeId, ...editableDates]
  );
  return rows.map(mapProductionEntry);
};

export const listEmployeePortalProductionEntries = async (
  db: DbInterface,
  employeeId: string,
  options?: { limit?: number }
) => {
  await ensureEmployeePortalTables(db);
  const limit = Math.max(1, Math.min(Number(options?.limit || 100), 500));
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_production_entries
    WHERE employee_id = ? AND deleted_at IS NULL
    ORDER BY service_date DESC, created_at DESC
    LIMIT ${limit}
    `,
    [employeeId]
  );
  return rows.map(mapProductionEntry);
};

const getProductionEntryById = async (db: DbInterface, entryId: string, employeeId: string) => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_production_entries
    WHERE id = ? AND employee_id = ? AND deleted_at IS NULL
    LIMIT 1
    `,
    [entryId, employeeId]
  );
  return rows[0] ? mapProductionEntry(rows[0]) : null;
};

const buildProductionDaySummary = (
  date: string,
  entries: EmployeePortalProductionEntry[]
): EmployeePortalProductionDaySummary => {
  const dayEntries = entries.filter((entry) => entry.serviceDate === date);
  return {
    date,
    resolveCount: dayEntries.filter((entry) => entry.entryType === 'RESOLVE' && entry.matchStatus === 'MATCHED').length,
    checkupCount: dayEntries.filter((entry) => entry.entryType === 'CHECKUP' && entry.matchStatus === 'MATCHED').length,
    matchedCount: dayEntries.filter((entry) => entry.matchStatus === 'MATCHED').length,
    pendingMatchCount: dayEntries.filter((entry) => entry.matchStatus !== 'MATCHED').length,
    totalCount: dayEntries.length,
  };
};

const buildProductionLast7DaysSummary = (
  dates: string[],
  entries: EmployeePortalProductionEntry[]
): EmployeePortalProductionLast7DaysSummary => {
  const periodEntries = entries.filter((entry) => dates.includes(entry.serviceDate));
  return {
    startDate: dates[dates.length - 1] || nowDate(),
    endDate: dates[0] || nowDate(),
    resolveMatchedCount: periodEntries.filter((entry) => entry.entryType === 'RESOLVE' && entry.matchStatus === 'MATCHED').length,
    checkupMatchedCount: periodEntries.filter((entry) => entry.entryType === 'CHECKUP' && entry.matchStatus === 'MATCHED').length,
    matchedCount: periodEntries.filter((entry) => entry.matchStatus === 'MATCHED').length,
    pendingMatchCount: periodEntries.filter((entry) => entry.matchStatus !== 'MATCHED').length,
    totalCount: periodEntries.length,
  };
};

export const getEmployeePortalProductionDashboard = async (
  db: DbInterface,
  employeeId: string,
  rawFilters?: {
    serviceDate?: string | null;
    entryType?: string | null;
    matchStatus?: string | null;
  }
): Promise<EmployeePortalProductionDashboard> => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);

  const availableDates = getRecentPortalProductionDates(7);
  const editableDates = getEditablePortalProductionDates();
  const filters: EmployeePortalProductionDashboardFilters = {
    serviceDate: normalizePortalProductionServiceDateFilter(rawFilters?.serviceDate, availableDates),
    entryType: normalizePortalProductionEntryTypeFilter(rawFilters?.entryType),
    matchStatus: normalizePortalProductionMatchStatusFilter(rawFilters?.matchStatus),
  };

  const placeholders = availableDates.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_production_entries
    WHERE employee_id = ?
      AND deleted_at IS NULL
      AND service_date IN (${placeholders})
    ORDER BY service_date DESC, created_at DESC
    `,
    [employeeId, ...availableDates]
  );
  const allEntries = rows.map(mapProductionEntry);
  const entries = allEntries.filter((entry) => {
    if (filters.serviceDate && entry.serviceDate !== filters.serviceDate) return false;
    if (filters.entryType !== 'ALL' && entry.entryType !== filters.entryType) return false;
    if (filters.matchStatus !== 'ALL' && entry.matchStatus !== filters.matchStatus) return false;
    return true;
  });

  return {
    today: buildProductionDaySummary(availableDates[0] || nowDate(), allEntries),
    yesterday: buildProductionDaySummary(availableDates[1] || availableDates[0] || nowDate(), allEntries),
    last7Days: buildProductionLast7DaysSummary(availableDates, allEntries),
    filters,
    editableDates,
    availableDates,
    entries,
  };
};

const getPortalProductionTeamSnapshot = async (db: DbInterface, employee: any) => {
  const rows = await db.query(
    `
    SELECT tm.name
    FROM users u
    INNER JOIN user_teams ut ON ut.user_id = u.id
    INNER JOIN teams_master tm ON tm.id = ut.team_id
    WHERE u.employee_id = ?
    ORDER BY tm.name ASC
    LIMIT 1
    `,
    [clean(employee?.id)]
  );
  return clean(rows?.[0]?.name) || clean(employee?.department) || clean(employee?.units?.[0]) || null;
};

const resolvePortalProductionMatch = async (db: DbInterface, patientName: string) => {
  const normalized = normalizePatientName(patientName);
  if (!normalized) {
    return {
      normalized,
      matchStatus: 'NO_MATCH' as EmployeePortalProductionMatchStatus,
      patientId: null,
      patientName: null,
    };
  }

  const raw = clean(patientName);
  let rows = await db.query(
    `
    SELECT patient_id, nome, nome_social
    FROM feegow_patients
    WHERE UPPER(TRIM(COALESCE(nome, ''))) = UPPER(TRIM(?))
       OR UPPER(TRIM(COALESCE(nome_social, ''))) = UPPER(TRIM(?))
    LIMIT 20
    `,
    [raw, raw]
  ).catch(() => []);

  if (!rows.length) {
    const tokens = normalized.split(' ').filter((token) => token.length >= 2).slice(0, 3);
    if (tokens.length > 0) {
      const where = tokens
        .map(() => `(UPPER(COALESCE(nome, '')) LIKE UPPER(?) OR UPPER(COALESCE(nome_social, '')) LIKE UPPER(?))`)
        .join(' AND ');
      const params = tokens.flatMap((token) => [`%${token}%`, `%${token}%`]);
      rows = await db.query(
        `
        SELECT patient_id, nome, nome_social
        FROM feegow_patients
        WHERE ${where}
        LIMIT 50
        `,
        params
      ).catch(() => []);
    }
  }

  const exactMatches = (rows as any[]).filter((row) => {
    const names = [row?.nome, row?.nome_social].map(normalizePatientName).filter(Boolean);
    return names.includes(normalized);
  });

  if (exactMatches.length === 1) {
    return {
      normalized,
      matchStatus: 'MATCHED' as EmployeePortalProductionMatchStatus,
      patientId: Number(exactMatches[0].patient_id || 0) || null,
      patientName: clean(exactMatches[0].nome) || clean(exactMatches[0].nome_social) || raw,
    };
  }

  if (exactMatches.length > 1) {
    return {
      normalized,
      matchStatus: 'MULTIPLE_MATCHES' as EmployeePortalProductionMatchStatus,
      patientId: null,
      patientName: null,
    };
  }

  return {
    normalized,
    matchStatus: 'NO_MATCH' as EmployeePortalProductionMatchStatus,
    patientId: null,
    patientName: null,
  };
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
  return rows.map((row) => mapInvite(row));
};

const getLatestInvite = async (db: DbInterface, employeeId: string): Promise<EmployeePortalInvite | null> => {
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_invites
    WHERE employee_id = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [employeeId]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
};

const getActiveInvite = async (
  db: DbInterface,
  employeeId: string,
  baseUrl?: string
): Promise<EmployeePortalInvite | null> => {
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
  const invite = rows[0] ? mapInvite(rows[0], baseUrl) : null;
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
  if (!created) throw new EmployeePortalError('Falha ao criar submissão do portal.', 500);
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
  throw new EmployeePortalError('A submissão já foi enviada e aguarda revisão do DP.', 409);
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
          throw new EmployeePortalError('E-mail inválido.');
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
          throw new EmployeePortalError('Nível de escolaridade inválido.');
        }
        data[field] = level || null;
        break;
      }
      case 'maritalStatus': {
        const status = upper(value);
        if (status && !['SOLTEIRO', 'CASADO', 'UNIAO_ESTAVEL', 'DIVORCIADO', 'VIUVO'].includes(status)) {
          throw new EmployeePortalError('Estado civil inválido.');
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
  employeeId: string,
  baseUrl?: string
): Promise<EmployeePortalOverview> => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);

  const [invites, submission, officialDocuments, linkedUser, latestCredential, productionEntries] = await Promise.all([
    listInvites(db, employeeId),
    getLatestSubmission(db, employeeId),
    listEmployeeDocuments(db, employeeId),
    getLinkedUserByEmployeeId(db, employeeId),
    getLatestPortalCredential(db, employeeId),
    listRecentProductionEntries(db, employeeId),
  ]);
  const activeInvite = await getActiveInvite(db, employeeId, baseUrl);
  const documents = submission ? await listSubmissionDocuments(db, submission.id) : [];
  const checklist = buildChecklist(employee, submission, documents, officialDocuments);
  const editableDates = getEditablePortalProductionDates();
  const todaySummary = buildProductionDaySummary(editableDates[0] || nowDate(), productionEntries);
  const yesterdaySummary = buildProductionDaySummary(editableDates[1] || editableDates[0] || nowDate(), productionEntries);
  const intranetBaseUrl = clean(process.env.INTRANET_BASE_URL) || clean(process.env.NEXT_PUBLIC_INTRANET_URL) || '/';
  const intranetAccess =
    employee.status === 'ATIVO' &&
    linkedUser &&
    latestCredential &&
    ['PENDING_VIEW', 'VIEWED'].includes(latestCredential.status)
      ? {
          credentialId: latestCredential.id,
          status: latestCredential.status as 'PENDING_VIEW' | 'VIEWED',
          username: linkedUser.username || latestCredential.usernameSnapshot,
          temporaryPassword: latestCredential.status === 'PENDING_VIEW' ? latestCredential.temporaryPassword : null,
          intranetUrl: intranetBaseUrl,
          generatedAt: latestCredential.generatedAt,
          shownAt: latestCredential.shownAt,
        }
      : null;

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
    production: {
      entries: productionEntries,
      today: todaySummary,
      yesterday: yesterdaySummary,
      pendingMatchCount: productionEntries.filter((entry) => entry.matchStatus !== 'MATCHED').length,
      editableDates,
    },
    intranetAccess,
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
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);
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
  const tokenEncrypted = encryptPortalToken(token);
  const id = randomUUID();
  const expiresAt = addDaysIso(now, EMPLOYEE_PORTAL_INVITE_TTL_DAYS);

  await db.execute(
    `
    INSERT INTO employee_portal_invites (
      id, employee_id, token_hash, token_encrypted, status, expires_at, created_by, created_at,
      attempt_count
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, 0)
    `,
    [id, employeeId, tokenHash, tokenEncrypted, expiresAt, actorUserId, now]
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

const createPortalSession = async (
  db: DbInterface,
  employeeId: string,
  inviteId: string,
  context: { ipAddress?: string | null; userAgent?: string | null },
  auditAction: string,
  auditPayload: Record<string, any> | null = null
) => {
  const sessionToken = generatePortalToken();
  const sessionHash = hashPortalToken(sessionToken);
  const sessionId = randomUUID();
  const now = NOW();
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
      employeeId,
      inviteId,
      sessionHash,
      now,
      expiresAt,
      clean(context.ipAddress) || null,
      clean(context.userAgent) || null,
    ]
  );

  await insertAudit(db, auditAction, `portal:${employeeId}`, employeeId, {
    ...(auditPayload || {}),
    sessionId,
  });

  return {
    sessionToken,
    session: {
      id: sessionId,
      employeeId,
      inviteId,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      ipAddress: clean(context.ipAddress) || null,
      userAgent: clean(context.userAgent) || null,
    } satisfies EmployeePortalSession,
  };
};

const ensurePortalCredentialAccess = async (
  db: DbInterface,
  employee: Awaited<ReturnType<typeof getEmployeeById>>,
  actorUserId?: string | null
) => {
  if (!employee || employee.status !== 'ATIVO') {
    return { credentialIssuedNow: false };
  }

  const ensured = await ensureEmployeeUserAccount(db, employee, {
    actorUserId,
    createInitialCredential: true,
  });
  const linkedUser = ensured.user || await getLinkedUserByEmployeeId(db, employee.id);
  if (!linkedUser) {
    return { credentialIssuedNow: false };
  }

  const latestCredential = await getLatestPortalCredential(db, employee.id);
  if (!latestCredential || !['PENDING_VIEW', 'VIEWED'].includes(latestCredential.status)) {
    await createOrRotatePortalCredential(
      db,
      employee.id,
      linkedUser.id,
      linkedUser.username,
      actorUserId || null
    );
    return { credentialIssuedNow: true };
  }

  return { credentialIssuedNow: Boolean(ensured.createdCredential) };
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
  const genericError = new EmployeePortalError('Não foi possível validar o acesso. Confira os dados ou fale com o RH.', 401);
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

  const credentialProvisioning = await ensurePortalCredentialAccess(db, employee, `portal:${employee.id}`);
  const session = await createPortalSession(
    db,
    employee.id,
    invite.id,
    context,
    'EMPLOYEE_PORTAL_LOGIN_SUCCESS',
    {
      inviteId: invite.id,
      credentialIssuedNow: credentialProvisioning.credentialIssuedNow,
    }
  );

  await db.execute(
    `
    UPDATE employee_portal_invites
    SET last_used_at = ?, attempt_count = 0, locked_until = NULL, status = 'ACTIVE'
    WHERE id = ?
    `,
    [now, invite.id]
  );

  return {
    ...session,
    authMethod: 'INVITE' as const,
    credentialIssuedNow: credentialProvisioning.credentialIssuedNow,
  };
};

export const authenticateEmployeePortalWithCredentials = async (
  db: DbInterface,
  payload: { usernameOrEmail: string; password: string },
  context: { ipAddress?: string | null; userAgent?: string | null }
) => {
  await ensureEmployeePortalTables(db);
  const identifier = clean(payload.usernameOrEmail).toLowerCase();
  const password = String(payload.password || '');
  if (!identifier || !password) {
    throw new EmployeePortalError('Informe usuário e senha para continuar.', 400);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM users
    WHERE LOWER(COALESCE(username, '')) = ?
       OR LOWER(COALESCE(email, '')) = ?
    ORDER BY CASE WHEN LOWER(COALESCE(username, '')) = ? THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1
    `,
    [identifier, identifier, identifier]
  );
  const user = rows[0] || null;
  const genericError = new EmployeePortalError('Usuário ou senha inválidos. Confira os dados ou fale com o RH.', 401);

  if (!user) {
    await insertAudit(db, 'EMPLOYEE_PORTAL_CREDENTIAL_LOGIN_FAILED', 'portal:credentials', null, {
      reason: 'user_not_found',
      identifier,
    });
    throw genericError;
  }

  const employeeId = clean(user.employee_id);
  const storedHash = clean(user.password || user.password_hash);

  if (!employeeId || upper(user.status || 'INATIVO') !== 'ATIVO' || !storedHash) {
    await insertAudit(db, 'EMPLOYEE_PORTAL_CREDENTIAL_LOGIN_FAILED', `portal:user:${clean(user.id) || 'unknown'}`, employeeId || null, {
      reason: !employeeId ? 'missing_employee_link' : (!storedHash ? 'missing_password_hash' : 'inactive_user'),
      identifier,
      userId: clean(user.id) || null,
    });
    throw genericError;
  }

  const passwordValid = await compare(password, storedHash);
  if (!passwordValid) {
    await insertAudit(db, 'EMPLOYEE_PORTAL_CREDENTIAL_LOGIN_FAILED', `portal:user:${clean(user.id)}`, employeeId, {
      reason: 'invalid_password',
      identifier,
      userId: clean(user.id),
    });
    throw genericError;
  }

  const employee = await getEmployeeById(db, employeeId);
  if (!employee) {
    await insertAudit(db, 'EMPLOYEE_PORTAL_CREDENTIAL_LOGIN_FAILED', `portal:user:${clean(user.id)}`, employeeId, {
      reason: 'employee_not_found',
      identifier,
      userId: clean(user.id),
    });
    throw genericError;
  }

  const latestInvite = await getLatestInvite(db, employeeId);
  if (!latestInvite) {
    throw new EmployeePortalError('Faça o primeiro acesso com CPF, data de nascimento e convite enviado pelo RH.', 401);
  }

  const session = await createPortalSession(
    db,
    employee.id,
    latestInvite.id,
    context,
    'EMPLOYEE_PORTAL_CREDENTIAL_LOGIN_SUCCESS',
    {
      inviteId: latestInvite.id,
      userId: clean(user.id),
    }
  );

  return {
    ...session,
    authMethod: 'CREDENTIALS' as const,
    credentialIssuedNow: false,
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
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);
  const submission = await getEditableSubmission(db, employeeId, inviteId);
  const currentData = submission.personalData || {};
  const normalizedData = normalizePersonalData(payload);
  const nextData = {
    ...currentData,
    ...normalizedData,
  };
  if (employee.employmentRegime !== 'PJ') {
    delete nextData.bankName;
    delete nextData.bankAgency;
    delete nextData.bankAccount;
    delete nextData.pixKey;
  }
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
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);

  const submission = await getEditableSubmission(db, employeeId, inviteId);
  const docType = upper(input.docType) as EmployeeDocumentTypeCode;
  const allowedTypes = new Set(getPortalExpectedDocumentTypes(employee, submission.personalData || {}));
  allowedTypes.add('OUTRO');
  if (!allowedTypes.has(docType) || EMPLOYEE_PORTAL_EXCLUDED_DOCUMENT_TYPES.has(docType)) {
    throw new EmployeePortalError('Documento não solicitado para este portal.');
  }

  const typeDef = EMPLOYEE_DOCUMENT_TYPE_MAP.get(docType);
  const issueDate = parseDate(input.issueDate);
  const expiresAt = parseDate(input.expiresAt);
  if (typeDef?.hasIssueDate && !issueDate) throw new EmployeePortalError('Este documento exige data de emissão.');
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
  if (!document) throw new EmployeePortalError('Documento não encontrado.', 404);
  if (document.status === 'APPROVED') throw new EmployeePortalError('Documento aprovado não pode ser removido pelo portal.', 409);

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

const validatePortalProductionPayload = (payload: any) => {
  const serviceDate = parseDate(payload?.serviceDate);
  const entryType = upper(payload?.entryType) as EmployeePortalProductionEntryType;
  const patientNameRaw = clean(payload?.patientNameRaw);

  if (!serviceDate) throw new EmployeePortalError('Informe a data do atendimento.');
  if (!isWithinPortalProductionEditWindow(serviceDate)) {
    throw new EmployeePortalError('Só é possível registrar ou ajustar atendimentos de hoje e ontem.', 409);
  }
  if (!['RESOLVE', 'CHECKUP'].includes(entryType)) {
    throw new EmployeePortalError('Tipo de atendimento inválido.');
  }
  if (!patientNameRaw || patientNameRaw.length < 6) {
    throw new EmployeePortalError('Informe o nome completo do paciente.');
  }

  const patientNameNormalized = normalizePatientName(patientNameRaw);
  if (!patientNameNormalized || patientNameNormalized.split(' ').length < 2) {
    throw new EmployeePortalError('Informe nome e sobrenome do paciente.');
  }

  return {
    serviceDate,
    entryType,
    patientNameRaw,
    patientNameNormalized,
  };
};

const ensurePortalProductionUniqueness = async (
  db: DbInterface,
  employeeId: string,
  payload: ReturnType<typeof validatePortalProductionPayload>,
  ignoredEntryId?: string | null
) => {
  const rows = await db.query(
    `
    SELECT id
    FROM employee_portal_production_entries
    WHERE employee_id = ?
      AND service_date = ?
      AND entry_type = ?
      AND patient_name_normalized = ?
      AND deleted_at IS NULL
      AND (? IS NULL OR id <> ?)
    LIMIT 1
    `,
    [
      employeeId,
      payload.serviceDate,
      payload.entryType,
      payload.patientNameNormalized,
      ignoredEntryId || null,
      ignoredEntryId || null,
    ]
  );
  if (rows[0]) {
    throw new EmployeePortalError('Já existe um lançamento igual para este paciente, data e tipo.', 409);
  }
};

export const createPortalProductionEntry = async (
  db: DbInterface,
  employeeId: string,
  payload: any
) => {
  await ensureEmployeePortalTables(db);
  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);

  const normalizedPayload = validatePortalProductionPayload(payload);
  await ensurePortalProductionUniqueness(db, employeeId, normalizedPayload);
  const match = await resolvePortalProductionMatch(db, normalizedPayload.patientNameRaw);
  const teamSnapshot = await getPortalProductionTeamSnapshot(db, employee);
  const now = NOW();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO employee_portal_production_entries (
      id, employee_id, employee_name_snapshot, service_date, entry_type, patient_name_raw,
      patient_name_normalized, match_status, feegow_patient_id, feegow_patient_name,
      team_snapshot, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `,
    [
      id,
      employeeId,
      clean(employee.fullName),
      normalizedPayload.serviceDate,
      normalizedPayload.entryType,
      normalizedPayload.patientNameRaw,
      match.normalized || normalizedPayload.patientNameNormalized,
      match.matchStatus,
      match.patientId,
      match.patientName,
      teamSnapshot,
      now,
      now,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_PORTAL_PRODUCTION_ENTRY_CREATED', `portal:${employeeId}`, employeeId, {
    entryId: id,
    entryType: normalizedPayload.entryType,
    serviceDate: normalizedPayload.serviceDate,
    matchStatus: match.matchStatus,
  });
  return getEmployeePortalOverview(db, employeeId);
};

export const updatePortalProductionEntry = async (
  db: DbInterface,
  employeeId: string,
  entryId: string,
  payload: any
) => {
  await ensureEmployeePortalTables(db);
  const existing = await getProductionEntryById(db, entryId, employeeId);
  if (!existing) throw new EmployeePortalError('Lançamento não encontrado.', 404);
  if (!existing.canEdit) throw new EmployeePortalError('Este lançamento não pode mais ser editado.', 409);

  const employee = await getEmployeeById(db, employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);
  const normalizedPayload = validatePortalProductionPayload(payload);
  await ensurePortalProductionUniqueness(db, employeeId, normalizedPayload, entryId);
  const match = await resolvePortalProductionMatch(db, normalizedPayload.patientNameRaw);
  const teamSnapshot = await getPortalProductionTeamSnapshot(db, employee);
  const now = NOW();

  await db.execute(
    `
    UPDATE employee_portal_production_entries
    SET employee_name_snapshot = ?, service_date = ?, entry_type = ?, patient_name_raw = ?,
      patient_name_normalized = ?, match_status = ?, feegow_patient_id = ?, feegow_patient_name = ?,
      team_snapshot = ?, updated_at = ?
    WHERE id = ? AND employee_id = ?
    `,
    [
      clean(employee.fullName),
      normalizedPayload.serviceDate,
      normalizedPayload.entryType,
      normalizedPayload.patientNameRaw,
      match.normalized || normalizedPayload.patientNameNormalized,
      match.matchStatus,
      match.patientId,
      match.patientName,
      teamSnapshot,
      now,
      entryId,
      employeeId,
    ]
  );

  await insertAudit(db, 'EMPLOYEE_PORTAL_PRODUCTION_ENTRY_UPDATED', `portal:${employeeId}`, employeeId, {
    entryId,
    entryType: normalizedPayload.entryType,
    serviceDate: normalizedPayload.serviceDate,
    matchStatus: match.matchStatus,
  });
  return getEmployeePortalOverview(db, employeeId);
};

export const deletePortalProductionEntry = async (
  db: DbInterface,
  employeeId: string,
  entryId: string
) => {
  await ensureEmployeePortalTables(db);
  const existing = await getProductionEntryById(db, entryId, employeeId);
  if (!existing) throw new EmployeePortalError('Lançamento não encontrado.', 404);
  if (!existing.canEdit) throw new EmployeePortalError('Este lançamento não pode mais ser excluído.', 409);

  await db.execute(
    `
    UPDATE employee_portal_production_entries
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND employee_id = ?
    `,
    [NOW(), NOW(), entryId, employeeId]
  );
  await insertAudit(db, 'EMPLOYEE_PORTAL_PRODUCTION_ENTRY_DELETED', `portal:${employeeId}`, employeeId, {
    entryId,
    serviceDate: existing.serviceDate,
    entryType: existing.entryType,
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
    throw new EmployeePortalError('Não há rascunho liberado para envio.', 409);
  }
  if (!consentLgpd) throw new EmployeePortalError('Aceite a declaração de privacidade para enviar.');

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

  if (nextStatus === 'APPROVED') {
    const employee = await getEmployeeById(db, submission.employeeId);
    if (employee?.status === 'ATIVO') {
      await ensureEmployeeUserAccount(db, employee, {
        actorUserId,
        createInitialCredential: true,
      });
    }
  }

  return getSubmissionById(db, submissionId);
};

export const acknowledgePortalIntranetAccess = async (
  db: DbInterface,
  employeeId: string,
  credentialId: string
) => {
  await ensureEmployeePortalTables(db);
  const latestCredential = await getLatestPortalCredential(db, employeeId);
  if (!latestCredential || latestCredential.id !== credentialId) {
    throw new EmployeePortalError('Credencial de acesso não encontrada.', 404);
  }
  if (latestCredential.status === 'PENDING_VIEW') {
    await markPortalCredentialAsViewed(db, credentialId, employeeId);
  }
  return getEmployeePortalOverview(db, employeeId);
};

export const approvePortalPersonalData = async (
  db: DbInterface,
  submissionId: string,
  actorUserId: string
) => {
  await ensureEmployeePortalTables(db);
  const submission = await getSubmissionById(db, submissionId);
  if (!submission) throw new EmployeePortalError('Submissão não encontrada.', 404);
  const employee = await getEmployeeById(db, submission.employeeId);
  if (!employee) throw new EmployeePortalError('Colaborador não encontrado.', 404);
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
  if (employee.employmentRegime === 'PJ') {
    if ('bankName' in data) add('bank_name', clean(data.bankName) || null);
    if ('bankAgency' in data) add('bank_agency', clean(data.bankAgency) || null);
    if ('bankAccount' in data) add('bank_account', clean(data.bankAccount) || null);
    if ('pixKey' in data) add('pix_key', clean(data.pixKey) || null);
  }

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
  if (!submission) throw new EmployeePortalError('Submissão não encontrada.', 404);
  const rejectionReason = clean(reason);
  if (!rejectionReason) throw new EmployeePortalError('Informe o motivo da rejeição.');
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
  if (!document) throw new EmployeePortalError('Documento não encontrado.', 404);
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
  if (!document) throw new EmployeePortalError('Documento não encontrado.', 404);
  const rejectionReason = clean(reason);
  if (!rejectionReason) throw new EmployeePortalError('Informe o motivo da rejeição.');
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
  if (!submission) throw new EmployeePortalError('Submissão não encontrada.', 404);
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
  if (!allowed.has(docType)) throw new EmployeePortalError('Tipo de documento inválido.');
  return docType;
};
