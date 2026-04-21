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

      // 1. Alterado de .prepare() para .query()
    // 2. Tabela alterada para resumo diário e coluna para 'grupo'
      // para sincronizar com o seu database_manager.py
      const rows = await db.query(`
      SELECT DISTINCT grupo 
      FROM faturamento_resumo_diario 
      WHERE grupo IS NOT NULL AND grupo != ''
      ORDER BY grupo ASC
    `);

      // O db.query retorna um array de objetos. Mapeamos para retornar apenas as strings.
      const groups = rows.map((row: any) => row.grupo);

      return groups;
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro ao buscar grupos do Feegow:", error);
    
    // Se a tabela não existir ainda, retorna um array vazio para não quebrar o build/front
    if (error.message?.includes('no such table')) {
        return NextResponse.json([]);
    }
    
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
} 
