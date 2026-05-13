import { NextResponse } from 'next/server';
import { addTaskComment } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const body = await request.json();
    const data = await addTaskComment(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao comentar tarefa da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao comentar tarefa.' }, { status: Number(error?.status) || 500 });
  }
}
