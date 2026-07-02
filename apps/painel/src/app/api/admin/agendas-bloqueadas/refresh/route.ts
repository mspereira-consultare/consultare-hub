import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requireBlockedAgendasPermission } from '@/lib/agendas_bloqueadas/auth';
import { getBlockedAgendasDefaultRange } from '@/lib/agendas_bloqueadas/date_range';
import { BlockedAgendasValidationError, createBlockedAgendasJob } from '@/lib/agendas_bloqueadas/repository';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireBlockedAgendasPermission('refresh');
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

    const defaults = getBlockedAgendasDefaultRange();
    const unit = String(payload.unit || payload.unitId || 'all').trim();

    const job = await createBlockedAgendasJob(
      auth.db,
      {
        startDate: payload.startDate || defaults.startDate,
        endDate: payload.endDate || defaults.endDate,
        unitScope: payload.unitScope || unit,
      },
      auth.userId
    );

    await upsertSystemStatus(auth.db, {
      serviceName: 'blocked_agendas',
      status: 'PENDING',
      details: `Job ${job.id} enfileirado`,
    });

    invalidateCache('admin:agendas-bloqueadas');
    invalidateCache('admin:');

    return NextResponse.json({
      status: 'success',
      data: {
        job,
      },
    });
  } catch (error: unknown) {
    const status = error instanceof BlockedAgendasValidationError ? error.status : 500;
    console.error('Erro API agendas-bloqueadas refresh:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
