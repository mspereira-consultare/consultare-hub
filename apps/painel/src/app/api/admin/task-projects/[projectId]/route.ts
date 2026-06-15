import { NextResponse } from 'next/server';
import { getTaskProjectById, updateTaskProject } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await context.params;
    const data = await getTaskProjectById(auth.db, String(projectId || ''), auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao detalhar projeto de tarefas no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao detalhar projeto.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await context.params;
    const body = await request.json();
    const data = await updateTaskProject(auth.db, String(projectId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar projeto de tarefas no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar projeto.' }, { status: Number(error?.status) || 500 });
  }
}
