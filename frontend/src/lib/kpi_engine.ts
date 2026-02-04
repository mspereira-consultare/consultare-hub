// frontend/src/lib/kpi_engine.ts
import { getDbConnection } from '@/lib/db';

interface KpiResult { 
    currentValue: number; 
    lastUpdated: string; 
}

interface KpiOptions { 
    group_filter?: string; 
    unit_filter?: string;
    collaborator?: string;
    team?: string;
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
// Aceita duas formas de data: original 'DD/MM/YYYY' (com barras) OU já em ISO 'YYYY-MM-DD'
// Se contém '/', converte para 'YYYY-MM-DD', caso contrário usa o valor diretamente.
const SQL_DATE_ANALITICO = `(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)`;
const SUMMARY_TABLE = 'faturamento_resumo_diario';
const SUMMARY_DATE_COL = 'data_ref';

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
        if (kpiId === 'ticket_medio' || kpiId === 'absenteeism' || kpiId === 'agendamentos_confirm_rate') {
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
    const filterVal = options?.group_filter ? String(options.group_filter).trim() : undefined;
    const unitVal = options?.unit_filter ? String(options.unit_filter).trim() : undefined;
    const collaboratorVal = options?.collaborator ? String(options.collaborator).trim() : undefined;
    const teamVal = options?.team ? String(options.team).trim() : undefined;
    
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
            let unitSql = "";

            // Filtro por Grupo do Feegow (Ex: Consultas, Exames, Procedimentos)
            if (filterVal && filterVal !== 'all' && filterVal !== '') {
                groupSql = `AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
                queryParams.push(filterVal);
            }

            // Filtro por Unidade da Clínica
            if (unitVal && unitVal !== 'all' && unitVal !== '') {
                unitSql = `AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))`;
                queryParams.push(unitVal);
            }

            // --- KPI ESPECIAL: AGENDAMENTOS (por scheduled_by / equipe) ---
            if (kpiId === 'agendamentos') {
                const dbStart = `${startDate} 00:00:00`;
                const dbEnd = `${endDate} 23:59:59`;
                const params: any[] = [dbStart, dbEnd];
                let whereSql = "WHERE f.scheduled_at BETWEEN ? AND ?";

                if (filterVal && filterVal !== 'all' && filterVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.procedure_group)) = UPPER(TRIM(?))`;
                    params.push(filterVal);
                }

                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.unit_name)) = UPPER(TRIM(?))`;
                    params.push(unitVal);
                }

                if (collaboratorVal && collaboratorVal !== 'all' && collaboratorVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.scheduled_by)) = UPPER(TRIM(?))`;
                    params.push(collaboratorVal);
                }

                let joinSql = "";
                if (teamVal && teamVal !== 'all' && teamVal !== '') {
                    joinSql = `
                        JOIN user_teams ut ON ut.user_name = f.scheduled_by
                        JOIN teams_master tm ON tm.id = ut.team_id
                    `;
                    whereSql += ` AND tm.name = ?`;
                    params.push(teamVal);
                }

                query = `
                    SELECT substr(f.scheduled_at, 1, 10) as d, COUNT(*) as val
                    FROM feegow_appointments f
                    ${joinSql}
                    ${whereSql}
                    GROUP BY d ORDER BY d
                `;
                queryParams = params;
            } else if (kpiId === 'agendamentos_confirm_rate') {
                const dbStart = `${startDate} 00:00:00`;
                const dbEnd = `${endDate} 23:59:59`;
                const params: any[] = [dbStart, dbEnd];
                let whereSql = "WHERE f.scheduled_at BETWEEN ? AND ?";

                if (filterVal && filterVal !== 'all' && filterVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.procedure_group)) = UPPER(TRIM(?))`;
                    params.push(filterVal);
                }

                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.unit_name)) = UPPER(TRIM(?))`;
                    params.push(unitVal);
                }

                if (collaboratorVal && collaboratorVal !== 'all' && collaboratorVal !== '') {
                    whereSql += ` AND UPPER(TRIM(f.scheduled_by)) = UPPER(TRIM(?))`;
                    params.push(collaboratorVal);
                }

                let joinSql = "";
                if (teamVal && teamVal !== 'all' && teamVal !== '') {
                    joinSql = `
                        JOIN user_teams ut ON ut.user_name = f.scheduled_by
                        JOIN teams_master tm ON tm.id = ut.team_id
                    `;
                    whereSql += ` AND tm.name = ?`;
                    params.push(teamVal);
                }

                query = `
                    SELECT 
                        substr(f.scheduled_at, 1, 10) as d, 
                        (SUM(CASE WHEN f.status_id IN (3, 7) THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)) as val
                    FROM feegow_appointments f
                    ${joinSql}
                    ${whereSql}
                    GROUP BY d ORDER BY d
                `;
                queryParams = params;
            } else {
                const buildClinicQuery = (useSummary: boolean) => {
                const table = useSummary ? SUMMARY_TABLE : 'faturamento_analitico';
                const dateCol = useSummary ? SUMMARY_DATE_COL : SQL_DATE_ANALITICO;
                const sumCol = useSummary ? 'total_pago' : 'total_pago';
                const countCol = useSummary ? 'qtd' : '*';
                const countExpr = useSummary ? `SUM(${countCol})` : `COUNT(${countCol})`;

                switch (kpiId) {
                    case 'revenue': // Faturamento Total (Baseado na tabela analítica)
                        return `
                            SELECT ${dateCol} as d, SUM(${sumCol}) as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    case 'appointments': // Quantidade de atendimentos realizados
                        return `
                            SELECT ${dateCol} as d, ${countExpr} as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    case 'ticket_medio': // Faturamento total / Qtd de atendimentos
                        if (useSummary) {
                            return `
                                SELECT ${dateCol} as d, (SUM(${sumCol}) / NULLIF(SUM(${countCol}), 0)) as val 
                                FROM ${table} 
                                WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql} ${clinicExclusion} 
                                GROUP BY d ORDER BY d
                            `;
                        }
                        return `
                            SELECT ${dateCol} as d, (SUM(${sumCol}) / COUNT(${countCol})) as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    default:
                        console.warn(`[KPI_ENGINE] KPI de Clínica não implementado: ${kpiId}`);
                        return '';
                }
            };

                // Primeiro tenta a tabela de resumo
                query = buildClinicQuery(true);
                if (!query) return [];
            }
        }

        // 3. Execução da Query
        let rows: any[] = [];
        try {
            rows = await db.query(query, queryParams);
        } catch (error: any) {
            // Fallback automático se a tabela de resumo ainda não existir
            if (error?.message?.includes('no such table') && query.includes(SUMMARY_TABLE)) {
                const fallbackQuery = `
                    SELECT ${SQL_DATE_ANALITICO} as d, ${
                        kpiId === 'appointments' ? 'COUNT(*)' :
                        kpiId === 'ticket_medio' ? '(SUM(total_pago) / COUNT(*))' :
                        'SUM(total_pago)'
                    } as val
                    FROM faturamento_analitico
                    WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${
                        (filterVal && filterVal !== 'all' && filterVal !== '') ? "AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))" : ""
                    } ${
                        (unitVal && unitVal !== 'all' && unitVal !== '') ? "AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))" : ""
                    } ${clinicExclusion}
                    GROUP BY d ORDER BY d
                `;
                rows = await db.query(fallbackQuery, queryParams);
            } else {
                throw error;
            }
        }
        
        // Debug: quando não houver linhas, logamos a query e os params para diagnóstico
        if (!rows || rows.length === 0) {
            console.debug(`[KPI_ENGINE] Query retornou 0 linhas para kpi=${kpiId}`, { query, queryParams });
            return [];
        }

        // Log de amostra para ajudar a inspecionar rapidamente o resultado da query
        console.debug(`[KPI_ENGINE] Query retornou ${rows.length} linhas para kpi=${kpiId}. Amostra:`, rows.slice(0, 4));

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
