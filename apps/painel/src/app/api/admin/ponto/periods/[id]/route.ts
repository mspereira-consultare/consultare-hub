import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { getPayrollPeriodDetail, getPayrollPointHeartbeat } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const [detail, heartbeat] = await Promise.all([
      getPayrollPeriodDetail(auth.db, String(id || '')),
      getPayrollPointHeartbeat(auth.db),
    ]);
    return NextResponse.json({ status: 'success', data: { detail, heartbeat } });
  } catch (error: any) {
    console.error('Erro ao carregar competência de ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar competência.' }, { status: Number(error?.status) || 500 });
  }
}
