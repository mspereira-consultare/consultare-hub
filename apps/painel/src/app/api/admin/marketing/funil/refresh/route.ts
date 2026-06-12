import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requireMarketingFunilPermission } from '@/lib/marketing_funil/auth';
import { upsertSystemStatus } from '@/lib/system_status_repository';
import {
  createMarketingFunnelJob,
  MarketingFunilValidationError,
} from '@/lib/marketing_funil/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireMarketingFunilPermission('refresh');
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

    const job = await createMarketingFunnelJob(
      auth.db,
      {
        periodRef: payload.periodRef,
        startDate: payload.startDate,
        endDate: payload.endDate,
        brand: payload.brand,
        account: payload.account,
      },
      auth.userId
    );

    await upsertSystemStatus(auth.db, {
      serviceName: 'marketing_funnel',
      status: 'PENDING',
      details: `Job ${job.id} enfileirado via API marketing/funil`,
    });

    invalidateCache('admin:');

    return NextResponse.json({ status: 'success', data: { job } });
  } catch (error: unknown) {
    const status = error instanceof MarketingFunilValidationError ? error.status : 500;
    console.error('Erro API marketing/funil refresh:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
