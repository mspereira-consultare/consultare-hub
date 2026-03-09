import { NextResponse } from 'next/server';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import { AgendaOcupacaoValidationError, getLatestAgendaOcupacaoJob } from '@/lib/agenda_ocupacao/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const filters = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      unitId: searchParams.get('unit') || undefined,
    };

    const latestJob = await getLatestAgendaOcupacaoJob(auth.db, filters);
    return NextResponse.json({ status: 'success', data: { latestJob } });
  } catch (error: unknown) {
    const status = error instanceof AgendaOcupacaoValidationError ? error.status : 500;
    console.error('Erro API agenda-ocupacao jobs/latest:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
