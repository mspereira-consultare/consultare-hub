import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { markIntranetNotificationsRead } from '@consultare/core/intranet/notifications';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '');
    if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const notificationIds = Array.isArray(body?.notificationIds) ? body.notificationIds : [];
    const db = getDbConnection();
    const data = await markIntranetNotificationsRead(db, userId, notificationIds);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao marcar notificações como lidas:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao marcar notificações como lidas.' }, { status: Number(error?.status) || 500 });
  }
}
