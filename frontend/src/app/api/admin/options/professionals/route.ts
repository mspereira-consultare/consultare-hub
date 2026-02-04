import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      // Busca nomes distintos de profissionais e agendadores
      const rows = await db.query(`
        SELECT DISTINCT TRIM(COALESCE(professional_name, scheduled_by)) as name
        FROM feegow_appointments
        WHERE (professional_name IS NOT NULL AND professional_name != '') OR (scheduled_by IS NOT NULL AND scheduled_by != '')
        ORDER BY name ASC
      `);

      const list = rows.map((r: any) => ({ name: r.name }));
      return list;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error('Erro OPTIONS professionals:', error);
    return NextResponse.json([], { status: 200 });
  }
}
