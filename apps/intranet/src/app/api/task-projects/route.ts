import { NextResponse } from 'next/server';
import { createTaskProject, listTaskProjects } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listTaskProjects(auth.db, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar projetos de tarefas da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar projetos.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createTaskProject(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar projeto de tarefas da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar projeto.' }, { status: Number(error?.status) || 500 });
  }
}
