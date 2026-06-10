import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { listIntranetNotifications } from '@consultare/core/intranet/notifications';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '');
    if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 12);
    const unreadOnly = String(searchParams.get('unreadOnly') || '') === '1';
    const db = getDbConnection();
    const data = await listIntranetNotifications(db, userId, { limit, unreadOnly });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar notificações da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar notificações.' }, { status: Number(error?.status) || 500 });
  }
}
