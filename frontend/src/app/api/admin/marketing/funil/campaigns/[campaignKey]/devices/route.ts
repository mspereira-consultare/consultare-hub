import { NextResponse } from 'next/server';
import { requireMarketingFunilPermission } from '@/lib/marketing_funil/auth';
import {
  listMarketingFunnelCampaignDevices,
  MarketingFunilValidationError,
  type MarketingFunilFilters,
} from '@/lib/marketing_funil/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ campaignKey: string }>;
};

const getFilters = (request: Request): MarketingFunilFilters => {
  const { searchParams } = new URL(request.url);
  return {
    periodRef: searchParams.get('periodRef') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    brand: searchParams.get('brand') || undefined,
    device: searchParams.get('device') || undefined,
  };
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireMarketingFunilPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { campaignKey } = await context.params;
    const data = await listMarketingFunnelCampaignDevices(auth.db, String(campaignKey || ''), getFilters(request));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const status = error instanceof MarketingFunilValidationError ? error.status : 500;
    console.error('Erro API marketing/funil campaign devices:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
