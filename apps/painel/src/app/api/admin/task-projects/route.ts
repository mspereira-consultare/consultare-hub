import { NextResponse } from 'next/server';
import { createTaskProject, listTaskProjects } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listTaskProjects(auth.db, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar projetos de tarefas no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar projetos.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createTaskProject(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar projeto de tarefas no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar projeto.' }, { status: Number(error?.status) || 500 });
  }
}
