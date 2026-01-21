import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;
    
    const db = getDbConnection();

    // 1. TOTAIS GERAIS (Qtd e Valor)
    const summary = db.prepare(`
        SELECT 
            COUNT(*) as qtd,
            SUM(total_value) as valor
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate) as { qtd: number, valor: number };

    // 2. POR UNIDADE (Agrupado por Status dentro da Unidade)
    const byUnit = db.prepare(`
        SELECT 
            unit_name,
            status,
            COUNT(*) as qtd,
            SUM(total_value) as valor
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
        GROUP BY unit_name, status
        ORDER BY unit_name, valor DESC
    `).all(startDate, endDate);

    // 3. RANKING DE VENDEDORES (Quem mais gerou propostas)
    const byProposer = db.prepare(`
        SELECT 
            professional_name,
            COUNT(*) as qtd,
            SUM(total_value) as valor
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
        GROUP BY professional_name
        ORDER BY valor DESC
        LIMIT 10
    `).all(startDate, endDate);

    return NextResponse.json({ summary, byUnit, byProposer });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}