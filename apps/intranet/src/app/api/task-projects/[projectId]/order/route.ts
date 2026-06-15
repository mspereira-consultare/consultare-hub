import { NextResponse } from 'next/server';
import { reorderTaskProjectTasks } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await context.params;
    const body = await request.json();
    const data = await reorderTaskProjectTasks(auth.db, String(projectId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao reordenar cronograma do projeto na intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao reordenar cronograma.' }, { status: Number(error?.status) || 500 });
  }
}
