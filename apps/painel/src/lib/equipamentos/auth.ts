import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { getExecutiveScope } from '@/lib/dashboard_executive/repository';
import { hasPermission, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import type { EquipmentWorkOrderPermissionProfile } from '@/lib/equipamentos/types';

const allowedWorkOrderProfiles: EquipmentWorkOrderPermissionProfile[] = [
  'diretoria_gerencia_adm',
  'gerencia_operacional',
  'lider_unidades',
  'lider_operacional',
];

export const requireEquipamentosPermission = async (action: PermissionAction) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as { role?: string } | null)?.role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'equipamentos', action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissão para equipamentos.' };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};

export const requireEquipmentWorkOrderPermission = async (action: 'view' | 'edit') => {
  const auth = await requireEquipamentosPermission(action === 'view' ? 'view' : 'edit');
  if (!auth.ok) return auth;
  const executiveScope = await getExecutiveScope(auth.db, auth.userId);
  const profileKey = String(executiveScope.profileKey || '') as EquipmentWorkOrderPermissionProfile;
  const canManage = allowedWorkOrderProfiles.includes(profileKey);

  if (action === 'view') {
    return {
      ...auth,
      executiveScope,
      canManage,
    };
  }

  if (!allowedWorkOrderProfiles.includes(profileKey)) {
    return {
      ok: false as const,
      status: 403,
      error: 'Seu perfil executivo atual não pode criar ou gerir OS de equipamentos.',
    };
  }

  return {
    ...auth,
    executiveScope,
    canManage,
  };
};
