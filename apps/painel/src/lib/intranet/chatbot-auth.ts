import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const requireIntranetChatbotAdminAccess = async (action: 'view' | 'edit') => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const userId = String(session.user.id);
  const role = String((session.user as { role?: string }).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'intranet_chatbot', action, role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissao para o chatbot e a base de conhecimento.' };
  }

  return {
    ok: true as const,
    db,
    userId,
    role,
    permissions,
  };
};

