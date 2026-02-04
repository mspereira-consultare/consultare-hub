import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
// Importamos calculateHistory conforme definimos no kpi_engine.ts atualizado
import { calculateHistory } from '@/lib/kpi_engine'; 
import { withCache, buildCacheKey } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goal_id');

    if (!goalId) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    
    // 1. Busca a configuração da meta (Async)
    const result = await db.query('SELECT * FROM goals_config WHERE id = ?', [goalId]);
    const goal = result[0] as any;

    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    // 2. Lógica de Datas (Mantida do original)
    // Se for meta diária, mostra o histórico do mês atual inteiro
    let start = goal.start_date;
    let end = goal.end_date;
    
    if (goal.periodicity === 'daily') {
        const now = new Date();
        // Primeiro dia do mês atual
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        // Último dia do mês atual
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    // 3. Chama o Engine (Async)
    // Passamos o objeto de opções com scope e filter_group
    const normalizeUnitFilter = (goal: any) => {
        const raw = goal?.clinic_unit;
        if (raw && raw !== 'all') return raw;
        const unitField = goal?.unit;
        if (unitField && !['currency', 'qtd', 'percent', 'minutes'].includes(unitField)) {
            return unitField;
        }
        return undefined;
    };

    const unitFilter = normalizeUnitFilter(goal);
    const history = await calculateHistory(
        goal.linked_kpi_id, 
        start, 
        end,
        { 
            group_filter: goal.filter_group,
            unit_filter: unitFilter,
            collaborator: goal.collaborator,
            team: goal.team,
            scope: goal.scope // 'CLINIC' ou 'CARD'
        }
    );

    return history;
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro History Route:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
