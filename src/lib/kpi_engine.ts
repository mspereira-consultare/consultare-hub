import { getDbConnection } from '@/lib/db';

interface KpiResult { currentValue: number; lastUpdated: string; }
interface KpiOptions { 
    group_filter?: string; 
    scope?: 'CLINIC' | 'CARD'; // NOVO: Saber quem está pedindo o dado
}
interface KpiHistoryItem { date: string; value: number; }

// --- CONFIGURAÇÃO DE DATAS ---
// Scraper: data_do_pagamento (DD/MM/YYYY) -> SQL converte para YYYY-MM-DD para comparação
const COL_DATA_ANALITICO = 'data_do_pagamento';
const SQL_DATE_ANALITICO = `substr(${COL_DATA_ANALITICO}, 7, 4) || '-' || substr(${COL_DATA_ANALITICO}, 4, 2) || '-' || substr(${COL_DATA_ANALITICO}, 1, 2)`;

// Worker Feegow/Contratos: date (YYYY-MM-DD) -> Já está pronto no banco
const SQL_DATE_AGENDA = 'date'; 
const SQL_DATE_CONTRATO = 'start_date';

export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
  const db = getDbConnection();
  
  // 1. FILTROS DE GRUPO/PROCEDIMENTO
  const filterVal = options?.group_filter?.trim();
  const groupClauseAnalitico = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(grupo)) = UPPER(TRIM('${filterVal}'))` : '';
  const groupClauseAgenda = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(procedure_group)) = UPPER(TRIM('${filterVal}'))` : '';

  // 2. FILTRO DE UNIDADE (REGRA DE OURO)
  // Se for Clínica, EXCLUI ResolveCard. Se for Cartão, a tabela já é separada.
  const clinicExclusion = `AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))`;

  try {
    let value = 0;
    
    // =========================================================================
    // ESCOPO: CARTÃO DE BENEFÍCIOS (Tabela: feegow_contracts)
    // =========================================================================
    if (options?.scope === 'CARD') {
        switch (kpiId) {
            case 'mrr': // MRR é snapshot atual, ignora data
                const rMrr = db.prepare(`SELECT SUM(recurrence_value) as val FROM feegow_contracts WHERE status_contract = 'Aprovado'`).get() as any;
                value = rMrr?.val || 0;
                break;
            case 'sales_value': // Valor de Adesão no Período
                const rSales = db.prepare(`SELECT SUM(membership_value) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND start_date BETWEEN ? AND ?`).get(startDate, endDate) as any;
                value = rSales?.val || 0;
                break;
            case 'sales_qty': // Quantidade de Contratos no Período
                const rQty = db.prepare(`SELECT COUNT(*) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND start_date BETWEEN ? AND ?`).get(startDate, endDate) as any;
                value = rQty?.val || 0;
                break;
            case 'churn_rate': // Taxa de Cancelamento
                const rCanc = db.prepare(`SELECT COUNT(*) as val FROM feegow_contracts WHERE status_contract = 'Cancelado' AND start_date BETWEEN ? AND ?`).get(startDate, endDate) as any;
                const rAtivos = db.prepare(`SELECT COUNT(*) as val FROM feegow_contracts WHERE status_contract = 'Aprovado'`).get() as any;
                value = (rAtivos?.val > 0) ? (rCanc?.val / rAtivos?.val) * 100 : 0;
                break;
            case 'default_rate': // Taxa de Inadimplência (Novas Vendas)
                const rTotal = db.prepare(`SELECT COUNT(*) as val FROM feegow_contracts WHERE start_date BETWEEN ? AND ?`).get(startDate, endDate) as any;
                const rBad = db.prepare(`SELECT COUNT(*) as val FROM feegow_contracts WHERE status_financial = 'Inadimplente' AND start_date BETWEEN ? AND ?`).get(startDate, endDate) as any;
                value = (rTotal?.val > 0) ? (rBad?.val / rTotal?.val) * 100 : 0;
                break;
        }
    }
    
    // =========================================================================
    // ESCOPO: CLÍNICA / GERAL (Tabelas: faturamento_analitico, agenda)
    // =========================================================================
    else { 
        switch (kpiId) {
          // --- FINANCEIRO (Fonte: Faturamento) ---
          case 'revenue':
          case 'revenue_total':
            const rowRev = db.prepare(`
                SELECT SUM(total_pago) as total FROM faturamento_analitico 
                WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico} ${clinicExclusion}
            `).get(startDate, endDate) as { total: number };
            value = rowRev?.total || 0;
            break;

          case 'appointments':
          case 'appointments_realized':
            const rowR = db.prepare(`
                SELECT COUNT(*) as total FROM faturamento_analitico 
                WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico} ${clinicExclusion}
            `).get(startDate, endDate) as { total: number };
            value = rowR?.total || 0;
            break;

          case 'ticket_avg':
          case 'ticket_average':
            const rowT = db.prepare(`
                SELECT SUM(total_pago) as t, COUNT(*) as q FROM faturamento_analitico 
                WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico} ${clinicExclusion}
            `).get(startDate, endDate) as { t: number, q: number };
            value = (rowT && rowT.q > 0) ? (rowT.t / rowT.q) : 0;
            break;

          // --- OPERACIONAL / AGENDA ---
          case 'appointments_total_volume':   
            try {
                const rowSch = db.prepare(`
                    SELECT COUNT(*) as total FROM feegow_appointments 
                    WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? 
                    AND status_id IN (1, 2, 3, 4, 7)
                    ${groupClauseAgenda}
                `).get(startDate, endDate) as { total: number };
                value = rowSch?.total || 0;
            } catch (e) { value = 0; }
            break;

          case 'absenteeism_rate': // Taxa de Faltas
             try {
                 const rowFaltas = db.prepare(`
                    SELECT COUNT(*) as total FROM feegow_appointments 
                    WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? AND status_id = 6 ${groupClauseAgenda}
                `).get(startDate, endDate) as { total: number };
                const rowTotal = db.prepare(`
                    SELECT COUNT(*) as total FROM feegow_appointments 
                    WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? AND status_id IN (1, 2, 3, 4, 6, 7) ${groupClauseAgenda}
                `).get(startDate, endDate) as { total: number };
                value = rowTotal?.total > 0 ? (rowFaltas?.total / rowTotal?.total) * 100 : 0;
             } catch (e) { value = 0; }
            break;

          // --- DIGITAL (Sem alterações) ---
          case 'whatsapp_queue_current':
            try { value = (db.prepare(`SELECT SUM(queue_size) as val FROM clinia_group_snapshots`).get() as any)?.val || 0; } catch (e) {}
            break;
          case 'whatsapp_wait_time':
            try { 
                const v = (db.prepare(`SELECT AVG(avg_wait_seconds) as val FROM clinia_group_snapshots WHERE avg_wait_seconds > 0`).get() as any)?.val || 0;
                value = v / 60;
            } catch (e) {}
            break;
        }
    }

    return { currentValue: Number(value.toFixed(2)), lastUpdated: new Date().toISOString() };
  } catch (error) {
    console.error(`[KPI CALC ERROR] ${kpiId}:`, error);
    return { currentValue: 0, lastUpdated: new Date().toISOString() };
  }
}

// Histórico (Gráficos) - Também atualizado
export async function getKpiHistory(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiHistoryItem[]> {
  const db = getDbConnection();
  const filterVal = options?.group_filter?.trim();
  const clinicExclusion = `AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))`;
  
  try {
    let query = '';
    
    // --- ESCOPO CARTÃO ---
    if (options?.scope === 'CARD') {
        if (kpiId === 'sales_value' || kpiId === 'mrr') { // Evolução Valor
             query = `SELECT start_date as d, SUM(${kpiId === 'mrr' ? 'recurrence_value' : 'membership_value'}) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND d BETWEEN '${startDate}' AND '${endDate}' GROUP BY d ORDER BY d`;
        } else if (kpiId === 'sales_qty') { // Evolução Qtd
             query = `SELECT start_date as d, COUNT(*) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND d BETWEEN '${startDate}' AND '${endDate}' GROUP BY d ORDER BY d`;
        }
    }
    // --- ESCOPO CLÍNICA ---
    else {
        if (kpiId === 'revenue' || kpiId === 'revenue_total') {
            const groupSql = (filterVal && filterVal !== 'all') ? `AND UPPER(TRIM(grupo)) = UPPER(TRIM('${filterVal}'))` : '';
            query = `SELECT ${SQL_DATE_ANALITICO} as d, SUM(total_pago) as val FROM faturamento_analitico WHERE d BETWEEN '${startDate}' AND '${endDate}' ${groupSql} ${clinicExclusion} GROUP BY d ORDER BY d`;
        }
        else if (kpiId === 'appointments') {
            const groupSql = (filterVal && filterVal !== 'all') ? `AND UPPER(TRIM(grupo)) = UPPER(TRIM('${filterVal}'))` : '';
            query = `SELECT ${SQL_DATE_ANALITICO} as d, COUNT(*) as val FROM faturamento_analitico WHERE d BETWEEN '${startDate}' AND '${endDate}' ${groupSql} ${clinicExclusion} GROUP BY d ORDER BY d`;
        }
    }

    if (!query) return [];
    
    const rows = db.prepare(query).all() as { d: string, val: number }[];
    return rows.map(r => ({ date: r.d, value: r.val }));
  } catch (error) {
    return [];
  }
}