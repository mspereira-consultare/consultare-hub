import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  try {
    const db = getDbConnection();
    // Ordena por data de fim (mais recentes primeiro)
    const goals = db.prepare('SELECT * FROM goals_config ORDER BY end_date DESC, sector ASC').all();
    return NextResponse.json(goals);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar metas' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
        id, sector, name, start_date, end_date, 
        periodicity, target_value, unit, linked_kpi_id 
    } = body;
    
    const db = getDbConnection();

    if (id) {
        const stmt = db.prepare(`
            UPDATE goals_config 
            SET sector=?, name=?, start_date=?, end_date=?, periodicity=?, 
                target_value=?, unit=?, linked_kpi_id=?, updated_at=CURRENT_TIMESTAMP 
            WHERE id=?
        `);
        stmt.run(sector, name, start_date, end_date, periodicity, target_value, unit, linked_kpi_id, id);
    } else {
        const stmt = db.prepare(`
            INSERT INTO goals_config (sector, name, start_date, end_date, periodicity, target_value, unit, linked_kpi_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(sector, name, start_date, end_date, periodicity, target_value, unit, linked_kpi_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const db = getDbConnection();
        db.prepare('DELETE FROM goals_config WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao deletar' }, { status: 500 });
    }
}