import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { invalidateCache } from '@/lib/api_cache';
import { getDbConnection } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { getExecutiveScope, saveExecutiveScope } from '@/lib/dashboard_executive/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ensureAuthorized = async (action: 'view' | 'edit') => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) };
  }
  const role = String((session.user as any).role || 'OPERADOR');
  const permissions = (session.user as any).permissions;
  const allowed = hasPermission(permissions, 'users', action, role);
  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: 'Sem permissao' }, { status: 403 }) };
  }
  return { ok: true as const, session };
};

export async function GET(request: Request) {
  try {
    const auth = await ensureAuthorized('view');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = clean(searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 });
    }

    const db = getDbConnection();
    const scope = await getExecutiveScope(db, userId);
    return NextResponse.json({ status: 'success', data: scope });
  } catch (error: any) {
    console.error('Erro GET executive scope:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await ensureAuthorized('edit');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const userId = clean(body?.userId);
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 });
    }

    const db = getDbConnection();
    const scope = await saveExecutiveScope(
      db,
      userId,
      {
        areas: Array.isArray(body?.scope?.areas) ? body.scope.areas : [],
        departments: Array.isArray(body?.scope?.departments) ? body.scope.departments : [],
        teams: Array.isArray(body?.scope?.teams) ? body.scope.teams : [],
        units: Array.isArray(body?.scope?.units) ? body.scope.units : [],
      },
      String(auth.session.user.id)
    );
    invalidateCache('admin:');
    return NextResponse.json({ status: 'success', data: scope });
  } catch (error: any) {
    console.error('Erro PATCH executive scope:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}
