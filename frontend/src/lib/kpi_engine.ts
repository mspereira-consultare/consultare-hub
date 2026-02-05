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

const buildAppointmentsFilter = (startDate: string, endDate: string, options?: KpiOptions) => {
    const filterVal = options?.group_filter ? String(options.group_filter).trim() : undefined;
    const unitVal = options?.unit_filter ? String(options.unit_filter).trim() : undefined;
    const collaboratorVal = options?.collaborator ? String(options.collaborator).trim() : undefined;
    const teamVal = options?.team ? String(options.team).trim() : undefined;

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
        whereSql += ` AND UPPER(TRIM(tm.name)) = UPPER(TRIM(?))`;
        params.push(teamVal);
    }

    return { joinSql, whereSql, params };
};

const calculateConfirmRateAggregate = async (startDate: string, endDate: string, options?: KpiOptions) => {
    const db = getDbConnection();
    const { joinSql, whereSql, params } = buildAppointmentsFilter(startDate, endDate, options);

    const rows = await db.query(`
        SELECT 
            COUNT(DISTINCT f.appointment_id) as total,
            COUNT(DISTINCT CASE WHEN f.status_id IN (3, 7) THEN f.appointment_id END) as confirmados
        FROM feegow_appointments f
        ${joinSql}
        ${whereSql}
    `, params);

    const total = Number(rows?.[0]?.total || 0);
    const confirmed = Number(rows?.[0]?.confirmados || 0);
    if (total <= 0) return 0;
    return (confirmed * 100) / total;
};

const calculateProposalConversionAggregate = async (startDate: string, endDate: string, options?: KpiOptions) => {
    const db = getDbConnection();
    const unitVal = options?.unit_filter ? String(options.unit_filter).trim() : undefined;
    let whereSql = "WHERE date BETWEEN ? AND ?";
    const params: any[] = [startDate, endDate];

    if (unitVal && unitVal !== 'all' && unitVal !== '') {
        whereSql += ` AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))`;
        params.push(unitVal);
    }

    const rows = await db.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN lower(status) IN ${PROPOSAL_EXEC_STATUSES} THEN 1 ELSE 0 END) as won
        FROM feegow_proposals
        ${whereSql}
    `, params);

    const total = Number(rows?.[0]?.total || 0);
    const won = Number(rows?.[0]?.won || 0);
    if (total <= 0) return 0;
    return (won * 100) / total;
};

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
const SUMMARY_MONTHLY_TABLE = 'faturamento_resumo_mensal';
const SUMMARY_MONTH_COL = 'month_ref';
const RESOLVECARD_UNIT = 'RESOLVECARD GESTÃO DE BENEFICOS E MEIOS DE PAGAMENTOS';
const PROPOSAL_EXEC_STATUSES = "('executada','aprovada pelo cliente','ganho','realizado','concluido','pago')";
let cachedCollaboratorColumn: string | null | undefined;

const normalizeIdentifier = (value: string) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const quoteIdentifier = (value: string) => {
    const safe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
    if (safe) return value;
    return `"${value.replace(/"/g, '""')}"`;
};

const getCollaboratorColumn = async (db: any) => {
    if (cachedCollaboratorColumn !== undefined) return cachedCollaboratorColumn;
    try {
        const rows = await db.query("PRAGMA table_info(faturamento_analitico)");
        const names = (rows || [])
            .map((row: any) => row?.name ?? row?.[1] ?? row?.[0])
            .filter((name: any) => typeof name === 'string' && name.trim().length > 0)
            .map((name: string) => name.trim());

        const target = normalizeIdentifier('usuario_que_agendou');
        const found = names.find((name) => normalizeIdentifier(name) === target);
        cachedCollaboratorColumn = found || null;
        return cachedCollaboratorColumn;
    } catch (error) {
        console.warn('[KPI_ENGINE] Não foi possível detectar coluna de colaborador:', error);
        cachedCollaboratorColumn = null;
        return cachedCollaboratorColumn;
    }
};

/**
 * MOTOR DE CÁLCULO CONSOLIDADO
 * Agrega os dados históricos para retornar o valor final da meta.
 */
export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
    const timestamp = new Date().toISOString();
    
    try {
        console.log(`[KPI_ENGINE] Iniciando cálculo: ${kpiId} | Período: ${startDate} a ${endDate} | Escopo: ${options?.scope || 'CLINIC'}`);

        if (kpiId === 'agendamentos_confirm_rate') {
            const rate = await calculateConfirmRateAggregate(startDate, endDate, options);
            return {
                currentValue: Number(rate.toFixed(2)),
                lastUpdated: timestamp
            };
        }

        if (kpiId === 'proposals_exec_rate') {
            const rate = await calculateProposalConversionAggregate(startDate, endDate, options);
            return {
                currentValue: Number(rate.toFixed(2)),
                lastUpdated: timestamp
            };
        }

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
    const filterVal = options?.group_filter ? String(options.group_filter).trim() : undefined;
    const unitVal = options?.unit_filter ? String(options.unit_filter).trim() : undefined;
    const collaboratorVal = options?.collaborator ? String(options.collaborator).trim() : undefined;
    const teamVal = options?.team ? String(options.team).trim() : undefined;
    
    let query = '';
    let queryParams: any[] = [];
    let cardSalesFallbackQuery: string | null = null;
    let cardSalesFallbackParams: any[] = [];
    let cardSalesSecondFallbackQuery: string | null = null;
    let cardSalesSecondFallbackParams: any[] = [];

    // Filtro de exclusão: Garante que dados de unidades do Cartão Resolve 
    // não apareçam nos KPIs de faturamento da Clínica.
    const clinicExclusion = "AND unidade NOT LIKE '%Card%' AND unidade NOT LIKE '%Resolve%'";

    try {
        // --- SEÇÃO 1: ESCOPO CARTÃO (CARD) ---
        if (options?.scope === 'CARD') {
            queryParams = [startDate, endDate];

            switch (kpiId) {
                case 'contracts': { // Novas Adesões (R$)
                    query = `
                        SELECT substr(created_at, 1, 10) as d, SUM(membership_value) as val
                        FROM feegow_contracts
                        WHERE status_contract = 'Aprovado'
                        AND created_at BETWEEN ? AND ?
                        GROUP BY d ORDER BY d
                    `;
                    queryParams = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
                    break;
                }

                case 'sales': { // Vendas Totais (ResolveSaude) vindo do faturamento analítico
                    const isFullMonthRange = (() => {
                        try {
                            const start = new Date(startDate + 'T00:00:00');
                            const end = new Date(endDate + 'T00:00:00');
                            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
                            const isFirstDay = start.getDate() === 1;
                            const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
                            const isLastDay = end.getDate() === lastDay;
                            return isFirstDay && isLastDay;
                        } catch {
                            return false;
                        }
                    })();

                    const summaryDailyQuery = `
                        SELECT ${SUMMARY_DATE_COL} as d, SUM(total_pago) as val
                        FROM ${SUMMARY_TABLE}
                        WHERE ${SUMMARY_DATE_COL} BETWEEN ? AND ?
                        AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))
                        GROUP BY d ORDER BY d
                    `;
                    const summaryMonthlyQuery = `
                        SELECT ${SUMMARY_MONTH_COL} as d, SUM(total_pago) as val
                        FROM ${SUMMARY_MONTHLY_TABLE}
                        WHERE ${SUMMARY_MONTH_COL} BETWEEN ? AND ?
                        AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))
                        GROUP BY d ORDER BY d
                    `;
                    const analyticQuery = `
                        SELECT ${SQL_DATE_ANALITICO} as d, SUM(total_pago) as val 
                        FROM faturamento_analitico 
                        WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ?
                        AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))
                        GROUP BY d ORDER BY d
                    `;

                    if (isFullMonthRange) {
                        query = summaryMonthlyQuery;
                        queryParams = [startDate.slice(0, 7), endDate.slice(0, 7), RESOLVECARD_UNIT];
                        cardSalesFallbackQuery = summaryDailyQuery;
                        cardSalesFallbackParams = [startDate, endDate, RESOLVECARD_UNIT];
                        cardSalesSecondFallbackQuery = analyticQuery;
                        cardSalesSecondFallbackParams = [startDate, endDate, RESOLVECARD_UNIT];
                    } else {
                        query = summaryDailyQuery;
                        queryParams = [startDate, endDate, RESOLVECARD_UNIT];
                        cardSalesFallbackQuery = analyticQuery;
                        cardSalesFallbackParams = [startDate, endDate, RESOLVECARD_UNIT];
                    }
                    break;
                }

                case 'sales_qty': { // Novas Adesões (Qtd.)
                    query = `
                        SELECT substr(created_at, 1, 10) as d, COUNT(*) as val
                        FROM feegow_contracts
                        WHERE status_contract = 'Aprovado'
                        AND created_at BETWEEN ? AND ?
                        GROUP BY d ORDER BY d
                    `;
                    queryParams = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
                    break;
                }

                case 'churn_rate': { // Cancelados
                    query = `
                        SELECT substr(created_at, 1, 10) as d, COUNT(*) as val
                        FROM feegow_contracts
                        WHERE status_contract = 'Cancelado'
                        AND created_at BETWEEN ? AND ?
                        GROUP BY d ORDER BY d
                    `;
                    queryParams = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
                    break;
                }

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
            let collaboratorSql = "";
            const hasCollaboratorFilter = Boolean(collaboratorVal && collaboratorVal !== 'all' && collaboratorVal !== '');
            const useSummary = !hasCollaboratorFilter;

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

            // Filtro por Colaborador (somente na tabela analítica)
            if (hasCollaboratorFilter) {
                const collaboratorColumn = await getCollaboratorColumn(db);
                if (!collaboratorColumn) {
                    console.warn('[KPI_ENGINE] Coluna de colaborador não encontrada em faturamento_analitico. Ignorando filtro.');
                    return [];
                }
                collaboratorSql = `AND UPPER(TRIM(${quoteIdentifier(collaboratorColumn)})) = UPPER(TRIM(?))`;
                if (!useSummary) {
                    queryParams.push(collaboratorVal);
                }
            }

            // --- KPI ESPECIAL: PROPOSTAS (CLÍNICA) ---
            if (kpiId === 'proposals') {
                query = `
                    SELECT date as d, COUNT(*) as val 
                    FROM feegow_proposals 
                    WHERE date BETWEEN ? AND ?
                    ${unitVal && unitVal !== 'all' && unitVal !== '' ? "AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))" : ""}
                    GROUP BY d ORDER BY d
                `;
                queryParams = [startDate, endDate];
                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    queryParams.push(unitVal);
                }
            } else if (kpiId === 'proposals_exec_qty') {
                query = `
                    SELECT date as d, COUNT(*) as val 
                    FROM feegow_proposals 
                    WHERE date BETWEEN ? AND ?
                    ${unitVal && unitVal !== 'all' && unitVal !== '' ? "AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))" : ""}
                    AND lower(status) IN ${PROPOSAL_EXEC_STATUSES}
                    GROUP BY d ORDER BY d
                `;
                queryParams = [startDate, endDate];
                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    queryParams.push(unitVal);
                }
            } else if (kpiId === 'proposals_exec_value') {
                query = `
                    SELECT date as d, SUM(total_value) as val 
                    FROM feegow_proposals 
                    WHERE date BETWEEN ? AND ?
                    ${unitVal && unitVal !== 'all' && unitVal !== '' ? "AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))" : ""}
                    AND lower(status) IN ${PROPOSAL_EXEC_STATUSES}
                    GROUP BY d ORDER BY d
                `;
                queryParams = [startDate, endDate];
                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    queryParams.push(unitVal);
                }
            } else if (kpiId === 'proposals_exec_rate') {
                query = `
                    SELECT date as d, 
                        (SUM(CASE WHEN lower(status) IN ${PROPOSAL_EXEC_STATUSES} THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)) as val
                    FROM feegow_proposals 
                    WHERE date BETWEEN ? AND ?
                    ${unitVal && unitVal !== 'all' && unitVal !== '' ? "AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))" : ""}
                    GROUP BY d ORDER BY d
                `;
                queryParams = [startDate, endDate];
                if (unitVal && unitVal !== 'all' && unitVal !== '') {
                    queryParams.push(unitVal);
                }
            }
            // --- KPI ESPECIAL: AGENDAMENTOS (por scheduled_by / equipe) ---
            if (kpiId === 'agendamentos') {
                const { joinSql, whereSql, params } = buildAppointmentsFilter(startDate, endDate, options);
                query = `
                    SELECT substr(f.scheduled_at, 1, 10) as d, COUNT(DISTINCT f.appointment_id) as val
                    FROM feegow_appointments f
                    ${joinSql}
                    ${whereSql}
                    GROUP BY d ORDER BY d
                `;
                queryParams = params;
            } else if (kpiId === 'agendamentos_confirm_rate') {
                const { joinSql, whereSql, params } = buildAppointmentsFilter(startDate, endDate, options);
                query = `
                    SELECT 
                        substr(f.scheduled_at, 1, 10) as d, 
                        (COUNT(DISTINCT CASE WHEN f.status_id IN (3, 7) THEN f.appointment_id END) * 100.0 / NULLIF(COUNT(DISTINCT f.appointment_id), 0)) as val
                    FROM feegow_appointments f
                    ${joinSql}
                    ${whereSql}
                    GROUP BY d ORDER BY d
                `;
                queryParams = params;
            } else if (!query) {
                const buildClinicQuery = (useSummary: boolean) => {
                const table = useSummary ? SUMMARY_TABLE : 'faturamento_analitico';
                const dateCol = useSummary ? SUMMARY_DATE_COL : SQL_DATE_ANALITICO;
                const sumCol = useSummary ? 'total_pago' : 'total_pago';
                const countCol = useSummary ? 'qtd' : '*';
                const countExpr = useSummary ? `SUM(${countCol})` : `COUNT(${countCol})`;
                const collaboratorClause = (!useSummary && collaboratorSql) ? ` ${collaboratorSql}` : '';

                switch (kpiId) {
                    case 'revenue': // Faturamento Total (Baseado na tabela analítica)
                        return `
                            SELECT ${dateCol} as d, SUM(${sumCol}) as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql}${collaboratorClause} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    case 'appointments': // Quantidade de atendimentos realizados
                        return `
                            SELECT ${dateCol} as d, ${countExpr} as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql}${collaboratorClause} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    case 'ticket_medio': // Faturamento total / Qtd de atendimentos
                        if (useSummary) {
                            return `
                                SELECT ${dateCol} as d, (SUM(${sumCol}) / NULLIF(SUM(${countCol}), 0)) as val 
                                FROM ${table} 
                                WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql}${collaboratorClause} ${clinicExclusion} 
                                GROUP BY d ORDER BY d
                            `;
                        }
                        return `
                            SELECT ${dateCol} as d, (SUM(${sumCol}) / COUNT(${countCol})) as val 
                            FROM ${table} 
                            WHERE ${dateCol} BETWEEN ? AND ? ${groupSql} ${unitSql}${collaboratorClause} ${clinicExclusion} 
                            GROUP BY d ORDER BY d
                        `;

                    default:
                        console.warn(`[KPI_ENGINE] KPI de Clínica não implementado: ${kpiId}`);
                        return '';
                }
            };

                // Usa resumo apenas quando nÃ£o hÃ¡ filtro por colaborador
                query = buildClinicQuery(useSummary);
                if (!query) return [];
            }
        }

        // 3. Execução da Query
        let rows: any[] = [];
        try {
            rows = await db.query(query, queryParams);
        } catch (error: any) {
            // Fallback específico para vendas Resolve (tabelas de resumo ausentes)
            if (error?.message?.includes('no such table') && cardSalesFallbackQuery) {
                rows = await db.query(cardSalesFallbackQuery, cardSalesFallbackParams);
                if ((!rows || rows.length === 0) && cardSalesSecondFallbackQuery) {
                    rows = await db.query(cardSalesSecondFallbackQuery, cardSalesSecondFallbackParams);
                }
            }
            // Fallback automático se a tabela de resumo ainda não existir
            else if (error?.message?.includes('no such table') && query.includes(SUMMARY_TABLE)) {
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
