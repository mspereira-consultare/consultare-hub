import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { deletePayrollPeriod, getPayrollPeriodDetail } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getPayrollPeriodDetail(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar competência da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar competência.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deletePayrollPeriod(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao excluir competência da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir competência.' }, { status: Number(error?.status) || 500 });
  }
}
