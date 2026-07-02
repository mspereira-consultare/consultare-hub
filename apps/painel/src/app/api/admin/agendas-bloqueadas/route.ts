import { NextResponse } from 'next/server';
import { requireBlockedAgendasPermission } from '@/lib/agendas_bloqueadas/auth';
import { getBlockedAgendasDefaultRange } from '@/lib/agendas_bloqueadas/date_range';
import type { BlockedAgendaRecurrenceFilter, BlockedAgendaSituationFilter } from '@/lib/agendas_bloqueadas/types';
import {
  BlockedAgendasValidationError,
  getBlockedAgendasHeartbeat,
  getLatestBlockedAgendasJob,
  listBlockedAgendaRows,
  normalizeBlockedAgendaFilters,
} from '@/lib/agendas_bloqueadas/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const normalizeUnitParam = (value: string | null): 'all' | '2' | '3' | '12' => {
  if (value === '2' || value === '3' || value === '12') return value;
  return 'all';
};

export async function GET(request: Request) {
  try {
    const auth = await requireBlockedAgendasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const defaults = getBlockedAgendasDefaultRange();

    const filters = normalizeBlockedAgendaFilters({
      startDate: searchParams.get('startDate') || defaults.startDate,
      endDate: searchParams.get('endDate') || defaults.endDate,
      unitId: normalizeUnitParam(searchParams.get('unit')),
      professionalId: searchParams.get('professionalId') || '',
      recurrence: (searchParams.get('recurrence') || 'all') as BlockedAgendaRecurrenceFilter,
      situation: (searchParams.get('situation') || 'active') as BlockedAgendaSituationFilter,
      search: searchParams.get('search') || '',
    });

    const [result, heartbeat, latestJob] = await Promise.all([
      listBlockedAgendaRows(auth.db, filters),
      getBlockedAgendasHeartbeat(auth.db),
      getLatestBlockedAgendasJob(auth.db, filters),
    ]);

    const data = {
      filters,
      rows: result.rows,
      totals: result.totals,
      professionals: result.professionals,
      dataJob: result.dataJob,
      latestJob,
      heartbeat,
    };

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const status = error instanceof BlockedAgendasValidationError ? error.status : 500;
    console.error('Erro API agendas-bloqueadas GET:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
