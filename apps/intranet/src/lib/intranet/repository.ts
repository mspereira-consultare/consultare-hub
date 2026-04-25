import { randomUUID } from 'crypto';
import type { DbInterface } from '@consultare/core/db';

type Row = Record<string, unknown>;
type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export class IntranetValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const PAGE_TYPES = new Set(['content', 'landing', 'catalog', 'faq', 'news_index', 'system']);
const PAGE_STATUSES = new Set(['draft', 'published', 'archived']);
const NODE_TYPES = new Set(['page', 'external_link', 'label']);
const AUDIENCE_MODES = new Set(['inherit', 'custom']);
const POST_TYPES = new Set(['news', 'notice', 'banner']);
const NEWS_CATEGORIES = new Set(['geral', 'rh', 'operacional', 'comunicado', 'qualidade', 'ti', 'eventos']);
const NEWS_HIGHLIGHT_LEVELS = new Set(['info', 'attention', 'important', 'urgent']);
const FAQ_SOURCE_TYPES = new Set(['manual', 'chatbot_unanswered']);
const FAQ_KNOWLEDGE_STATUSES = new Set(['pending_index', 'indexed', 'reindex_needed']);
const SCOPE_TYPES = new Set(['section', 'catalog', 'faq', 'news', 'global']);
const RULE_TYPES = new Set(['role', 'department', 'team']);

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const toDbBool = (value: unknown) => (value === true || value === 1 || value === '1' ? 1 : 0);
const fromDbBool = (value: unknown) => value === true || value === 1 || value === '1';
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
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

const stringifyJson = (value: unknown, fallback: JsonValue = {}) => {
  const source = value === undefined ? fallback : value;
  return JSON.stringify(source ?? fallback);
};

const parseStringList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
};

const normalizeSlug = (value: unknown) => {
  const raw = clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return raw;
};

const pickEnum = (value: unknown, allowed: Set<string>, fallback: string) => {
  const raw = clean(value).toLowerCase();
  return allowed.has(raw) ? raw : fallback;
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const msg = String(err?.message || '');
    const code = String(err?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg) || /duplicate column/i.test(msg)) return;
    throw error;
  }
};

const ensureColumns = async (db: DbInterface) => {
  await safeAddColumn(db, `ALTER TABLE intranet_pages ADD COLUMN current_revision_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_navigation_nodes ADD COLUMN audience_mode VARCHAR(20) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_news_posts ADD COLUMN cover_asset_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_news_posts ADD COLUMN category VARCHAR(40) DEFAULT 'geral'`);
  await safeAddColumn(db, `ALTER TABLE intranet_news_posts ADD COLUMN highlight_level VARCHAR(40) DEFAULT 'info'`);
  await safeAddColumn(db, `ALTER TABLE intranet_faq_items ADD COLUMN source_type VARCHAR(40) DEFAULT 'manual'`);
  await safeAddColumn(db, `ALTER TABLE intranet_faq_items ADD COLUMN source_question_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_faq_items ADD COLUMN knowledge_status VARCHAR(40) DEFAULT 'pending_index'`);
  await safeAddColumn(db, `ALTER TABLE intranet_faq_items ADD COLUMN approved_at TEXT NULL`);
};

export const ensureIntranetTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_pages (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      full_path VARCHAR(500) NOT NULL,
      page_type VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL,
      parent_page_id VARCHAR(64),
      current_revision_id VARCHAR(64),
      meta_title VARCHAR(180),
      meta_description TEXT,
      icon_name VARCHAR(80),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL,
      published_at TEXT,
      published_by VARCHAR(64),
      archived_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_page_revisions (
      id VARCHAR(64) PRIMARY KEY,
      page_id VARCHAR(64) NOT NULL,
      revision_number INTEGER NOT NULL,
      content_json LONGTEXT NOT NULL,
      change_summary TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR(64),
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_navigation_nodes (
      id VARCHAR(64) PRIMARY KEY,
      parent_node_id VARCHAR(64),
      node_type VARCHAR(40) NOT NULL,
      page_id VARCHAR(64),
      label VARCHAR(180) NOT NULL,
      url VARCHAR(500),
      icon_name VARCHAR(80),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      audience_mode VARCHAR(20) NOT NULL DEFAULT 'inherit',
      created_by VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_assets (
      id VARCHAR(64) PRIMARY KEY,
      entity_type VARCHAR(80),
      entity_id VARCHAR(64),
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(160),
      storage_key VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64),
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_audience_groups (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_audience_group_rules (
      id VARCHAR(64) PRIMARY KEY,
      audience_group_id VARCHAR(64) NOT NULL,
      rule_type VARCHAR(40) NOT NULL,
      rule_value VARCHAR(180) NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_user_audience_assignments (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      audience_group_id VARCHAR(64) NOT NULL,
      assigned_by VARCHAR(64),
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_page_audiences (
      id VARCHAR(64) PRIMARY KEY,
      page_id VARCHAR(64) NOT NULL,
      audience_group_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_editorial_scopes (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      description TEXT,
      scope_type VARCHAR(40) NOT NULL,
      scope_ref VARCHAR(180),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_editorial_scope_assignments (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      editorial_scope_id VARCHAR(64) NOT NULL,
      assigned_by VARCHAR(64),
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_news_posts (
      id VARCHAR(64) PRIMARY KEY,
      post_type VARCHAR(30) NOT NULL,
      title VARCHAR(220) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      summary TEXT,
      body_json LONGTEXT NOT NULL,
      cover_asset_id VARCHAR(64),
      category VARCHAR(40) NOT NULL DEFAULT 'geral',
      highlight_level VARCHAR(40) NOT NULL DEFAULT 'info',
      is_featured INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL,
      publish_start_at TEXT,
      publish_end_at TEXT,
      created_by VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL,
      published_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_news_post_audiences (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      audience_group_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_faq_categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_faq_items (
      id VARCHAR(64) PRIMARY KEY,
      category_id VARCHAR(64),
      question TEXT NOT NULL,
      answer_json LONGTEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      source_type VARCHAR(40) NOT NULL DEFAULT 'manual',
      source_question_id VARCHAR(64),
      knowledge_status VARCHAR(40) NOT NULL DEFAULT 'pending_index',
      approved_at TEXT,
      created_by VARCHAR(64),
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64),
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_faq_item_audiences (
      id VARCHAR(64) PRIMARY KEY,
      faq_item_id VARCHAR(64) NOT NULL,
      audience_group_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumns(db);
  tablesEnsured = true;
};

const queryById = async (db: DbInterface, table: string, id: string) => {
  const rows = await db.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return (rows[0] || null) as Row | null;
};

const replaceJoinRows = async (
  db: DbInterface,
  table: string,
  ownerColumn: string,
  ownerId: string,
  targetColumn: string,
  targetIds: string[]
) => {
  await db.execute(`DELETE FROM ${table} WHERE ${ownerColumn} = ?`, [ownerId]);
  for (const targetId of targetIds) {
    await db.execute(
      `INSERT INTO ${table} (id, ${ownerColumn}, ${targetColumn}, created_at) VALUES (?, ?, ?, ?)`,
      [randomUUID(), ownerId, targetId, nowIso()]
    );
  }
};

const listJoinIds = async (db: DbInterface, table: string, ownerColumn: string, ownerId: string, targetColumn: string) => {
  const rows = await db.query(`SELECT ${targetColumn} FROM ${table} WHERE ${ownerColumn} = ?`, [ownerId]);
  return rows.map((row) => clean((row as Row)[targetColumn])).filter(Boolean);
};

const buildPagePath = async (db: DbInterface, slug: string, parentPageId: string | null) => {
  if (!parentPageId) return slug;
  const parent = await getPageById(db, parentPageId);
  if (!parent) throw new IntranetValidationError('Pagina pai nao encontrada.', 404);
  return `${parent.fullPath}/${slug}`.replace(/\/+/g, '/');
};

const nextRevisionNumber = async (db: DbInterface, pageId: string) => {
  const rows = await db.query(
    `SELECT MAX(revision_number) as max_revision FROM intranet_page_revisions WHERE page_id = ?`,
    [pageId]
  );
  return Number((rows[0] as Row | undefined)?.max_revision || 0) + 1;
};

const mapPage = async (db: DbInterface, row: Row) => ({
  id: clean(row.id),
  title: clean(row.title),
  slug: clean(row.slug),
  fullPath: clean(row.full_path),
  pageType: clean(row.page_type),
  status: clean(row.status),
  parentPageId: clean(row.parent_page_id) || null,
  currentRevisionId: clean(row.current_revision_id) || null,
  metaTitle: clean(row.meta_title) || null,
  metaDescription: clean(row.meta_description) || null,
  iconName: clean(row.icon_name) || null,
  sortOrder: Number(row.sort_order || 0),
  content: parseJson(row.content_json, {}),
  audienceGroupIds: await listJoinIds(db, 'intranet_page_audiences', 'page_id', clean(row.id), 'audience_group_id'),
  createdBy: clean(row.created_by) || null,
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by) || null,
  updatedAt: clean(row.updated_at),
  publishedAt: clean(row.published_at) || null,
  publishedBy: clean(row.published_by) || null,
  archivedAt: clean(row.archived_at) || null,
});

export const getPageById = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  const rows = await db.query(
    `
    SELECT p.*, r.content_json
    FROM intranet_pages p
    LEFT JOIN intranet_page_revisions r ON r.id = p.current_revision_id
    WHERE p.id = ?
    LIMIT 1
    `,
    [id]
  );
  if (!rows[0]) return null;
  return mapPage(db, rows[0] as Row);
};

export const listPages = async (db: DbInterface, filters: { status?: string; search?: string }) => {
  await ensureIntranetTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const status = clean(filters.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(p.status) = ?');
    params.push(status);
  }
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push('(LOWER(p.title) LIKE ? OR LOWER(p.full_path) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await db.query(
    `
    SELECT p.*, r.content_json
    FROM intranet_pages p
    LEFT JOIN intranet_page_revisions r ON r.id = p.current_revision_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.sort_order ASC, p.title ASC
    `,
    params
  );
  return Promise.all(rows.map((row) => mapPage(db, row as Row)));
};

export const createPage = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const title = clean(input.title);
  if (!title) throw new IntranetValidationError('Titulo da pagina e obrigatorio.');
  const slug = normalizeSlug(input.slug || title);
  if (!slug) throw new IntranetValidationError('Slug da pagina e obrigatorio.');
  const parentPageId = nullable(input.parentPageId);
  const status = pickEnum(input.status, PAGE_STATUSES, 'draft');
  const pageType = pickEnum(input.pageType, PAGE_TYPES, 'content');
  const pageId = randomUUID();
  const revisionId = randomUUID();
  const createdAt = nowIso();
  const fullPath = await buildPagePath(db, slug, parentPageId);

  await db.execute(
    `
    INSERT INTO intranet_pages (
      id, title, slug, full_path, page_type, status, parent_page_id, current_revision_id,
      meta_title, meta_description, icon_name, sort_order, created_by, created_at,
      updated_by, updated_at, published_at, published_by, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      pageId,
      title,
      slug,
      fullPath,
      pageType,
      status,
      parentPageId,
      revisionId,
      nullable(input.metaTitle),
      nullable(input.metaDescription),
      nullable(input.iconName),
      Number(input.sortOrder || 0),
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
      status === 'published' ? createdAt : null,
      status === 'published' ? actorUserId : null,
      status === 'archived' ? createdAt : null,
    ]
  );

  await db.execute(
    `
    INSERT INTO intranet_page_revisions (
      id, page_id, revision_number, content_json, change_summary, is_published, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      revisionId,
      pageId,
      1,
      stringifyJson(input.content, {}),
      nullable(input.changeSummary) || 'Criacao da pagina',
      status === 'published' ? 1 : 0,
      actorUserId,
      createdAt,
    ]
  );

  await replaceJoinRows(db, 'intranet_page_audiences', 'page_id', pageId, 'audience_group_id', parseStringList(input.audienceGroupIds));
  return getPageById(db, pageId);
};

export const updatePage = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await getPageById(db, id);
  if (!current) throw new IntranetValidationError('Pagina nao encontrada.', 404);

  const title = clean(input.title ?? current.title);
  if (!title) throw new IntranetValidationError('Titulo da pagina e obrigatorio.');
  const slug = normalizeSlug(input.slug ?? current.slug);
  const parentPageId = input.parentPageId === undefined ? current.parentPageId : nullable(input.parentPageId);
  const status = pickEnum(input.status ?? current.status, PAGE_STATUSES, current.status);
  const pageType = pickEnum(input.pageType ?? current.pageType, PAGE_TYPES, current.pageType);
  const updatedAt = nowIso();
  const fullPath = await buildPagePath(db, slug, parentPageId);
  let currentRevisionId = current.currentRevisionId;

  if (input.content !== undefined || input.changeSummary !== undefined) {
    currentRevisionId = randomUUID();
    await db.execute(
      `
      INSERT INTO intranet_page_revisions (
        id, page_id, revision_number, content_json, change_summary, is_published, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        currentRevisionId,
        id,
        await nextRevisionNumber(db, id),
        stringifyJson(input.content ?? current.content, {}),
        nullable(input.changeSummary) || 'Atualizacao da pagina',
        status === 'published' ? 1 : 0,
        actorUserId,
        updatedAt,
      ]
    );
  }

  await db.execute(
    `
    UPDATE intranet_pages
    SET title = ?, slug = ?, full_path = ?, page_type = ?, status = ?, parent_page_id = ?,
        current_revision_id = ?, meta_title = ?, meta_description = ?, icon_name = ?,
        sort_order = ?, updated_by = ?, updated_at = ?,
        published_at = ?, published_by = ?, archived_at = ?
    WHERE id = ?
    `,
    [
      title,
      slug,
      fullPath,
      pageType,
      status,
      parentPageId,
      currentRevisionId,
      input.metaTitle === undefined ? current.metaTitle : nullable(input.metaTitle),
      input.metaDescription === undefined ? current.metaDescription : nullable(input.metaDescription),
      input.iconName === undefined ? current.iconName : nullable(input.iconName),
      Number(input.sortOrder ?? current.sortOrder ?? 0),
      actorUserId,
      updatedAt,
      status === 'published' ? current.publishedAt || updatedAt : null,
      status === 'published' ? current.publishedBy || actorUserId : null,
      status === 'archived' ? current.archivedAt || updatedAt : null,
      id,
    ]
  );

  if (input.audienceGroupIds !== undefined) {
    await replaceJoinRows(db, 'intranet_page_audiences', 'page_id', id, 'audience_group_id', parseStringList(input.audienceGroupIds));
  }

  return getPageById(db, id);
};

export const archivePage = async (db: DbInterface, id: string, actorUserId: string) => {
  return updatePage(db, id, { status: 'archived' }, actorUserId);
};

const mapNavigationNode = (row: Row) => ({
  id: clean(row.id),
  parentNodeId: clean(row.parent_node_id) || null,
  nodeType: clean(row.node_type),
  pageId: clean(row.page_id) || null,
  label: clean(row.label),
  url: clean(row.url) || null,
  iconName: clean(row.icon_name) || null,
  sortOrder: Number(row.sort_order || 0),
  isVisible: fromDbBool(row.is_visible),
  audienceMode: clean(row.audience_mode) || 'inherit',
  createdBy: clean(row.created_by) || null,
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by) || null,
  updatedAt: clean(row.updated_at),
});

export const listNavigationNodes = async (db: DbInterface) => {
  await ensureIntranetTables(db);
  const rows = await db.query(`SELECT * FROM intranet_navigation_nodes ORDER BY sort_order ASC, label ASC`);
  return rows.map((row) => mapNavigationNode(row as Row));
};

export const createNavigationNode = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const label = clean(input.label);
  if (!label) throw new IntranetValidationError('Titulo do item de navegacao e obrigatorio.');
  const nodeType = pickEnum(input.nodeType, NODE_TYPES, 'page');
  const pageId = nullable(input.pageId);
  const url = nullable(input.url);
  if (nodeType === 'page' && !pageId) throw new IntranetValidationError('Pagina vinculada e obrigatoria para item de pagina.');
  if (nodeType === 'external_link' && !url) throw new IntranetValidationError('URL e obrigatoria para link externo.');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_navigation_nodes (
      id, parent_node_id, node_type, page_id, label, url, icon_name, sort_order,
      is_visible, audience_mode, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      nullable(input.parentNodeId),
      nodeType,
      nodeType === 'page' ? pageId : null,
      label,
      nodeType === 'external_link' ? url : null,
      nullable(input.iconName),
      Number(input.sortOrder || 0),
      input.isVisible === false ? 0 : 1,
      pickEnum(input.audienceMode, AUDIENCE_MODES, 'inherit'),
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );
  return mapNavigationNode((await queryById(db, 'intranet_navigation_nodes', id))!);
};

export const updateNavigationNode = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await queryById(db, 'intranet_navigation_nodes', id);
  if (!current) throw new IntranetValidationError('Item de navegacao nao encontrado.', 404);
  const label = clean(input.label ?? current.label);
  if (!label) throw new IntranetValidationError('Titulo do item de navegacao e obrigatorio.');
  const nodeType = pickEnum(input.nodeType ?? current.node_type, NODE_TYPES, clean(current.node_type) || 'page');
  const pageId = input.pageId === undefined ? nullable(current.page_id) : nullable(input.pageId);
  const url = input.url === undefined ? nullable(current.url) : nullable(input.url);
  if (nodeType === 'page' && !pageId) throw new IntranetValidationError('Pagina vinculada e obrigatoria para item de pagina.');
  if (nodeType === 'external_link' && !url) throw new IntranetValidationError('URL e obrigatoria para link externo.');
  await db.execute(
    `
    UPDATE intranet_navigation_nodes
    SET parent_node_id = ?, node_type = ?, page_id = ?, label = ?, url = ?, icon_name = ?,
        sort_order = ?, is_visible = ?, audience_mode = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      input.parentNodeId === undefined ? nullable(current.parent_node_id) : nullable(input.parentNodeId),
      nodeType,
      nodeType === 'page' ? pageId : null,
      label,
      nodeType === 'external_link' ? url : null,
      input.iconName === undefined ? nullable(current.icon_name) : nullable(input.iconName),
      Number(input.sortOrder ?? current.sort_order ?? 0),
      input.isVisible === undefined ? toDbBool(current.is_visible) : toDbBool(input.isVisible),
      pickEnum(input.audienceMode ?? current.audience_mode, AUDIENCE_MODES, 'inherit'),
      actorUserId,
      nowIso(),
      id,
    ]
  );
  return mapNavigationNode((await queryById(db, 'intranet_navigation_nodes', id))!);
};

export const deleteNavigationNode = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  await db.execute(`UPDATE intranet_navigation_nodes SET parent_node_id = NULL WHERE parent_node_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_navigation_nodes WHERE id = ?`, [id]);
  return { id };
};

const mapAudienceGroup = async (db: DbInterface, row: Row) => {
  const id = clean(row.id);
  const rules = await db.query(`SELECT * FROM intranet_audience_group_rules WHERE audience_group_id = ? ORDER BY rule_type ASC, rule_value ASC`, [id]);
  const assignments = await db.query(`SELECT * FROM intranet_user_audience_assignments WHERE audience_group_id = ? ORDER BY created_at DESC`, [id]);
  return {
    id,
    name: clean(row.name),
    description: clean(row.description) || null,
    isActive: fromDbBool(row.is_active),
    rules: rules.map((rule) => ({
      id: clean((rule as Row).id),
      ruleType: clean((rule as Row).rule_type),
      ruleValue: clean((rule as Row).rule_value),
      isActive: fromDbBool((rule as Row).is_active),
      createdAt: clean((rule as Row).created_at),
    })),
    assignments: assignments.map((assignment) => ({
      id: clean((assignment as Row).id),
      userId: clean((assignment as Row).user_id),
      assignedBy: clean((assignment as Row).assigned_by) || null,
      createdAt: clean((assignment as Row).created_at),
    })),
    createdBy: clean(row.created_by) || null,
    createdAt: clean(row.created_at),
    updatedBy: clean(row.updated_by) || null,
    updatedAt: clean(row.updated_at),
  };
};

export const listAudienceGroups = async (db: DbInterface) => {
  await ensureIntranetTables(db);
  const rows = await db.query(`SELECT * FROM intranet_audience_groups ORDER BY is_active DESC, name ASC`);
  return Promise.all(rows.map((row) => mapAudienceGroup(db, row as Row)));
};

export const createAudienceGroup = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const name = clean(input.name);
  if (!name) throw new IntranetValidationError('Nome da audiencia e obrigatorio.');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO intranet_audience_groups (id, name, description, is_active, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, nullable(input.description), input.isActive === false ? 0 : 1, actorUserId, createdAt, actorUserId, createdAt]
  );
  await replaceAudienceRules(db, id, input.rules);
  await replaceAudienceAssignments(db, id, input.userIds, actorUserId);
  return mapAudienceGroup(db, (await queryById(db, 'intranet_audience_groups', id))!);
};

export const updateAudienceGroup = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await queryById(db, 'intranet_audience_groups', id);
  if (!current) throw new IntranetValidationError('Audiencia nao encontrada.', 404);
  const name = clean(input.name ?? current.name);
  if (!name) throw new IntranetValidationError('Nome da audiencia e obrigatorio.');
  await db.execute(
    `UPDATE intranet_audience_groups SET name = ?, description = ?, is_active = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
    [
      name,
      input.description === undefined ? nullable(current.description) : nullable(input.description),
      input.isActive === undefined ? toDbBool(current.is_active) : toDbBool(input.isActive),
      actorUserId,
      nowIso(),
      id,
    ]
  );
  if (input.rules !== undefined) await replaceAudienceRules(db, id, input.rules);
  if (input.userIds !== undefined) await replaceAudienceAssignments(db, id, input.userIds, actorUserId);
  return mapAudienceGroup(db, (await queryById(db, 'intranet_audience_groups', id))!);
};

const replaceAudienceRules = async (db: DbInterface, audienceGroupId: string, rulesRaw: unknown) => {
  await db.execute(`DELETE FROM intranet_audience_group_rules WHERE audience_group_id = ?`, [audienceGroupId]);
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];
  for (const raw of rules) {
    const rule = raw as Row;
    const ruleType = pickEnum(rule.ruleType, RULE_TYPES, '');
    const ruleValue = clean(rule.ruleValue);
    if (!ruleType || !ruleValue) continue;
    await db.execute(
      `INSERT INTO intranet_audience_group_rules (id, audience_group_id, rule_type, rule_value, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), audienceGroupId, ruleType, ruleValue, rule.isActive === false ? 0 : 1, nowIso()]
    );
  }
};

const replaceAudienceAssignments = async (db: DbInterface, audienceGroupId: string, userIdsRaw: unknown, actorUserId: string) => {
  await db.execute(`DELETE FROM intranet_user_audience_assignments WHERE audience_group_id = ?`, [audienceGroupId]);
  for (const userId of parseStringList(userIdsRaw)) {
    await db.execute(
      `INSERT INTO intranet_user_audience_assignments (id, user_id, audience_group_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), userId, audienceGroupId, actorUserId, nowIso()]
    );
  }
};

export const deleteAudienceGroup = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  await db.execute(`DELETE FROM intranet_audience_group_rules WHERE audience_group_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_user_audience_assignments WHERE audience_group_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_audience_groups WHERE id = ?`, [id]);
  return { id };
};

const mapEditorialScope = async (db: DbInterface, row: Row) => {
  const id = clean(row.id);
  const assignments = await db.query(`SELECT * FROM intranet_editorial_scope_assignments WHERE editorial_scope_id = ? ORDER BY created_at DESC`, [id]);
  return {
    id,
    name: clean(row.name),
    description: clean(row.description) || null,
    scopeType: clean(row.scope_type),
    scopeRef: clean(row.scope_ref) || null,
    isActive: fromDbBool(row.is_active),
    userIds: assignments.map((assignment) => clean((assignment as Row).user_id)).filter(Boolean),
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

export const listEditorialScopes = async (db: DbInterface) => {
  await ensureIntranetTables(db);
  const rows = await db.query(`SELECT * FROM intranet_editorial_scopes ORDER BY is_active DESC, name ASC`);
  return Promise.all(rows.map((row) => mapEditorialScope(db, row as Row)));
};

export const createEditorialScope = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const name = clean(input.name);
  if (!name) throw new IntranetValidationError('Nome do escopo editorial e obrigatorio.');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO intranet_editorial_scopes (id, name, description, scope_type, scope_ref, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, nullable(input.description), pickEnum(input.scopeType, SCOPE_TYPES, 'section'), nullable(input.scopeRef), input.isActive === false ? 0 : 1, createdAt, createdAt]
  );
  await replaceEditorialScopeAssignments(db, id, input.userIds, actorUserId);
  return mapEditorialScope(db, (await queryById(db, 'intranet_editorial_scopes', id))!);
};

export const updateEditorialScope = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await queryById(db, 'intranet_editorial_scopes', id);
  if (!current) throw new IntranetValidationError('Escopo editorial nao encontrado.', 404);
  const name = clean(input.name ?? current.name);
  if (!name) throw new IntranetValidationError('Nome do escopo editorial e obrigatorio.');
  await db.execute(
    `UPDATE intranet_editorial_scopes SET name = ?, description = ?, scope_type = ?, scope_ref = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [
      name,
      input.description === undefined ? nullable(current.description) : nullable(input.description),
      pickEnum(input.scopeType ?? current.scope_type, SCOPE_TYPES, 'section'),
      input.scopeRef === undefined ? nullable(current.scope_ref) : nullable(input.scopeRef),
      input.isActive === undefined ? toDbBool(current.is_active) : toDbBool(input.isActive),
      nowIso(),
      id,
    ]
  );
  if (input.userIds !== undefined) await replaceEditorialScopeAssignments(db, id, input.userIds, actorUserId);
  return mapEditorialScope(db, (await queryById(db, 'intranet_editorial_scopes', id))!);
};

const replaceEditorialScopeAssignments = async (db: DbInterface, scopeId: string, userIdsRaw: unknown, actorUserId: string) => {
  await db.execute(`DELETE FROM intranet_editorial_scope_assignments WHERE editorial_scope_id = ?`, [scopeId]);
  for (const userId of parseStringList(userIdsRaw)) {
    await db.execute(
      `INSERT INTO intranet_editorial_scope_assignments (id, user_id, editorial_scope_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), userId, scopeId, actorUserId, nowIso()]
    );
  }
};

export const deleteEditorialScope = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  await db.execute(`DELETE FROM intranet_editorial_scope_assignments WHERE editorial_scope_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_editorial_scopes WHERE id = ?`, [id]);
  return { id };
};

const mapNewsPost = async (db: DbInterface, row: Row) => {
  const id = clean(row.id);
  return {
    id,
    postType: clean(row.post_type),
    title: clean(row.title),
    slug: clean(row.slug),
    summary: clean(row.summary) || null,
    body: parseJson(row.body_json, {}),
    coverAssetId: clean(row.cover_asset_id) || null,
    category: pickEnum(row.category, NEWS_CATEGORIES, 'geral'),
    highlightLevel: pickEnum(row.highlight_level, NEWS_HIGHLIGHT_LEVELS, 'info'),
    isFeatured: fromDbBool(row.is_featured),
    status: clean(row.status),
    publishStartAt: clean(row.publish_start_at) || null,
    publishEndAt: clean(row.publish_end_at) || null,
    audienceGroupIds: await listJoinIds(db, 'intranet_news_post_audiences', 'post_id', id, 'audience_group_id'),
    createdBy: clean(row.created_by) || null,
    createdAt: clean(row.created_at),
    updatedBy: clean(row.updated_by) || null,
    updatedAt: clean(row.updated_at),
    publishedAt: clean(row.published_at) || null,
  };
};

export const listNewsPosts = async (db: DbInterface, filters: { status?: string; search?: string; postType?: string; category?: string }) => {
  await ensureIntranetTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  const status = clean(filters.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(status) = ?');
    params.push(status);
  }
  const postType = clean(filters.postType).toLowerCase();
  if (postType && postType !== 'all') {
    where.push('LOWER(post_type) = ?');
    params.push(postType);
  }
  const category = clean(filters.category).toLowerCase();
  if (category && category !== 'all') {
    where.push('LOWER(category) = ?');
    params.push(category);
  }
  const search = clean(filters.search).toLowerCase();
  if (search) {
    where.push('(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await db.query(`SELECT * FROM intranet_news_posts WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
  return Promise.all(rows.map((row) => mapNewsPost(db, row as Row)));
};

export const getNewsPostById = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  const row = await queryById(db, 'intranet_news_posts', id);
  return row ? mapNewsPost(db, row) : null;
};

export const createNewsPost = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const title = clean(input.title);
  if (!title) throw new IntranetValidationError('Titulo da noticia/aviso e obrigatorio.');
  const id = randomUUID();
  const status = pickEnum(input.status, PAGE_STATUSES, 'draft');
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_news_posts (
      id, post_type, title, slug, summary, body_json, cover_asset_id, category, highlight_level, is_featured, status,
      publish_start_at, publish_end_at, created_by, created_at, updated_by, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      pickEnum(input.postType, POST_TYPES, 'news'),
      title,
      normalizeSlug(input.slug || title),
      nullable(input.summary),
      stringifyJson(input.body, {}),
      nullable(input.coverAssetId),
      pickEnum(input.category, NEWS_CATEGORIES, 'geral'),
      pickEnum(input.highlightLevel, NEWS_HIGHLIGHT_LEVELS, 'info'),
      toDbBool(input.isFeatured),
      status,
      nullable(input.publishStartAt),
      nullable(input.publishEndAt),
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
      status === 'published' ? createdAt : null,
    ]
  );
  await replaceJoinRows(db, 'intranet_news_post_audiences', 'post_id', id, 'audience_group_id', parseStringList(input.audienceGroupIds));
  return getNewsPostById(db, id);
};

export const updateNewsPost = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await getNewsPostById(db, id);
  if (!current) throw new IntranetValidationError('Noticia/aviso nao encontrado.', 404);
  const title = clean(input.title ?? current.title);
  if (!title) throw new IntranetValidationError('Titulo da noticia/aviso e obrigatorio.');
  const status = pickEnum(input.status ?? current.status, PAGE_STATUSES, current.status);
  await db.execute(
    `
    UPDATE intranet_news_posts
    SET post_type = ?, title = ?, slug = ?, summary = ?, body_json = ?, cover_asset_id = ?,
        category = ?, highlight_level = ?, is_featured = ?, status = ?, publish_start_at = ?, publish_end_at = ?,
        updated_by = ?, updated_at = ?, published_at = ?
    WHERE id = ?
    `,
    [
      pickEnum(input.postType ?? current.postType, POST_TYPES, current.postType),
      title,
      normalizeSlug(input.slug ?? current.slug),
      input.summary === undefined ? current.summary : nullable(input.summary),
      stringifyJson(input.body ?? current.body, {}),
      input.coverAssetId === undefined ? current.coverAssetId : nullable(input.coverAssetId),
      pickEnum(input.category ?? current.category, NEWS_CATEGORIES, current.category || 'geral'),
      pickEnum(input.highlightLevel ?? current.highlightLevel, NEWS_HIGHLIGHT_LEVELS, current.highlightLevel || 'info'),
      input.isFeatured === undefined ? toDbBool(current.isFeatured) : toDbBool(input.isFeatured),
      status,
      input.publishStartAt === undefined ? current.publishStartAt : nullable(input.publishStartAt),
      input.publishEndAt === undefined ? current.publishEndAt : nullable(input.publishEndAt),
      actorUserId,
      nowIso(),
      status === 'published' ? current.publishedAt || nowIso() : null,
      id,
    ]
  );
  if (input.audienceGroupIds !== undefined) {
    await replaceJoinRows(db, 'intranet_news_post_audiences', 'post_id', id, 'audience_group_id', parseStringList(input.audienceGroupIds));
  }
  return getNewsPostById(db, id);
};

export const archiveNewsPost = async (db: DbInterface, id: string, actorUserId: string) => {
  return updateNewsPost(db, id, { status: 'archived' }, actorUserId);
};

const mapFaqCategory = (row: Row) => ({
  id: clean(row.id),
  name: clean(row.name),
  slug: clean(row.slug),
  description: clean(row.description) || null,
  sortOrder: Number(row.sort_order || 0),
  isActive: fromDbBool(row.is_active),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

export const listFaqCategories = async (db: DbInterface) => {
  await ensureIntranetTables(db);
  const rows = await db.query(`SELECT * FROM intranet_faq_categories ORDER BY sort_order ASC, name ASC`);
  return rows.map((row) => mapFaqCategory(row as Row));
};

export const createFaqCategory = async (db: DbInterface, input: Row) => {
  await ensureIntranetTables(db);
  const name = clean(input.name);
  if (!name) throw new IntranetValidationError('Nome da categoria de FAQ e obrigatorio.');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO intranet_faq_categories (id, name, slug, description, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, normalizeSlug(input.slug || name), nullable(input.description), Number(input.sortOrder || 0), input.isActive === false ? 0 : 1, createdAt, createdAt]
  );
  return mapFaqCategory((await queryById(db, 'intranet_faq_categories', id))!);
};

export const updateFaqCategory = async (db: DbInterface, id: string, input: Row) => {
  await ensureIntranetTables(db);
  const current = await queryById(db, 'intranet_faq_categories', id);
  if (!current) throw new IntranetValidationError('Categoria de FAQ nao encontrada.', 404);
  const name = clean(input.name ?? current.name);
  await db.execute(
    `UPDATE intranet_faq_categories SET name = ?, slug = ?, description = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [
      name,
      normalizeSlug(input.slug ?? current.slug ?? name),
      input.description === undefined ? nullable(current.description) : nullable(input.description),
      Number(input.sortOrder ?? current.sort_order ?? 0),
      input.isActive === undefined ? toDbBool(current.is_active) : toDbBool(input.isActive),
      nowIso(),
      id,
    ]
  );
  return mapFaqCategory((await queryById(db, 'intranet_faq_categories', id))!);
};

export const deleteFaqCategory = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  await db.execute(`UPDATE intranet_faq_items SET category_id = NULL WHERE category_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_faq_categories WHERE id = ?`, [id]);
  return { id };
};

const mapFaqItem = async (db: DbInterface, row: Row) => {
  const id = clean(row.id);
  return {
    id,
    categoryId: clean(row.category_id) || null,
    question: clean(row.question),
    answer: parseJson(row.answer_json, {}),
    sortOrder: Number(row.sort_order || 0),
    isActive: fromDbBool(row.is_active),
    sourceType: pickEnum(row.source_type, FAQ_SOURCE_TYPES, 'manual'),
    sourceQuestionId: clean(row.source_question_id) || null,
    knowledgeStatus: pickEnum(row.knowledge_status, FAQ_KNOWLEDGE_STATUSES, 'pending_index'),
    approvedAt: clean(row.approved_at) || null,
    audienceGroupIds: await listJoinIds(db, 'intranet_faq_item_audiences', 'faq_item_id', id, 'audience_group_id'),
    createdBy: clean(row.created_by) || null,
    createdAt: clean(row.created_at),
    updatedBy: clean(row.updated_by) || null,
    updatedAt: clean(row.updated_at),
  };
};

export const listFaqItems = async (db: DbInterface, filters: { categoryId?: string; active?: string }) => {
  await ensureIntranetTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  if (clean(filters.categoryId)) {
    where.push('category_id = ?');
    params.push(clean(filters.categoryId));
  }
  if (clean(filters.active) === '1') where.push('is_active = 1');
  const rows = await db.query(`SELECT * FROM intranet_faq_items WHERE ${where.join(' AND ')} ORDER BY sort_order ASC, created_at DESC`, params);
  return Promise.all(rows.map((row) => mapFaqItem(db, row as Row)));
};

export const getFaqItemById = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  const row = await queryById(db, 'intranet_faq_items', id);
  return row ? mapFaqItem(db, row) : null;
};

export const createFaqItem = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const question = clean(input.question);
  if (!question) throw new IntranetValidationError('Pergunta do FAQ e obrigatoria.');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO intranet_faq_items (
      id, category_id, question, answer_json, sort_order, is_active,
      source_type, source_question_id, knowledge_status, approved_at,
      created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      nullable(input.categoryId),
      question,
      stringifyJson(input.answer, {}),
      Number(input.sortOrder || 0),
      input.isActive === false ? 0 : 1,
      pickEnum(input.sourceType, FAQ_SOURCE_TYPES, 'manual'),
      nullable(input.sourceQuestionId),
      pickEnum(input.knowledgeStatus, FAQ_KNOWLEDGE_STATUSES, 'pending_index'),
      nullable(input.approvedAt),
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );
  await replaceJoinRows(db, 'intranet_faq_item_audiences', 'faq_item_id', id, 'audience_group_id', parseStringList(input.audienceGroupIds));
  return getFaqItemById(db, id);
};

export const updateFaqItem = async (db: DbInterface, id: string, input: Row, actorUserId: string) => {
  await ensureIntranetTables(db);
  const current = await getFaqItemById(db, id);
  if (!current) throw new IntranetValidationError('Item de FAQ nao encontrado.', 404);
  const question = clean(input.question ?? current.question);
  await db.execute(
    `UPDATE intranet_faq_items SET
      category_id = ?, question = ?, answer_json = ?, sort_order = ?, is_active = ?,
      source_type = ?, source_question_id = ?, knowledge_status = ?, approved_at = ?,
      updated_by = ?, updated_at = ?
    WHERE id = ?`,
    [
      input.categoryId === undefined ? current.categoryId : nullable(input.categoryId),
      question,
      stringifyJson(input.answer ?? current.answer, {}),
      Number(input.sortOrder ?? current.sortOrder ?? 0),
      input.isActive === undefined ? toDbBool(current.isActive) : toDbBool(input.isActive),
      pickEnum(input.sourceType ?? current.sourceType, FAQ_SOURCE_TYPES, 'manual'),
      input.sourceQuestionId === undefined ? current.sourceQuestionId : nullable(input.sourceQuestionId),
      pickEnum(input.knowledgeStatus ?? current.knowledgeStatus, FAQ_KNOWLEDGE_STATUSES, 'pending_index'),
      input.approvedAt === undefined ? current.approvedAt : nullable(input.approvedAt),
      actorUserId,
      nowIso(),
      id,
    ]
  );
  if (input.audienceGroupIds !== undefined) {
    await replaceJoinRows(db, 'intranet_faq_item_audiences', 'faq_item_id', id, 'audience_group_id', parseStringList(input.audienceGroupIds));
  }
  return getFaqItemById(db, id);
};

export const deleteFaqItem = async (db: DbInterface, id: string) => {
  await ensureIntranetTables(db);
  await db.execute(`DELETE FROM intranet_faq_item_audiences WHERE faq_item_id = ?`, [id]);
  await db.execute(`DELETE FROM intranet_faq_items WHERE id = ?`, [id]);
  return { id };
};

export const createAssetRecord = async (
  db: DbInterface,
  input: {
    entityType?: string | null;
    entityId?: string | null;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  },
  actorUserId: string
) => {
  await ensureIntranetTables(db);
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_assets (
      id, entity_type, entity_id, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      nullable(input.entityType),
      nullable(input.entityId),
      input.storageProvider,
      input.storageBucket,
      input.storageKey,
      input.originalName,
      input.mimeType,
      input.sizeBytes,
      actorUserId,
      createdAt,
    ]
  );
  return mapAsset((await queryById(db, 'intranet_assets', id))!);
};

const mapAsset = (row: Row) => ({
  id: clean(row.id),
  entityType: clean(row.entity_type) || null,
  entityId: clean(row.entity_id) || null,
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  uploadedBy: clean(row.uploaded_by) || null,
  createdAt: clean(row.created_at),
});

export const listAssets = async (db: DbInterface, filters: { entityType?: string; entityId?: string }) => {
  await ensureIntranetTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  if (clean(filters.entityType)) {
    where.push('entity_type = ?');
    params.push(clean(filters.entityType));
  }
  if (clean(filters.entityId)) {
    where.push('entity_id = ?');
    params.push(clean(filters.entityId));
  }
  const rows = await db.query(`SELECT * FROM intranet_assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
  return rows.map((row) => mapAsset(row as Row));
};
