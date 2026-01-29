// frontend/src/lib/kpi_engine.ts
import { getDbConnection } from '@/lib/db';

interface KpiResult { 
    currentValue: number; 
    lastUpdated: string; 
}

interface KpiOptions { 
    group_filter?: string; 
    scope?: 'CLINIC' | 'CARD'; 
}

interface KpiHistoryItem { 
    date: string; 
    value: number; 
}

/**
 * CONFIGURAÇÃO DE TRATAMENTO DE DATAS (SQLite/LibSQL)
 * * faturamento_analitico: data_do_pagamento vem como 'DD/MM/YYYY' (String)
 * feegow_proposals/contracts: date/start_date vem como 'YYYY-MM-DD' (ISO)
 */
const SQL_DATE_ANALITICO = `substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2)`;

/**
 * MOTOR DE CÁLCULO CONSOLIDADO
 * Agrega os dados históricos para retornar o valor final da meta.
 */
export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
    const timestamp = new Date().toISOString();
    
    try {
        console.log(`[KPI_ENGINE] Iniciando cálculo: ${kpiId} | Período: ${startDate} a ${endDate} | Escopo: ${options?.scope || 'CLINIC'}`);

        // 1. Obtém o histórico dia a dia
        const history = await calculateHistory(kpiId, startDate, endDate, options);
        
        if (!history || history.length === 0) {
            console.log(`[KPI_ENGINE] Nenhum dado encontrado para ${kpiId} no período.`);
            return { currentValue: 0, lastUpdated: timestamp };
        }

        let finalValue = 0;

        // 2. Lógica de Agregação (Soma vs Média)
        // KPIs que representam taxas ou médias não podem ser somados
        if (kpiId === 'ticket_medio' || kpiId === 'absenteeism') {
            const sum = history.reduce((acc, item) => acc + item.value, 0);
            finalValue = sum / history.length;
            console.log(`[KPI_ENGINE] Agregação por MÉDIA: ${finalValue.toFixed(2)}`);
        } 
        else {
            // Faturamento, Vendas e Qtd são acumulativos
            finalValue = history.reduce((acc, item) => acc + item.value, 0);
            console.log(`[KPI_ENGINE] Agregação por SOMA: ${finalValue.toFixed(2)}`);
        }

        return {
            currentValue: Number(finalValue.toFixed(2)),
            lastUpdated: timestamp
        };

    } catch (error) {
        console.error(`[KPI_ENGINE] ERRO CRÍTICO no calculateKpi(${kpiId}):`, error);
        return { currentValue: 0, lastUpdated: timestamp };
    }
}

/**
 * MOTOR DE CONSULTA AO BANCO (HISTÓRICO)
 * Traduz as definições de KPI em queries SQL compatíveis com o Turso/SQLite.
 */
export async function calculateHistory(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiHistoryItem[]> {
    const db = getDbConnection();
    const filterVal = options?.group_filter?.trim();
    
    let query = '';
    let queryParams: any[] = [];

    // Filtro de exclusão: Garante que dados de unidades do Cartão Resolve 
    // não apareçam nos KPIs de faturamento da Clínica.
    const clinicExclusion = "AND unidade NOT LIKE '%Card%' AND unidade NOT LIKE '%Resolve%'";

    try {
        // --- SEÇÃO 1: ESCOPO CARTÃO (CARD) ---
        if (options?.scope === 'CARD') {
            queryParams = [startDate, endDate];
            
            switch (kpiId) {
                case 'proposals': // Quantidade de propostas aceitas/ganhas
                    query = `
                        SELECT date as d, COUNT(*) as val 
                        FROM feegow_proposals 
                        WHERE date BETWEEN ? AND ? 
                        AND lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho') 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'sales': // Valor das taxas de adesão (Membership)
                    query = `
                        SELECT start_date as d, SUM(membership_value) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'contracts': // Valor total bruto dos contratos vendidos
                    query = `
                        SELECT start_date as d, SUM(total_value) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'sales_qty': // Quantidade de novos contratos aprovados
                    query = `
                        SELECT start_date as d, COUNT(*) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;
                
                default:
                    console.warn(`[KPI_ENGINE] KPI de Cartão não implementado: ${kpiId}`);
                    return [];
            }
        } 
        
        // --- SEÇÃO 2: ESCOPO CLÍNICA (CLINIC) ---
        else {
            queryParams = [startDate, endDate];
            let groupSql = "";

            // Filtro por Grupo do Feegow (Ex: Consultas, Exames, Procedimentos)
            if (filterVal && filterVal !== 'all' && filterVal !== '') {
                groupSql = `AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
                queryParams.push(filterVal);
            }

            switch (kpiId) {
                case 'revenue': // Faturamento Total (Baseado na tabela analítica)
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, SUM(total_pago) as val 
                        FROM faturamento_analitico 
                        WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupSql} ${clinicExclusion} 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'appointments': // Quantidade de atendimentos realizados
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, COUNT(*) as val 
                        FROM faturamento_analitico 
                        WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupSql} ${clinicExclusion} 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'ticket_medio': // Faturamento total / Qtd de atendimentos
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, (SUM(total_pago) / COUNT(*)) as val 
                        FROM faturamento_analitico 
                        WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupSql} ${clinicExclusion} 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                default:
                    console.warn(`[KPI_ENGINE] KPI de Clínica não implementado: ${kpiId}`);
                    return [];
            }
        }

        // 3. Execução da Query
        const rows = await db.query(query, queryParams);
        
        // Debug: quando não houver linhas, logamos a query e os params para diagnóstico
        if (!rows || rows.length === 0) {
            console.debug(`[KPI_ENGINE] Query retornou 0 linhas para kpi=${kpiId}`, { query, queryParams });
            return [];
        }
        // 4. Mapeamento e Limpeza (Garante que valores nulos virem 0)
        return rows.map((row: any) => ({
            date: row.d,
            value: row.val ? Number(row.val) : 0
        }));

    } catch (error: any) {
        // Tratamento específico para tabelas inexistentes (evita quebrar o dashboard)
        if (error.message?.includes('no such table')) {
            console.error(`[KPI_ENGINE] Erro: Tabela não encontrada para o KPI ${kpiId}. Verifique os scrapers.`);
            return [];
        }
        
        console.error(`[KPI_ENGINE] Erro SQL no KPI ${kpiId}:`, error);
        throw error; // Re-throw para ser capturado pelo calculateKpi
    }
}