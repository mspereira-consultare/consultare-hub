import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { getExecutiveScope } from '@/lib/dashboard_executive/repository';
import type { TaskViewerContext } from '@consultare/core/tasks/types';

export const requireTaskGovernanceAccess = async (action: 'view' | 'edit') => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as { role?: string }).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'dashboard_executive_governance', action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissao para governanca de tarefas.' };
  }

  if (role === 'ADMIN') {
    return {
      ok: true as const,
      db,
      userId,
      role,
      permissions,
      scope: null,
      viewer: {
        userId,
        canViewAll: true,
      } satisfies TaskViewerContext,
    };
  }

  const scope = await getExecutiveScope(db, userId);
  if (scope.profileKey !== 'diretoria_gerencia_adm') {
    return {
      ok: false as const,
      status: 403,
      error: 'Sem escopo global para visualizar tarefas de toda a empresa.',
    };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
    permissions,
    scope,
    viewer: {
      userId,
      canViewAll: true,
    } satisfies TaskViewerContext,
  };
};
