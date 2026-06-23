import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import {
  processTaskWeeklyReportSendPulseWebhook,
  TaskWeeklyReportValidationError,
} from '@/lib/tasks/weekly-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const hasValidWebhookSecret = (request: Request) => {
  const configuredSecret = String(process.env.TASKS_WEEKLY_REPORT_CRON_SECRET || '').trim();
  if (!configuredSecret) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = String(request.headers.get('x-webhook-secret') || request.headers.get('x-cron-secret') || '').trim();
  const url = new URL(request.url);
  const querySecret = String(url.searchParams.get('secret') || '').trim();

  return bearer === configuredSecret || headerSecret === configuredSecret || querySecret === configuredSecret;
};

export async function POST(request: Request) {
  try {
    if (!hasValidWebhookSecret(request)) {
      return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const db = getDbConnection();
    const data = await processTaskWeeklyReportSendPulseWebhook(db, payload);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro no webhook SendPulse do report semanal de tarefas:', error);
    const status = error instanceof TaskWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno no webhook do report semanal.' }, { status });
  }
}
