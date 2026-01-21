import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine'; // IMPORTANTE: Usamos o engine atualizado

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    
    // 1. Busca metas ativas
    const goals = db.prepare(`
        SELECT * FROM goals_config 
        WHERE start_date <= date('now') 
        AND end_date >= date('now')
    `).all() as any[];

    // 2. Processa cada meta em paralelo usando o Engine
    const dashboardData = await Promise.all(goals.map(async (goal) => {
        
        // Define intervalo (Diário, Mensal ou Total)
        let calcStart = goal.start_date;
        let calcEnd = goal.end_date;
        const now = new Date();

        if (goal.periodicity === 'daily') {
            const today = now.toISOString().split('T')[0];
            calcStart = today; calcEnd = today;
        } else if (goal.periodicity === 'monthly') {
            const y = now.getFullYear(), m = now.getMonth();
            calcStart = new Date(y, m, 1).toISOString().split('T')[0];
            calcEnd = new Date(y, m + 1, 0).toISOString().split('T')[0];
        }

        // CHAMA O MOTOR DE CÁLCULO (Agora suporta scope='CARD')
        let current = 0;
        if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
            const result = await calculateKpi(
                goal.linked_kpi_id, 
                calcStart, 
                calcEnd, 
                { 
                    group_filter: goal.filter_group,
                    scope: goal.scope // Passamos o escopo!
                }
            );
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
    return NextResponse.json({ error: 'Erro dashboard', details: error.message }, { status: 500 });
  }
}