import { NextResponse } from 'next/server';
import { addTaskChecklistItem } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const body = await request.json();
    const data = await addTaskChecklistItem(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar item do checklist no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar item do checklist.' }, { status: Number(error?.status) || 500 });
  }
}
