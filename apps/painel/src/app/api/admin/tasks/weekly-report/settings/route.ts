import { NextResponse } from 'next/server';
import {
  getTaskWeeklyReportSettings,
  TaskWeeklyReportValidationError,
  updateTaskWeeklyReportSettings,
} from '@/lib/tasks/weekly-report';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getTaskWeeklyReportSettings(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar configurações do report semanal de tarefas:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar configurações.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data = await updateTaskWeeklyReportSettings(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar configurações do report semanal de tarefas:', error);
    const status = error instanceof TaskWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar configurações.' }, { status });
  }
}
