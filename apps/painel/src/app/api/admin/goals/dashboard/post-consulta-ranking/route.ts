import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { listPostConsultRanking, normalizePostConsultRankingFilters } from '@/lib/post_consulta/repository';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ensurePermission = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  type SessionUser = { role?: string | null };
  const sessionUser = session.user as SessionUser;
  const userId = String(session.user.id);
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'metas_dashboard', 'view', role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissão para consultar o ranking de pós-consulta.' };
  }

  return { ok: true as const, db };
};

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function GET(request: Request) {
  try {
    const auth = await ensurePermission();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const filters = normalizePostConsultRankingFilters(searchParams);
    const ranking = await listPostConsultRanking(filters, auth.db);

    return NextResponse.json({
      status: 'success',
      data: ranking,
    });
  } catch (error: unknown) {
    console.error('Erro API ranking pós-consulta:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao carregar o ranking de pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
