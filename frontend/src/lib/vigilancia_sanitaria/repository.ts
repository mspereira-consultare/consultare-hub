import { randomUUID } from 'crypto';
import { getDbConnection, type DbInterface } from '@/lib/db';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SURVEILLANCE_DOCUMENT_TYPES,
  SURVEILLANCE_EXPIRATION_STATUSES,
  SURVEILLANCE_RENEWAL_STATUSES,
  SURVEILLANCE_UNITS,
  type SurveillanceDocumentType,
  type SurveillanceExpirationStatus,
  type SurveillanceRenewalStatus,
  type SurveillanceUnit,
} from '@/lib/vigilancia_sanitaria/constants';
import { computeExpirationStatus, getExpirationSortRank, getExpirationStatusLabel } from '@/lib/vigilancia_sanitaria/status';
import type {
  SurveillanceDocument,
  SurveillanceDocumentFilters,
  SurveillanceDocumentInput,
  SurveillanceFile,
  SurveillanceFilters,
  SurveillanceLicense,
  SurveillanceLicenseFilters,
  SurveillanceLicenseInput,
  SurveillanceListResult,
  SurveillanceSummary,
  SurveillanceSummaryFilters,
} from '@/lib/vigilancia_sanitaria/types';

export class SurveillanceValidationError extends Error {
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
const normalizeSearch = (value: any) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const allowedUnits = new Set(SURVEILLANCE_UNITS);
const allowedExpirationStatuses = new Set(SURVEILLANCE_EXPIRATION_STATUSES.map((item) => item.value));
const allowedRenewalStatuses = new Set(SURVEILLANCE_RENEWAL_STATUSES.map((item) => item.value));
const allowedDocumentTypes = new Set(SURVEILLANCE_DOCUMENT_TYPES.map((item) => item.value));

const parseDate = (value: any): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
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

const parsePositiveInt = (value: any, fallback: number) => {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
    if (code === 'ER_DUP_KEYNAME' || /Duplicate key name/i.test(msg) || /already exists/i.test(msg)) return;
    throw error;
  }
};

export const ensureSurveillanceTables = async (db: DbInterface = getDbConnection()) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS health_surveillance_licenses (
      id VARCHAR(64) PRIMARY KEY,
      unit_name VARCHAR(180) NOT NULL,
      license_name VARCHAR(255) NOT NULL,
      cnae VARCHAR(80) NOT NULL,
      license_number VARCHAR(120) NULL,
      issuer VARCHAR(180) NULL,
      valid_until DATE NOT NULL,
      renewal_status VARCHAR(40) NOT NULL,
      responsible_name VARCHAR(180) NULL,
      notes TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by VARCHAR(64) NULL,
      updated_by VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS health_surveillance_documents (
      id VARCHAR(64) PRIMARY KEY,
      unit_name VARCHAR(180) NOT NULL,
      document_name VARCHAR(255) NOT NULL,
      document_type VARCHAR(40) NULL,
      license_id VARCHAR(64) NULL,
      valid_until DATE NULL,
      responsible_name VARCHAR(180) NULL,
      notes TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by VARCHAR(64) NULL,
      updated_by VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS health_surveillance_files (
      id VARCHAR(64) PRIMARY KEY,
      entity_type VARCHAR(20) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN license_number VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN issuer VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN renewal_status VARCHAR(40) NOT NULL DEFAULT 'NAO_INICIADO'`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN responsible_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN created_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_licenses ADD COLUMN updated_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN document_type VARCHAR(40) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN license_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN valid_until DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN responsible_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN created_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE health_surveillance_documents ADD COLUMN updated_by VARCHAR(64) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_hs_licenses_unit ON health_surveillance_licenses (unit_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_hs_licenses_valid ON health_surveillance_licenses (valid_until)`);
  await safeCreateIndex(db, `CREATE INDEX idx_hs_documents_unit ON health_surveillance_documents (unit_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_hs_documents_valid ON health_surveillance_documents (valid_until)`);
  await safeCreateIndex(db, `CREATE INDEX idx_hs_documents_license ON health_surveillance_documents (license_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_hs_files_entity ON health_surveillance_files (entity_type, entity_id)`);

  tablesEnsured = true;
};

const normalizeUnit = (value: any): SurveillanceUnit => {
  const normalized = upper(value);
  if (!allowedUnits.has(normalized as SurveillanceUnit)) {
    throw new SurveillanceValidationError('Unidade inválida.');
  }
  return normalized as SurveillanceUnit;
};

const normalizeRenewalStatus = (value: any): SurveillanceRenewalStatus => {
  const normalized = upper(value || 'NAO_INICIADO');
  if (!allowedRenewalStatuses.has(normalized as SurveillanceRenewalStatus)) {
    throw new SurveillanceValidationError('Status de renovação inválido.');
  }
  return normalized as SurveillanceRenewalStatus;
};

const normalizeDocumentType = (value: any): SurveillanceDocumentType | null => {
  const normalized = upper(value);
  if (!normalized) return null;
  if (!allowedDocumentTypes.has(normalized as SurveillanceDocumentType)) {
    throw new SurveillanceValidationError('Tipo de documento inválido.');
  }
  return normalized as SurveillanceDocumentType;
};

const normalizeLicenseInput = (payload: any): SurveillanceLicenseInput => {
  const unitName = normalizeUnit(payload?.unitName || payload?.unit_name);
  const licenseName = clean(payload?.licenseName || payload?.license_name);
  const cnae = clean(payload?.cnae);
  const validUntil = parseDate(payload?.validUntil || payload?.valid_until);

  if (!licenseName) throw new SurveillanceValidationError('Nome da licença é obrigatório.');
  if (!cnae) throw new SurveillanceValidationError('CNAE é obrigatório.');
  if (!validUntil) throw new SurveillanceValidationError('Validade da licença é obrigatória.');

  return {
    unitName,
    licenseName,
    cnae,
    licenseNumber: clean(payload?.licenseNumber || payload?.license_number) || null,
    issuer: clean(payload?.issuer) || null,
    validUntil,
    renewalStatus: normalizeRenewalStatus(payload?.renewalStatus || payload?.renewal_status),
    responsibleName: clean(payload?.responsibleName || payload?.responsible_name) || null,
    notes: clean(payload?.notes) || null,
  };
};

const normalizeDocumentInput = (payload: any): SurveillanceDocumentInput => {
  const unitName = normalizeUnit(payload?.unitName || payload?.unit_name);
  const documentName = clean(payload?.documentName || payload?.document_name);
  if (!documentName) throw new SurveillanceValidationError('Nome do documento é obrigatório.');

  return {
    unitName,
    documentName,
    documentType: normalizeDocumentType(payload?.documentType || payload?.document_type),
    licenseId: clean(payload?.licenseId || payload?.license_id) || null,
    validUntil: parseDate(payload?.validUntil || payload?.valid_until),
    responsibleName: clean(payload?.responsibleName || payload?.responsible_name) || null,
    notes: clean(payload?.notes) || null,
  };
};

const normalizeExpirationStatusFilter = (value: any): 'all' | SurveillanceExpirationStatus => {
  const normalized = upper(value || 'all');
  if (!normalized || normalized === 'ALL') return 'all';
  return allowedExpirationStatuses.has(normalized as SurveillanceExpirationStatus)
    ? (normalized as SurveillanceExpirationStatus)
    : 'all';
};

const normalizeBaseFilters = (params: URLSearchParams): SurveillanceFilters => ({
  search: clean(params.get('search')),
  unit: clean(params.get('unit')) || 'all',
  expirationStatus: normalizeExpirationStatusFilter(params.get('expirationStatus')),
  validFrom: parseDate(params.get('validFrom')) || '',
  validTo: parseDate(params.get('validTo')) || '',
  page: Math.max(1, parsePositiveInt(params.get('page'), 1)),
  pageSize: clamp(parsePositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE),
});

export const normalizeLicenseFilters = (params: URLSearchParams): SurveillanceLicenseFilters => {
  const base = normalizeBaseFilters(params);
  const renewal = upper(params.get('renewalStatus') || 'all');
  return {
    ...base,
    renewalStatus: allowedRenewalStatuses.has(renewal as SurveillanceRenewalStatus)
      ? (renewal as SurveillanceRenewalStatus)
      : 'all',
  };
};

export const normalizeDocumentFilters = (params: URLSearchParams): SurveillanceDocumentFilters => {
  const base = normalizeBaseFilters(params);
  const type = upper(params.get('documentType') || 'all');
  return {
    ...base,
    documentType: allowedDocumentTypes.has(type as SurveillanceDocumentType) ? (type as SurveillanceDocumentType) : 'all',
    licenseId: clean(params.get('licenseId')) || 'all',
  };
};

export const normalizeSummaryFilters = (params: URLSearchParams): SurveillanceSummaryFilters => {
  const base = normalizeBaseFilters(params);
  const itemTypeRaw = clean(params.get('itemType'));
  const itemType = itemTypeRaw === 'licenses' || itemTypeRaw === 'documents' ? itemTypeRaw : 'all';
  return {
    search: base.search,
    unit: base.unit,
    expirationStatus: base.expirationStatus,
    validFrom: base.validFrom,
    validTo: base.validTo,
    itemType,
  };
};

const mapFile = (row: any): SurveillanceFile => ({
  id: clean(row.id),
  entityType: clean(row.entity_type) === 'document' ? 'document' : 'license',
  entityId: clean(row.entity_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapLicenseBase = (row: any, fileCount = 0): SurveillanceLicense => {
  const validUntil = parseDate(row.valid_until) || '';
  const expirationStatus = computeExpirationStatus(validUntil);
  return {
    id: clean(row.id),
    unitName: upper(row.unit_name) as SurveillanceUnit,
    licenseName: clean(row.license_name),
    cnae: clean(row.cnae),
    licenseNumber: clean(row.license_number) || null,
    issuer: clean(row.issuer) || null,
    validUntil,
    renewalStatus: upper(row.renewal_status || 'NAO_INICIADO') as SurveillanceRenewalStatus,
    responsibleName: clean(row.responsible_name) || null,
    notes: clean(row.notes) || null,
    expirationStatus,
    expirationStatusLabel: getExpirationStatusLabel(expirationStatus),
    fileCount,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
    createdBy: clean(row.created_by) || null,
    updatedBy: clean(row.updated_by) || null,
  };
};

const mapDocumentBase = (row: any, fileCount = 0): SurveillanceDocument => {
  const validUntil = parseDate(row.valid_until);
  const expirationStatus = computeExpirationStatus(validUntil);
  return {
    id: clean(row.id),
    unitName: upper(row.unit_name) as SurveillanceUnit,
    documentName: clean(row.document_name),
    documentType: clean(row.document_type) ? (upper(row.document_type) as SurveillanceDocumentType) : null,
    licenseId: clean(row.license_id) || null,
    licenseName: clean(row.license_name) || null,
    licenseActive: Number(row.license_active ?? 1) === 1,
    validUntil,
    responsibleName: clean(row.responsible_name) || null,
    notes: clean(row.notes) || null,
    expirationStatus,
    expirationStatusLabel: getExpirationStatusLabel(expirationStatus),
    fileCount,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
    createdBy: clean(row.created_by) || null,
    updatedBy: clean(row.updated_by) || null,
  };
};

const loadFileCountMap = async (db: DbInterface) => {
  const rows = await db.query(`
    SELECT entity_type, entity_id, COUNT(*) AS file_count
    FROM health_surveillance_files
    GROUP BY entity_type, entity_id
  `);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${clean(row.entity_type)}:${clean(row.entity_id)}`, Number(row.file_count || 0));
  }
  return map;
};

const filterCommon = <T extends { unitName: string; expirationStatus: SurveillanceExpirationStatus; validUntil: string | null }>(
  list: T[],
  filters: Omit<SurveillanceFilters, 'page' | 'pageSize'>,
  buildSearchText: (item: T) => string,
) => {
  let out = [...list];

  if (filters.search) {
    const query = normalizeSearch(filters.search);
    out = out.filter((item) => normalizeSearch(buildSearchText(item)).includes(query));
  }

  if (filters.unit && filters.unit !== 'all') {
    const unit = upper(filters.unit);
    out = out.filter((item) => upper(item.unitName) === unit);
  }

  if (filters.expirationStatus !== 'all') {
    out = out.filter((item) => item.expirationStatus === filters.expirationStatus);
  }

  if (filters.validFrom) {
    out = out.filter((item) => Boolean(item.validUntil) && String(item.validUntil) >= filters.validFrom);
  }

  if (filters.validTo) {
    out = out.filter((item) => Boolean(item.validUntil) && String(item.validUntil) <= filters.validTo);
  }

  return out;
};

const sortByExpiration = <T extends { expirationStatus: SurveillanceExpirationStatus; validUntil: string | null; updatedAt?: string }>(list: T[]) => {
  return [...list].sort((a, b) => {
    const rankDiff = getExpirationSortRank(a.expirationStatus) - getExpirationSortRank(b.expirationStatus);
    if (rankDiff !== 0) return rankDiff;
    const dateA = a.validUntil || '9999-12-31';
    const dateB = b.validUntil || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
};

const paginate = <T>(list: T[], page: number, pageSize: number): SurveillanceListResult<T> => {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = clamp(page, 1, totalPages);
  const offset = (currentPage - 1) * pageSize;
  return {
    items: list.slice(offset, offset + pageSize),
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
};

const loadLicensesRaw = async (db: DbInterface) => {
  await ensureSurveillanceTables(db);
  const fileCounts = await loadFileCountMap(db);
  const rows = await db.query(`
    SELECT *
    FROM health_surveillance_licenses
    WHERE is_active = 1
    ORDER BY valid_until ASC, license_name ASC
  `);
  return rows.map((row: any) => mapLicenseBase(row, fileCounts.get(`license:${clean(row.id)}`) || 0));
};

const loadDocumentsRaw = async (db: DbInterface) => {
  await ensureSurveillanceTables(db);
  const fileCounts = await loadFileCountMap(db);
  const rows = await db.query(`
    SELECT d.*, l.license_name, l.is_active AS license_active
    FROM health_surveillance_documents d
    LEFT JOIN health_surveillance_licenses l ON l.id = d.license_id
    WHERE d.is_active = 1
    ORDER BY d.valid_until ASC, d.document_name ASC
  `);
  return rows.map((row: any) => mapDocumentBase(row, fileCounts.get(`document:${clean(row.id)}`) || 0));
};

export const listSurveillanceLicenses = async (db: DbInterface, filters: SurveillanceLicenseFilters) => {
  let list = await loadLicensesRaw(db);
  list = filterCommon(list, filters, (item) =>
    [item.licenseName, item.cnae, item.licenseNumber, item.issuer, item.responsibleName, item.notes].filter(Boolean).join(' '),
  );
  if (filters.renewalStatus !== 'all') {
    list = list.filter((item) => item.renewalStatus === filters.renewalStatus);
  }
  return paginate(sortByExpiration(list), filters.page, filters.pageSize);
};

export const listSurveillanceDocuments = async (db: DbInterface, filters: SurveillanceDocumentFilters) => {
  let list = await loadDocumentsRaw(db);
  list = filterCommon(list, filters, (item) =>
    [item.documentName, item.documentType, item.licenseName, item.responsibleName, item.notes].filter(Boolean).join(' '),
  );
  if (filters.documentType !== 'all') {
    list = list.filter((item) => item.documentType === filters.documentType);
  }
  if (filters.licenseId && filters.licenseId !== 'all') {
    list = list.filter((item) => item.licenseId === filters.licenseId);
  }
  return paginate(sortByExpiration(list), filters.page, filters.pageSize);
};

export const listActiveLicensesForOptions = async (db: DbInterface) => {
  const list = await loadLicensesRaw(db);
  return list.map((item) => ({ id: item.id, unitName: item.unitName, licenseName: item.licenseName }));
};

export const getSurveillanceLicenseById = async (db: DbInterface, id: string): Promise<SurveillanceLicense | null> => {
  await ensureSurveillanceTables(db);
  const rows = await db.query(`SELECT * FROM health_surveillance_licenses WHERE id = ? AND is_active = 1 LIMIT 1`, [id]);
  if (!rows[0]) return null;
  const files = await listSurveillanceFiles(db, 'license', id);
  return { ...mapLicenseBase(rows[0], files.length), files };
};

export const getSurveillanceDocumentById = async (db: DbInterface, id: string): Promise<SurveillanceDocument | null> => {
  await ensureSurveillanceTables(db);
  const rows = await db.query(
    `
    SELECT d.*, l.license_name, l.is_active AS license_active
    FROM health_surveillance_documents d
    LEFT JOIN health_surveillance_licenses l ON l.id = d.license_id
    WHERE d.id = ? AND d.is_active = 1
    LIMIT 1
    `,
    [id],
  );
  if (!rows[0]) return null;
  const files = await listSurveillanceFiles(db, 'document', id);
  return { ...mapDocumentBase(rows[0], files.length), files };
};

export const createSurveillanceLicense = async (db: DbInterface, payload: any, userId: string) => {
  await ensureSurveillanceTables(db);
  const input = normalizeLicenseInput(payload);
  const id = randomUUID();
  const now = NOW();
  await db.execute(
    `
    INSERT INTO health_surveillance_licenses (
      id, unit_name, license_name, cnae, license_number, issuer, valid_until, renewal_status,
      responsible_name, notes, is_active, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `,
    [
      id,
      input.unitName,
      input.licenseName,
      input.cnae,
      input.licenseNumber,
      input.issuer,
      input.validUntil,
      input.renewalStatus,
      input.responsibleName,
      input.notes,
      userId,
      userId,
      now,
      now,
    ],
  );
  const created = await getSurveillanceLicenseById(db, id);
  if (!created) throw new Error('Falha ao carregar licença criada.');
  return created;
};

export const updateSurveillanceLicense = async (db: DbInterface, id: string, payload: any, userId: string) => {
  await ensureSurveillanceTables(db);
  const input = normalizeLicenseInput(payload);
  await db.execute(
    `
    UPDATE health_surveillance_licenses
    SET unit_name = ?, license_name = ?, cnae = ?, license_number = ?, issuer = ?, valid_until = ?,
        renewal_status = ?, responsible_name = ?, notes = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_active = 1
    `,
    [
      input.unitName,
      input.licenseName,
      input.cnae,
      input.licenseNumber,
      input.issuer,
      input.validUntil,
      input.renewalStatus,
      input.responsibleName,
      input.notes,
      userId,
      NOW(),
      id,
    ],
  );
  const updated = await getSurveillanceLicenseById(db, id);
  if (!updated) throw new SurveillanceValidationError('Licença não encontrada.', 404);
  return updated;
};

export const deleteSurveillanceLicense = async (db: DbInterface, id: string, userId: string) => {
  await ensureSurveillanceTables(db);
  await db.execute(`UPDATE health_surveillance_licenses SET is_active = 0, updated_by = ?, updated_at = ? WHERE id = ?`, [
    userId,
    NOW(),
    id,
  ]);
};

export const createSurveillanceDocument = async (db: DbInterface, payload: any, userId: string) => {
  await ensureSurveillanceTables(db);
  const input = normalizeDocumentInput(payload);
  const id = randomUUID();
  const now = NOW();
  await db.execute(
    `
    INSERT INTO health_surveillance_documents (
      id, unit_name, document_name, document_type, license_id, valid_until,
      responsible_name, notes, is_active, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `,
    [
      id,
      input.unitName,
      input.documentName,
      input.documentType,
      input.licenseId,
      input.validUntil,
      input.responsibleName,
      input.notes,
      userId,
      userId,
      now,
      now,
    ],
  );
  const created = await getSurveillanceDocumentById(db, id);
  if (!created) throw new Error('Falha ao carregar documento criado.');
  return created;
};

export const updateSurveillanceDocument = async (db: DbInterface, id: string, payload: any, userId: string) => {
  await ensureSurveillanceTables(db);
  const input = normalizeDocumentInput(payload);
  await db.execute(
    `
    UPDATE health_surveillance_documents
    SET unit_name = ?, document_name = ?, document_type = ?, license_id = ?, valid_until = ?,
        responsible_name = ?, notes = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_active = 1
    `,
    [
      input.unitName,
      input.documentName,
      input.documentType,
      input.licenseId,
      input.validUntil,
      input.responsibleName,
      input.notes,
      userId,
      NOW(),
      id,
    ],
  );
  const updated = await getSurveillanceDocumentById(db, id);
  if (!updated) throw new SurveillanceValidationError('Documento não encontrado.', 404);
  return updated;
};

export const deleteSurveillanceDocument = async (db: DbInterface, id: string, userId: string) => {
  await ensureSurveillanceTables(db);
  await db.execute(`UPDATE health_surveillance_documents SET is_active = 0, updated_by = ?, updated_at = ? WHERE id = ?`, [
    userId,
    NOW(),
    id,
  ]);
};

export const listSurveillanceFiles = async (
  db: DbInterface,
  entityType: 'license' | 'document',
  entityId: string,
): Promise<SurveillanceFile[]> => {
  await ensureSurveillanceTables(db);
  const rows = await db.query(
    `SELECT * FROM health_surveillance_files WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
    [entityType, entityId],
  );
  return rows.map(mapFile);
};

export const createSurveillanceFileRecord = async (
  db: DbInterface,
  input: {
    entityType: 'license' | 'document';
    entityId: string;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
  },
) => {
  await ensureSurveillanceTables(db);
  if (input.entityType === 'license') {
    const exists = await getSurveillanceLicenseById(db, input.entityId);
    if (!exists) throw new SurveillanceValidationError('Licença não encontrada.', 404);
  } else {
    const exists = await getSurveillanceDocumentById(db, input.entityId);
    if (!exists) throw new SurveillanceValidationError('Documento não encontrado.', 404);
  }

  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO health_surveillance_files (
      id, entity_type, entity_id, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.entityType,
      input.entityId,
      input.storageProvider,
      input.storageBucket,
      input.storageKey,
      input.originalName,
      input.mimeType,
      input.sizeBytes,
      input.uploadedBy,
      NOW(),
    ],
  );
  const rows = await db.query(`SELECT * FROM health_surveillance_files WHERE id = ? LIMIT 1`, [id]);
  return mapFile(rows[0]);
};

export const getSurveillanceFileById = async (db: DbInterface, id: string): Promise<SurveillanceFile | null> => {
  await ensureSurveillanceTables(db);
  const rows = await db.query(`SELECT * FROM health_surveillance_files WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapFile(rows[0]) : null;
};

export const deleteSurveillanceFileRecord = async (db: DbInterface, id: string) => {
  await ensureSurveillanceTables(db);
  await db.execute(`DELETE FROM health_surveillance_files WHERE id = ?`, [id]);
};

const applySummaryFilters = (
  licenses: SurveillanceLicense[],
  documents: SurveillanceDocument[],
  filters: SurveillanceSummaryFilters,
) => {
  const filteredLicenses =
    filters.itemType === 'documents'
      ? []
      : filterCommon(licenses, filters, (item) =>
          [item.licenseName, item.cnae, item.licenseNumber, item.issuer, item.responsibleName, item.notes].filter(Boolean).join(' '),
        );
  const filteredDocuments =
    filters.itemType === 'licenses'
      ? []
      : filterCommon(documents, filters, (item) =>
          [item.documentName, item.documentType, item.licenseName, item.responsibleName, item.notes].filter(Boolean).join(' '),
        );
  return { filteredLicenses, filteredDocuments };
};

export const getSurveillanceSummary = async (db: DbInterface, filters: SurveillanceSummaryFilters): Promise<SurveillanceSummary> => {
  const licenses = await loadLicensesRaw(db);
  const documents = await loadDocumentsRaw(db);
  const { filteredLicenses, filteredDocuments } = applySummaryFilters(licenses, documents, filters);

  const cards = {
    totalLicenses: filteredLicenses.length,
    expiredLicenses: filteredLicenses.filter((item) => item.expirationStatus === 'VENCIDO').length,
    dueSoonLicenses: filteredLicenses.filter((item) => item.expirationStatus === 'VENCE_HOJE' || item.expirationStatus === 'VENCENDO').length,
    expiredDocuments: filteredDocuments.filter((item) => item.expirationStatus === 'VENCIDO').length,
    dueSoonDocuments: filteredDocuments.filter((item) => item.expirationStatus === 'VENCE_HOJE' || item.expirationStatus === 'VENCENDO').length,
    noValidity: [...filteredLicenses, ...filteredDocuments].filter((item) => item.expirationStatus === 'SEM_VALIDADE').length,
  };

  const combined = [
    ...filteredLicenses.map((item) => ({
      id: item.id,
      entityType: 'license' as const,
      unitName: item.unitName,
      name: item.licenseName,
      validUntil: item.validUntil,
      expirationStatus: item.expirationStatus,
      expirationStatusLabel: item.expirationStatusLabel,
      responsibleName: item.responsibleName,
    })),
    ...filteredDocuments.map((item) => ({
      id: item.id,
      entityType: 'document' as const,
      unitName: item.unitName,
      name: item.documentName,
      validUntil: item.validUntil,
      expirationStatus: item.expirationStatus,
      expirationStatusLabel: item.expirationStatusLabel,
      responsibleName: item.responsibleName,
    })),
  ];

  const criticalAlerts = sortByExpiration(
    combined.filter((item) => ['VENCIDO', 'VENCE_HOJE', 'VENCENDO'].includes(item.expirationStatus)),
  ).slice(0, 12);

  const upcoming = sortByExpiration(combined.filter((item) => item.expirationStatus !== 'SEM_VALIDADE')).slice(0, 12);

  const unitMap = new Map<SurveillanceUnit, { unitName: SurveillanceUnit; total: number; expired: number; dueSoon: number; ok: number; noValidity: number }>();
  for (const unit of SURVEILLANCE_UNITS) {
    unitMap.set(unit, { unitName: unit, total: 0, expired: 0, dueSoon: 0, ok: 0, noValidity: 0 });
  }

  for (const item of combined) {
    const row = unitMap.get(item.unitName) || { unitName: item.unitName, total: 0, expired: 0, dueSoon: 0, ok: 0, noValidity: 0 };
    row.total += 1;
    if (item.expirationStatus === 'VENCIDO') row.expired += 1;
    else if (item.expirationStatus === 'VENCE_HOJE' || item.expirationStatus === 'VENCENDO') row.dueSoon += 1;
    else if (item.expirationStatus === 'EM_DIA') row.ok += 1;
    else row.noValidity += 1;
    unitMap.set(item.unitName, row);
  }

  return {
    cards,
    criticalAlerts,
    upcoming,
    byUnit: Array.from(unitMap.values()).filter((item) => item.total > 0),
  };
};

export const listSurveillanceExportRows = async (
  db: DbInterface,
  type: 'licenses' | 'documents' | 'all',
  filters: SurveillanceSummaryFilters,
) => {
  const licenses = type === 'documents' ? [] : await loadLicensesRaw(db);
  const documents = type === 'licenses' ? [] : await loadDocumentsRaw(db);
  return applySummaryFilters(licenses, documents, filters);
};
