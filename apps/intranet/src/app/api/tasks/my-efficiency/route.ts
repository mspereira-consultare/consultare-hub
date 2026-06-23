import { NextResponse } from 'next/server';
import { getTaskEfficiencySummary } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const data = await getTaskEfficiencySummary(auth.db, auth.viewer, {
      assigneeUserId: auth.userId,
      includeCanceled: true,
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar eficiência pessoal das tarefas na intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar eficiência.' }, { status: Number(error?.status) || 500 });
  }
}
