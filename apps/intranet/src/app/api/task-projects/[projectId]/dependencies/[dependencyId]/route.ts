import { NextResponse } from 'next/server';
import { deleteTaskDependency } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string; dependencyId: string }>;
};

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId, dependencyId } = await context.params;
    const data = await deleteTaskDependency(auth.db, String(projectId || ''), String(dependencyId || ''), auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao remover dependência de projeto na intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao remover dependência.' }, { status: Number(error?.status) || 500 });
  }
}
