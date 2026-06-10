import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { markAllIntranetNotificationsRead } from '@consultare/core/intranet/notifications';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '');
    if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const db = getDbConnection();
    const data = await markAllIntranetNotificationsRead(db, userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao marcar todas as notificações como lidas:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao marcar todas as notificações.' }, { status: Number(error?.status) || 500 });
  }
}
