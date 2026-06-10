import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { getIntranetNotificationSummary } from '@consultare/core/intranet/notifications';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '');
    if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const db = getDbConnection();
    const data = await getIntranetNotificationSummary(db, userId, 8);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar resumo de notificações:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar resumo de notificações.' }, { status: Number(error?.status) || 500 });
  }
}
