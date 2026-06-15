import { NextResponse } from 'next/server';
import { removeTaskProjectMember } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string; memberId: string }>;
};

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId, memberId } = await context.params;
    const data = await removeTaskProjectMember(auth.db, String(projectId || ''), String(memberId || ''), auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao remover membro do projeto no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao remover membro.' }, { status: Number(error?.status) || 500 });
  }
}
