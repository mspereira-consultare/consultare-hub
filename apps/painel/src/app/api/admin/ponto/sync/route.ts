import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { enqueuePointSync } from '@/lib/point/repository';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const payload = await request
      .json()
      .catch(() => ({} as { startDate?: string; endDate?: string }));

    const data = await enqueuePointSync(auth.db, {
      requestedBy: auth.userId,
      window:
        payload?.startDate || payload?.endDate
          ? {
              startDate: payload?.startDate,
              endDate: payload?.endDate,
            }
          : undefined,
    });
    await upsertSystemStatus(auth.db, {
      serviceName: 'point_sync',
      status: 'PENDING',
      details: `Job ${data.job.id} enfileirado para sincronizar a janela ${data.window.startDate} a ${data.window.endDate}.`,
    });

    return NextResponse.json(
      {
        status: 'accepted',
        data,
        message: 'Sincronização da base de ponto enfileirada com sucesso.',
      },
      { status: 202 },
    );
  } catch (error: any) {
    console.error('Erro ao sincronizar base de ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao sincronizar ponto.' }, { status: Number(error?.status) || 500 });
  }
}
