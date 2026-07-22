import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { deletePointOccurrenceOverride, upsertPointOccurrenceOverride } from '@/lib/point/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await upsertPointOccurrenceOverride(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar override de ocorrência do ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar override de ocorrência.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deletePointOccurrenceOverride(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao excluir override de ocorrência do ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir override de ocorrência.' }, { status: Number(error?.status) || 500 });
  }
}
