import { NextResponse } from 'next/server';
import { listTaskWeeklyReportRuns } from '@/lib/tasks/weekly-report';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 20) || 20;
    const data = await listTaskWeeklyReportRuns(auth.db, limit);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar runs do report semanal de tarefas:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar runs.' }, { status: Number(error?.status) || 500 });
  }
}
