import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

// --- LISTAR METAS (GET) ---
export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      
      // Busca todas as configurações de metas
      // Mantendo a compatibilidade com os campos do seu frontend
      const goals = await db.query(`
        SELECT * FROM goals_config 
        ORDER BY created_at DESC
      `);

      return goals;
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro GET Goals Config:", error);
    // Se a tabela não existir, retorna array vazio em vez de erro 500
    if (error.message?.includes('no such table')) {
        return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// --- SALVAR/ATUALIZAR META (POST) ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
        id, // Se vier ID, é edição
        name, 
        scope, // 'CLINIC' ou 'CARD'
        sector, 
        start_date, 
        end_date, 
        periodicity, 
        target_value, 
        unit, 
        linked_kpi_id, 
        filter_group 
    } = body;
    const clinic_unit = body.clinic_unit || null;
    const collaborator = body.collaborator || null;
    const team = body.team || null;

    const db = getDbConnection();
    const finalScope = scope || 'CLINIC';
    const finalFilterGroup = filter_group || null;

    // Garante colunas novas (compatível com SQLite/Turso)
    try { await db.execute("ALTER TABLE goals_config ADD COLUMN clinic_unit TEXT"); } catch (e) {}
    try { await db.execute("ALTER TABLE goals_config ADD COLUMN collaborator TEXT"); } catch (e) {}
    try { await db.execute("ALTER TABLE goals_config ADD COLUMN team TEXT"); } catch (e) {}

    if (id) {
      // --- EDIÇÃO (UPDATE) ---
      // Tentativa com colunas novas (clinic_unit, collaborator). Se falhar (coluna não existe), faz fallback para versão antiga.
      try {
        await db.execute(`
          UPDATE goals_config 
          SET 
              name = ?, 
              scope = ?, 
              sector = ?, 
              start_date = ?, 
              end_date = ?, 
              periodicity = ?, 
              target_value = ?, 
              unit = ?, 
              linked_kpi_id = ?, 
              filter_group = ?, 
              clinic_unit = ?,
              collaborator = ?,
              team = ?,
              updated_at = datetime('now') 
          WHERE id = ?
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, clinic_unit, collaborator, team, id
        ]);
      } catch (e) {
        // Fallback para schema antigo sem novas colunas
        await db.execute(`
          UPDATE goals_config 
          SET 
              name = ?, 
              scope = ?, 
              sector = ?, 
              start_date = ?, 
              end_date = ?, 
              periodicity = ?, 
              target_value = ?, 
              unit = ?, 
              linked_kpi_id = ?, 
              filter_group = ?, 
              updated_at = datetime('now') 
          WHERE id = ?
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, id
        ]);
      }

      invalidateCache('admin:');
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      // --- CRIAÇÃO (INSERT) ---
      try {
        const result = await db.execute(`
          INSERT INTO goals_config (
              name, scope, sector, start_date, end_date, 
              periodicity, target_value, unit, linked_kpi_id, 
              filter_group, clinic_unit, collaborator, team, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, clinic_unit, collaborator, team
        ]);
      } catch (e) {
        // Fallback: insert sem as novas colunas
        const result = await db.execute(`
          INSERT INTO goals_config (
              name, scope, sector, start_date, end_date, 
              periodicity, target_value, unit, linked_kpi_id, 
              filter_group, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup
        ]);
      }
      
      // O cliente Turso retorna o ID inserido no result
      // Nota: Dependendo da versão do driver, pode ser result.lastInsertRowid ou similar.
      // O nosso adaptador db.ts deve tratar isso, mas retornamos success true por garantia.
      invalidateCache('admin:');
      return NextResponse.json({ success: true });
    }

  } catch (error: any) {
    console.error("Erro POST Goals Config:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// --- DELETAR META (DELETE) ---
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    
    await db.execute(
        "DELETE FROM goals_config WHERE id = ?", 
        [id]
    );

    invalidateCache('admin:');
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro DELETE Goal:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
