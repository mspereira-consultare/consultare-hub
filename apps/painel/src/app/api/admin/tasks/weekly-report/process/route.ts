import { NextResponse } from 'next/server';
import { processTaskWeeklyReportRun, TaskWeeklyReportValidationError } from '@/lib/tasks/weekly-report';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const hasValidCronSecret = (request: Request) => {
  const configuredSecret = String(process.env.TASKS_WEEKLY_REPORT_CRON_SECRET || '').trim();
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

    if (hasValidCronSecret(request)) {
      const db = getDbConnection();
      const data = await processTaskWeeklyReportRun(db, {
        triggerSource: 'cron',
        triggeredBy: 'system_cron',
        force: Boolean(body?.force),
        maxRecipients: Number(body?.maxRecipients || 0) || undefined,
      });
      return NextResponse.json({ status: 'success', data });
    }

    const auth = await requireTaskGovernanceAccess('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await processTaskWeeklyReportRun(auth.db, {
      triggerSource: 'manual',
      triggeredBy: auth.userId,
      force: Boolean(body?.force),
      maxRecipients: Number(body?.maxRecipients || 0) || undefined,
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao processar o report semanal de tarefas:', error);
    const status = error instanceof TaskWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao processar o report semanal.' }, { status });
  }
}
