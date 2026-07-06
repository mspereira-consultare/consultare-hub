import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

type PayrollPageKey = Extract<PageKey, 'folha_pagamento' | 'ponto'>;

const payrollPermissionErrorLabel: Record<PayrollPageKey, string> = {
  folha_pagamento: 'folha de pagamento',
  ponto: 'ponto',
};

export const requirePayrollPermission = async (action: PermissionAction, pageKey: PayrollPageKey = 'folha_pagamento') => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as any).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, pageKey, action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: `Sem permissão para ${payrollPermissionErrorLabel[pageKey]}.` };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
  };
};
