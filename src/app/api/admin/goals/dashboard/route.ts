import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    // Pega as metas e inclui a coluna 'filters' (que vamos criar no banco ou assumir que existe no objeto JSON)
    // Para simplificar, vou assumir que você salvou o "Grupo" numa coluna nova ou no campo 'sector' se quiser improvisar, 
    // mas o ideal é criar uma coluna 'filter_group' na tabela goals_config.
    
    // Por enquanto, vamos assumir que a tabela goals_config já tem uma coluna 'filter_criteria' 
    // Se não tiver, precisamos criar. Vamos fazer isso via código defensivo abaixo.
    
    // 1. Busca metas
    const goals = db.prepare(`SELECT * FROM goals_config`).all() as any[];

    const dashboardData = await Promise.all(goals.map(async (goal) => {
        let current = 0;
        let calcStart = goal.start_date;
        let calcEnd = goal.end_date;

        if (goal.periodicity === 'daily') {
            const today = new Date().toISOString().split('T')[0];
            calcStart = today;
            calcEnd = today;
        }

        if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
            // Passa o filtro de grupo se ele existir na meta
            const options = {
                group_filter: goal.filter_group || undefined // Assumindo coluna nova
            };
            
            const result = await calculateKpi(goal.linked_kpi_id, calcStart, calcEnd, options);
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