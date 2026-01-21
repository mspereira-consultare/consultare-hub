import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Função para converter data
function parseDate(dateStr: string) {
    if (!dateStr) return null;
    try {
        if (dateStr.includes('/')) {
            const [day, month, year] = dateStr.split('/');
            return new Date(Number(year), Number(month) - 1, Number(day));
        }
        if (dateStr.includes('-')) {
            return new Date(dateStr);
        }
    } catch (e) { return null; }
    return null;
}

// Formata data para chave do gráfico
function formatDateKey(date: Date) {
    return date.toISOString().split('T')[0];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate') || '2026-01-01';
    const endDateStr = searchParams.get('endDate') || '2026-01-20';

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 999);

    const dbPath = path.resolve(process.cwd(), 'data', 'dados_clinica.db');

    if (!fs.existsSync(dbPath)) {
        return NextResponse.json({ error: "Banco de dados não encontrado" }, { status: 500 });
    }

    try {
        const db = new Database(dbPath, { readonly: true });

        // =========================================================================
        // 1. DADOS DE CONTRATOS (API OFICIAL)
        // =========================================================================
        
        // --- A. TOTAIS GERAIS (ACUMULADO / CARTEIRA) ---
        // Contratos Ativos (Aprovados)
        const totalContracts = db.prepare(`
            SELECT COUNT(*) as qtd, SUM(recurrence_value) as mrr
            FROM feegow_contracts 
            WHERE status_contract = 'Aprovado'
        `).get() as any;

        // Inadimplência Total da Carteira (Acumulado Histórico)
        const totalDefaulters = db.prepare(`
            SELECT COUNT(*) as qtd, SUM(recurrence_value) as valor
            FROM feegow_contracts 
            WHERE status_financial = 'Inadimplente'
        `).get() as any;

        // --- B. PERÍODO (NOVAS VENDAS / FLUXO) ---
        
        // Novas Vendas (Adesão) no Período
        // Baseado na DATA DE INÍCIO do contrato
        const periodSales = db.prepare(`
            SELECT SUM(membership_value) as total_adesao, SUM(recurrence_value) as total_mensalidade
            FROM feegow_contracts 
            WHERE status_contract = 'Aprovado'
            AND start_date BETWEEN ? AND ?
        `).get(startDateStr, endDateStr) as any;

        // Inadimplência no Período (Vendas "Podres")
        // Contratos que COMEÇARAM neste mês e já constam como Inadimplente
        const periodDefaulters = db.prepare(`
            SELECT COUNT(*) as qtd, SUM(recurrence_value) as valor
            FROM feegow_contracts 
            WHERE status_financial = 'Inadimplente'
            AND start_date BETWEEN ? AND ?
        `).get(startDateStr, endDateStr) as any;

        // Cancelamentos no Período
        // CORREÇÃO: Alterado de 'updated_at' para 'start_date'
        // Isso alinha com o filtro "Data Início" do relatório do Feegow, que mostra contratos
        // iniciados no período que foram cancelados (ex: erros de cadastro ou desistência imediata).
        const periodCancelled = db.prepare(`
            SELECT COUNT(*) as qtd
            FROM feegow_contracts 
            WHERE status_contract = 'Cancelado' 
            AND start_date BETWEEN ? AND ?
        `).get(startDateStr, endDateStr) as any;


        // =========================================================================
        // 2. FATURAMENTO REALIZADO (RESOLVECARD APENAS)
        // =========================================================================
        let billingRealized = 0;
        let billingDailyMap: Record<string, number> = {};

        try {
            const rawBilling = db.prepare(`
                SELECT data_do_pagamento, total_pago
                FROM faturamento_analitico 
                WHERE (unidade LIKE '%RESOLVECARD%' OR unidade LIKE '%GESTÃO DE BENEFICOS%')
                AND data_do_pagamento BETWEEN ? AND ?
            `).all(startDateStr, endDateStr) as any[];

            rawBilling.forEach(row => {
                const val = Number(row.total_pago || 0);
                billingRealized += val;
                
                const key = row.data_do_pagamento; 
                billingDailyMap[key] = (billingDailyMap[key] || 0) + val;
            });

        } catch (e) {
            console.error("Erro no faturamento scraper:", e);
        }

        // Formatar Gráfico Diário
        const dailyChart = Object.keys(billingDailyMap).sort().map(date => ({
            date,
            faturamento: billingDailyMap[date]
        }));

        return NextResponse.json({ 
            totals: {
                activeContractsCount: totalContracts?.qtd || 0,
                activeContractsMRR: totalContracts?.mrr || 0,
                defaultersCount: totalDefaulters?.qtd || 0,
                defaultersValue: totalDefaulters?.valor || 0
            },
            period: {
                salesMembership: periodSales?.total_adesao || 0,
                salesMRR: periodSales?.total_mensalidade || 0,
                defaultersCount: periodDefaulters?.qtd || 0,
                defaultersValue: periodDefaulters?.valor || 0,
                cancelledCount: periodCancelled?.qtd || 0,
                billingRealized: billingRealized,
                dailyChart: dailyChart
            }
        });

    } catch (error: any) {
        console.error("Erro Geral API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}