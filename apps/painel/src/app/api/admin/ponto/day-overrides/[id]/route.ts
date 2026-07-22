import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { deletePointDayOverride, updatePointDayOverride } from '@/lib/point/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await updatePointDayOverride(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar override diário do ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar override diário.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deletePointDayOverride(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao excluir override diário do ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir override diário.' }, { status: Number(error?.status) || 500 });
  }
}
