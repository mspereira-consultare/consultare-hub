import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupFilter = searchParams.get('group'); // Pega o filtro da URL

    const db = getDbConnection();

    // Cláusula SQL dinâmica: se tiver filtro, adiciona AND
    const filterSQL = groupFilter && groupFilter !== 'all' 
        ? `AND procedure_group = '${groupFilter}'` 
        : '';

    // 1. Histórico Diário (Últimos 30 dias)
    const daily = db.prepare(`
        SELECT date, SUM(value) as total, COUNT(*) as qtd
        FROM feegow_appointments
        WHERE status_id = 3 
        AND date >= date('now', '-30 days')
        ${filterSQL}
        GROUP BY date
        ORDER BY date DESC
    `).all();

    // 2. Histórico Mensal (Últimos 12 meses)
    const monthly = db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(value) as total, COUNT(*) as qtd
        FROM feegow_appointments
        WHERE status_id = 3
        AND date >= date('now', '-12 months')
        ${filterSQL}
        GROUP BY month
        ORDER BY month DESC
    `).all();

    // 3. Ranking de Grupos (Sempre traz todos para preencher o Select/Filtro)
    // Trazemos também o Ticket Médio Geral por grupo aqui
    const groups = db.prepare(`
        SELECT procedure_group, SUM(value) as total, COUNT(*) as qtd
        FROM feegow_appointments
        WHERE status_id = 3
        GROUP BY procedure_group
        ORDER BY total DESC
    `).all();

    // 4. Totais Gerais (Cards do Topo)
    const totals = db.prepare(`
        SELECT SUM(value) as total, COUNT(*) as qtd
        FROM feegow_appointments
        WHERE status_id = 3
        AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
        ${filterSQL}
    `).get() as { total: number, qtd: number };

    return NextResponse.json({ daily, monthly, groups, totals });

  } catch (error: any) {
    console.error("ERRO API HISTORY:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}