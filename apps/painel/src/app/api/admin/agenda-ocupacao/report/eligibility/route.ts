import { NextResponse } from 'next/server';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOccupancyWeeklyReportValidationError,
  getAgendaOccupancyWeeklyReportEligibilitySummary,
} from '@/lib/agenda_ocupacao/weekly_report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getAgendaOccupancyWeeklyReportEligibilitySummary(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar elegibilidade do report semanal de ocupação:', error);
    const status =
      error instanceof AgendaOccupancyWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar elegibilidade.' },
      { status },
    );
  }
}
