import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { listExecutiveProfilePreview } from '@/lib/dashboard_executive/repository';
import { hasPermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ensureAuthorized = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) };
  }

  const role = String((session.user as any).role || 'OPERADOR');
  const permissions = (session.user as any).permissions;
  const allowed =
    hasPermission(permissions, 'dashboard_executive_governance', 'view', role) ||
    hasPermission(permissions, 'users', 'view', role) ||
    hasPermission(permissions, 'settings', 'view', role);

  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: 'Sem permissao' }, { status: 403 }) };
  }

  return { ok: true as const };
};

export async function GET() {
  try {
    const auth = await ensureAuthorized();
    if (!auth.ok) return auth.response;

    const db = getDbConnection();
    const preview = await listExecutiveProfilePreview(db);
    return NextResponse.json({ status: 'success', data: preview });
  } catch (error: any) {
    console.error('Erro GET executive config preview:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
