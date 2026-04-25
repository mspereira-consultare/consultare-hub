import type { DbInterface } from '../db';
import {
  listPublishedIntranetSpecialties,
  listIntranetProfessionals,
  listIntranetProcedures,
  listIntranetQmsDocuments,
} from './catalog';

type Row = Record<string, unknown>;

export type IntranetSessionUser = {
  id: string;
  role?: string | null;
  department?: string | null;
};

export type IntranetBlock = {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type IntranetPageContent = {
  blocks?: IntranetBlock[];
  [key: string]: unknown;
};

export type IntranetPage = {
  id: string;
  title: string;
  slug: string;
  fullPath: string;
  pageType: string;
  metaTitle: string | null;
  metaDescription: string | null;
  iconName: string | null;
  content: IntranetPageContent;
  publishedAt: string | null;
};

export type IntranetNavigationNode = {
  id: string;
  parentNodeId: string | null;
  nodeType: string;
  pageId: string | null;
  label: string;
  url: string | null;
  iconName: string | null;
  sortOrder: number;
  href: string | null;
};

export type IntranetNewsPost = {
  id: string;
  postType: string;
  title: string;
  slug: string;
  summary: string | null;
  coverAssetId: string | null;
  category: string;
  highlightLevel: string;
  isFeatured: boolean;
  publishedAt: string | null;
};

export type IntranetFaqItem = {
  id: string;
  categoryId: string | null;
  question: string;
  answer: Record<string, unknown>;
  sortOrder?: number;
};

export type IntranetFaqCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
};

export type IntranetFaqCategoryWithItems = IntranetFaqCategory & {
  items: IntranetFaqItem[];
};

export type IntranetSearchResult = {
  id: string;
  entityType: 'page' | 'news' | 'faq' | 'qms_document' | 'professional' | 'specialty' | 'procedure';
  title: string;
  summary: string | null;
  url: string;
};

const clean = (value: unknown) => String(value ?? '').trim();
const fromDbBool = (value: unknown) => value === true || value === 1 || value === '1';

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const safeQuery = async (db: DbInterface, sql: string, params: unknown[] = []) => {
  try {
    return await db.query(sql, params);
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || '');
    if (/doesn't exist|no such table|Table .* doesn't exist/i.test(message)) return [];
    throw error;
  }
};

const mapPage = (row: Row): IntranetPage => ({
  id: clean(row.id),
  title: clean(row.title),
  slug: clean(row.slug),
  fullPath: clean(row.full_path),
  pageType: clean(row.page_type),
  metaTitle: clean(row.meta_title) || null,
  metaDescription: clean(row.meta_description) || null,
  iconName: clean(row.icon_name) || null,
  content: parseJson<IntranetPageContent>(row.content_json, { blocks: [] }),
  publishedAt: clean(row.published_at) || null,
});

const normalizeFullPath = (value: string) =>
  clean(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');

const pageUrl = (fullPath: string) => {
  const normalized = normalizeFullPath(fullPath);
  return normalized ? `/${normalized}` : '/';
};

const userMatchesAudience = async (
  db: DbInterface,
  audienceGroupId: string,
  user: IntranetSessionUser
) => {
  const assignments = await safeQuery(
    db,
    `SELECT id FROM intranet_user_audience_assignments WHERE audience_group_id = ? AND user_id = ? LIMIT 1`,
    [audienceGroupId, user.id]
  );
  if (assignments.length > 0) return true;

  const rules = await safeQuery(
    db,
    `
    SELECT rule_type, rule_value
    FROM intranet_audience_group_rules
    WHERE audience_group_id = ? AND is_active = 1
    `,
    [audienceGroupId]
  );

  for (const rule of rules as Row[]) {
    const type = clean(rule.rule_type).toLowerCase();
    const value = clean(rule.rule_value).toLowerCase();
    if (type === 'role' && clean(user.role).toLowerCase() === value) return true;
    if (type === 'department' && clean(user.department).toLowerCase() === value) return true;
  }

  return false;
};

export const canUserAccessPage = async (
  db: DbInterface,
  pageId: string,
  user: IntranetSessionUser
) => {
  const rows = await safeQuery(
    db,
    `SELECT audience_group_id FROM intranet_page_audiences WHERE page_id = ?`,
    [pageId]
  );
  if (rows.length === 0) return true;

  for (const row of rows as Row[]) {
    if (await userMatchesAudience(db, clean(row.audience_group_id), user)) return true;
  }

  return false;
};

const canUserAccessFaqItem = async (
  db: DbInterface,
  faqItemId: string,
  user: IntranetSessionUser
) => {
  const rows = await safeQuery(
    db,
    `SELECT audience_group_id FROM intranet_faq_item_audiences WHERE faq_item_id = ?`,
    [faqItemId]
  );
  if (rows.length === 0) return true;

  for (const row of rows as Row[]) {
    if (await userMatchesAudience(db, clean(row.audience_group_id), user)) return true;
  }

  return false;
};

export const getPublishedPageByPath = async (
  db: DbInterface,
  fullPathRaw: string,
  user: IntranetSessionUser
) => {
  const fullPath = normalizeFullPath(fullPathRaw);
  const rows = await safeQuery(
    db,
    `
    SELECT p.*, r.content_json
    FROM intranet_pages p
    LEFT JOIN intranet_page_revisions r ON r.id = p.current_revision_id
    WHERE p.full_path = ? AND LOWER(p.status) = 'published'
    LIMIT 1
    `,
    [fullPath]
  );

  const page = rows[0] ? mapPage(rows[0] as Row) : null;
  if (!page) return null;
  if (!(await canUserAccessPage(db, page.id, user))) return null;
  return page;
};

export const listPublishedNavigationNodes = async (
  db: DbInterface,
  user: IntranetSessionUser
) => {
  const rows = await safeQuery(
    db,
    `
    SELECT n.*, p.full_path, p.status as page_status
    FROM intranet_navigation_nodes n
    LEFT JOIN intranet_pages p ON p.id = n.page_id
    WHERE n.is_visible = 1
    ORDER BY n.sort_order ASC, n.label ASC
    `
  );

  const out: IntranetNavigationNode[] = [];
  for (const row of rows as Row[]) {
    const nodeType = clean(row.node_type);
    const pageId = clean(row.page_id) || null;
    if (nodeType === 'page') {
      if (!pageId || clean(row.page_status).toLowerCase() !== 'published') continue;
      if (!(await canUserAccessPage(db, pageId, user))) continue;
    }

    out.push({
      id: clean(row.id),
      parentNodeId: clean(row.parent_node_id) || null,
      nodeType,
      pageId,
      label: clean(row.label),
      url: clean(row.url) || null,
      iconName: clean(row.icon_name) || null,
      sortOrder: Number(row.sort_order || 0),
      href: nodeType === 'page' ? pageUrl(clean(row.full_path)) : clean(row.url) || null,
    });
  }

  return out;
};

export const listRecentNewsPosts = async (db: DbInterface, limitRaw = 5) => {
  const limit = Math.max(1, Math.min(20, Number(limitRaw || 5)));
  const rows = await safeQuery(
    db,
    `
    SELECT id, post_type, title, slug, summary, cover_asset_id, category, highlight_level, is_featured, published_at
    FROM intranet_news_posts
    WHERE LOWER(status) = 'published'
      AND (publish_start_at IS NULL OR publish_start_at = '' OR publish_start_at <= ?)
      AND (publish_end_at IS NULL OR publish_end_at = '' OR publish_end_at >= ?)
    ORDER BY is_featured DESC, published_at DESC, created_at DESC
    LIMIT ${limit}
    `,
    [new Date().toISOString(), new Date().toISOString()]
  );

  return (rows as Row[]).map((row) => ({
    id: clean(row.id),
    postType: clean(row.post_type),
    title: clean(row.title),
    slug: clean(row.slug),
    summary: clean(row.summary) || null,
    coverAssetId: clean(row.cover_asset_id) || null,
    category: clean(row.category) || 'geral',
    highlightLevel: clean(row.highlight_level) || 'info',
    isFeatured: fromDbBool(row.is_featured),
    publishedAt: clean(row.published_at) || null,
  }));
};

export const listFaqItemsByCategoryIds = async (db: DbInterface, categoryIds: string[]) => {
  const ids = categoryIds.map(clean).filter(Boolean);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await safeQuery(
    db,
    `
    SELECT id, category_id, question, answer_json
    FROM intranet_faq_items
    WHERE is_active = 1 AND category_id IN (${placeholders})
    ORDER BY sort_order ASC, created_at DESC
    `,
    ids
  );

  return (rows as Row[]).map((row) => ({
    id: clean(row.id),
    categoryId: clean(row.category_id) || null,
    question: clean(row.question),
    answer: parseJson<Record<string, unknown>>(row.answer_json, {}),
  }));
};

export const listPublishedFaqCategoriesWithItems = async (
  db: DbInterface,
  user: IntranetSessionUser,
  queryRaw = '',
  categoryIdRaw = ''
): Promise<IntranetFaqCategoryWithItems[]> => {
  const query = clean(queryRaw).toLowerCase();
  const categoryId = clean(categoryIdRaw);
  const like = `%${query}%`;
  const categories = await safeQuery(
    db,
    `
    SELECT id, name, slug, description, sort_order
    FROM intranet_faq_categories
    WHERE is_active = 1
      ${categoryId ? 'AND id = ?' : ''}
    ORDER BY sort_order ASC, name ASC
    `,
    categoryId ? [categoryId] : []
  );

  const out: IntranetFaqCategoryWithItems[] = [];
  for (const category of categories as Row[]) {
    const rows = await safeQuery(
      db,
      `
      SELECT id, category_id, question, answer_json, sort_order
      FROM intranet_faq_items
      WHERE is_active = 1
        AND category_id = ?
        ${query ? "AND (LOWER(question) LIKE ? OR LOWER(COALESCE(answer_json, '')) LIKE ?)" : ''}
      ORDER BY sort_order ASC, created_at DESC
      `,
      query ? [clean(category.id), like, like] : [clean(category.id)]
    );

    const items: IntranetFaqItem[] = [];
    for (const row of rows as Row[]) {
      if (!(await canUserAccessFaqItem(db, clean(row.id), user))) continue;
      items.push({
        id: clean(row.id),
        categoryId: clean(row.category_id) || null,
        question: clean(row.question),
        answer: parseJson<Record<string, unknown>>(row.answer_json, {}),
        sortOrder: Number(row.sort_order || 0),
      });
    }

    if (items.length > 0 || (!query && !categoryId)) {
      out.push({
        id: clean(category.id),
        name: clean(category.name),
        slug: clean(category.slug),
        description: clean(category.description) || null,
        sortOrder: Number(category.sort_order || 0),
        items,
      });
    }
  }

  return out;
};

export const searchIntranet = async (
  db: DbInterface,
  queryRaw: string,
  user: IntranetSessionUser
) => {
  const query = clean(queryRaw).toLowerCase();
  if (query.length < 2) return [];
  const like = `%${query}%`;
  const results: IntranetSearchResult[] = [];

  const pages = await safeQuery(
    db,
    `
    SELECT p.id, p.title, p.full_path, p.meta_description
    FROM intranet_pages p
    LEFT JOIN intranet_page_revisions r ON r.id = p.current_revision_id
    WHERE LOWER(p.status) = 'published'
      AND (LOWER(p.title) LIKE ? OR LOWER(p.full_path) LIKE ? OR LOWER(COALESCE(p.meta_description, '')) LIKE ? OR LOWER(COALESCE(r.content_json, '')) LIKE ?)
    ORDER BY p.sort_order ASC, p.title ASC
    LIMIT 20
    `,
    [like, like, like, like]
  );

  for (const row of pages as Row[]) {
    if (!(await canUserAccessPage(db, clean(row.id), user))) continue;
    results.push({
      id: clean(row.id),
      entityType: 'page',
      title: clean(row.title),
      summary: clean(row.meta_description) || null,
      url: pageUrl(clean(row.full_path)),
    });
  }

  const news = await safeQuery(
    db,
    `
    SELECT id, title, slug, summary
    FROM intranet_news_posts
    WHERE LOWER(status) = 'published'
      AND (LOWER(title) LIKE ? OR LOWER(COALESCE(summary, '')) LIKE ? OR LOWER(COALESCE(body_json, '')) LIKE ?)
    ORDER BY published_at DESC, created_at DESC
    LIMIT 10
    `,
    [like, like, like]
  );

  for (const row of news as Row[]) {
    results.push({
      id: clean(row.id),
      entityType: 'news',
      title: clean(row.title),
      summary: clean(row.summary) || null,
      url: `/noticias/${clean(row.slug) || clean(row.id)}`,
    });
  }

  const faq = await safeQuery(
    db,
    `
    SELECT id, question, answer_json
    FROM intranet_faq_items
    WHERE is_active = 1
      AND (LOWER(question) LIKE ? OR LOWER(COALESCE(answer_json, '')) LIKE ?)
    ORDER BY sort_order ASC, created_at DESC
    LIMIT 10
    `,
    [like, like]
  );

  for (const row of faq as Row[]) {
    if (!(await canUserAccessFaqItem(db, clean(row.id), user))) continue;
    results.push({
      id: clean(row.id),
      entityType: 'faq',
      title: clean(row.question),
      summary: null,
      url: `/faq?q=${encodeURIComponent(query)}`,
    });
  }

  const [qmsDocuments, specialties, professionals, procedures] = await Promise.all([
    listIntranetQmsDocuments(db, { search: query, limit: 8 }),
    listPublishedIntranetSpecialties(db, { search: query, limit: 8 }),
    listIntranetProfessionals(db, { search: query, limit: 8 }),
    listIntranetProcedures(db, { search: query, limit: 8 }),
  ]);

  for (const document of qmsDocuments) {
    results.push({
      id: document.id,
      entityType: 'qms_document',
      title: document.name,
      summary: [document.code, document.sector, document.objective].filter(Boolean).join(' · ') || null,
      url: document.fileUrl || '/busca',
    });
  }

  for (const specialty of specialties) {
    results.push({
      id: specialty.id,
      entityType: 'specialty',
      title: specialty.displayName,
      summary: specialty.shortDescription,
      url: `/servicos/consultas/${specialty.slug}`,
    });
  }

  for (const professional of professionals) {
    results.push({
      id: professional.professionalId,
      entityType: 'professional',
      title: professional.displayName,
      summary: [professional.cardHighlight, professional.specialties.join(', ')].filter(Boolean).join(' · ') || null,
      url: `/servicos/consultas?q=${encodeURIComponent(query)}`,
    });
  }

  for (const procedure of procedures) {
    const basePath = procedure.catalogType === 'exam' ? '/servicos/exames' : '/servicos/procedimentos';
    results.push({
      id: String(procedure.procedimentoId),
      entityType: 'procedure',
      title: procedure.displayName,
      summary: [procedure.category, procedure.summary].filter(Boolean).join(' · ') || null,
      url: `${basePath}/${procedure.slug}`,
    });
  }

  return results.slice(0, 30);
};
