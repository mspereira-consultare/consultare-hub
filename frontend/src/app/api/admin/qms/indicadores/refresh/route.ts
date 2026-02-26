import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { refreshQmsAll } from '@/lib/qms/metrics_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    const db = getDbConnection();
    const userId = String(session.user.id);
    const role = String((session.user as any).role || 'OPERADOR').toUpperCase();
    const permissions = await loadUserPermissionMatrix(db, userId, role);
    const canRefresh =
      hasPermission(permissions, 'qualidade_documentos', 'refresh', role) ||
      hasPermission(permissions, 'qualidade_treinamentos', 'refresh', role) ||
      hasPermission(permissions, 'qualidade_auditorias', 'refresh', role);

    if (!canRefresh) {
      return NextResponse.json({ error: 'Sem permissao para refresh do modulo.' }, { status: 403 });
    }

    const data = await refreshQmsAll(db, userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro no refresh consolidado QMS:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no refresh consolidado QMS.' },
      { status }
    );
  }
}
