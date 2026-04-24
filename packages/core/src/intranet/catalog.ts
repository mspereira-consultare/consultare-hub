import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';

type Row = Record<string, unknown>;

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
};

export type IntranetProcedureFilters = IntranetCatalogFilters & {
  categories?: string[];
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
  cardHighlight: string | null;
  specialties: string[];
  serviceUnits: string[];
  contactNotes: string | null;
  displayOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type IntranetProcedureProfile = {
  procedimentoId: number;
  slug: string;
  displayName: string;
  category: string | null;
  subcategory: string | null;
  summary: string | null;
  description: string | null;
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
  procedimentoId: number;
  notes: string | null;
  displayOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

const clean = (value: unknown) => String(value ?? '').trim();
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const nowIso = () => new Date().toISOString();
const nullable = (value: unknown) => clean(value) || null;
const toDbBool = (value: unknown) => (bool(value) ? 1 : 0);

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

const normalizeSlug = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

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
    CREATE TABLE IF NOT EXISTS intranet_procedure_profiles (
      procedimento_id BIGINT PRIMARY KEY,
      slug VARCHAR(180) NOT NULL,
      display_name VARCHAR(220) NOT NULL,
      category VARCHAR(140),
      subcategory VARCHAR(140),
      summary TEXT,
      description LONGTEXT,
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

const mapProfessional = (row: Row): IntranetProfessionalProfile => {
  const professionalId = clean(row.id || row.professional_id);
  const name = clean(row.display_name) || clean(row.name);
  const specialties = parseStringArray(row.specialties_override_json);
  const serviceUnits = parseStringArray(row.service_units_override_json);
  return {
    professionalId,
    slug: clean(row.slug) || normalizeSlug(name || professionalId),
    displayName: name,
    shortBio: clean(row.short_bio) || null,
    longBio: clean(row.long_bio) || null,
    photoAssetId: clean(row.photo_asset_id) || null,
    cardHighlight: clean(row.card_highlight) || null,
    specialties: specialties.length ? specialties : parseStringArray(row.specialties_json).concat(clean(row.primary_specialty || row.specialty)).filter(Boolean),
    serviceUnits: serviceUnits.length ? serviceUnits : parseStringArray(row.service_units_json),
    contactNotes: clean(row.contact_notes) || null,
    displayOrder: Number(row.display_order || 0),
    isFeatured: bool(row.is_featured),
    isPublished: bool(row.is_published),
    publishedAt: clean(row.published_at) || null,
    updatedAt: clean(row.updated_at) || null,
  };
};

const mapProcedure = (row: Row): IntranetProcedureProfile => {
  const procedimentoId = Number(row.procedimento_id || 0);
  const name = clean(row.display_name) || clean(row.nome);
  const basePrice = toNumber(row.valor);
  const publishedPrice = toNumber(row.published_price);
  return {
    procedimentoId,
    slug: clean(row.slug) || normalizeSlug(name || procedimentoId),
    displayName: name,
    category: clean(row.category) || clean(row.grupo_procedimento) || null,
    subcategory: clean(row.subcategory) || clean(row.tipo_procedimento) || null,
    summary: clean(row.summary) || null,
    description: clean(row.description) || null,
    preparationInstructions: clean(row.preparation_instructions) || null,
    contraindications: clean(row.contraindications) || null,
    estimatedDurationText: clean(row.estimated_duration_text) || null,
    recoveryNotes: clean(row.recovery_notes) || null,
    showPrice: row.show_price === undefined || row.show_price === null ? true : bool(row.show_price),
    publishedPrice: publishedPrice ?? basePrice,
    basePrice,
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

export const listIntranetProfessionals = async (db: DbInterface, filters: IntranetProfessionalFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['COALESCE(p.is_active, 1) = 1', 'COALESCE(ip.is_published, 0) = 1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(p.name) LIKE ? OR LOWER(p.specialty) LIKE ? OR LOWER(COALESCE(ip.display_name, '')) LIKE ? OR LOWER(COALESCE(ip.short_bio, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (filters.featuredOnly) where.push('COALESCE(ip.is_featured, 0) = 1');
  const rows = await safeQuery(
    db,
    `
    SELECT p.*, ip.*
    FROM professionals p
    INNER JOIN intranet_professional_profiles ip ON ip.professional_id = p.id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(ip.is_featured, 0) DESC, ip.display_order ASC, p.name ASC
    LIMIT ${limitValue(filters.limit, 12)}
    `,
    params
  );
  const specialties = (filters.specialties || []).map((item) => clean(item).toLowerCase()).filter(Boolean);
  return (rows as Row[]).map(mapProfessional).filter((item) => {
    if (!specialties.length) return true;
    return item.specialties.some((specialty) => specialties.includes(specialty.toLowerCase()));
  });
};

export const listIntranetProfessionalProfiles = async (db: DbInterface, filters: IntranetProfessionalFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(p.name) LIKE ? OR LOWER(p.specialty) LIKE ? OR LOWER(COALESCE(ip.display_name, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT p.*, ip.*
    FROM professionals p
    LEFT JOIN intranet_professional_profiles ip ON ip.professional_id = p.id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(ip.is_published, 0) DESC, COALESCE(ip.display_order, 0) ASC, p.name ASC
    LIMIT ${limitValue(filters.limit, 80, 200)}
    `,
    params
  );
  return (rows as Row[]).map(mapProfessional);
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

export const listIntranetProcedures = async (db: DbInterface, filters: IntranetProcedureFilters = {}) => {
  await ensureIntranetCatalogTables(db);
  const where = ['COALESCE(ip.is_published, 0) = 1'];
  const params: unknown[] = [];
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push("(LOWER(c.nome) LIKE ? OR LOWER(COALESCE(ip.display_name, '')) LIKE ? OR LOWER(COALESCE(ip.summary, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (filters.featuredOnly) where.push('COALESCE(ip.is_featured, 0) = 1');
  const rows = await safeQuery(
    db,
    `
    SELECT c.*, ip.*
    FROM feegow_procedures_catalog c
    INNER JOIN intranet_procedure_profiles ip ON ip.procedimento_id = c.procedimento_id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(ip.is_featured, 0) DESC, ip.display_order ASC, c.nome ASC
    LIMIT ${limitValue(filters.limit, 12)}
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
    where.push("(LOWER(c.nome) LIKE ? OR LOWER(COALESCE(ip.display_name, '')) LIKE ? OR LOWER(COALESCE(ip.summary, '')) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const rows = await safeQuery(
    db,
    `
    SELECT c.*, ip.*
    FROM feegow_procedures_catalog c
    LEFT JOIN intranet_procedure_profiles ip ON ip.procedimento_id = c.procedimento_id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(ip.is_published, 0) DESC, COALESCE(ip.display_order, 0) ASC, c.nome ASC
    LIMIT ${limitValue(filters.limit, 80, 200)}
    `,
    params
  );
  return (rows as Row[]).map(mapProcedure);
};

export const saveIntranetProcedureProfile = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetCatalogTables(db);
  const procedimentoId = Number(input.procedimentoId || input.procedimento_id || 0);
  if (!Number.isFinite(procedimentoId) || procedimentoId <= 0) throw new Error('procedimentoId é obrigatório.');
  const displayName = clean(input.displayName || input.display_name);
  if (!displayName) throw new Error('displayName é obrigatório.');
  const now = nowIso();
  const existing = await db.query(`SELECT procedimento_id FROM intranet_procedure_profiles WHERE procedimento_id = ? LIMIT 1`, [procedimentoId]);
  const values = [
    normalizeSlug(input.slug || displayName || procedimentoId),
    displayName,
    nullable(input.category),
    nullable(input.subcategory),
    nullable(input.summary),
    nullable(input.description),
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
    procedimentoId,
  ];
  if (existing.length) {
    await db.execute(
      `
      UPDATE intranet_procedure_profiles
      SET slug = ?, display_name = ?, category = ?, subcategory = ?, summary = ?, description = ?,
        preparation_instructions = ?, contraindications = ?, estimated_duration_text = ?, recovery_notes = ?,
        show_price = ?, published_price = ?, is_featured = ?, is_published = ?, display_order = ?, updated_by = ?, updated_at = ?
      WHERE procedimento_id = ?
      `,
      values
    );
  } else {
    await db.execute(
      `
      INSERT INTO intranet_procedure_profiles (
        slug, display_name, category, subcategory, summary, description, preparation_instructions,
        contraindications, estimated_duration_text, recovery_notes, show_price, published_price,
        is_featured, is_published, display_order, updated_by, updated_at, procedimento_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values
    );
  }
  return (await listIntranetProcedureProfiles(db, { search: displayName, limit: 1 }))[0] || null;
};

export const listIntranetProfessionalProcedures = async (db: DbInterface, professionalIdRaw?: string) => {
  await ensureIntranetCatalogTables(db);
  const professionalId = clean(professionalIdRaw);
  const where = professionalId ? 'WHERE professional_id = ?' : '';
  const rows = await safeQuery(
    db,
    `SELECT * FROM intranet_professional_procedures ${where} ORDER BY display_order ASC, created_at DESC`,
    professionalId ? [professionalId] : []
  );
  return (rows as Row[]).map((row) => ({
    id: clean(row.id),
    professionalId: clean(row.professional_id),
    procedimentoId: Number(row.procedimento_id || 0),
    notes: clean(row.notes) || null,
    displayOrder: Number(row.display_order || 0),
    isPublished: bool(row.is_published),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  }));
};

export const saveIntranetProfessionalProcedure = async (db: DbInterface, input: Row) => {
  await ensureIntranetCatalogTables(db);
  const inputId = clean(input.id);
  const professionalId = clean(input.professionalId || input.professional_id);
  const procedimentoId = Number(input.procedimentoId || input.procedimento_id || 0);
  if (!professionalId || !Number.isFinite(procedimentoId) || procedimentoId <= 0) {
    throw new Error('professionalId e procedimentoId são obrigatórios.');
  }
  const now = nowIso();
  const existing = inputId
    ? await db.query(`SELECT id FROM intranet_professional_procedures WHERE id = ? LIMIT 1`, [inputId])
    : await db.query(
        `SELECT id FROM intranet_professional_procedures WHERE professional_id = ? AND procedimento_id = ? LIMIT 1`,
        [professionalId, procedimentoId]
      );
  const id = clean((existing[0] as Row | undefined)?.id) || inputId || randomUUID();
  const values = [
    professionalId,
    procedimentoId,
    nullable(input.notes),
    Number(input.displayOrder ?? input.display_order ?? 0),
    input.isPublished === undefined && input.is_published === undefined ? 1 : toDbBool(input.isPublished ?? input.is_published),
    now,
    id,
  ];
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_professional_procedures SET professional_id = ?, procedimento_id = ?, notes = ?, display_order = ?, is_published = ?, updated_at = ? WHERE id = ?`,
      values
    );
  } else {
    await db.execute(
      `INSERT INTO intranet_professional_procedures (professional_id, procedimento_id, notes, display_order, is_published, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, now]
    );
  }
  return (await listIntranetProfessionalProcedures(db, professionalId)).find((item) => item.id === id) || null;
};
