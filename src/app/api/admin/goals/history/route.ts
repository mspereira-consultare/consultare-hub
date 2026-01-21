import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { getKpiHistory } from '@/lib/kpi_engine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goal_id');

    if (!goalId) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    const goal = db.prepare('SELECT * FROM goals_config WHERE id = ?').get(goalId) as any;

    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    // Ajuste de datas para meta diária (pega o mês atual para mostrar contexto no gráfico)
    let start = goal.start_date;
    let end = goal.end_date;
    
    if (goal.periodicity === 'daily') {
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    // --- CORREÇÃO AQUI ---
    // Agora passamos o 'scope' (CLINIC ou CARD) para o engine saber onde buscar
    const history = await getKpiHistory(
        goal.linked_kpi_id, 
        start, 
        end, 
        { 
            group_filter: goal.filter_group,
            scope: goal.scope // <--- ADICIONADO: Define se olha faturamento ou contratos
        }
    );

    return NextResponse.json(history);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}