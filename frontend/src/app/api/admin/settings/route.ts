import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

// --- AUTO-CORREÇÃO DE SCHEMA ---
async function ensureSettingsSchema(db: any) {
  // Alterado para .execute para garantir compatibilidade com Turso
  await db.execute(`
    CREATE TABLE IF NOT EXISTS integrations_config (
      service TEXT PRIMARY KEY, 
      username TEXT,
      password TEXT,
      token TEXT, 
      unit_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// GET: Busca as configurações
export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      await ensureSettingsSchema(db);

      // Alterado: de .prepare().all() para .query()
      const configs = await db.query('SELECT * FROM integrations_config');
      
      const safeConfigs = configs.map((c: any) => ({
          ...c,
          password: c.password ? '********' : '', 
          token: c.token ? (c.token.substring(0, 10) + '...') : '',
          is_configured: !!c.password || !!c.token
      }));

      return safeConfigs;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error("Erro GET Settings:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// POST: Salva ou atualiza configurações
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { service, username, password, token, unit_id } = body;
    
    if (!['feegow', 'clinia'].includes(service)) {
        return NextResponse.json({ error: "Serviço inválido" }, { status: 400 });
    }

    const db = getDbConnection();
    await ensureSettingsSchema(db);

    // Alterado: de .prepare().get() para .query() pegando o primeiro resultado
    const results = await db.query('SELECT password, token FROM integrations_config WHERE service = ?', [service]);
    const existing = results.length > 0 ? results[0] : null;

    let finalPassword = password;
    if (password === '********' && existing) {
        finalPassword = existing.password;
    }

    let finalToken = token;
    if (token && token.includes('...') && existing) {
         finalToken = existing.token;
    }

    // Alterado: de .prepare().run() para .execute() direto
    await db.execute(`
      INSERT INTO integrations_config (service, username, password, token, unit_id, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(service) DO UPDATE SET
        username=excluded.username,
        password=excluded.password,
        token=excluded.token,
        unit_id=excluded.unit_id,
        updated_at=datetime('now')
    `, [service, username, finalPassword, finalToken, unit_id]);

    invalidateCache('admin:');
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro POST Settings:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
