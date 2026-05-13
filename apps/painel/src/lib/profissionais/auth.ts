import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

const requirePermission = async (
  pageKey: PageKey,
  action: PermissionAction,
  deniedMessage: string
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as any).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, pageKey, action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: deniedMessage };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};

export const requireProfissionaisPermission = async (action: PermissionAction) =>
  requirePermission('profissionais', action, 'Sem permissao para profissionais.');

export const requireProfissionaisMapasPermission = async (action: PermissionAction) =>
  requirePermission('profissionais_mapas', action, 'Sem permissao para mapas de profissionais.');
