import { NextResponse } from 'next/server';
import { requireMarketingFunilPermission } from '@/lib/marketing_funil/auth';
import {
  getLatestMarketingFunnelJob,
  MarketingFunilValidationError,
} from '@/lib/marketing_funil/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireMarketingFunilPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const latestJob = await getLatestMarketingFunnelJob(auth.db, {
      periodRef: searchParams.get('periodRef') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      brand: searchParams.get('brand') || undefined,
    });

    return NextResponse.json({ status: 'success', data: { latestJob } });
  } catch (error: unknown) {
    const status = error instanceof MarketingFunilValidationError ? error.status : 500;
    console.error('Erro API marketing/funil jobs/latest:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
