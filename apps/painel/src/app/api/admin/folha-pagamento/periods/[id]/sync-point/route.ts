import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { listPayrollDailyControlRows, getPayrollPeriodDetail } from '@/lib/payroll/repository';
import { enqueuePointSync } from '@/lib/point/repository';
import { upsertSystemStatus } from '@/lib/system_status_repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
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

    await upsertSystemStatus(auth.db, {
      serviceName: 'payroll_point_sync',
      status: 'PENDING',
      details: `Job ${data.job.id} enfileirado para sincronização da competência ${periodId} via base única de ponto.`,
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
    console.error('Erro ao sincronizar ponto da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao sincronizar ponto.' }, { status: Number(error?.status) || 500 });
  }
}

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listPayrollDailyControlRows(auth.db, String(id || ''), parsePayrollLineFilters(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao consultar sincronização de ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao consultar sincronização.' }, { status: Number(error?.status) || 500 });
  }
}
