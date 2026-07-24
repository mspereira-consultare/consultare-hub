import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { deletePayrollLateBankCompensation, upsertPayrollLateBankCompensation } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ lineId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { lineId } = await context.params;
    const body = await request.json().catch(() => ({} as { requestedMinutes?: number; notes?: string | null }));
    const data = await upsertPayrollLateBankCompensation(auth.db, String(lineId || ''), body, String(auth.userId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar abatimento de atraso com banco:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar abatimento de atraso com banco.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { lineId } = await context.params;
    const data = await deletePayrollLateBankCompensation(auth.db, String(lineId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao remover abatimento de atraso com banco:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao remover abatimento de atraso com banco.' }, { status: Number(error?.status) || 500 });
  }
}
