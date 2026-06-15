import { NextResponse } from 'next/server';
import { addTaskProjectMember } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await context.params;
    const body = await request.json();
    const data = await addTaskProjectMember(auth.db, String(projectId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao adicionar membro ao projeto no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao adicionar membro.' }, { status: Number(error?.status) || 500 });
  }
}
