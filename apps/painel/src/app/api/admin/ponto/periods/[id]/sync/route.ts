import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { getPayrollPeriodDetail } from '@/lib/payroll/repository';
import { enqueuePointSync } from '@/lib/point/repository';
import { upsertSystemStatus } from '@/lib/system_status_repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const periodId = String(id || '').trim();
    const detail = await getPayrollPeriodDetail(auth.db, periodId);
    const data = await enqueuePointSync(auth.db, {
      requestedBy: auth.userId,
      window: {
        startDate: detail.period.periodStart,
        endDate: detail.period.periodEnd,
      },
    });

    await upsertSystemStatus(auth.db, {
      serviceName: 'point_sync',
      status: 'PENDING',
      details: `Job ${data.job.id} enfileirado para sincronização da janela ${detail.period.periodStart} a ${detail.period.periodEnd}.`,
    });

    return NextResponse.json(
      {
        status: 'accepted',
        data,
        message: 'Sincronização de ponto enfileirada com sucesso.',
      },
      { status: 202 },
    );
  } catch (error: any) {
    console.error('Erro ao sincronizar ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao sincronizar ponto.' }, { status: Number(error?.status) || 500 });
  }
}
