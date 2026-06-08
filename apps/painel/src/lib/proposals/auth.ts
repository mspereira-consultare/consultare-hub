import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

type ProposalPageKey = Extract<PageKey, 'propostas' | 'propostas_pos_consulta' | 'propostas_gerencial'>;
type SessionUserShape = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export const getPropostasAccessContext = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  const sessionUser = session.user as SessionUserShape;
  const userId = String(session.user.id);
  const userName = String(sessionUser.name || sessionUser.email || 'Usuário');
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
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
    const label =
      pageKey === 'propostas_gerencial'
        ? 'propostas gerenciais'
        : pageKey === 'propostas_pos_consulta'
          ? 'propostas de pós-consulta'
          : 'propostas';
    return { ok: false as const, status: 403, error: `Sem permissão para ${label}.` };
  }

  return context;
};

export const requirePropostasPermission = async (action: PermissionAction) =>
  requireProposalPagePermission('propostas', action);

export const requirePropostasPosConsultaPermission = async (action: PermissionAction) =>
  requireProposalPagePermission('propostas_pos_consulta', action);

export const requirePropostasGerencialPermission = async (action: PermissionAction) =>
  requireProposalPagePermission('propostas_gerencial', action);
