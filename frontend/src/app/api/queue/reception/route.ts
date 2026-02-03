import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();

    const sql = `
      SELECT 
        unidade_id,
        unidade_nome,

        COUNT(CASE 
          WHEN dt_atendimento IS NULL 
               AND status NOT LIKE 'Finalizado%' 
          THEN 1 END
        ) AS fila,

        CAST(ROUND(AVG(
          CASE 
            WHEN dt_atendimento IS NOT NULL 
            THEN (julianday(dt_atendimento) - julianday(dt_chegada)) * 1440
          END
        )) AS INTEGER) AS tempo_medio,

        COUNT(CASE 
          WHEN dt_atendimento IS NOT NULL 
          THEN 1 END
        ) AS total_passaram

      FROM recepcao_historico
      WHERE dia_referencia = date('now')
      GROUP BY unidade_id, unidade_nome
    `;

    const rows = await db.query(sql);

    const response = {
      por_unidade: {
        "2": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Ouro Verde" },
        "3": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Centro Cambuí" },
        "12": { fila: 0, tempo_medio: 0, total_passaram: 0, nome_unidade: "Campinas Shopping" }
      } as Record<string, any>,
      global: { total_fila: 0, tempo_medio: 0 }
    };

    let totalTempo = 0;
    let totalAtendidos = 0;

    (rows as any[]).forEach(row => {
      const id = String(row.unidade_id);
      if (response.por_unidade[id]) {
        response.por_unidade[id] = {
          ...response.por_unidade[id],
          fila: row.fila || 0,
          tempo_medio: row.tempo_medio || 0,
          total_passaram: row.total_passaram || 0
        };

        response.global.total_fila += row.fila || 0;

        if (row.total_passaram > 0) {
          totalTempo += row.tempo_medio * row.total_passaram;
          totalAtendidos += row.total_passaram;
        }
      }
    });

    response.global.tempo_medio = totalAtendidos > 0
      ? Math.round(totalTempo / totalAtendidos)
      : 0;

    return NextResponse.json({
      status: 'success',
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[RECEPTION ERROR]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: (error as any)?.status || 500 });
  }
}
