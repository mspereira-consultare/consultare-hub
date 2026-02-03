import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;
    
    const db = getDbConnection();

    // 1. TOTAIS GERAIS + CÁLCULO DE CONVERSÃO + VALOR PERDIDO
    // Adicionei 'executada' e 'aprovada pelo cliente' (tudo minúsculo para bater com lower(status))
    const summaryResult = await db.query(`
        SELECT 
            COUNT(*) as qtd,
            SUM(total_value) as valor,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as won_value,
            SUM(
                CASE 
                    WHEN lower(status) IN ('cancelado', 'recusado', 'perdido', 'rejeição', 'cancelada') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as lost_value
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    const rawSummary = summaryResult[0] || {};
    
    // Mapeia para o frontend (que espera wonValue)
    const summary = {
        qtd: rawSummary.qtd || 0,
        valor: rawSummary.valor || 0,
        wonValue: rawSummary.won_value || 0,
        lostValue: rawSummary.lost_value || 0
    };

    // 2. POR UNIDADE
    const byUnit = await db.query(`
        SELECT 
            unit_name,
            status,
            COUNT(*) as qtd,
            SUM(total_value) as valor
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
        GROUP BY unit_name, status
        ORDER BY unit_name, valor DESC
    `, [startDate, endDate]);

    // 3. RANKING DE VENDEDORES (COM SEPARAÇÃO DE STATUS)
    const byProposer = await db.query(`
        SELECT 
            professional_name,
            COUNT(*) as qtd,
            SUM(total_value) as valor,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as valor_executado
        FROM feegow_proposals
        WHERE date BETWEEN ? AND ?
        GROUP BY professional_name
        ORDER BY valor DESC
        LIMIT 20
    `, [startDate, endDate]);

    // 4. HEARTBEAT
    const statusResult = await db.query(`
        SELECT status, last_run, message 
        FROM system_status 
        WHERE service_name = 'comercial'
    `);
    const heartbeat = statusResult[0] || { status: 'UNKNOWN', last_run: null, message: '' };

    return NextResponse.json({
        summary,
        byUnit,
        byProposer,
        heartbeat
    });

  } catch (error: any) {
    console.error("Erro API Propostas:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

export async function POST() {
    try {
        const db = getDbConnection();
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, message)
            VALUES ('comercial', 'PENDING', datetime('now'), 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                message = 'Solicitado via Painel',
                last_run = datetime('now')
        `);
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
    }
}