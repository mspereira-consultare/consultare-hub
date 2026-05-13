import { NextResponse } from 'next/server';
import { getTaskById, updateTask } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const data = await getTaskById(auth.db, String(taskId || ''), auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao detalhar tarefa da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao detalhar tarefa.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const body = await request.json();
    const data = await updateTask(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar tarefa da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar tarefa.' }, { status: Number(error?.status) || 500 });
  }
}
