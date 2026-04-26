import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';

type Row = Record<string, unknown>;
type IntranetCatalogBlock = {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type IntranetSpecialtyPageContent = {
  blocks?: IntranetCatalogBlock[];
  [key: string]: unknown;
};

export type IntranetCatalogFilters = {
  search?: string;
  limit?: number;
  featuredOnly?: boolean;
};

export type IntranetQmsFilters = IntranetCatalogFilters & {
  documentId?: string;
  sector?: string;
  status?: string;
};

export type IntranetProfessionalFilters = IntranetCatalogFilters & {
  specialties?: string[];
  specialtyId?: string;
};

export type IntranetProcedureFilters = IntranetCatalogFilters & {
  categories?: string[];
  catalogTypes?: string[];
};

export type IntranetSpecialtyProfile = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  description: string | null;
  serviceGuidance: string | null;
  displayOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type IntranetSpecialtyPage = {
  specialtySlug: string;
  specialtyName: string;
  content: IntranetSpecialtyPageContent;
  updatedAt: string | null;
};

export type IntranetQmsDocument = {
  id: string;
  code: string;
  sector: string;
  name: string;
  objective: string | null;
  status: string;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
  defaultPageId: string | null;
  currentVersionId: string | null;
  versionLabel: string | null;
  nextReviewDate: string | null;
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  updatedAt: string | null;
};

export type IntranetProfessionalProfile = {
  professionalId: string;
  slug: string;
  displayName: string;
  shortBio: string | null;
  longBio: string | null;
  photoAssetId: string | null;
  photoDocumentId: string | null;
  photoUrl: string | null;
  cardHighlight: string | null;
  specialties: string[];
  serviceUnits: string[];
  attendanceModes: string[];
  serviceLocations: string[];
  ageRange: string | null;
  patientAgeText: string | null;
  walkInPolicyText: string | null;
  idealRoomText: string | null;
  intranetNotesText: string | null;
  contactNotes: string | null;
  specialtyIds?: string[];
  displayOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type IntranetProcedureProfile = {
  id: string;
  procedimentoId: number | null;
  slug: string;
  displayName: string;
  catalogType: 'consultation' | 'procedure' | 'exam';
  category: string | null;
  subcategory: string | null;
  summary: string | null;
  description: string | null;
  requiresPreparation: boolean;
  whoPerforms: string | null;
  howItWorks: string | null;
  patientInstructions: string | null;
  preparationInstructions: string | null;
  contraindications: string | null;
  estimatedDurationText: string | null;
  recoveryNotes: string | null;
  showPrice: boolean;
  publishedPrice: number | null;
  basePrice: number | null;
  isFeatured: boolean;
  isPublished: boolean;
  displayOrder: number;
  updatedAt: string | null;
};

export type IntranetProfessionalProcedure = {
  id: string;
  professionalId: string;
  itemId: string;
  procedimentoId: number | null;
  notes: string | null;
  displayOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IntranetProfessionalSpecialty = {
  id: string;
  professionalId: string;
  specialtyId: string;
  notes: string | null;
  displayOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IntranetProfessionalNote = {
  professionalId: string;
  notes: string | null;
  updatedAt: string | null;
};

export type IntranetSpecialtyNote = {
  specialtySlug: string;
  specialtyName: string;
  notes: string | null;
  updatedAt: string | null;
};

const clean = (value: unknown) => String(value ?? '').trim();
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const nowIso = () => new Date().toISOString();
const nullable = (value: unknown) => clean(value) || null;
const toDbBool = (value: unknown) => (bool(value) ? 1 : 0);
const CATALOG_TYPES = new Set(['consultation', 'procedure', 'exam']);

const limitValue = (value: unknown, fallback = 12, max = 80) => {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseStringArray = (value: unknown) => {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(clean).filter(Boolean);
};

const stringifyArray = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const items = value.map(clean).filter(Boolean);
  return items.length ? JSON.stringify(items) : null;
};

const stringifyJson = (value: unknown, fallback: unknown = {}) => JSON.stringify(value ?? fallback);

const normalizeSlug = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const uniqueStrings = (values: unknown[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};

const specialtyMatchesSlug = (specialties: string[], slug: string) =>
  specialties.some((specialty) => normalizeSlug(specialty) === slug);

const pickCatalogType = (value: unknown) => {
  const raw = clean(value).toLowerCase();
  return (CATALOG_TYPES.has(raw) ? raw : 'procedure') as 'consultation' | 'procedure' | 'exam';
};

const safeQuery = async (db: DbInterface, sql: string, params: unknown[] = []) => {
  try {
    return await db.query(sql, params);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = String(err?.message || '');
    const code = String(err?.code || '');
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|no such table|Table .* doesn't exist/i.test(message)) return [];
    throw error;
  }
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = String(err?.message || '');
    const code = String(err?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name|duplicate column/i.test(message)) return;
    throw error;
  }
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = String(err?.message || '');
    const code = String(err?.code || '');
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|no such table|Table .* doesn't exist/i.test(message)) return;
    throw error;
  }
};

const ensureCatalogColumns = async (db: DbInterface) => {
  await safeAddColumn(db, `ALTER TABLE intranet_procedure_profiles ADD COLUMN catalog_type VARCHAR(40) DEFAULT 'procedure'`);
  await safeAddColumn(db, `ALTER TABLE intranet_procedure_profiles ADD COLUMN requires_preparation INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE intranet_procedure_profiles ADD COLUMN who_performs TEXT`);
  await safeAddColumn(db, `ALTER TABLE intranet_procedure_profiles ADD COLUMN how_it_works LONGTEXT`);
  await safeAddColumn(db, `ALTER TABLE intranet_procedure_profiles ADD COLUMN patient_instructions LONGTEXT`);
};

const migrateLegacyProcedureProfiles = async (db: DbInterface) => {
  await safeExecute(
    db,
    `
    INSERT IGNORE INTO intranet_catalog_items (
      id, slug, display_name, catalog_type, category, subcategory, summary, description,
      requires_preparation, who_performs, how_it_works, patient_instructions, preparation_instructions,
      contraindications, estimated_duration_text, recovery_notes, show_price, published_price,
      is_featured, is_published, display_order, updated_by, updated_at
    )
    SELECT
      CAST(procedimento_id AS CHAR), slug, display_name, catalog_type, category, subcategory, summary, description,
      requires_preparation, who_performs, how_it_works, patient_instructions, preparation_instructions,
      contraindications, estimated_duration_text, recovery_notes, show_price, published_price,
      is_featured, is_published, display_order, updated_by, updated_at
    FROM intranet_procedure_profiles old
    `
  );

  await safeExecute(
    db,
    `
    INSERT IGNORE INTO intranet_professional_catalog_items (
      id, professional_id, catalog_item_id, notes, display_order, is_published, created_at, updated_at
    )
    SELECT
      id, professional_id, CAST(procedimento_id AS CHAR), notes, display_order, is_published, created_at, updated_at
    FROM intranet_professional_procedures old
    `
  );
};

let catalogTablesEnsured = false;

export const ensureIntranetCatalogTables = async (db: DbInterface) => {
  if (catalogTablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_qms_document_settings (
      document_id VARCHAR(64) PRIMARY KEY,
      is_visible INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      default_page_id VARCHAR(64),
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_specialty_profiles (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(180) NOT NULL,
      display_name VARCHAR(180) NOT NULL,
      short_description TEXT,
      description LONGTEXT,
      service_guidance LONGTEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_professional_profiles (
      professional_id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(180) NOT NULL,
      display_name VARCHAR(180) NOT NULL,
      short_bio TEXT,
      long_bio LONGTEXT,
      photo_asset_id VARCHAR(64),
      card_highlight VARCHAR(220),
      service_units_override_json LONGTEXT,
      specialties_override_json LONGTEXT,
      contact_notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_catalog_items (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(180) NOT NULL,
      display_name VARCHAR(220) NOT NULL,
      catalog_type VARCHAR(40) NOT NULL DEFAULT 'procedure',
      category VARCHAR(140),
      subcategory VARCHAR(140),
      summary TEXT,
      description LONGTEXT,
      requires_preparation INTEGER NOT NULL DEFAULT 0,
      who_performs TEXT,
      how_it_works LONGTEXT,
      patient_instructions LONGTEXT,
      preparation_instructions LONGTEXT,
      contraindications LONGTEXT,
      estimated_duration_text VARCHAR(120),
      recovery_notes LONGTEXT,
      show_price INTEGER NOT NULL DEFAULT 1,
      published_price DECIMAL(12,2),
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_procedure_profiles (
      procedimento_id BIGINT PRIMARY KEY,
      slug VARCHAR(180) NOT NULL,
      display_name VARCHAR(220) NOT NULL,
      catalog_type VARCHAR(40) NOT NULL DEFAULT 'procedure',
      category VARCHAR(140),
      subcategory VARCHAR(140),
      summary TEXT,
      description LONGTEXT,
      requires_preparation INTEGER NOT NULL DEFAULT 0,
      who_performs TEXT,
      how_it_works LONGTEXT,
      patient_instructions LONGTEXT,
      preparation_instructions LONGTEXT,
      contraindications LONGTEXT,
      estimated_duration_text VARCHAR(120),
      recovery_notes LONGTEXT,
      show_price INTEGER NOT NULL DEFAULT 1,
      published_price DECIMAL(12,2),
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_professional_catalog_items (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      catalog_item_id VARCHAR(64) NOT NULL,
      notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_professional_notes (
      professional_id VARCHAR(64) PRIMARY KEY,
      notes TEXT,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_specialty_notes (
      specialty_slug VARCHAR(180) PRIMARY KEY,
      specialty_name VARCHAR(180) NOT NULL,
      notes TEXT,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_specialty_pages (
      specialty_slug VARCHAR(180) PRIMARY KEY,
      specialty_name VARCHAR(180) NOT NULL,
      content_json LONGTEXT,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_professional_specialties (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      specialty_id VARCHAR(64) NOT NULL,
      notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_professional_procedures (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      procedimento_id BIGINT NOT NULL,
      notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await ensureCatalogColumns(db);
  await migrateLegacyProcedureProfiles(db);
  catalogTablesEnsured = true;
};

const mapQmsDocument = (row: Row): IntranetQmsDocument => {
  const id = clean(row.id);
  const fileId = clean(row.file_id) || null;
  return {
    id,
    code: clean(row.code),
    sector: clean(row.sector),
    name: clean(row.name),
    objective: clean(row.objective) || null,
    status: clean(row.status),
    isVisible: bool(row.is_visible),
    isFeatured: bool(row.is_featured),
    displayOrder: Number(row.display_order || 0),
    defaultPageId: clean(row.default_page_id) || null,
    currentVersionId: clean(row.current_version_id) || null,
    versionLabel: clean(row.version_label) || null,
    nextReviewDate: clean(row.next_review_date) || null,
    fileId,
    fileName: clean(row.file_name) || null,
    fileUrl: fileId ? `/api/qms/documents/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download` : null,
    updatedAt: clean(row.updated_at) || null,
  };
};

const mapSpecialty = (row: Row): IntranetSpecialtyProfile => ({
  id: clean(row.id),
  slug: clean(row.slug) || normalizeSlug(row.display_name),
  displayName: clean(row.display_name),
  shortDescription: clean(row.short_description) || null,
  description: clean(row.description) || null,
  serviceGuidance: clean(row.service_guidance) || null,
  displayOrder: Number(row.display_order || 0),
  isFeatured: bool(row.is_featured),
  isPublished: bool(row.is_published),
  publishedAt: clean(row.published_at) || null,
  updatedAt: clean(row.updated_at) || null,
});

const mapSpecialtyPage = (row: Row): IntranetSpecialtyPage => ({
  specialtySlug: clean(row.specialty_slug),
  specialtyName: clean(row.specialty_name),
  content: parseJson<IntranetSpecialtyPageContent>(row.content_json, { blocks: [] }),
  updatedAt: clean(row.updated_at) || null,
});

const mapProfessional = (row: Row): IntranetProfessionalProfile => {
  const professionalId = clean(row.id || row.professional_id);
  const name = clean(row.name || row.display_name);
  const specialties = uniqueStrings(parseStringArray(row.specialties_json).concat(clean(row.primary_specialty || row.specialty)));
  const serviceUnits = parseStringArray(row.service_units_json);
  const photoDocumentId = clean(row.photo_document_id) || null;
  return {
    professionalId,
    slug: clean(row.slug) || normalizeSlug(name || professionalId),
    displayName: name,
    shortBio: null,
    longBio: null,
    photoAssetId: photoDocumentId,
    photoDocumentId,
    photoUrl: photoDocumentId ? `/api/intranet/professionals/${encodeURIComponent(professionalId)}/photo` : null,
    cardHighlight: clean(row.primary_specialty || row.specialty) || null,
    specialties,
    serviceUnits,
    attendanceModes: parseStringArray(row.attendance_modes_json),
    serviceLocations: parseStringArray(row.service_locations_text_json),
    ageRange: clean(row.age_range) || null,
    patientAgeText: clean(row.patient_age_text) || null,
    walkInPolicyText: clean(row.walk_in_policy_text) || null,
    idealRoomText: clean(row.ideal_room_text) || null,
    intranetNotesText: clean(row.intranet_notes_text) || null,
    contactNotes: clean(row.intranet_notes) || null,
    displayOrder: Number(row.display_order || 0),
    isFeatured: false,
    isPublished: bool(row.is_active),
    publishedAt: null,
    updatedAt: clean(row.updated_at) || null,
  };
};

const mapProcedure = (row: Row): IntranetProcedureProfile => {
  const procedimentoId = toNumber(row.procedimento_id);
  const id = clean(row.id) || (procedimentoId ? String(procedimentoId) : '');
  const name = clean(row.display_name) || clean(row.nome);
  const publishedPrice = toNumber(row.published_price);
  return {
    id,
    procedimentoId,
    slug: clean(row.slug) || normalizeSlug(name || procedimentoId),
    displayName: name,
    catalogType: pickCatalogType(row.catalog_type),
    category: clean(row.category) || clean(row.grupo_procedimento) || null,
    subcategory: clean(row.subcategory) || clean(row.tipo_procedimento) || null,
    summary: clean(row.summary) || null,
    description: clean(row.description) || null,
    requiresPreparation: bool(row.requires_preparation),
    whoPerforms: clean(row.who_performs) || null,
    howItWorks: clean(row.how_it_works) || null,
    patientInstructions: clean(row.patient_instructions) || null,
    preparationInstructions: clean(row.preparation_instructions) || null,
    contraindications: clean(row.contraindications) || null,
    estimatedDurationText: clean(row.estimated_duration_text) || null,
    recoveryNotes: clean(row.recovery_notes) || null,
    showPrice: row.show_price === undefined || row.show_price === null ? true : bool(row.show_price),
    publishedPrice,
    basePrice: null,
    isFeatured: bool(row.is_featured),
    isPublished: bool(row.is_published),
    displayOrder: Number(row.display_order || 0),
    updatedAt: clean(row.updated_at) || null,
  };
};

export const listIntranetQmsDocuments = async (db: DbInterface, filters: IntranetQmsFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['COALESCE(s.is_visible, 0) = 1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(d.code) LIKE ? OR LOWER(d.name) LIKE ? OR LOWER(d.sector) LIKE ? OR LOWER(COALESCE(d.objective, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const sector = clean(filters.sector).toLowerCase();
  if (sector) {
    where.push('LOWER(d.sector) = ?');
    params.push(sector);
  }
  const status = clean(filters.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(d.status) = ?');
    params.push(status);
  }
  if (filters.featuredOnly) where.push('COALESCE(s.is_featured, 0) = 1');
  const limit = limitValue(filters.limit, 12);

  const rows = await safeQuery(
    db,
    `
    SELECT d.*, s.is_visible, s.is_featured, s.default_page_id, s.display_order,
      v.id AS current_version_id, v.version_label, v.next_review_date,
      f.id AS file_id, f.filename AS file_name
    FROM qms_documents d
    INNER JOIN intranet_qms_document_settings s ON s.document_id = d.id
    LEFT JOIN qms_document_versions v ON v.document_id = d.id AND v.is_current = 1
    LEFT JOIN qms_document_files f ON f.document_version_id = v.id AND COALESCE(f.is_active, 1) = 1
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(s.is_featured, 0) DESC, s.display_order ASC, d.updated_at DESC
    LIMIT ${limit}
    `,
    params
  );
  return (rows as Row[]).map(mapQmsDocument);
};

export const listIntranetQmsDocumentSettings = async (db: DbInterface, filters: IntranetQmsFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const documentId = clean(filters.documentId);
  if (documentId) {
    where.push('d.id = ?');
    params.push(documentId);
  }
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push('(LOWER(d.code) LIKE ? OR LOWER(d.name) LIKE ? OR LOWER(d.sector) LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT d.*, COALESCE(s.is_visible, 0) AS is_visible, COALESCE(s.is_featured, 0) AS is_featured,
      s.default_page_id, COALESCE(s.display_order, 0) AS display_order,
      v.id AS current_version_id, v.version_label, v.next_review_date,
      f.id AS file_id, f.filename AS file_name
    FROM qms_documents d
    LEFT JOIN intranet_qms_document_settings s ON s.document_id = d.id
    LEFT JOIN qms_document_versions v ON v.document_id = d.id AND v.is_current = 1
    LEFT JOIN qms_document_files f ON f.document_version_id = v.id AND COALESCE(f.is_active, 1) = 1
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(s.is_visible, 0) DESC, COALESCE(s.display_order, 0) ASC, d.name ASC
    LIMIT ${limitValue(filters.limit, 80, 200)}
    `,
    params
  );
  return (rows as Row[]).map(mapQmsDocument);
};

export const saveIntranetQmsDocumentSetting = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const documentId = clean(input.documentId || input.document_id);
  if (!documentId) throw new Error('documentId é obrigatório.');
  const now = nowIso();
  const existing = await db.query(`SELECT document_id FROM intranet_qms_document_settings WHERE document_id = ? LIMIT 1`, [documentId]);
  const values = [
    toDbBool(input.isVisible ?? input.is_visible),
    toDbBool(input.isFeatured ?? input.is_featured),
    nullable(input.defaultPageId ?? input.default_page_id),
    Number(input.displayOrder ?? input.display_order ?? 0),
    actorUserId,
    now,
    documentId,
  ];
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_qms_document_settings SET is_visible = ?, is_featured = ?, default_page_id = ?, display_order = ?, updated_by = ?, updated_at = ? WHERE document_id = ?`,
      values
    );
  } else {
    await db.execute(
      `INSERT INTO intranet_qms_document_settings (is_visible, is_featured, default_page_id, display_order, updated_by, updated_at, document_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      values
    );
  }
  return (await listIntranetQmsDocumentSettings(db, { documentId, limit: 1 }))[0] || null;
};

export const listIntranetSpecialtyProfiles = async (db: DbInterface, filters: IntranetCatalogFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(display_name) LIKE ? OR LOWER(COALESCE(short_description, '')) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (filters.featuredOnly) where.push('is_featured = 1');
  const rows = await safeQuery(
    db,
    `
    SELECT *
    FROM intranet_specialty_profiles
    WHERE ${where.join(' AND ')}
    ORDER BY is_published DESC, is_featured DESC, display_order ASC, display_name ASC
    LIMIT ${limitValue(filters.limit, 80, 200)}
    `,
    params
  );
  return (rows as Row[]).map(mapSpecialty);
};

export const listPublishedIntranetSpecialties = async (db: DbInterface, filters: IntranetCatalogFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const search = clean(filters.search).toLowerCase();
  const professionalRows = await safeQuery(
    db,
    `
    SELECT specialty, primary_specialty, specialties_json
    FROM professionals
    WHERE COALESCE(is_active, 1) = 1
    `
  );
  const noteRows = await safeQuery(db, `SELECT * FROM intranet_specialty_notes`);
  const notesBySlug = new Map((noteRows as Row[]).map((row) => [clean(row.specialty_slug), row]));
  const bySlug = new Map<string, IntranetSpecialtyProfile>();
  for (const row of professionalRows as Row[]) {
    const specialties = uniqueStrings(parseStringArray(row.specialties_json).concat(clean(row.primary_specialty || row.specialty)));
    for (const specialty of specialties) {
      const slug = normalizeSlug(specialty);
      if (!slug || bySlug.has(slug)) continue;
      const note = notesBySlug.get(slug);
      bySlug.set(slug, {
        id: slug,
        slug,
        displayName: clean(note?.specialty_name) || specialty,
        shortDescription: clean(note?.notes) || null,
        description: null,
        serviceGuidance: clean(note?.notes) || null,
        displayOrder: 0,
        isFeatured: false,
        isPublished: true,
        publishedAt: null,
        updatedAt: clean(note?.updated_at) || null,
      });
    }
  }
  const out = Array.from(bySlug.values())
    .filter((item) => !search || `${item.displayName} ${item.shortDescription || ''}`.toLowerCase().includes(search))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  return out.slice(0, limitValue(filters.limit, 80, 200));
};

export const getPublishedIntranetSpecialtyBySlug = async (db: DbInterface, slugRaw: string) => {
  const slug = normalizeSlug(slugRaw);
  const specialties = await listPublishedIntranetSpecialties(db, { limit: 500 });
  return specialties.find((item) => item.slug === slug) || null;
};

export const listIntranetSpecialtyPages = async (db: DbInterface) => {
  await ensureIntranetCatalogTables(db);
  const rows = await safeQuery(db, `SELECT * FROM intranet_specialty_pages ORDER BY specialty_name ASC`);
  return (rows as Row[]).map(mapSpecialtyPage);
};

export const getIntranetSpecialtyPage = async (db: DbInterface, slugRaw: string) => {
  await ensureIntranetCatalogTables(db);
  const slug = normalizeSlug(slugRaw);
  if (!slug) return null;
  const rows = await safeQuery(
    db,
    `SELECT * FROM intranet_specialty_pages WHERE specialty_slug = ? LIMIT 1`,
    [slug]
  );
  return rows[0] ? mapSpecialtyPage(rows[0] as Row) : null;
};

export const saveIntranetSpecialtyPage = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const specialtyName = clean(input.specialtyName || input.specialty_name);
  const specialtySlug = normalizeSlug(input.specialtySlug || input.specialty_slug || specialtyName);
  if (!specialtySlug || !specialtyName) throw new Error('Especialidade é obrigatória.');
  const content = (input.content && typeof input.content === 'object') ? input.content : { blocks: [] };
  const now = nowIso();
  const values = [specialtyName, stringifyJson(content, { blocks: [] }), actorUserId, now, specialtySlug];
  const existing = await db.query(`SELECT specialty_slug FROM intranet_specialty_pages WHERE specialty_slug = ? LIMIT 1`, [specialtySlug]);
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_specialty_pages SET specialty_name = ?, content_json = ?, updated_by = ?, updated_at = ? WHERE specialty_slug = ?`,
      values
    );
  } else {
    await db.execute(
      `INSERT INTO intranet_specialty_pages (specialty_name, content_json, updated_by, updated_at, specialty_slug) VALUES (?, ?, ?, ?, ?)`,
      values
    );
  }
  return getIntranetSpecialtyPage(db, specialtySlug);
};

export const saveIntranetSpecialtyProfile = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const inputId = clean(input.id);
  const displayName = clean(input.displayName || input.display_name);
  if (!displayName) throw new Error('displayName é obrigatório.');
  const now = nowIso();
  const isPublished = toDbBool(input.isPublished ?? input.is_published);
  const existing = inputId
    ? await db.query(`SELECT id FROM intranet_specialty_profiles WHERE id = ? LIMIT 1`, [inputId])
    : [];
  const id = clean((existing[0] as Row | undefined)?.id) || inputId || randomUUID();
  const values = [
    normalizeSlug(input.slug || displayName),
    displayName,
    nullable(input.shortDescription || input.short_description),
    nullable(input.description),
    nullable(input.serviceGuidance || input.service_guidance),
    Number(input.displayOrder ?? input.display_order ?? 0),
    toDbBool(input.isFeatured ?? input.is_featured),
    isPublished,
    isPublished ? now : null,
    actorUserId,
    now,
    id,
  ];
  if (existing.length) {
    await db.execute(
      `
      UPDATE intranet_specialty_profiles
      SET slug = ?, display_name = ?, short_description = ?, description = ?, service_guidance = ?,
        display_order = ?, is_featured = ?, is_published = ?, published_at = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
      `,
      values
    );
  } else {
    await db.execute(
      `
      INSERT INTO intranet_specialty_profiles (
        slug, display_name, short_description, description, service_guidance,
        display_order, is_featured, is_published, published_at, updated_by, updated_at, id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values
    );
  }
  return (await listIntranetSpecialtyProfiles(db, { search: displayName, limit: 1 })).find((item) => item.id === id) || null;
};

export const listIntranetProfessionals = async (db: DbInterface, filters: IntranetProfessionalFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['COALESCE(p.is_active, 1) = 1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(p.name) LIKE ? OR LOWER(p.specialty) LIKE ? OR LOWER(COALESCE(p.primary_specialty, '')) LIKE ? OR LOWER(COALESCE(n.notes, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT p.*, n.notes AS intranet_notes, photo.id AS photo_document_id
    FROM professionals p
    LEFT JOIN intranet_professional_notes n ON n.professional_id = p.id
    LEFT JOIN professional_documents photo ON photo.id = (
      SELECT d.id
      FROM professional_documents d
      WHERE d.professional_id = p.id AND d.doc_type = 'FOTO' AND COALESCE(d.is_active, 1) = 1
      ORDER BY d.created_at DESC
      LIMIT 1
    )
    WHERE ${where.join(' AND ')}
    ORDER BY p.name ASC
    LIMIT ${limitValue(filters.limit, 80, 500)}
    `,
    params
  );
  const specialties = (filters.specialties || []).map((item) => clean(item).toLowerCase()).filter(Boolean);
  const specialtySlug = normalizeSlug(filters.specialtyId);
  return (rows as Row[]).map(mapProfessional).filter((item) => {
    const matchesNamedSpecialties = !specialties.length || item.specialties.some((specialty) => specialties.includes(specialty.toLowerCase()));
    const matchesSlug = !specialtySlug || specialtyMatchesSlug(item.specialties, specialtySlug);
    return matchesNamedSpecialties && matchesSlug;
  }).slice(0, limitValue(filters.limit, 12, 500));
};

export const listIntranetProfessionalProfiles = async (db: DbInterface, filters: IntranetProfessionalFilters = {}) => {
  return listIntranetProfessionals(db, filters);
};

export const listIntranetProfessionalsBySpecialty = async (db: DbInterface, specialtyId: string, filters: IntranetProfessionalFilters = {}) => {
  return listIntranetProfessionals(db, { ...filters, specialtyId });
};

export const getProfessionalPhotoDocument = async (db: DbInterface, professionalIdRaw: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return null;
  const rows = await safeQuery(
    db,
    `
    SELECT d.*
    FROM professional_documents d
    INNER JOIN professionals p ON p.id = d.professional_id
    WHERE d.professional_id = ? AND d.doc_type = 'FOTO' AND COALESCE(d.is_active, 1) = 1 AND COALESCE(p.is_active, 1) = 1
    ORDER BY d.created_at DESC
    LIMIT 1
    `,
    [professionalId]
  );
  return (rows[0] as Row | undefined) || null;
};

export const listIntranetProfessionalNotes = async (db: DbInterface) => {
  await ensureIntranetCatalogTables(db);
  const rows = await safeQuery(db, `SELECT * FROM intranet_professional_notes ORDER BY updated_at DESC`);
  return (rows as Row[]).map((row) => ({
    professionalId: clean(row.professional_id),
    notes: clean(row.notes) || null,
    updatedAt: clean(row.updated_at) || null,
  }));
};

export const saveIntranetProfessionalNote = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(input.professionalId || input.professional_id);
  if (!professionalId) throw new Error('professionalId é obrigatório.');
  const now = nowIso();
  const values = [nullable(input.notes), actorUserId, now, professionalId];
  const existing = await db.query(`SELECT professional_id FROM intranet_professional_notes WHERE professional_id = ? LIMIT 1`, [professionalId]);
  if (existing.length) {
    await db.execute(`UPDATE intranet_professional_notes SET notes = ?, updated_by = ?, updated_at = ? WHERE professional_id = ?`, values);
  } else {
    await db.execute(`INSERT INTO intranet_professional_notes (notes, updated_by, updated_at, professional_id) VALUES (?, ?, ?, ?)`, values);
  }
  return (await listIntranetProfessionalNotes(db)).find((item) => item.professionalId === professionalId) || null;
};

export const listIntranetSpecialtyNotes = async (db: DbInterface) => {
  await ensureIntranetCatalogTables(db);
  const rows = await safeQuery(db, `SELECT * FROM intranet_specialty_notes ORDER BY specialty_name ASC`);
  return (rows as Row[]).map((row) => ({
    specialtySlug: clean(row.specialty_slug),
    specialtyName: clean(row.specialty_name),
    notes: clean(row.notes) || null,
    updatedAt: clean(row.updated_at) || null,
  }));
};

export const saveIntranetSpecialtyNote = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const specialtyName = clean(input.specialtyName || input.specialty_name);
  const specialtySlug = normalizeSlug(input.specialtySlug || input.specialty_slug || specialtyName);
  if (!specialtySlug || !specialtyName) throw new Error('Especialidade é obrigatória.');
  const now = nowIso();
  const values = [specialtyName, nullable(input.notes), actorUserId, now, specialtySlug];
  const existing = await db.query(`SELECT specialty_slug FROM intranet_specialty_notes WHERE specialty_slug = ? LIMIT 1`, [specialtySlug]);
  if (existing.length) {
    await db.execute(`UPDATE intranet_specialty_notes SET specialty_name = ?, notes = ?, updated_by = ?, updated_at = ? WHERE specialty_slug = ?`, values);
  } else {
    await db.execute(`INSERT INTO intranet_specialty_notes (specialty_name, notes, updated_by, updated_at, specialty_slug) VALUES (?, ?, ?, ?, ?)`, values);
  }
  return (await listIntranetSpecialtyNotes(db)).find((item) => item.specialtySlug === specialtySlug) || null;
};

export const saveIntranetProfessionalProfile = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(input.professionalId || input.professional_id);
  if (!professionalId) throw new Error('professionalId é obrigatório.');
  const displayName = clean(input.displayName || input.display_name);
  if (!displayName) throw new Error('displayName é obrigatório.');
  const now = nowIso();
  const isPublished = toDbBool(input.isPublished ?? input.is_published);
  const existing = await db.query(`SELECT professional_id FROM intranet_professional_profiles WHERE professional_id = ? LIMIT 1`, [professionalId]);
  const values = [
    normalizeSlug(input.slug || displayName || professionalId),
    displayName,
    nullable(input.shortBio || input.short_bio),
    nullable(input.longBio || input.long_bio),
    nullable(input.photoAssetId || input.photo_asset_id),
    nullable(input.cardHighlight || input.card_highlight),
    stringifyArray(input.serviceUnits || input.service_units),
    stringifyArray(input.specialties || input.specialties_override),
    nullable(input.contactNotes || input.contact_notes),
    Number(input.displayOrder ?? input.display_order ?? 0),
    toDbBool(input.isFeatured ?? input.is_featured),
    isPublished,
    isPublished ? now : null,
    actorUserId,
    now,
    professionalId,
  ];
  if (existing.length) {
    await db.execute(
      `
      UPDATE intranet_professional_profiles
      SET slug = ?, display_name = ?, short_bio = ?, long_bio = ?, photo_asset_id = ?, card_highlight = ?,
        service_units_override_json = ?, specialties_override_json = ?, contact_notes = ?, display_order = ?,
        is_featured = ?, is_published = ?, published_at = ?, updated_by = ?, updated_at = ?
      WHERE professional_id = ?
      `,
      values
    );
  } else {
    await db.execute(
      `
      INSERT INTO intranet_professional_profiles (
        slug, display_name, short_bio, long_bio, photo_asset_id, card_highlight,
        service_units_override_json, specialties_override_json, contact_notes, display_order,
        is_featured, is_published, published_at, updated_by, updated_at, professional_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values
    );
  }
  return (await listIntranetProfessionalProfiles(db, { search: displayName, limit: 1 }))[0] || null;
};

export const listIntranetProfessionalSpecialties = async (db: DbInterface, professionalIdRaw?: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(professionalIdRaw);
  const where = professionalId ? 'WHERE professional_id = ?' : '';
  const rows = await safeQuery(
    db,
    `SELECT * FROM intranet_professional_specialties ${where} ORDER BY display_order ASC, created_at DESC`,
    professionalId ? [professionalId] : []
  );
  return (rows as Row[]).map((row) => ({
    id: clean(row.id),
    professionalId: clean(row.professional_id),
    specialtyId: clean(row.specialty_id),
    notes: clean(row.notes) || null,
    displayOrder: Number(row.display_order || 0),
    isPublished: bool(row.is_published),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  }));
};

export const replaceIntranetProfessionalSpecialties = async (db: DbInterface, input: Row) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(input.professionalId || input.professional_id);
  if (!professionalId) throw new Error('professionalId é obrigatório.');
  const specialtyIds = Array.isArray(input.specialtyIds) ? input.specialtyIds.map(clean).filter(Boolean) : [];
  const now = nowIso();
  await db.execute(`DELETE FROM intranet_professional_specialties WHERE professional_id = ?`, [professionalId]);
  for (let index = 0; index < specialtyIds.length; index += 1) {
    await db.execute(
      `
      INSERT INTO intranet_professional_specialties (
        id, professional_id, specialty_id, notes, display_order, is_published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [randomUUID(), professionalId, specialtyIds[index], null, index, 1, now, now]
    );
  }
  return listIntranetProfessionalSpecialties(db, professionalId);
};

export const listIntranetProcedures = async (db: DbInterface, filters: IntranetProcedureFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['is_published = 1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(display_name) LIKE ? OR LOWER(COALESCE(summary, '')) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (filters.featuredOnly) where.push('is_featured = 1');
  const catalogTypes = (filters.catalogTypes || []).map((item) => clean(item).toLowerCase()).filter((item) => CATALOG_TYPES.has(item));
  if (catalogTypes.length) {
    where.push(`LOWER(catalog_type) IN (${catalogTypes.map(() => '?').join(', ')})`);
    params.push(...catalogTypes);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT *
    FROM intranet_catalog_items
    WHERE ${where.join(' AND ')}
    ORDER BY is_featured DESC, display_order ASC, display_name ASC
    LIMIT ${limitValue(filters.limit, 12, 500)}
    `,
    params
  );
  const categories = (filters.categories || []).map((item) => clean(item).toLowerCase()).filter(Boolean);
  return (rows as Row[]).map(mapProcedure).filter((item) => {
    if (!categories.length) return true;
    return [item.category, item.subcategory].filter(Boolean).some((value) => categories.includes(String(value).toLowerCase()));
  });
};

export const listIntranetProcedureProfiles = async (db: DbInterface, filters: IntranetProcedureFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(display_name) LIKE ? OR LOWER(COALESCE(summary, '')) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const catalogTypes = (filters.catalogTypes || []).map((item) => clean(item).toLowerCase()).filter((item) => CATALOG_TYPES.has(item));
  if (catalogTypes.length) {
    where.push(`LOWER(catalog_type) IN (${catalogTypes.map(() => '?').join(', ')})`);
    params.push(...catalogTypes);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT *
    FROM intranet_catalog_items
    WHERE ${where.join(' AND ')}
    ORDER BY is_published DESC, display_order ASC, display_name ASC
    LIMIT ${limitValue(filters.limit, 80, 200)}
    `,
    params
  );
  return (rows as Row[]).map(mapProcedure);
};

export const getPublishedIntranetProcedureBySlug = async (db: DbInterface, catalogTypeRaw: string, slugRaw: string) => {
  await ensureIntranetCatalogTables(db);
  const catalogType = pickCatalogType(catalogTypeRaw);
  const slug = normalizeSlug(slugRaw);
  const rows = await safeQuery(
    db,
    `
    SELECT *
    FROM intranet_catalog_items
    WHERE slug = ? AND catalog_type = ? AND is_published = 1
    LIMIT 1
    `,
    [slug, catalogType]
  );
  return rows[0] ? mapProcedure(rows[0] as Row) : null;
};

export const saveIntranetProcedureProfile = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const inputId = clean(input.id);
  const displayName = clean(input.displayName || input.display_name);
  if (!displayName) throw new Error('displayName é obrigatório.');
  const now = nowIso();
  const existing = inputId ? await db.query(`SELECT id FROM intranet_catalog_items WHERE id = ? LIMIT 1`, [inputId]) : [];
  const id = clean((existing[0] as Row | undefined)?.id) || inputId || randomUUID();
  const values = [
    normalizeSlug(input.slug || displayName || id),
    displayName,
    pickCatalogType(input.catalogType || input.catalog_type),
    nullable(input.category),
    nullable(input.subcategory),
    nullable(input.summary),
    nullable(input.description),
    toDbBool(input.requiresPreparation ?? input.requires_preparation),
    nullable(input.whoPerforms || input.who_performs),
    nullable(input.howItWorks || input.how_it_works),
    nullable(input.patientInstructions || input.patient_instructions),
    nullable(input.preparationInstructions || input.preparation_instructions),
    nullable(input.contraindications),
    nullable(input.estimatedDurationText || input.estimated_duration_text),
    nullable(input.recoveryNotes || input.recovery_notes),
    input.showPrice === undefined && input.show_price === undefined ? 1 : toDbBool(input.showPrice ?? input.show_price),
    toNumber(input.publishedPrice ?? input.published_price),
    toDbBool(input.isFeatured ?? input.is_featured),
    toDbBool(input.isPublished ?? input.is_published),
    Number(input.displayOrder ?? input.display_order ?? 0),
    actorUserId,
    now,
    id,
  ];
  if (existing.length) {
    await db.execute(
      `
      UPDATE intranet_catalog_items
      SET slug = ?, display_name = ?, catalog_type = ?, category = ?, subcategory = ?, summary = ?, description = ?,
        requires_preparation = ?, who_performs = ?, how_it_works = ?, patient_instructions = ?,
        preparation_instructions = ?, contraindications = ?, estimated_duration_text = ?, recovery_notes = ?,
        show_price = ?, published_price = ?, is_featured = ?, is_published = ?, display_order = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
      `,
      values
    );
  } else {
    await db.execute(
      `
      INSERT INTO intranet_catalog_items (
        slug, display_name, catalog_type, category, subcategory, summary, description,
        requires_preparation, who_performs, how_it_works, patient_instructions, preparation_instructions,
        contraindications, estimated_duration_text, recovery_notes, show_price, published_price,
        is_featured, is_published, display_order, updated_by, updated_at, id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values
    );
  }
  return (await listIntranetProcedureProfiles(db, { search: displayName, limit: 200 })).find((item) => item.id === id) || null;
};

export const listIntranetProfessionalProcedures = async (db: DbInterface, professionalIdRaw?: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(professionalIdRaw);
  const where = professionalId ? 'WHERE professional_id = ?' : '';
  const rows = await safeQuery(
    db,
    `SELECT * FROM intranet_professional_catalog_items ${where} ORDER BY display_order ASC, created_at DESC`,
    professionalId ? [professionalId] : []
  );
  return (rows as Row[]).map((row) => ({
    id: clean(row.id),
    professionalId: clean(row.professional_id),
    itemId: clean(row.catalog_item_id),
    procedimentoId: null,
    notes: clean(row.notes) || null,
    displayOrder: Number(row.display_order || 0),
    isPublished: bool(row.is_published),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  }));
};

export const listIntranetProfessionalsByCatalogItem = async (db: DbInterface, itemIdRaw: string) => {
  await ensureIntranetCatalogTables(db);
  const itemId = clean(itemIdRaw);
  if (!itemId) return [];
  const links = await safeQuery(
    db,
    `
    SELECT professional_id
    FROM intranet_professional_catalog_items
    WHERE catalog_item_id = ? AND COALESCE(is_published, 1) = 1
    ORDER BY display_order ASC, created_at DESC
    `,
    [itemId]
  );
  const ids = (links as Row[]).map((row) => clean(row.professional_id)).filter(Boolean);
  if (!ids.length) return [];
  const professionals = await listIntranetProfessionals(db, { limit: 500 });
  const byId = new Map(professionals.map((item) => [item.professionalId, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as IntranetProfessionalProfile[];
};

export const saveIntranetProfessionalProcedure = async (db: DbInterface, input: Row) => {
  await ensureIntranetCatalogTables(db);
  const inputId = clean(input.id);
  const professionalId = clean(input.professionalId || input.professional_id);
  const itemId = clean(input.itemId || input.catalogItemId || input.catalog_item_id || input.procedimentoId || input.procedimento_id);
  if (!professionalId || !itemId) {
    throw new Error('professionalId e itemId são obrigatórios.');
  }
  const now = nowIso();
  const existing = inputId
    ? await db.query(`SELECT id FROM intranet_professional_catalog_items WHERE id = ? LIMIT 1`, [inputId])
    : await db.query(
        `SELECT id FROM intranet_professional_catalog_items WHERE professional_id = ? AND catalog_item_id = ? LIMIT 1`,
        [professionalId, itemId]
      );
  const id = clean((existing[0] as Row | undefined)?.id) || inputId || randomUUID();
  const values = [
    professionalId,
    itemId,
    nullable(input.notes),
    Number(input.displayOrder ?? input.display_order ?? 0),
    input.isPublished === undefined && input.is_published === undefined ? 1 : toDbBool(input.isPublished ?? input.is_published),
    now,
    id,
  ];
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_professional_catalog_items SET professional_id = ?, catalog_item_id = ?, notes = ?, display_order = ?, is_published = ?, updated_at = ? WHERE id = ?`,
      values
    );
  } else {
    await db.execute(
      `INSERT INTO intranet_professional_catalog_items (professional_id, catalog_item_id, notes, display_order, is_published, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, now]
    );
  }
  return (await listIntranetProfessionalProcedures(db, professionalId)).find((item) => item.id === id) || null;
};
