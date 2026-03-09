import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import { AgendaOcupacaoValidationError, createAgendaOcupacaoJob } from '@/lib/agenda_ocupacao/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getDefaultRange = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const year = String(byType.get('year') || '1970');
  const month = String(byType.get('month') || '01');
  const day = String(byType.get('day') || '01');
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
  };
};

export async function POST(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let payload: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = {};
    }

    const defaults = getDefaultRange();
    const unit = String(payload.unit || payload.unitId || 'all').trim();

    const job = await createAgendaOcupacaoJob(
      auth.db,
      {
        startDate: payload.startDate || defaults.startDate,
        endDate: payload.endDate || defaults.endDate,
        unitScope: payload.unitScope || unit,
      },
      auth.userId
    );

    await auth.db.execute(
      `
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES ('agenda_occupancy', 'PENDING', datetime('now'), ?)
      ON CONFLICT(service_name) DO UPDATE SET
        status = excluded.status,
        last_run = excluded.last_run,
        details = excluded.details
      `,
      [`Job ${job.id} enfileirado`] 
    );

    invalidateCache('admin:agenda-ocupacao');
    invalidateCache('admin:');

    return NextResponse.json({
      status: 'success',
      data: {
        job,
      },
    });
  } catch (error: unknown) {
    const status = error instanceof AgendaOcupacaoValidationError ? error.status : 500;
    console.error('Erro API agenda-ocupacao refresh:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
