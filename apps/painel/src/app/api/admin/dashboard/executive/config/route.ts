import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { invalidateCache } from '@/lib/api_cache';
import { getDbConnection } from '@/lib/db';
import {
  getExecutiveConfigurationSnapshot,
  saveExecutiveConfigurationSnapshot,
} from '@/lib/dashboard_executive/repository';
import { hasPermission } from '@/lib/permissions';
import type { ExecutiveConfigurationSnapshot } from '@/lib/dashboard_executive/types';

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
    hasPermission(permissions, 'users', 'view', role) || hasPermission(permissions, 'settings', 'view', role);

  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: 'Sem permissao' }, { status: 403 }) };
  }

  return { ok: true as const, session };
};

export async function GET() {
  try {
    const auth = await ensureAuthorized();
    if (!auth.ok) return auth.response;

    const db = getDbConnection();
    const config = await getExecutiveConfigurationSnapshot(db);
    return NextResponse.json({ status: 'success', data: config });
  } catch (error: any) {
    console.error('Erro GET executive config:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await ensureAuthorized();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const config = body?.config as ExecutiveConfigurationSnapshot | undefined;
    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });
    }

    const db = getDbConnection();
    const saved = await saveExecutiveConfigurationSnapshot(db, config, String(auth.session.user.id));
    invalidateCache('admin:');
    return NextResponse.json({ status: 'success', data: saved });
  } catch (error: any) {
    console.error('Erro PATCH executive config:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
