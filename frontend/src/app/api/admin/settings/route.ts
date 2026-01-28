import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

// --- AUTO-CORREÇÃO DE SCHEMA ---
function ensureSettingsSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS integrations_config (
      service TEXT PRIMARY KEY, -- 'feegow' ou 'clinia'
      username TEXT,
      password TEXT,
      token TEXT, -- Para o Cookie Completo ou Token de API
      unit_id TEXT, -- Específico para Feegow (Unidade Padrão)
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// GET: Busca as configurações (ocultando senhas reais)
export async function GET() {
  try {
    const db = getDbConnection();
    ensureSettingsSchema(db);

    const configs = db.prepare('SELECT * FROM integrations_config').all();
    
    // Mascara a senha para segurança visual no front
    const safeConfigs = configs.map((c: any) => ({
        ...c,
        password: c.password ? '********' : '', 
        token: c.token ? (c.token.substring(0, 10) + '...') : '', // Mostra só o comecinho do token
        is_configured: !!c.password || !!c.token
    }));

    return NextResponse.json(safeConfigs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Salva as configurações
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { service, username, password, token, unit_id } = body;
    
    if (!['feegow', 'clinia'].includes(service)) {
        return NextResponse.json({ error: "Serviço inválido" }, { status: 400 });
    }

    const db = getDbConnection();
    ensureSettingsSchema(db);

    // Verifica se já existe para manter a senha antiga se o usuário não digitou uma nova
    const existing = db.prepare('SELECT password, token FROM integrations_config WHERE service = ?').get(service) as any;

    let finalPassword = password;
    if (password === '********' && existing) {
        finalPassword = existing.password;
    }

    // Lógica similar para o Token (se o usuário não mudou, mantém)
    let finalToken = token;
    if (token && token.includes('...') && existing) {
         finalToken = existing.token;
    }

    const stmt = db.prepare(`
      INSERT INTO integrations_config (service, username, password, token, unit_id, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(service) DO UPDATE SET
        username=excluded.username,
        password=excluded.password,
        token=excluded.token,
        unit_id=excluded.unit_id,
        updated_at=datetime('now')
    `);

    stmt.run(service, username, finalPassword, finalToken, unit_id);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro ao salvar config:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}