import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import { listRepasseEmailEvents } from '@/lib/repasses/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const data = await listRepasseEmailEvents(auth.db, {
      batchId: String(searchParams.get('batchId') || '').trim() || undefined,
      recipientId: String(searchParams.get('recipientId') || '').trim() || undefined,
      limit: Number(searchParams.get('limit') || 100),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar eventos de e-mail de repasse:', error);
    const status = Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao listar eventos de e-mail de repasse.',
      },
      { status }
    );
  }
}
