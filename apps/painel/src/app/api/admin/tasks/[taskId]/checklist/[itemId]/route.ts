import { NextResponse } from 'next/server';
import { deleteTaskChecklistItem, updateTaskChecklistItem } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string; itemId: string }>;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId, itemId } = await context.params;
    const body = await request.json();
    const data = await updateTaskChecklistItem(auth.db, String(taskId || ''), String(itemId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar item do checklist no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar item do checklist.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId, itemId } = await context.params;
    const data = await deleteTaskChecklistItem(auth.db, String(taskId || ''), String(itemId || ''), auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao remover item do checklist no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao remover item do checklist.' }, { status: Number(error?.status) || 500 });
  }
}
