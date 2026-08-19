import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { RECEPCAO_CHECKLIST_REFRESH_SERVICE } from '@/lib/checklist_recepcao';
import { isSystemStatusActive, isSystemStatusStale } from '@/lib/system_status_health';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const hasValidCronSecret = (request: Request) => {
  const configuredSecret = String(process.env.CHECKLIST_RECEPCAO_CRON_SECRET || '').trim();
  if (!configuredSecret) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  const querySecret = String(new URL(request.url).searchParams.get('secret') || '').trim();
  return bearer === configuredSecret || headerSecret === configuredSecret || querySecret === configuredSecret;
};

export async function POST(request: Request) {
  try {
    if (!hasValidCronSecret(request)) {
      return NextResponse.json({ status: 'error', error: 'Cron secret inválido.' }, { status: 401 });
    }

    const db = getDbConnection();
    const rows = await db.query(
      `
        SELECT status, last_run
        FROM system_status
        WHERE service_name = ?
        LIMIT 1
      `,
      [RECEPCAO_CHECKLIST_REFRESH_SERVICE],
    );
    const currentStatus = String((rows[0] as { status?: unknown } | undefined)?.status || '').trim().toUpperCase();
    const currentLastRun = String((rows[0] as { last_run?: unknown } | undefined)?.last_run || '').trim() || null;

    if (isSystemStatusActive(currentStatus) && !isSystemStatusStale(currentStatus, currentLastRun)) {
      return NextResponse.json({
        status: 'success',
        message: 'Lote da checklist já estava em processamento.',
        batchStatus: currentStatus,
        requested: false,
      });
    }

    await upsertSystemStatus(db, {
      serviceName: RECEPCAO_CHECKLIST_REFRESH_SERVICE,
      status: 'PENDING',
      details: 'Lote da checklist solicitado via cron do Railway.',
    });

    return NextResponse.json({
      status: 'success',
      message: 'Lote da checklist enfileirado via cron.',
      batchStatus: 'PENDING',
      requested: true,
    });
  } catch (error: unknown) {
    console.error('Erro cron checklist recepcao refresh:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Erro ao enfileirar lote da checklist.' },
      { status: 500 },
    );
  }
}
