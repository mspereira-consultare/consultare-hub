import { NextResponse } from 'next/server';
import { getTaskWeeklyReportPreview } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'Informe o userId para gerar a prévia do report semanal.' }, { status: 400 });
    }

    const data = await getTaskWeeklyReportPreview(auth.db, userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao gerar prévia do report semanal de tarefas:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao gerar a prévia do report semanal.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
