import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    
    // 1. Busca todas as metas
    const goals = db.prepare(`SELECT * FROM goals_config`).all() as any[];

    console.log(`[Dashboard API] Processando ${goals.length} metas...`);

    // 2. Calcula KPIs
    const dashboardData = await Promise.all(goals.map(async (goal) => {
        let current = 0;
        
        // --- LÓGICA INTELIGENTE DE DATAS ---
        let calcStart = goal.start_date;
        let calcEnd = goal.end_date;

        // Se for meta DIÁRIA, forçamos o cálculo apenas para o dia de HOJE
        if (goal.periodicity === 'daily') {
            // Pega data atual no formato YYYY-MM-DD
            // Nota: Isso usa a data do SERVIDOR onde o Next.js está rodando
            const today = new Date().toISOString().split('T')[0];
            calcStart = today;
            calcEnd = today;
        }
        // -----------------------------------

        if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
            // Passamos as datas ajustadas (calcStart/End) em vez das originais
            const result = await calculateKpi(goal.linked_kpi_id, calcStart, calcEnd);
            current = result.currentValue;
        }

        const percentage = goal.target_value > 0 
            ? Math.round((current / goal.target_value) * 100) 
            : 0;

        return {
            goal_id: goal.id,
            current: current,
            percentage: percentage
        };
    }));

    return NextResponse.json(dashboardData);

  } catch (error: any) {
    console.error('[Dashboard API Error]', error);
    return NextResponse.json({ error: 'Erro ao processar dashboard', details: error.message }, { status: 500 });
  }
}