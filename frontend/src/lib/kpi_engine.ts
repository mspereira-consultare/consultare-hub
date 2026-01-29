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

// --- CONFIGURAÇÃO DE DATAS ---
// Scraper: data_do_pagamento (DD/MM/YYYY) -> SQL converte para YYYY-MM-DD para comparação
const COL_DATA_ANALITICO = 'data_do_pagamento';
// SQLite/LibSQL substring: substr(col, start, length). Start é 1-based.
// DD/MM/YYYY -> YYYY-MM-DD: substr(7,4) || '-' || substr(4,2) || '-' || substr(1,2)
const SQL_DATE_ANALITICO = `substr(${COL_DATA_ANALITICO}, 7, 4) || '-' || substr(${COL_DATA_ANALITICO}, 4, 2) || '-' || substr(${COL_DATA_ANALITICO}, 1, 2)`;

const SQL_DATE_AGENDA = 'date'; 
const SQL_DATE_CONTRATO = 'start_date';

/**
 * Calcula o valor consolidado de um KPI para um período específico.
 * Utiliza o calculateHistory para obter os dados diários e os agrega.
 */
export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
    try {
        console.log(`[KPI Engine] Calculando consolidado: ${kpiId} (${startDate} a ${endDate}) - Scope: ${options?.scope}`);
        
        const history = await calculateHistory(kpiId, startDate, endDate, options);
        
        if (!history || history.length === 0) {
            return { currentValue: 0, lastUpdated: new Date().toISOString() };
        }

        let finalValue = 0;

        // LÓGICA DE AGREGAÇÃO POR TIPO DE KPI
        if (kpiId === 'ticket_medio') {
            // Média simples das médias diárias encontradas
            const sum = history.reduce((acc, item) => acc + item.value, 0);
            finalValue = sum / history.length;
        } 
        else if (kpiId === 'absenteeism') {
            // No caso de taxa, pegamos a média do período
            const sum = history.reduce((acc, item) => acc + item.value, 0);
            finalValue = sum / history.length;
        }
        else {
            // Para faturamento, vendas e quantidades, a agregação é SOMA
            finalValue = history.reduce((acc, item) => acc + item.value, 0);
        }

        return {
            currentValue: Number(finalValue.toFixed(2)),
            lastUpdated: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[KPI Engine] Erro crítico no calculateKpi (${kpiId}):`, error);
        return { currentValue: 0, lastUpdated: new Date().toISOString() };
    }
}

/**
 * Busca o histórico detalhado (dia a dia) de um indicador no banco de dados.
 */
export async function calculateHistory(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiHistoryItem[]> {
    const db = getDbConnection();
    const filterVal = options?.group_filter?.trim();
    
    let query = '';
    let queryParams: any[] = [];

    // --- FILTROS DE SEGURANÇA ---
    const clinicExclusion = "AND unidade NOT LIKE '%Card%' AND unidade NOT LIKE '%Resolve%'";

    try {
        // --- ESCOPO: CARTÃO (CARD) ---
        if (options?.scope === 'CARD') {
            queryParams = [startDate, endDate];
            
            switch (kpiId) {
                case 'proposals':
                    query = `
                        SELECT date as d, COUNT(*) as val 
                        FROM feegow_proposals 
                        WHERE date BETWEEN ? AND ? 
                        AND lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho')
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'sales': // Novas Adesões (Valor da Taxa de Adesão)
                    query = `
                        SELECT start_date as d, SUM(membership_value) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'contracts': // Vendas Totais (Valor Total do Contrato)
                    query = `
                        SELECT start_date as d, SUM(total_value) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'sales_qty': // Quantidade de Contratos
                    query = `
                        SELECT start_date as d, COUNT(*) as val 
                        FROM feegow_contracts 
                        WHERE status_contract = 'Aprovado' 
                        AND start_date BETWEEN ? AND ? 
                        GROUP BY d ORDER BY d
                    `;
                    break;
            }
        } 
        // --- ESCOPO: CLÍNICA (CLINIC) ---
        else {
            queryParams = [startDate, endDate];
            let groupSql = "";
            
            if (filterVal && filterVal !== 'all' && filterVal !== '') {
                groupSql = `AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
                queryParams.push(filterVal);
            }

            switch (kpiId) {
                case 'revenue':
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, SUM(total_pago) as val 
                        FROM faturamento_analitico 
                        WHERE d BETWEEN ? AND ? ${groupSql} ${clinicExclusion}
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'appointments':
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, COUNT(*) as val 
                        FROM faturamento_analitico 
                        WHERE d BETWEEN ? AND ? ${groupSql} ${clinicExclusion}
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'ticket_medio':
                    query = `
                        SELECT ${SQL_DATE_ANALITICO} as d, (SUM(total_pago) / COUNT(*)) as val 
                        FROM faturamento_analitico 
                        WHERE d BETWEEN ? AND ? ${groupSql} ${clinicExclusion}
                        GROUP BY d ORDER BY d
                    `;
                    break;

                case 'absenteeism':
                    // Busca na tabela de agendamentos (feegow_appointments)
                    // Necessário que a tabela feegow_appointments exista
                    query = `
                        SELECT date as d, (SUM(CASE WHEN status = 'Faltou' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as val 
                        FROM feegow_appointments 
                        WHERE date BETWEEN ? AND ? ${clinicExclusion}
                        GROUP BY d ORDER BY d
                    `;
                    break;
            }
        }

        if (!query) {
            console.warn(`[KPI Engine] Nenhuma query definida para o KPI: ${kpiId} no escopo: ${options?.scope}`);
            return [];
        }

        const rows = await db.query(query, queryParams);
        
        return rows.map((row: any) => ({
            date: row.d,
            value: Number(row.val || 0)
        }));

    } catch (error) {
        console.error(`[KPI Engine] Erro ao buscar histórico SQL para ${kpiId}:`, error);
        return [];
    }
}