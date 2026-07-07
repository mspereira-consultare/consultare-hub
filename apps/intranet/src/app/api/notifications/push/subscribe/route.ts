import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { upsertIntranetPushSubscription } from '@consultare/core/intranet/notifications';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '');
    if (!userId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const db = getDbConnection();
    const data = await upsertIntranetPushSubscription(db, userId, body, request.headers.get('user-agent'));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao registrar assinatura push da intranet:', error);
    const status = Number((error as { status?: number })?.status || 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao registrar assinatura push.' },
      { status }
    );
  }
}
