import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@consultare/core/db';
import { hasPermission, type PageKey, type PermissionAction } from '@consultare/core/permissions';
import { loadUserPermissionMatrix } from '@consultare/core/permissions-server';
import { ensureIntranetTables } from './repository';

type IntranetPageKey = Extract<
  PageKey,
  | 'intranet_dashboard'
  | 'intranet_navegacao'
  | 'intranet_paginas'
  | 'intranet_noticias'
  | 'intranet_faq'
  | 'intranet_catalogo'
  | 'intranet_audiencias'
  | 'intranet_escopos'
  | 'intranet_chat'
  | 'intranet_chatbot'
>;

export const requireIntranetPermission = async (
  pageKey: IntranetPageKey,
  action: PermissionAction
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as { role?: string }).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, pageKey, action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissao para administrar este modulo da intranet.' };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};

export const requireAnyIntranetPermission = async (
  pageKeys: IntranetPageKey[],
  action: PermissionAction
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as { role?: string }).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = pageKeys.some((pageKey) => hasPermission(permissions, pageKey, action, role));

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissao para administrar este modulo da intranet.' };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};

type IntranetAuthSuccess = Awaited<ReturnType<typeof requireIntranetPermission>> & { ok: true };

type EditorialScopeType = 'section' | 'catalog' | 'faq' | 'news';

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeRef = (value: unknown) => clean(value).toLowerCase();

const normalizeSlug = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const pageScopeRefs = async (db: IntranetAuthSuccess['db'], pageIdRaw: unknown) => {
  const refs: string[] = [];
  let pageId = clean(pageIdRaw);
  const seen = new Set<string>();
  while (pageId && !seen.has(pageId)) {
    seen.add(pageId);
    refs.push(`page:${pageId}`);
    const rows = await db.query(
      `SELECT id, parent_page_id, full_path FROM intranet_pages WHERE id = ? LIMIT 1`,
      [pageId]
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) break;
    const fullPath = clean(row.full_path);
    if (fullPath) refs.push(`path:${fullPath}`);
    pageId = clean(row.parent_page_id);
  }
  return refs;
};

export const buildPageEditorialRefs = async (
  db: IntranetAuthSuccess['db'],
  pageIdRaw?: unknown,
  parentPageIdRaw?: unknown
) => {
  const refs = new Set<string>();
  for (const ref of await pageScopeRefs(db, pageIdRaw)) refs.add(ref);
  for (const ref of await pageScopeRefs(db, parentPageIdRaw)) refs.add(ref);
  return Array.from(refs);
};

export const buildFaqEditorialRefs = (...categoryIds: unknown[]) =>
  categoryIds.map(clean).filter(Boolean).map((id) => `category:${id}`);

export const buildNewsEditorialRefs = (...values: Array<{ category?: unknown; postType?: unknown } | undefined>) => {
  const refs = new Set<string>();
  for (const value of values) {
    const category = normalizeRef(value?.category);
    const postType = normalizeRef(value?.postType);
    if (category) refs.add(`category:${category}`);
    if (postType) refs.add(`type:${postType}`);
  }
  return Array.from(refs);
};

export const buildCatalogEditorialRefs = (...values: Array<{ specialtySlug?: unknown; itemId?: unknown; professionalId?: unknown; catalogType?: unknown } | undefined>) => {
  const refs = new Set<string>();
  for (const value of values) {
    const specialtySlug = normalizeSlug(value?.specialtySlug);
    const itemId = clean(value?.itemId);
    const professionalId = clean(value?.professionalId);
    const catalogType = normalizeRef(value?.catalogType);
    if (specialtySlug) refs.add(`specialty:${specialtySlug}`);
    if (itemId) refs.add(`item:${itemId}`);
    if (professionalId) refs.add(`professional:${professionalId}`);
    if (catalogType) refs.add(`type:${catalogType}`);
  }
  return Array.from(refs);
};

export const hasEditorialScope = async (
  auth: IntranetAuthSuccess,
  scopeType: EditorialScopeType,
  refsRaw: unknown[] = []
) => {
  if (auth.role === 'ADMIN') return true;
  await ensureIntranetTables(auth.db);
  const refs = new Set(refsRaw.map(normalizeRef).filter(Boolean));
  const rows = await auth.db.query(
    `
    SELECT s.scope_type, s.scope_ref
    FROM intranet_editorial_scopes s
    INNER JOIN intranet_editorial_scope_assignments a ON a.editorial_scope_id = s.id
    WHERE a.user_id = ? AND COALESCE(s.is_active, 1) = 1
    `,
    [auth.userId]
  );

  for (const row of rows as Array<Record<string, unknown>>) {
    const rowType = normalizeRef(row.scope_type);
    const rowRef = normalizeRef(row.scope_ref);
    if (rowType === 'global') return true;
    if (rowType !== scopeType) continue;
    if (!rowRef) return true;
    if (refs.has(rowRef)) return true;
  }
  return false;
};

export const requireEditorialScope = async (
  auth: IntranetAuthSuccess,
  scopeType: EditorialScopeType,
  refs: unknown[] = []
) => {
  const allowed = await hasEditorialScope(auth, scopeType, refs);
  if (allowed) return { ok: true as const };
  return {
    ok: false as const,
    status: 403,
    error: 'Você não possui escopo editorial para alterar este conteúdo.',
  };
};
