import { NextResponse } from 'next/server';
import { getTaskProjectGantt } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await context.params;
    const data = await getTaskProjectGantt(auth.db, String(projectId || ''), auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar gantt do projeto na intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar gantt.' }, { status: Number(error?.status) || 500 });
  }
}
