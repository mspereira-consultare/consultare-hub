import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import type {
  QmsDocumentDetail,
  QmsDocumentFile,
  QmsDocumentFileInput,
  QmsDocumentFilters,
  QmsDocumentInput,
  QmsDocumentStatus,
  QmsDocumentSummary,
  QmsDocumentUpdateInput,
  QmsDocumentVersion,
  QmsDocumentVersionInput,
  QmsRefreshResult,
} from '@/lib/qms/types';

export class QmsValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const ALLOWED_STATUS = new Set<QmsDocumentStatus>([
  'rascunho',
  'vigente',
  'a_vencer',
  'vencido',
  'arquivado',
]);

const nowIso = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const bool = (value: unknown) => value === true || value === 1 || String(value || '') === '1';

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (value: unknown): string | null => {
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

const parsePeriodicityDays = (value: unknown): number | null => {
  const raw = clean(value);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new QmsValidationError('Periodicidade invalida. Informe numero inteiro em dias.');
  }
  return n;
};

const normalizeStatus = (value: unknown, fallback: QmsDocumentStatus = 'rascunho'): QmsDocumentStatus => {
  const normalized = clean(value).toLowerCase() as QmsDocumentStatus;
  return ALLOWED_STATUS.has(normalized) ? normalized : fallback;
};

const readCount = (row: any): number => {
  if (!row || typeof row !== 'object') return 0;
  if (row.total !== undefined) return toNumber(row.total);
  if (row.count !== undefined) return toNumber(row.count);
  const key = Object.keys(row).find((k) => /count|total/i.test(k));
  return key ? toNumber((row as any)[key]) : 0;
};

const documentFromRow = (row: any): Omit<QmsDocumentSummary, 'currentVersion' | 'fileCount' | 'lastFile'> => ({
  id: clean(row.id),
  code: clean(row.code),
  sector: clean(row.sector),
  name: clean(row.name),
  objective: clean(row.objective),
  periodicityDays: row.periodicity_days === null || row.periodicity_days === undefined
    ? null
    : toNumber(row.periodicity_days),
  status: normalizeStatus(row.status, 'rascunho'),
  archivedAt: clean(row.archived_at) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const versionFromRow = (row: any): QmsDocumentVersion => ({
  id: clean(row.id),
  documentId: clean(row.document_id),
  versionLabel: clean(row.version_label),
  elaboratedBy: clean(row.elaborated_by) || null,
  reviewedBy: clean(row.reviewed_by) || null,
  approvedBy: clean(row.approved_by) || null,
  creationDate: parseDate(row.creation_date),
  lastReviewDate: parseDate(row.last_review_date),
  nextReviewDate: parseDate(row.next_review_date),
  linkedTrainingRef: clean(row.linked_training_ref) || null,
  revisionReason: clean(row.revision_reason) || null,
  scope: clean(row.scope) || null,
  notes: clean(row.notes) || null,
  isCurrent: bool(row.is_current),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
});

const fileFromRow = (row: any): QmsDocumentFile => ({
  id: clean(row.id),
  documentVersionId: clean(row.document_version_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  filename: clean(row.filename),
  mimeType: clean(row.mime_type),
  sizeBytes: toNumber(row.size_bytes),
  uploadedBy: clean(row.uploaded_by),
  uploadedAt: clean(row.uploaded_at),
  isActive: bool(row.is_active),
});

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      /duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const buildCurrentCode = async (db: DbInterface) => {
  const year = new Date().getFullYear();
  const rows = await db.query(
    `
    SELECT code
    FROM qms_documents
    WHERE code LIKE ?
    ORDER BY code DESC
    LIMIT 1
    `,
    [`POP-${year}-%`]
  );
  const last = clean(rows?.[0]?.code);
  const lastMatch = last.match(/^POP-\d{4}-(\d{4})$/);
  const next = lastMatch ? Number(lastMatch[1]) + 1 : 1;
  return `POP-${year}-${String(next).padStart(4, '0')}`;
};

const insertAuditLog = async (
  db: DbInterface,
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  before: unknown,
  after: unknown
) => {
  await db.execute(
    `
    INSERT INTO qms_audit_log (
      id, entity_type, entity_id, action, before_json, after_json, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      actorUserId,
      nowIso(),
    ]
  );
};

const getCurrentVersionByDocument = async (
  db: DbInterface,
  documentId: string
): Promise<QmsDocumentVersion | null> => {
  const currentRows = await db.query(
    `
    SELECT *
    FROM qms_document_versions
    WHERE document_id = ? AND is_current = 1
    LIMIT 1
    `,
    [documentId]
  );

  if (currentRows?.[0]) return versionFromRow(currentRows[0]);

  const fallback = await db.query(
    `
    SELECT *
    FROM qms_document_versions
    WHERE document_id = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [documentId]
  );
  if (!fallback?.[0]) return null;
  return versionFromRow(fallback[0]);
};

const getFilesByDocument = async (db: DbInterface, documentId: string) => {
  const rows = await db.query(
    `
    SELECT f.*
    FROM qms_document_files f
    INNER JOIN qms_document_versions v ON v.id = f.document_version_id
    WHERE v.document_id = ? AND COALESCE(f.is_active, 1) = 1
    ORDER BY f.uploaded_at DESC
    `,
    [documentId]
  );
  return rows.map(fileFromRow);
};

const computeStatusFromDates = (
  currentStatus: QmsDocumentStatus,
  nextReviewDate: string | null
): QmsDocumentStatus => {
  if (currentStatus === 'arquivado') return 'arquivado';
  if (!nextReviewDate) return currentStatus;
  const next = new Date(`${nextReviewDate}T00:00:00-03:00`);
  if (Number.isNaN(next.getTime())) return currentStatus;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'vencido';
  if (diffDays <= 30) return 'a_vencer';
  return 'vigente';
};

const validateBaseInput = (input: QmsDocumentInput | QmsDocumentUpdateInput) => {
  const name = clean((input as QmsDocumentInput).name);
  if ((input as QmsDocumentInput).name !== undefined && !name) {
    throw new QmsValidationError('Nome do POP e obrigatorio.');
  }
};

export const ensureQmsTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_documents (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      sector VARCHAR(120) NOT NULL,
      name VARCHAR(220) NOT NULL,
      objective TEXT,
      periodicity_days INTEGER,
      status VARCHAR(30) NOT NULL DEFAULT 'rascunho',
      archived_at TEXT,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN objective TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN periodicity_days INTEGER NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'rascunho'`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN archived_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN created_by VARCHAR(64) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN updated_by VARCHAR(64) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE qms_documents ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_document_versions (
      id VARCHAR(64) PRIMARY KEY,
      document_id VARCHAR(64) NOT NULL,
      version_label VARCHAR(30) NOT NULL,
      elaborated_by VARCHAR(140),
      reviewed_by VARCHAR(140),
      approved_by VARCHAR(140),
      creation_date TEXT,
      last_review_date TEXT,
      next_review_date TEXT,
      linked_training_ref VARCHAR(140),
      revision_reason TEXT,
      scope TEXT,
      notes TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE qms_document_versions ADD COLUMN linked_training_ref VARCHAR(140) NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_document_versions ADD COLUMN revision_reason TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_document_versions ADD COLUMN scope TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_document_versions ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_document_versions ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_document_files (
      id VARCHAR(64) PRIMARY KEY,
      document_version_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      uploaded_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await safeAddColumn(db, `ALTER TABLE qms_document_files ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      entity_type VARCHAR(60) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      action VARCHAR(60) NOT NULL,
      before_json LONGTEXT,
      after_json LONGTEXT,
      actor_user_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  tablesEnsured = true;
};

export const listQmsDocuments = async (
  db: DbInterface,
  filters: QmsDocumentFilters = {}
): Promise<QmsDocumentSummary[]> => {
  await ensureQmsTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];

  const search = clean(filters.search);
  if (search) {
    where.push('(LOWER(code) LIKE ? OR LOWER(name) LIKE ? OR LOWER(sector) LIKE ?)');
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like);
  }

  const sector = clean(filters.sector);
  if (sector) {
    where.push('LOWER(sector) = ?');
    params.push(sector.toLowerCase());
  }

  const status = normalizeStatus(filters.status || 'rascunho', 'rascunho');
  if (filters.status && filters.status !== 'all') {
    where.push('LOWER(status) = ?');
    params.push(status);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM qms_documents
    WHERE ${where.join(' AND ')}
    ORDER BY updated_at DESC, created_at DESC
    `,
    params
  );

  const out: QmsDocumentSummary[] = [];
  for (const row of rows) {
    const base = documentFromRow(row);
    const currentVersion = await getCurrentVersionByDocument(db, base.id);
    const files = await getFilesByDocument(db, base.id);
    out.push({
      ...base,
      currentVersion,
      fileCount: files.length,
      lastFile: files[0] || null,
    });
  }
  return out;
};

export const getQmsDocumentById = async (
  db: DbInterface,
  documentId: string
): Promise<QmsDocumentDetail | null> => {
  await ensureQmsTables(db);
  const rows = await db.query(`SELECT * FROM qms_documents WHERE id = ? LIMIT 1`, [documentId]);
  if (!rows?.[0]) return null;

  const base = documentFromRow(rows[0]);
  const versionsRows = await db.query(
    `
    SELECT *
    FROM qms_document_versions
    WHERE document_id = ?
    ORDER BY is_current DESC, created_at DESC
    `,
    [documentId]
  );
  const versions = versionsRows.map(versionFromRow);
  const currentVersion = versions.find((item) => item.isCurrent) || versions[0] || null;
  const files = await getFilesByDocument(db, documentId);

  return {
    document: {
      ...base,
      currentVersion,
      fileCount: files.length,
      lastFile: files[0] || null,
    },
    versions,
    files,
  };
};

export const createQmsDocument = async (
  db: DbInterface,
  input: QmsDocumentInput,
  actorUserId: string
): Promise<QmsDocumentDetail> => {
  await ensureQmsTables(db);
  validateBaseInput(input);

  const id = randomUUID();
  const createdAt = nowIso();
  const code = clean(input.code) || (await buildCurrentCode(db));
  const sector = clean(input.sector) || 'Geral';
  const name = clean(input.name);
  const objective = clean(input.objective) || '';
  const periodicityDays = parsePeriodicityDays(input.periodicityDays);
  const status = normalizeStatus(input.status || 'rascunho', 'rascunho');

  await db.execute(
    `
    INSERT INTO qms_documents (
      id, code, sector, name, objective, periodicity_days, status, archived_at,
      created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      code,
      sector,
      name,
      objective,
      periodicityDays,
      status,
      status === 'arquivado' ? createdAt : null,
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );

  const versionId = randomUUID();
  await db.execute(
    `
    INSERT INTO qms_document_versions (
      id, document_id, version_label, elaborated_by, reviewed_by, approved_by,
      creation_date, last_review_date, next_review_date, linked_training_ref,
      revision_reason, scope, notes, is_current, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      versionId,
      id,
      clean(input.versionLabel) || '1.0',
      clean(input.elaboratedBy) || null,
      clean(input.reviewedBy) || null,
      clean(input.approvedBy) || null,
      parseDate(input.creationDate),
      parseDate(input.lastReviewDate),
      parseDate(input.nextReviewDate),
      clean(input.linkedTrainingRef) || null,
      clean(input.revisionReason) || null,
      clean(input.scope) || null,
      clean(input.notes) || null,
      1,
      actorUserId,
      createdAt,
    ]
  );

  const detail = await getQmsDocumentById(db, id);
  if (!detail) throw new Error('Falha ao carregar documento criado.');
  await insertAuditLog(db, 'document', id, 'create', actorUserId, null, detail);
  return detail;
};

export const updateQmsDocument = async (
  db: DbInterface,
  documentId: string,
  input: QmsDocumentUpdateInput,
  actorUserId: string
): Promise<QmsDocumentDetail> => {
  await ensureQmsTables(db);
  validateBaseInput(input);

  const current = await getQmsDocumentById(db, documentId);
  if (!current) throw new QmsValidationError('Documento nao encontrado.', 404);

  const code = input.code !== undefined ? clean(input.code) || current.document.code : current.document.code;
  const sector = input.sector !== undefined ? clean(input.sector) || 'Geral' : current.document.sector;
  const name = input.name !== undefined ? clean(input.name) : current.document.name;
  const objective = input.objective !== undefined ? clean(input.objective) : current.document.objective;
  const periodicityDays = input.periodicityDays !== undefined
    ? parsePeriodicityDays(input.periodicityDays)
    : current.document.periodicityDays;
  const status = input.status !== undefined
    ? normalizeStatus(input.status, current.document.status)
    : current.document.status;
  const updatedAt = nowIso();

  await db.execute(
    `
    UPDATE qms_documents
    SET code = ?, sector = ?, name = ?, objective = ?, periodicity_days = ?, status = ?,
        archived_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      code,
      sector,
      name,
      objective,
      periodicityDays,
      status,
      status === 'arquivado' ? current.document.archivedAt || updatedAt : null,
      actorUserId,
      updatedAt,
      documentId,
    ]
  );

  const activeVersion = current.versions.find((item) => item.isCurrent) || current.versions[0] || null;
  if (activeVersion) {
    await db.execute(
      `
      UPDATE qms_document_versions
      SET elaborated_by = ?, reviewed_by = ?, approved_by = ?,
          creation_date = ?, last_review_date = ?, next_review_date = ?,
          linked_training_ref = ?, revision_reason = ?, scope = ?, notes = ?
      WHERE id = ?
      `,
      [
        input.elaboratedBy !== undefined ? clean(input.elaboratedBy) || null : activeVersion.elaboratedBy,
        input.reviewedBy !== undefined ? clean(input.reviewedBy) || null : activeVersion.reviewedBy,
        input.approvedBy !== undefined ? clean(input.approvedBy) || null : activeVersion.approvedBy,
        input.creationDate !== undefined ? parseDate(input.creationDate) : activeVersion.creationDate,
        input.lastReviewDate !== undefined ? parseDate(input.lastReviewDate) : activeVersion.lastReviewDate,
        input.nextReviewDate !== undefined ? parseDate(input.nextReviewDate) : activeVersion.nextReviewDate,
        input.linkedTrainingRef !== undefined ? clean(input.linkedTrainingRef) || null : activeVersion.linkedTrainingRef,
        input.revisionReason !== undefined ? clean(input.revisionReason) || null : activeVersion.revisionReason,
        input.scope !== undefined ? clean(input.scope) || null : activeVersion.scope,
        input.notes !== undefined ? clean(input.notes) || null : activeVersion.notes,
        activeVersion.id,
      ]
    );
  }

  const updated = await getQmsDocumentById(db, documentId);
  if (!updated) throw new Error('Falha ao carregar documento atualizado.');
  await insertAuditLog(db, 'document', documentId, 'update', actorUserId, current, updated);
  return updated;
};

export const deleteQmsDocument = async (
  db: DbInterface,
  documentId: string,
  actorUserId: string
) => {
  await ensureQmsTables(db);
  const current = await getQmsDocumentById(db, documentId);
  if (!current) throw new QmsValidationError('Documento nao encontrado.', 404);

  const versionIds = current.versions.map((item) => item.id);
  if (versionIds.length > 0) {
    const placeholders = versionIds.map(() => '?').join(', ');
    await db.execute(`DELETE FROM qms_document_files WHERE document_version_id IN (${placeholders})`, versionIds);
  }
  await db.execute(`DELETE FROM qms_document_versions WHERE document_id = ?`, [documentId]);
  await db.execute(`DELETE FROM qms_documents WHERE id = ?`, [documentId]);
  await insertAuditLog(db, 'document', documentId, 'delete', actorUserId, current, null);
};

export const createQmsDocumentVersion = async (
  db: DbInterface,
  documentId: string,
  input: QmsDocumentVersionInput,
  actorUserId: string
): Promise<QmsDocumentDetail> => {
  await ensureQmsTables(db);
  const current = await getQmsDocumentById(db, documentId);
  if (!current) throw new QmsValidationError('Documento nao encontrado.', 404);

  const base = current.versions.find((item) => item.isCurrent) || current.versions[0] || null;
  const now = nowIso();
  const versionId = randomUUID();

  await db.execute(`UPDATE qms_document_versions SET is_current = 0 WHERE document_id = ?`, [documentId]);
  await db.execute(
    `
    INSERT INTO qms_document_versions (
      id, document_id, version_label, elaborated_by, reviewed_by, approved_by,
      creation_date, last_review_date, next_review_date, linked_training_ref,
      revision_reason, scope, notes, is_current, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      versionId,
      documentId,
      clean(input.versionLabel) || (base ? base.versionLabel : '1.0'),
      clean(input.elaboratedBy) || (base?.elaboratedBy || null),
      clean(input.reviewedBy) || (base?.reviewedBy || null),
      clean(input.approvedBy) || (base?.approvedBy || null),
      parseDate(input.creationDate) || base?.creationDate || null,
      parseDate(input.lastReviewDate) || base?.lastReviewDate || null,
      parseDate(input.nextReviewDate) || base?.nextReviewDate || null,
      clean(input.linkedTrainingRef) || base?.linkedTrainingRef || null,
      clean(input.revisionReason) || base?.revisionReason || null,
      clean(input.scope) || base?.scope || null,
      clean(input.notes) || base?.notes || null,
      1,
      actorUserId,
      now,
    ]
  );

  await db.execute(
    `
    UPDATE qms_documents
    SET updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, now, documentId]
  );

  const updated = await getQmsDocumentById(db, documentId);
  if (!updated) throw new Error('Falha ao carregar documento com nova versao.');
  await insertAuditLog(db, 'document_version', versionId, 'create', actorUserId, null, updated);
  return updated;
};

export const createQmsDocumentFileRecord = async (
  db: DbInterface,
  documentId: string,
  input: QmsDocumentFileInput,
  actorUserId: string
): Promise<QmsDocumentFile> => {
  await ensureQmsTables(db);
  const detail = await getQmsDocumentById(db, documentId);
  if (!detail) throw new QmsValidationError('Documento nao encontrado.', 404);

  const versionId = clean(input.documentVersionId) || detail.document.currentVersion?.id;
  if (!versionId) {
    throw new QmsValidationError('Documento sem versao ativa para upload.');
  }
  const existsVersion = detail.versions.some((item) => item.id === versionId);
  if (!existsVersion) {
    throw new QmsValidationError('Versao informada nao pertence ao documento.', 400);
  }

  const createdAt = nowIso();
  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO qms_document_files (
      id, document_version_id, storage_provider, storage_bucket, storage_key,
      filename, mime_type, size_bytes, uploaded_by, uploaded_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      id,
      versionId,
      clean(input.storageProvider),
      clean(input.storageBucket) || null,
      clean(input.storageKey),
      clean(input.filename),
      clean(input.mimeType),
      toNumber(input.sizeBytes),
      actorUserId,
      createdAt,
    ]
  );

  await db.execute(
    `
    UPDATE qms_documents
    SET updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, createdAt, documentId]
  );

  const row = (
    await db.query(`SELECT * FROM qms_document_files WHERE id = ? LIMIT 1`, [id])
  )?.[0];
  if (!row) throw new Error('Falha ao carregar arquivo salvo.');
  const file = fileFromRow(row);
  await insertAuditLog(db, 'document_file', id, 'create', actorUserId, null, file);
  return file;
};

export const listQmsDocumentFiles = async (
  db: DbInterface,
  documentId: string
): Promise<QmsDocumentFile[]> => {
  await ensureQmsTables(db);
  return getFilesByDocument(db, documentId);
};

export const getQmsDocumentFileById = async (
  db: DbInterface,
  documentId: string,
  fileId: string
): Promise<QmsDocumentFile | null> => {
  await ensureQmsTables(db);
  const rows = await db.query(
    `
    SELECT f.*
    FROM qms_document_files f
    INNER JOIN qms_document_versions v ON v.id = f.document_version_id
    WHERE v.document_id = ? AND f.id = ? AND COALESCE(f.is_active, 1) = 1
    LIMIT 1
    `,
    [documentId, fileId]
  );
  if (!rows?.[0]) return null;
  return fileFromRow(rows[0]);
};

export const refreshQmsDocumentStatuses = async (
  db: DbInterface,
  actorUserId: string
): Promise<QmsRefreshResult> => {
  await ensureQmsTables(db);
  const docs = await listQmsDocuments(db, { status: 'all' });
  let updated = 0;

  const stats = {
    vigente: 0,
    aVencer: 0,
    vencido: 0,
    rascunho: 0,
    arquivado: 0,
  };

  for (const doc of docs) {
    const nextDate = doc.currentVersion?.nextReviewDate || null;
    const target = computeStatusFromDates(doc.status, nextDate);
    if (target !== doc.status) {
      await db.execute(
        `
        UPDATE qms_documents
        SET status = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        `,
        [target, actorUserId, nowIso(), doc.id]
      );
      updated += 1;
    }

    const finalStatus = target;
    if (finalStatus === 'vigente') stats.vigente += 1;
    else if (finalStatus === 'a_vencer') stats.aVencer += 1;
    else if (finalStatus === 'vencido') stats.vencido += 1;
    else if (finalStatus === 'arquivado') stats.arquivado += 1;
    else stats.rascunho += 1;
  }

  const details = `refresh docs=${docs.length} updated=${updated}`;
  await db.execute(
    `
    INSERT INTO system_status (service_name, status, last_run, details)
    VALUES ('qms_documentos', 'COMPLETED', datetime('now'), ?)
    ON CONFLICT(service_name) DO UPDATE SET
      status = excluded.status,
      last_run = excluded.last_run,
      details = excluded.details
    `,
    [details]
  );

  return {
    total: docs.length,
    updated,
    stats,
  };
};
