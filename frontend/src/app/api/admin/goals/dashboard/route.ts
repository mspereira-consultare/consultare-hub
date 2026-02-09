import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine'; 
import { withCache, buildCacheKey } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      
      const normalizeUnitFilter = (goal: any) => {
          const raw = goal?.clinic_unit;
          if (raw && raw !== 'all') return raw;
          // Fallback seguro: evita usar unidade de medida como filtro
          const unitField = goal?.unit;
          if (unitField && !['currency', 'qtd', 'percent', 'minutes'].includes(unitField)) {
              return unitField;
          }
          return undefined;
      };

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
          } else if (goal.periodicity === 'weekly') {
              const current = new Date(now);
              const day = current.getDay(); // 0=domingo ... 6=sabado
              const diffToMonday = day === 0 ? -6 : 1 - day;
              const monday = new Date(current);
              monday.setDate(current.getDate() + diffToMonday);
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 6);
              calcStart = monday.toISOString().split('T')[0];
              calcEnd = sunday.toISOString().split('T')[0];
          } else if (goal.periodicity === 'monthly') {
              const y = now.getFullYear(), m = now.getMonth();
              calcStart = new Date(y, m, 1).toISOString().split('T')[0];
              calcEnd = new Date(y, m + 1, 0).toISOString().split('T')[0];
          }

          // CHAMA O MOTOR DE CÁLCULO
          let current = 0;
          
          // Se tiver um KPI vinculado (não for apenas manual)
          if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
              const unitFilter = normalizeUnitFilter(goal);
              const result = await calculateKpi(
                  goal.linked_kpi_id, 
                  calcStart, 
                  calcEnd, 
                  { 
                    group_filter: goal.filter_group,
                    unit_filter: unitFilter,
                    collaborator: goal.collaborator,
                    team: goal.team,
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
              linked_kpi_id: goal.linked_kpi_id,
              sector: goal.sector,
              start_date: goal.start_date,
              end_date: goal.end_date,
              filter_group: goal.filter_group,
              clinic_unit: goal.clinic_unit,
              collaborator: goal.collaborator,
              team: goal.team,
              // Status visual para o card
              status: percentage >= 100 ? 'SUCCESS' : percentage >= 70 ? 'WARNING' : 'DANGER'
          };
      }));

      return dashboardData;
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro Dashboard Goals:", error);
    
    // Se a tabela não existir (primeira execução), retorna vazio para não quebrar o front
    if (error.message && error.message.includes('no such table')) {
        return NextResponse.json([]);
    }
    
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
