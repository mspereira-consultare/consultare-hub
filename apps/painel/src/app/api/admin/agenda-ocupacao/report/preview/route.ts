import { NextResponse } from 'next/server';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOccupancyWeeklyReportValidationError,
  getAgendaOccupancyWeeklyReportPreview,
  getNextAgendaOccupancyWeeklyWindow,
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
    const employeeId = String(searchParams.get('employeeId') || '').trim();
    if (!employeeId) {
      return NextResponse.json({ error: 'Informe o employeeId para gerar a prévia.' }, { status: 400 });
    }

    const window = getNextAgendaOccupancyWeeklyWindow();
    const data = await getAgendaOccupancyWeeklyReportPreview(auth.db, employeeId, {
      startDate: String(searchParams.get('startDate') || '').trim() || window.startDate,
      endDate: String(searchParams.get('endDate') || '').trim() || window.endDate,
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao gerar prévia do report semanal de ocupação:', error);
    const status =
      error instanceof AgendaOccupancyWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao gerar prévia.' },
      { status },
    );
  }
}
