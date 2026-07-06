import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { enqueuePayrollPointSync } from '@/lib/payroll/repository';
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
    const data = await enqueuePayrollPointSync(auth.db, {
      periodId,
      requestedBy: auth.userId,
    });

    await upsertSystemStatus(auth.db, {
      serviceName: 'payroll_point_sync',
      status: 'PENDING',
      details: `Job ${data.job.id} enfileirado para sincronização da competência ${periodId}`,
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
