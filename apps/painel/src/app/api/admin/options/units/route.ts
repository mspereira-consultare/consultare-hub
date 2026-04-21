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

      // Busca unidades distintas da tabela de resumo de faturamento
      const units = await db.query(`
          SELECT DISTINCT TRIM(unidade) as name
          FROM faturamento_resumo_diario
          WHERE unidade IS NOT NULL AND unidade != ''
          AND (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%')
          ORDER BY name ASC
      `);

      return units;
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro ao buscar unidades:", error);
    if (error.message?.includes('no such table')) {
        return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
