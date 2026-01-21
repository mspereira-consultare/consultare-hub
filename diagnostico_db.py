import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Função auxiliar para converter "DD/MM/YYYY" em Objeto Date
function parseDateBR(dateStr: string) {
    if (!dateStr) return null;
    try {
        // Tenta formato DD/MM/YYYY (Ex: 03/12/2025)
        if (dateStr.includes('/')) {
            const [day, month, year] = dateStr.split('/');
            return new Date(Number(year), Number(month) - 1, Number(day));
        }
        // Tenta formato YYYY-MM-DD
        if (dateStr.includes('-')) {
            return new Date(dateStr);
        }
    } catch (e) { return null; }
    return null;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate') || '2024-01-01';
    const endDateStr = searchParams.get('endDate') || '2024-12-31';

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    // Ajuste para garantir inclusão do dia final (até 23:59:59)
    endDate.setHours(23, 59, 59, 999);

    const dbPath = path.resolve(process.cwd(), 'data', 'dados_clinica.db');

    if (!fs.existsSync(dbPath)) {
        return NextResponse.json({ error: "Banco de dados não encontrado" }, { status: 500 });
    }

    try {
        const db = new Database(dbPath, { readonly: true });

        // --- 1. DADOS DE CONTRATOS (Via API Contracts) ---
        
        // Vendas (Adesão) - Consideramos tudo que entrou no período
        const salesResult = db.prepare(`
            SELECT SUM(membership_value) as total 
            FROM feegow_contracts 
            WHERE start_date BETWEEN ? AND ?
        `).get(startDateStr, endDateStr) as any;
        
        // Recorrência ATIVA (Correção: Status 'Aprovado' é o 'Ativo' real)
        const activeResult = db.prepare(`
            SELECT SUM(recurrence_value) as total 
            FROM feegow_contracts 
            WHERE status_contract = 'Aprovado'
        `).get() as any;

        const defaultersResult = db.prepare(`
            SELECT SUM(recurrence_value) as total 
            FROM feegow_contracts 
            WHERE status_financial = 'Inadimplente'
        `).get() as any;

        const cancelledResult = db.prepare(`
            SELECT COUNT(*) as total 
            FROM feegow_contracts 
            WHERE status_contract = 'Cancelado' 
            AND updated_at BETWEEN ? AND ?
        `).get(startDateStr, endDateStr) as any;

        const salesDaily = db.prepare(`
            SELECT 
                start_date as date,
                COUNT(*) as qtd,
                SUM(membership_value) as valor
            FROM feegow_contracts
            WHERE start_date BETWEEN ? AND ?
            GROUP BY start_date
            ORDER BY start_date
        `).all(startDateStr, endDateStr);

        // --- 2. VIDAS (Scraper ou Fallback) ---
        let lives = { total: 0 };
        try {
            const scraperResult = db.prepare(`SELECT total_lives FROM feegow_lives_count WHERE id = 1`).get() as any;
            if (scraperResult && scraperResult.total_lives > 0) {
                lives = { total: scraperResult.total_lives };
            } else {
                // Fallback corrigido para 'Aprovado'
                const fallbackResult = db.prepare(`
                    SELECT COUNT(*) as total 
                    FROM feegow_contracts 
                    WHERE status_contract = 'Aprovado'
                `).get() as any;
                lives = { total: fallbackResult?.total || 0 };
            }
        } catch (e) { console.error("Erro vidas:", e); }

        // --- 3. FATURAMENTO REALIZADO (Scraper Financeiro) ---
        let billingRealized = { total: 0, count: 0 };
        try {
            // CORREÇÃO: Usando os nomes exatos descobertos no diagnóstico
            // Coluna de Valor: 'total_pago'
            // Coluna de Data: 'data_do_pagamento'
            
            const rawBilling = db.prepare(`
                SELECT data_do_pagamento, total_pago
                FROM faturamento_analitico 
                WHERE unidade LIKE '%RESOLVECARD%' 
                   OR unidade LIKE '%GESTÃO DE BENEFICOS%'
            `).all() as any[];

            let sumBilling = 0;
            let countBilling = 0;

            rawBilling.forEach(row => {
                // Parse da data DD/MM/YYYY
                const rowDate = parseDateBR(row.data_do_pagamento);
                
                if (rowDate && rowDate >= startDate && rowDate <= endDate) {
                    // Soma o valor pago (pode ser negativo se for estorno, o que é correto)
                    sumBilling += Number(row.total_pago || 0);
                    countBilling++;
                }
            });

            billingRealized = { total: sumBilling, count: countBilling };

        } catch (e) {
            console.error("⚠️ Erro ao calcular faturamento:", e);
        }

        return NextResponse.json({ 
            sales: { total: salesResult?.total || 0 },
            active: { total: activeResult?.total || 0 }, 
            defaulters: { total: defaultersResult?.total || 0 },
            cancelled: { total: cancelledResult?.total || 0 }, 
            salesDaily, 
            lives: lives.total, 
            billingRealized 
        });

    } catch (error: any) {
        console.error("❌ Erro Geral na API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}