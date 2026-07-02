import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const requireBlockedAgendasPermission = async (action: PermissionAction) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  type SessionUser = { role?: string };
  const sessionUser = session.user as SessionUser;
  const userId = String(session.user.id);
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'agendas_bloqueadas', action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissao para agendas bloqueadas.' };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};
