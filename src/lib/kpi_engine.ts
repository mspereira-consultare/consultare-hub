import { getDbConnection } from '@/lib/db';

interface KpiResult {
  currentValue: number;
  lastUpdated: string;
}

export async function calculateKpi(
  kpiId: string, 
  startDate: string, 
  endDate: string
): Promise<KpiResult> {
  const db = getDbConnection();

  // DEBUG: Mostra no terminal o que está sendo pedido
  console.log(`[KPI Engine] Calculando: ${kpiId} | De: ${startDate} Até: ${endDate}`);

  try {
    let value = 0;

    switch (kpiId) {
      // --- GRUPO 1: DIGITAL ---
      case 'whatsapp_queue_current':
        const rowQueue = db.prepare(`SELECT SUM(queue_size) as total FROM clinia_group_snapshots`).get() as { total: number };
        value = rowQueue?.total || 0;
        break;

      case 'whatsapp_wait_time':
        const rowWait = db.prepare(`SELECT AVG(avg_wait_seconds) as val FROM clinia_group_snapshots WHERE avg_wait_seconds > 0`).get() as { val: number };
        value = (rowWait?.val || 0) / 60; 
        break;

      // --- GRUPO 2: COMERCIAL ---
      case 'appointments_total_clinia':
        const rowAppt = db.prepare(`SELECT SUM(total_appointments) as total FROM clinia_appointment_stats WHERE date >= ? AND date <= ?`).get(startDate, endDate) as { total: number };
        value = rowAppt?.total || 0;
        break;

      // --- GRUPO 3: FINANCEIRO (FEEGOW) ---
      case 'revenue_total':
        // Query blindada
        const rowRev = db.prepare(`
            SELECT SUM(value) as total 
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? AND status_id = 3
        `).get(startDate, endDate) as { total: number };
        
        value = rowRev?.total || 0;
        console.log(`   -> Resultado revenue_total: ${value}`); // LOG NO TERMINAL
        break;

      case 'ticket_average':
        const rowTicket = db.prepare(`
            SELECT SUM(value) as total_val, COUNT(*) as qtd
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? AND status_id = 3
        `).get(startDate, endDate) as { total_val: number, qtd: number };
        
        value = (rowTicket && rowTicket.qtd > 0) ? (rowTicket.total_val / rowTicket.qtd) : 0;
        break;

      default:
        console.log(`   -> KPI Desconhecido ou Manual: ${kpiId}`);
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