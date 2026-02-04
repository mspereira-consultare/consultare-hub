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
      // Busca apenas colaboradores (scheduled_by), alinhado com a página de produtividade
      const rows = await db.query(`
        SELECT DISTINCT TRIM(scheduled_by) as name
        FROM feegow_appointments
        WHERE scheduled_by IS NOT NULL AND scheduled_by != '' AND scheduled_by != 'Sistema'
        ORDER BY name ASC
      `);

      const normalizeKey = (value: string) => {
        return value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      };

      const normalized = new Map<string, string>();
      for (const r of rows) {
        const raw = String(r?.name || '').replace(/\s+/g, ' ').trim();
        if (!raw) continue;
        const key = normalizeKey(raw);
        if (!normalized.has(key)) normalized.set(key, raw);
      }

      const list = Array.from(normalized.values())
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((name) => ({ name }));

      return list;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error('Erro OPTIONS professionals:', error);
    return NextResponse.json([], { status: 200 });
  }
}
