import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { invalidateCache } from '@/lib/api_cache';
import { PAGE_DEFS, hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix, saveUserPermissionMatrix } from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';

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
    const userId = String(searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 });
    }

    const db = getDbConnection();
    const userRows = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }

    const matrix = await loadUserPermissionMatrix(db, String(user.id), String(user.role || 'OPERADOR'));
    return NextResponse.json({
      status: 'success',
      userId: String(user.id),
      role: String(user.role || 'OPERADOR'),
      pages: PAGE_DEFS,
      permissions: matrix,
    });
  } catch (error: any) {
    console.error('Erro GET User Permissions:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await ensureAuthorized('edit');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const permissions = body?.permissions;

    if (!userId || !permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'Payload invalido' }, { status: 400 });
    }

    const db = getDbConnection();
    const userRows = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }

    await saveUserPermissionMatrix(db, String(user.id), String(user.role || 'OPERADOR'), permissions);
    invalidateCache('admin:');
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro POST User Permissions:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

