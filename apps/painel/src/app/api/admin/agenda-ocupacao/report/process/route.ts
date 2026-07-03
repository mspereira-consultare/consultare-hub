import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOccupancyWeeklyReportValidationError,
  getNextAgendaOccupancyWeeklyWindow,
  processAgendaOccupancyWeeklyReportRun,
} from '@/lib/agenda_ocupacao/weekly_report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const hasValidCronSecret = (request: Request) => {
  const configuredSecret = String(process.env.AGENDA_OCCUPANCY_REPORT_CRON_SECRET || '').trim();
  if (!configuredSecret) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  const url = new URL(request.url);
  const querySecret = String(url.searchParams.get('secret') || '').trim();

  return bearer === configuredSecret || headerSecret === configuredSecret || querySecret === configuredSecret;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fallbackWindow = getNextAgendaOccupancyWeeklyWindow();
    const input = {
      force: Boolean(body?.force),
      startDate: String(body?.startDate || '').trim() || fallbackWindow.startDate,
      endDate: String(body?.endDate || '').trim() || fallbackWindow.endDate,
      refreshJobId: String(body?.refreshJobId || '').trim() || null,
    };

    if (hasValidCronSecret(request)) {
      const db = getDbConnection();
      const data = await processAgendaOccupancyWeeklyReportRun(db, {
        triggerSource: 'cron',
        triggeredBy: 'system_cron',
        ...input,
      });
      return NextResponse.json({ status: 'success', data });
    }

    const auth = await requireAgendaOcupacaoPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await processAgendaOccupancyWeeklyReportRun(auth.db, {
      triggerSource: 'manual',
      triggeredBy: auth.userId,
      ...input,
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao processar report semanal de ocupação:', error);
    const status =
      error instanceof AgendaOccupancyWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar report semanal.' },
      { status },
    );
  }
}
