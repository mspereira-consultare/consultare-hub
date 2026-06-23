import { NextResponse } from 'next/server';
import { getTaskWeeklyReportEligibilitySummary } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getTaskWeeklyReportEligibilitySummary(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar elegibilidade do report semanal de tarefas:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar elegibilidade do report semanal.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
