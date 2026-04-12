import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { getPayrollLineDetail, patchPayrollLine } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ lineId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { lineId } = await context.params;
    const data = await getPayrollLineDetail(auth.db, String(lineId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar detalhe da linha da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar detalhe da linha.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { lineId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await patchPayrollLine(auth.db, String(lineId || ''), body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar linha da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar linha.' }, { status: Number(error?.status) || 500 });
  }
}
