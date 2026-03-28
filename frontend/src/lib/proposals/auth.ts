import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

type ProposalPageKey = Extract<PageKey, 'propostas' | 'propostas_gerencial'>;

export const getPropostasAccessContext = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  const userId = String(session.user.id);
  const userName = String((session.user as any).name || (session.user as any).email || 'Usuário');
  const role = String((session.user as any).role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);

  return {
    ok: true as const,
    db,
    userId,
    userName,
    role,
    permissions,
  };
};

const requireProposalPagePermission = async (pageKey: ProposalPageKey, action: PermissionAction) => {
  const context = await getPropostasAccessContext();
  if (!context.ok) return context;

  const allowed = hasPermission(context.permissions, pageKey, action, context.role);
  if (!allowed) {
    const label = pageKey === 'propostas_gerencial' ? 'propostas gerenciais' : 'propostas';
    return { ok: false as const, status: 403, error: `Sem permissão para ${label}.` };
  }

  return context;
};

export const requirePropostasPermission = async (action: PermissionAction) =>
  requireProposalPagePermission('propostas', action);

export const requirePropostasGerencialPermission = async (action: PermissionAction) =>
  requireProposalPagePermission('propostas_gerencial', action);
