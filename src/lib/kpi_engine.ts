import { getDbConnection } from '@/lib/db';

interface KpiResult {
  currentValue: number;
  lastUpdated: string;
}

interface KpiOptions {
    group_filter?: string;
}

interface KpiHistoryItem {
    date: string;
    value: number;
}

export async function getKpiHistory(
  kpiId: string, 
  startDate: string, 
  endDate: string,
  options?: KpiOptions
): Promise<KpiHistoryItem[]> {
  const db = getDbConnection();
  
  const groupClause = (options?.group_filter && options.group_filter !== 'Todos' && options.group_filter !== 'all') 
    ? `AND procedure_group = '${options.group_filter}'` 
    : '';

  try {
    let query = '';
    
    // Seleciona a Query baseada no KPI (Mesma lógica do calculateKpi, mas agrupado por dia)
    switch (kpiId) {
        case 'revenue_total':
            query = `
                SELECT date, SUM(value) as val 
                FROM feegow_appointments 
                WHERE date >= ? AND date <= ? AND status_id IN (2, 3, 4) ${groupClause}
                GROUP BY date ORDER BY date ASC
            `;
            break;
        
        case 'appointments_total_volume':
            query = `
                SELECT date, COUNT(*) as val 
                FROM feegow_appointments 
                WHERE date >= ? AND date <= ? AND status_id IN (1, 2, 3, 4, 6, 7) ${groupClause}
                GROUP BY date ORDER BY date ASC
            `;
            break;

        case 'appointments_realized':
            query = `
                SELECT date, COUNT(*) as val 
                FROM feegow_appointments 
                WHERE date >= ? AND date <= ? AND status_id IN (2, 3, 4) ${groupClause}
                GROUP BY date ORDER BY date ASC
            `;
            break;

        // Adicione outros cases conforme necessário...
        default:
            return [];
    }

    const rows = db.prepare(query).all(startDate, endDate) as { date: string, val: number }[];
    
    return rows.map(r => ({
        date: r.date,
        value: r.val
    }));

  } catch (error) {
    console.error(`[KPI HISTORY ERROR] ${kpiId}:`, error);
    return [];
  }
}
export async function calculateKpi(
  kpiId: string, 
  startDate: string, 
  endDate: string,
  options?: KpiOptions
): Promise<KpiResult> {
  const db = getDbConnection();

  // Prepara a cláusula SQL para filtro de grupo (se houver e não for 'Todos')
  // Nota: procedure_group é a coluna que criamos no worker_feegow.py
  const groupClause = (options?.group_filter && options.group_filter !== 'Todos' && options.group_filter !== 'all') 
    ? `AND procedure_group = '${options.group_filter}'` 
    : '';

  try {
    let value = 0;

    switch (kpiId) {
      
      // --- GRUPO 1: FINANCEIRO (FEEGOW) ---
      
      case 'revenue_total':
        // Faturamento Total (R$)
        // Considera status 2, 3, 4 (Andamento, Atendido, Em Atendimento)
        const rowRev = db.prepare(`
            SELECT SUM(value) as total 
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? 
            AND status_id IN (2, 3, 4)
            ${groupClause} 
        `).get(startDate, endDate) as { total: number };
        value = rowRev?.total || 0;
        break;

      case 'ticket_average':
        // Ticket Médio (R$)
        const rowTicket = db.prepare(`
            SELECT SUM(value) as total_val, COUNT(*) as qtd
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? 
            AND status_id IN (2, 3, 4)
            ${groupClause}
        `).get(startDate, endDate) as { total_val: number, qtd: number };
        
        value = (rowTicket && rowTicket.qtd > 0) ? (rowTicket.total_val / rowTicket.qtd) : 0;
        break;


      // --- GRUPO 2: VOLUME / OPERACIONAL (FEEGOW) ---

      case 'appointments_total_volume':
        // Ocupação de Agenda (Qtd)
        // Considera: Realizados (2,3,4) + Futuros/Marcados (1,7) + Faltas (6)
        const rowVol = db.prepare(`
            SELECT COUNT(*) as total 
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? 
            AND status_id IN (1, 2, 3, 4, 6, 7)
            ${groupClause}
        `).get(startDate, endDate) as { total: number };
        value = rowVol?.total || 0;
        break;

      case 'appointments_realized':
        // Atendimentos Realizados (Qtd)
        // Considera apenas quem de fato compareceu (2,3,4)
        const rowReal = db.prepare(`
            SELECT COUNT(*) as total 
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? 
            AND status_id IN (2, 3, 4)
            ${groupClause}
        `).get(startDate, endDate) as { total: number };
        value = rowReal?.total || 0;
        break;

      case 'absenteeism_rate':
        // Taxa de Absenteísmo (%)
        // (Faltas / Total Ocupado) * 100
        const rowAbs = db.prepare(`
            SELECT 
                COUNT(CASE WHEN status_id = 6 THEN 1 END) as faltas,
                COUNT(*) as total
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? 
            AND status_id IN (1, 2, 3, 4, 6, 7)
            ${groupClause}
        `).get(startDate, endDate) as { faltas: number, total: number };
        
        value = (rowAbs.total > 0) ? (rowAbs.faltas / rowAbs.total) * 100 : 0;
        break;


      // --- GRUPO 3: DIGITAL / OUTROS (Sem filtro de grupo Feegow) ---
      
      case 'whatsapp_queue_current':
        const rowQueue = db.prepare(`SELECT SUM(queue_size) as total FROM clinia_group_snapshots`).get() as { total: number };
        value = rowQueue?.total || 0;
        break;

      case 'whatsapp_wait_time':
        const rowWait = db.prepare(`SELECT AVG(avg_wait_seconds) as val FROM clinia_group_snapshots WHERE avg_wait_seconds > 0`).get() as { val: number };
        value = (rowWait?.val || 0) / 60; 
        break;

      case 'appointments_total_clinia':
         // Exemplo legado se ainda usar tabela separada
         const rowAppt = db.prepare(`SELECT SUM(total_appointments) as total FROM clinia_appointment_stats WHERE date >= ? AND date <= ?`).get(startDate, endDate) as { total: number };
         value = rowAppt?.total || 0;
         break;

      default:
        // Caso KPI manual ou desconhecido
        value = 0;
    }

    return {
      currentValue: Number(value.toFixed(2)),
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[KPI ERROR] Falha ao calcular ${kpiId}:`, error);
    return { currentValue: 0, lastUpdated: new Date().toISOString() };
  }
}