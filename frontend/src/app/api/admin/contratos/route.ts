import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDateStr = searchParams.get('startDate') || '2026-01-01'; 
        const endDateStr = searchParams.get('endDate') || new Date().toISOString().split('T')[0];

        // Datas para filtro de TIMESTAMP (Tabela feegow_contracts usa created_at)
        const dbStart = `${startDateStr} 00:00:00`;
        const dbEnd = `${endDateStr} 23:59:59`;

        // Datas para filtro de DATA TEXTO (Tabela faturamento_analitico usa YYYY-MM-DD)
        const simpleStart = startDateStr;
        const simpleEnd = endDateStr;

        const db = getDbConnection();

        // ---------------------------------------------------------
        // 1. TOTAIS GERAIS (ACUMULADO - Contratos Ativos)
        // ---------------------------------------------------------
        
        // CORREÇÃO: Contagem distinta de Contratos vs Pacientes
        const totalContractsRes = await db.query(`
            SELECT 
                COUNT(DISTINCT contract_id) as qtd_contratos,
                COUNT(DISTINCT registration_number) as qtd_pacientes,
                SUM(recurrence_value) as mrr 
            FROM feegow_contracts 
            WHERE status_contract = 'Aprovado'
        `);
        const totalContracts = totalContractsRes[0] || { qtd_contratos: 0, qtd_pacientes: 0, mrr: 0 };

        // Inadimplentes (Mantido membership_value para valor da dívida)
        const totalDefaultersRes = await db.query(`
            SELECT count(*) as qtd, SUM(recurrence_value) as valor 
            FROM feegow_contracts 
            WHERE status_financial = 'Inadimplente'
        `);
        const totalDefaulters = totalDefaultersRes[0] || { qtd: 0, valor: 0 };

        // ---------------------------------------------------------
        // 2. DADOS DO PERÍODO (Novas Vendas - feegow_contracts)
        // ---------------------------------------------------------
        
        const periodSalesRes = await db.query(`
            SELECT 
                SUM(membership_value) as total_adesao, 
                SUM(recurrence_value) as total_mensalidade 
            FROM feegow_contracts 
            WHERE status_contract = 'Aprovado' 
            AND created_at BETWEEN ? AND ?
        `, [dbStart, dbEnd]);
        const periodSales = periodSalesRes[0] || { total_adesao: 0, total_mensalidade: 0 };

        // Inadimplência no Período
        const periodDefaultersRes = await db.query(`
            SELECT count(*) as qtd, SUM(recurrence_value) as valor 
            FROM feegow_contracts 
            WHERE status_financial = 'Inadimplente' 
            AND created_at BETWEEN ? AND ?
        `, [dbStart, dbEnd]);
        const periodDefaulters = periodDefaultersRes[0] || { qtd: 0, valor: 0 };

        // Cancelamentos no Período
        const periodCancelledRes = await db.query(`
            SELECT count(*) as qtd 
            FROM feegow_contracts 
            WHERE status_contract = 'Cancelado' 
            AND created_at BETWEEN ? AND ?
        `, [dbStart, dbEnd]);
        const periodCancelled = periodCancelledRes[0] || { qtd: 0 };

        // ---------------------------------------------------------
        // 3. FATURAMENTO REALIZADO (faturamento_analitico)
        // ---------------------------------------------------------
        
        // REGRA DE NEGÓCIO: Apenas unidade 'RESOLVECARD...'
        const unidadeResolve = 'RESOLVECARD GESTÃO DE BENEFICOS E MEIOS DE PAGAMENTOS';

        const billingRes = await db.query(`
            SELECT 
                data_do_pagamento as date, 
                SUM(total_pago) as faturamento
            FROM faturamento_analitico 
            WHERE unidade = ?
            AND data_do_pagamento BETWEEN ? AND ?
            GROUP BY date
            ORDER BY date ASC
        `, [unidadeResolve, simpleStart, simpleEnd]);

        const billingRealized = billingRes.reduce((acc: number, curr: any) => acc + (Number(curr.faturamento) || 0), 0);

        const dailyChart = billingRes.map((r: any) => ({
            date: r.date,
            faturamento: Number(r.faturamento || 0)
        }));

        // ---------------------------------------------------------
        // 4. HEARTBEAT (Status do Worker)
        // ---------------------------------------------------------
        const statusResult = await db.query(`
            SELECT status, last_run, message 
            FROM system_status 
            WHERE service_name = 'contratos'
        `);
        const heartbeat = statusResult[0] || { status: 'UNKNOWN', last_run: null, message: '' };

        return NextResponse.json({ 
            totals: {
                activeContractsCount: totalContracts.qtd_contratos || 0, // Contratos Únicos
                activePatientsCount: totalContracts.qtd_pacientes || 0,   // Pacientes Únicos (Novo)
                activeContractsMRR: totalContracts.mrr || 0,
                defaultersCount: totalDefaulters.qtd || 0,
                defaultersValue: totalDefaulters.valor || 0
            },
            period: {
                salesMembership: periodSales.total_adesao || 0,
                salesMRR: periodSales.total_mensalidade || 0,
                defaultersCount: periodDefaulters.qtd || 0,
                defaultersValue: periodDefaulters.valor || 0,
                cancelledCount: periodCancelled.qtd || 0,
                billingRealized: billingRealized,
                dailyChart: dailyChart
            },
            heartbeat
        });

    } catch (error: any) {
        console.error("Erro API Contratos:", error);
        return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
    }
}

// Trigger de Atualização Manual
export async function POST() {
    try {
        const db = getDbConnection();
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, message)
            VALUES ('contratos', 'PENDING', datetime('now'), 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                message = 'Solicitado via Painel',
                last_run = datetime('now')
        `);
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: (error?.status || 500) });
    }
}