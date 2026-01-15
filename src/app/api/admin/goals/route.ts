import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

// --- AUTO-CORREÇÃO DE SCHEMA (VERSÃO COMPATÍVEL) ---
function ensureSchema(db: any) {
  // 1. Cria a tabela se não existir
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      sector TEXT,
      start_date TEXT,
      end_date TEXT,
      periodicity TEXT,
      target_value REAL,
      unit TEXT,
      linked_kpi_id TEXT,
      filter_group TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // 2. Verifica colunas individualmente para tabelas antigas
  // NOTA: Removemos "DEFAULT CURRENT_TIMESTAMP" para evitar o erro de 'non-constant default'
  const columnsToCheck = [
    { name: 'filter_group', def: 'TEXT' },
    { name: 'created_at', def: 'TEXT' },
    { name: 'updated_at', def: 'TEXT' }
  ];

  columnsToCheck.forEach(col => {
    try {
      db.prepare(`SELECT ${col.name} FROM goals_config LIMIT 1`).get();
    } catch (error: any) {
      if (error.message.includes('no such column')) {
        console.log(`⚠️ Coluna '${col.name}' ausente. Criando (Simple Mode)...`);
        try {
          // Adiciona a coluna sem valor padrão complexo (fica NULL nos registros antigos)
          db.prepare(`ALTER TABLE goals_config ADD COLUMN ${col.name} ${col.def}`).run();
          console.log(`✅ Coluna '${col.name}' criada!`);
          
          // Opcional: Preenche datas vazias com uma data fixa para não quebrar a ordenação
          if (col.name === 'created_at' || col.name === 'updated_at') {
              db.prepare(`UPDATE goals_config SET ${col.name} = datetime('now') WHERE ${col.name} IS NULL`).run();
          }
        } catch (e) {
          console.error(`Erro ao criar ${col.name}:`, e);
        }
      }
    }
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const db = getDbConnection();

    ensureSchema(db); // Repara o banco

    if (id) {
      const goal = db.prepare('SELECT * FROM goals_config WHERE id = ?').get(id);
      return NextResponse.json(goal);
    } else {
      // Coalesce garante que não quebre se a data for null
      const goals = db.prepare(`
        SELECT * FROM goals_config 
        ORDER BY COALESCE(created_at, '') DESC
      `).all();
      
      if (!Array.isArray(goals)) return NextResponse.json([]);
      return NextResponse.json(goals);
    }
  } catch (error: any) {
    console.error("❌ ERRO SERVER-SIDE (GET GOALS):", error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
        id, name, sector, start_date, end_date, 
        periodicity, target_value, unit, linked_kpi_id,
        filter_group 
    } = body;

    const db = getDbConnection();
    ensureSchema(db); // Repara o banco

    const finalFilterGroup = (filter_group && String(filter_group).trim() !== '') ? String(filter_group) : null;

    if (id) {
      // UPDATE
      const stmt = db.prepare(`
        UPDATE goals_config 
        SET name = ?, sector = ?, start_date = ?, end_date = ?, 
            periodicity = ?, target_value = ?, unit = ?, linked_kpi_id = ?,
            filter_group = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(
          name, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, 
          id
      );
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      // INSERT
      const stmt = db.prepare(`
        INSERT INTO goals_config (
            name, sector, start_date, end_date, 
            periodicity, target_value, unit, linked_kpi_id, 
            filter_group, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const info = stmt.run(
          name, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id,
          finalFilterGroup 
      );
      return NextResponse.json({ success: true, id: info.lastInsertRowid });
    }

  } catch (error: any) {
    console.error("❌ ERRO SERVER-SIDE (POST GOALS):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    db.prepare('DELETE FROM goals_config WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 