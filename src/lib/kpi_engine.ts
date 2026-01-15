import { getDbConnection } from '@/lib/db';

interface KpiResult { currentValue: number; lastUpdated: string; }
interface KpiOptions { group_filter?: string; }
interface KpiHistoryItem { date: string; value: number; }

// --- CONFIGURAÇÃO DE DATAS ---
// Scraper: data_do_pagamento (DD/MM/YYYY) -> SQL converte para YYYY-MM-DD
const COL_DATA_ANALITICO = 'data_do_pagamento';
const SQL_DATE_ANALITICO = `substr(${COL_DATA_ANALITICO}, 7, 4) || '-' || substr(${COL_DATA_ANALITICO}, 4, 2) || '-' || substr(${COL_DATA_ANALITICO}, 1, 2)`;

// Worker Feegow: date (YYYY-MM-DD) -> Já está pronto no banco
const SQL_DATE_AGENDA = 'date'; 

export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
  const db = getDbConnection();
  
  // FILTRO BLINDADO: Resolve diferenças de maiúsculas/minúsculas e espaços
  const filterVal = options?.group_filter?.trim();
  
  const groupClauseAnalitico = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(grupo)) = UPPER(TRIM('${filterVal}'))` : '';
    
  const groupClauseAgenda = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(procedure_group)) = UPPER(TRIM('${filterVal}'))` : '';

  try {
    let value = 0;
    
    switch (kpiId) {
      
      // --- FINANCEIRO (Fonte: Faturamento) ---
      case 'revenue_total':
        const rowRev = db.prepare(`
            SELECT SUM(total_pago) as total FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico}
        `).get(startDate, endDate) as { total: number };
        value = rowRev?.total || 0;
        break;

      case 'appointments_realized':
        const rowR = db.prepare(`
            SELECT COUNT(*) as total FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico}
        `).get(startDate, endDate) as { total: number };
        value = rowR?.total || 0;
        break;

      case 'ticket_average':
        const rowT = db.prepare(`
            SELECT SUM(total_pago) as t, COUNT(*) as q FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? ${groupClauseAnalitico}
        `).get(startDate, endDate) as { t: number, q: number };
        value = (rowT && rowT.q > 0) ? (rowT.t / rowT.q) : 0;
        break;

      // --- AGENDA / META (Fonte: Feegow) ---
      // COMPATIBILIDADE: Aceita ambos os IDs para garantir que a meta funcione
      case 'appointments_schedule_total': 
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
        
      // CÁLCULO DE ABSENTEÍSMO (NOVO)
      case 'absenteeism_rate':
         try {
             // 1. Busca total de Faltas (Status 6)
             const rowFaltas = db.prepare(`
                SELECT COUNT(*) as total FROM feegow_appointments 
                WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? 
                AND status_id = 6 
                ${groupClauseAgenda}
            `).get(startDate, endDate) as { total: number };
            const faltas = rowFaltas?.total || 0;

            // 2. Busca Total Geral (Compareceu + Faltou + Agendado)
            const rowTotal = db.prepare(`
                SELECT COUNT(*) as total FROM feegow_appointments 
                WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? 
                AND status_id IN (1, 2, 3, 4, 6, 7) 
                ${groupClauseAgenda}
            `).get(startDate, endDate) as { total: number };
            const total = rowTotal?.total || 0;

            // 3. Calcula %
            value = total > 0 ? (faltas / total) * 100 : 0;

         } catch (e) { value = 0; }
        break;

      case 'appointments_canceled':
         try {
             const rowCanc = db.prepare(`
                SELECT COUNT(*) as total FROM feegow_appointments 
                WHERE ${SQL_DATE_AGENDA} BETWEEN ? AND ? 
                AND status_id IN (6, 11, 16, 22)
                ${groupClauseAgenda}
            `).get(startDate, endDate) as { total: number };
            value = rowCanc?.total || 0;
         } catch (e) { value = 0; }
        break;

      // --- DIGITAL ---
      case 'whatsapp_queue_current':
        try {
            const rowQ = db.prepare(`SELECT SUM(queue_size) as total FROM clinia_group_snapshots`).get() as { total: number };
            value = rowQ?.total || 0;
        } catch (e) { value = 0; }
        break;

      case 'whatsapp_wait_time':
        try {
            const rowW = db.prepare(`SELECT AVG(avg_wait_seconds) as val FROM clinia_group_snapshots WHERE avg_wait_seconds > 0`).get() as { val: number };
            value = (rowW?.val || 0) / 60;
        } catch (e) { value = 0; }
        break;

      default: value = 0;
    }

    return { currentValue: Number(value.toFixed(2)), lastUpdated: new Date().toISOString() };
  } catch (error) {
    console.error(`[KPI CALC ERROR] ${kpiId}:`, error);
    return { currentValue: 0, lastUpdated: new Date().toISOString() };
  }
}

// Histórico (Gráficos)
export async function getKpiHistory(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiHistoryItem[]> {
  const db = getDbConnection();
  
  const filterVal = options?.group_filter?.trim();
  const groupClauseAnalitico = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(grupo)) = UPPER(TRIM('${filterVal}'))` : '';
  const groupClauseAgenda = (filterVal && filterVal !== 'all') 
    ? `AND UPPER(TRIM(procedure_group)) = UPPER(TRIM('${filterVal}'))` : '';

  try {
    let query = '';
    
    switch (kpiId) {
        case 'revenue_total':
            query = `
                SELECT ${SQL_DATE_ANALITICO} as iso_date, SUM(total_pago) as val 
                FROM faturamento_analitico 
                WHERE iso_date >= ? AND iso_date <= ? AND total_pago > 0 ${groupClauseAnalitico}
                GROUP BY iso_date ORDER BY iso_date ASC
            `;
            break;
        
        case 'appointments_realized':
             query = `
                SELECT ${SQL_DATE_ANALITICO} as iso_date, COUNT(*) as val 
                FROM faturamento_analitico 
                WHERE iso_date >= ? AND iso_date <= ? ${groupClauseAnalitico}
                GROUP BY iso_date ORDER BY iso_date ASC
            `;
            break;

        case 'appointments_schedule_total':
        case 'appointments_total_volume':
            query = `
                SELECT ${SQL_DATE_AGENDA} as iso_date, COUNT(*) as val 
                FROM feegow_appointments 
                WHERE iso_date >= ? AND iso_date <= ? 
                AND status_id IN (1, 2, 3, 4, 7) ${groupClauseAgenda}
                GROUP BY iso_date ORDER BY iso_date ASC
            `;
            break;

        // GRÁFICO DE ABSENTEÍSMO (% de Faltas por dia)
        case 'absenteeism_rate':
            query = `
                SELECT ${SQL_DATE_AGENDA} as iso_date, 
                (CAST(SUM(CASE WHEN status_id = 6 THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) * 100 as val 
                FROM feegow_appointments 
                WHERE iso_date >= ? AND iso_date <= ? 
                AND status_id IN (1, 2, 3, 4, 6, 7) ${groupClauseAgenda}
                GROUP BY iso_date ORDER BY iso_date ASC
            `;
            break;

        default: return [];
    }

    const rows = db.prepare(query).all(startDate, endDate) as { iso_date: string, val: number }[];
    return rows.map(r => ({ date: r.iso_date, value: r.val }));
  } catch (error) {
    return [];
  }
}