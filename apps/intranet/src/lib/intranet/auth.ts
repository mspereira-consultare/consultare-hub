import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@consultare/core/db';
import { hasPermission, type PageKey, type PermissionAction } from '@consultare/core/permissions';
import { loadUserPermissionMatrix } from '@consultare/core/permissions-server';

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
