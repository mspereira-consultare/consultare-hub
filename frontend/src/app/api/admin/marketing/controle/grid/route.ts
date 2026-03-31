import { NextResponse } from 'next/server';
import { buildCacheKey, withCache } from '@/lib/api_cache';
import { requireMarketingControlePermission } from '@/lib/marketing_controle/auth';
import {
  getMarketingControleGrid,
  MarketingControleValidationError,
  type MarketingControleFilters,
} from '@/lib/marketing_controle/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 10 * 60 * 1000;

const getFilters = (request: Request): MarketingControleFilters => {
  const { searchParams } = new URL(request.url);
  return {
    monthRef: searchParams.get('monthRef') || undefined,
    brand: searchParams.get('brand') || undefined,
  };
};

export async function GET(request: Request) {
  try {
    const auth = await requireMarketingControlePermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const cacheKey = buildCacheKey('admin', request.url);
    const data = await withCache(cacheKey, CACHE_TTL_MS, () =>
      getMarketingControleGrid(auth.db, getFilters(request))
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const status = error instanceof MarketingControleValidationError ? error.status : 500;
    console.error('Erro API marketing/controle grid:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
