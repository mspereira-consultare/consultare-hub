import { NextResponse } from 'next/server';
import { requireMarketingFunilPermission } from '@/lib/marketing_funil/auth';
import {
  listMarketingFunilCliniaAdsOrigins,
  MarketingFunilValidationError,
  type MarketingFunilFilters,
} from '@/lib/marketing_funil/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getFilters = (request: Request): MarketingFunilFilters => {
  const { searchParams } = new URL(request.url);
  return {
    periodRef: searchParams.get('periodRef') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    brand: searchParams.get('brand') || undefined,
  };
};

export async function GET(request: Request) {
  try {
    const auth = await requireMarketingFunilPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await listMarketingFunilCliniaAdsOrigins(auth.db, getFilters(request));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const status = error instanceof MarketingFunilValidationError ? error.status : 500;
    console.error('Erro API marketing/funil clinia-ads origins:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
