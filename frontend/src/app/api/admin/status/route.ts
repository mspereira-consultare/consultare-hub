import { getDbConnection } from '@/lib/db';
import { NextResponse } from 'next/server';
import { withCache, buildCacheKey } from '@/lib/api_cache';

const CACHE_TTL_MS = 15 * 1000;

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();

      const services = await db.query(`
        SELECT service_name, status, last_run, details
        FROM system_status
        ORDER BY last_run DESC
      `);

      return services;
    });

    return NextResponse.json(cached);
  } catch (error) {
    console.error('[STATUS] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar status.' }, { status: (error as any)?.status || 500 });
  }
}
