import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine'; 

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    
    // 1. Busca metas ativas (vigentes hoje)
    // ASYNC: Substituído prepare().all() por await query()
    const goals = await db.query(`
        SELECT * FROM goals_config 
        WHERE start_date <= date('now') 
        AND end_date >= date('now')
    `);

    // 2. Processa cada meta em paralelo usando o Engine
    const dashboardData = await Promise.all(goals.map(async (goal: any) => {
        
        // Define intervalo de cálculo (Diário, Mensal ou Período Total)
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

        // CHAMA O MOTOR DE CÁLCULO
        let current = 0;
        
        // Se tiver um KPI vinculado (não for apenas manual)
        if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
            const result = await calculateKpi(
                goal.linked_kpi_id, 
                calcStart, 
                calcEnd, 
                { 
                    group_filter: goal.filter_group,
                    scope: goal.scope // Importante: Passa se é CLINIC ou CARD
                }
            );
            current = result.currentValue;
        }

        // Cálculo da Porcentagem de Conclusão
        const percentage = goal.target_value > 0 
            ? Math.round((current / goal.target_value) * 100) 
            : 0;

        return {
            goal_id: goal.id,
            name: goal.name,
            target: goal.target_value,
            current: current,
            percentage: percentage,
            unit: goal.unit,
            periodicity: goal.periodicity,
            scope: goal.scope,
            // Status visual para o card
            status: percentage >= 100 ? 'SUCCESS' : percentage >= 70 ? 'WARNING' : 'DANGER'
        };
    }));

    return NextResponse.json(dashboardData);

  } catch (error: any) {
    console.error("Erro Dashboard Goals:", error);
    
    // Se a tabela não existir (primeira execução), retorna vazio para não quebrar o front
    if (error.message && error.message.includes('no such table')) {
        return NextResponse.json([]);
    }
    
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}