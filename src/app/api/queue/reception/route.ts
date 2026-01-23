import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    console.log("=== API RECEPTION DEBUG ===");
    
    // Pega data Brasil
    const today = new Date().toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).split('/').reverse().join('-');
    
    console.log(`[RECEPTION] Data filtro usada: ${today}`);

    // Query
    const sql = `SELECT * FROM recepcao_historico WHERE dia_referencia = ?`;
    const rows = await db.query(sql, [today]);

    console.log(`[RECEPTION] Linhas retornadas: ${rows.length}`);
    if (rows.length > 0) {
        console.log(`[RECEPTION] Exemplo linha 1:`, rows[0]);
    } else {
        // Tenta buscar sem filtro para ver se o problema é a data
        const check = await db.query("SELECT count(*) as total FROM recepcao_historico", []);
        console.warn(`[RECEPTION] Query vazia para hoje. Total na tabela inteira:`, check[0]);
    }

    const response = {
      global: { total_fila: 0, tempo_medio: 0 },
      por_unidade: {
          "2": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Ouro Verde" },
          "3": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Centro Cambuí" },
          "12": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Campinas Shopping" }
      } as Record<string, any>
    };

    (rows as any[]).forEach((row: any) => {
      const id = String(row.unidade_id);
      const status = (row.status || '').toLowerCase();
      
      if (response.por_unidade[id]) {
          if ((status.includes('aguardando') || status.includes('triagem')) && !status.includes('atendimento')) {
              response.por_unidade[id].fila++;
              response.global.total_fila++;
          }
          if (status.includes('atendido') || status.includes('finalizado')) {
              response.por_unidade[id].total_passaram++;
          }
      }
    });

    console.log(`[RECEPTION] Resumo final:`, JSON.stringify(response.global));
    return NextResponse.json({ status: 'success', data: response, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('[RECEPTION ERROR]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}