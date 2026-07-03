import { NextResponse } from 'next/server';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOccupancyWeeklyReportValidationError,
  getAgendaOccupancyWeeklyReportSettings,
  updateAgendaOccupancyWeeklyReportSettings,
} from '@/lib/agenda_ocupacao/weekly_report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getAgendaOccupancyWeeklyReportSettings(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar configurações do report semanal de ocupação:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar configurações.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const data = await updateAgendaOccupancyWeeklyReportSettings(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar configurações do report semanal de ocupação:', error);
    const status =
      error instanceof AgendaOccupancyWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar configurações.' },
      { status },
    );
  }
}
