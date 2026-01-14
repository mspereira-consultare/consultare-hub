import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  const db = getDbConnection();
  const report = [];

  try {
    // 1. Busca todas as metas configuradas
    const metas = db.prepare('SELECT * FROM goals_config').all() as any[];

    for (const meta of metas) {
      const log: any = {
        meta: meta.name,
        periodo: `${meta.start_date} até ${meta.end_date}`,
        kpi_id: meta.linked_kpi_id,
        steps: []
      };

      // 2. Simula o cálculo para 'revenue_total' (Faturamento)
      if (meta.linked_kpi_id === 'revenue_total') {
        
        // Passo A: Verifica quantos registros existem nesse intervalo exato
        const checkQuery = `
            SELECT COUNT(*) as qtd, SUM(value) as total 
            FROM feegow_appointments 
            WHERE date >= '${meta.start_date}' AND date <= '${meta.end_date}' AND status_id = 3
        `;
        
        const result = db.prepare(`
            SELECT COUNT(*) as qtd, SUM(value) as total 
            FROM feegow_appointments 
            WHERE date >= ? AND date <= ? AND status_id = 3
        `).get(meta.start_date, meta.end_date) as { qtd: number, total: number };

        log.steps.push({
          action: "Teste SQL direto",
          query_simulada: checkQuery,
          resultado_banco: result
        });
        
        log.conclusao = result.total > 0 ? "O BANCO TEM DADOS!" : "ZERO RESULTADOS NO BANCO PARA ESSAS DATAS";
      } else {
        log.steps.push("KPI ignorado neste teste (não é revenue_total)");
      }

      report.push(log);
    }

    return NextResponse.json({ 
        diagnostico: "Teste de Cálculo de Metas", 
        timestamp: new Date().toISOString(),
        resultados: report 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}