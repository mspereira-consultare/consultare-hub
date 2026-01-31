import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

// --- LISTAR METAS (GET) ---
export async function GET(request: Request) {
  try {
    const db = getDbConnection();
    
    // Busca todas as configurações de metas
    // Mantendo a compatibilidade com os campos do seu frontend
    const goals = await db.query(`
      SELECT * FROM goals_config 
      ORDER BY created_at DESC
    `);

    return NextResponse.json(goals);

  } catch (error: any) {
    console.error("Erro GET Goals Config:", error);
    // Se a tabela não existir, retorna array vazio em vez de erro 500
    if (error.message?.includes('no such table')) {
        return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    const db = getDbConnection();
    const finalScope = scope || 'CLINIC';
    const finalFilterGroup = filter_group || null;

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
              updated_at = datetime('now') 
          WHERE id = ?
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, clinic_unit, collaborator, id
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

      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      // --- CRIAÇÃO (INSERT) ---
      try {
        const result = await db.execute(`
          INSERT INTO goals_config (
              name, scope, sector, start_date, end_date, 
              periodicity, target_value, unit, linked_kpi_id, 
              filter_group, clinic_unit, collaborator, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          name, finalScope, sector, start_date, end_date, 
          periodicity, target_value, unit, linked_kpi_id, 
          finalFilterGroup, clinic_unit, collaborator
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
      return NextResponse.json({ success: true });
    }

  } catch (error: any) {
    console.error("Erro POST Goals Config:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro DELETE Goal:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}