import { NextResponse } from 'next/server';
import { requestTaskApproval } from '@consultare/core/tasks/repository';
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
    const data = await requestTaskApproval(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao solicitar aprovação da tarefa:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao solicitar aprovação.' }, { status: Number(error?.status) || 500 });
  }
}
