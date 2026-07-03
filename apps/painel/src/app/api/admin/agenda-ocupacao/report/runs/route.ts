import { NextResponse } from 'next/server';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOccupancyWeeklyReportValidationError,
  listAgendaOccupancyWeeklyReportRuns,
} from '@/lib/agenda_ocupacao/weekly_report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 10) || 10;
    const data = await listAgendaOccupancyWeeklyReportRuns(auth.db, limit);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar histórico do report semanal de ocupação:', error);
    const status =
      error instanceof AgendaOccupancyWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar histórico.' },
      { status },
    );
  }
}
