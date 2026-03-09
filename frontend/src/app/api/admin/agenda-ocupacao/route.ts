import { NextResponse } from 'next/server';
import { buildCacheKey, withCache } from '@/lib/api_cache';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOcupacaoValidationError,
  getAgendaOcupacaoHeartbeat,
  getLatestAgendaOcupacaoJob,
  listAgendaOcupacaoBySpecialty,
  normalizeAgendaFilters,
} from '@/lib/agenda_ocupacao/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 2 * 60 * 1000;

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

export async function GET(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const defaults = getDefaultRange();

    const filters = normalizeAgendaFilters({
      startDate: searchParams.get('startDate') || defaults.startDate,
      endDate: searchParams.get('endDate') || defaults.endDate,
      unitId: searchParams.get('unit') || 'all',
    });

    const cacheKey = buildCacheKey('admin:agenda-ocupacao', request.url);
    const data = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const [summary, heartbeat, latestJob] = await Promise.all([
        listAgendaOcupacaoBySpecialty(auth.db, filters),
        getAgendaOcupacaoHeartbeat(auth.db),
        getLatestAgendaOcupacaoJob(auth.db, filters),
      ]);

      return {
        filters,
        rows: summary.rows,
        totals: summary.totals,
        heartbeat,
        latestJob,
      };
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const status = error instanceof AgendaOcupacaoValidationError ? error.status : 500;
    console.error('Erro API agenda-ocupacao GET:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
