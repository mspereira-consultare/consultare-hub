import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDbConnection();

    // Busca unidades distintas da tabela de faturamento
    const units = await db.query(`
        SELECT DISTINCT TRIM(unidade) as name
        FROM faturamento_analitico
        WHERE unidade IS NOT NULL AND unidade != ''
        AND (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%')
        ORDER BY name ASC
    `);

    return NextResponse.json(units);

  } catch (error: any) {
    console.error("Erro ao buscar unidades:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
