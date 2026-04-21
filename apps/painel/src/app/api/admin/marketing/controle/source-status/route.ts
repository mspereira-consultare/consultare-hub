import { NextResponse } from 'next/server';
import { buildCacheKey, withCache } from '@/lib/api_cache';
import { requireMarketingControlePermission } from '@/lib/marketing_controle/auth';
import { getMarketingControleSourceStatus } from '@/lib/marketing_controle/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 60 * 1000;

export async function GET(request: Request) {
  try {
    const auth = await requireMarketingControlePermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const cacheKey = buildCacheKey('admin', request.url);
    const data = await withCache(cacheKey, CACHE_TTL_MS, () =>
      getMarketingControleSourceStatus(auth.db)
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro API marketing/controle source-status:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
