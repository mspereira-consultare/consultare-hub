import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine';
import { withCache, buildCacheKey } from '@/lib/api_cache';
import { deriveDailyTargetFromMonthly, getSaoPauloToday, resolveAggregation } from '@/lib/goals/projection';
import { weekStart, weekEnd, monthStart, monthEnd } from '@/lib/goals/operational_calendar';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isWildcard = (value: unknown) => {
  const normalized = normalizeKey(value);
  return !normalized || normalized === 'all';
};

/**
 * Chave de correspondência entre uma meta diária e a meta mensal equivalente.
 * Precisa casar indicador, unidade, grupo, escopo, equipe e colaborador.
 */
const buildGoalMatchKey = (goal: any) =>
  [
    normalizeKey(goal?.linked_kpi_id),
    normalizeKey(goal?.scope) || 'clinic',
    isWildcard(goal?.clinic_unit) ? 'all' : normalizeKey(goal?.clinic_unit),
    isWildcard(goal?.filter_group) ? 'all' : normalizeKey(goal?.filter_group),
    isWildcard(goal?.team) ? 'all' : normalizeKey(goal?.team),
    isWildcard(goal?.collaborator) ? 'all' : normalizeKey(goal?.collaborator),
    normalizeKey(goal?.employee_id),
  ].join('|');

const shouldDeriveDailyTarget = (goal: any) => {
  const raw = goal?.derive_daily_from_monthly;
  if (raw === 0 || raw === '0' || raw === false) return false;
  return true;
};

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      const today = getSaoPauloToday();

      const normalizeUnitFilter = (goal: any) => {
        const raw = goal?.clinic_unit;
        if (raw && raw !== 'all') return raw;

        const unitField = goal?.unit;
        if (unitField && !['currency', 'qtd', 'percent', 'minutes'].includes(unitField)) {
          return unitField;
        }
        return undefined;
      };

      const goals = await db.query(
        `
          SELECT *
          FROM goals_config
          WHERE start_date <= ?
            AND end_date >= ?
        `,
        [today, today]
      );

      // Bug 4 - metas diárias derivadas da mensal correspondente, para que a soma
      // das diárias do mês feche exatamente com a meta mensal.
      const monthlyTargetByKey = new Map<string, { target: number; name: string }>();
      for (const goal of goals as any[]) {
        if (String(goal?.periodicity || '') !== 'monthly') continue;
        const key = buildGoalMatchKey(goal);
        const current = monthlyTargetByKey.get(key);
        monthlyTargetByKey.set(key, {
          target: (current?.target || 0) + Number(goal?.target_value || 0),
          name: current?.name || String(goal?.name || ''),
        });
      }

      const dashboardData = await Promise.all(
        goals.map(async (goal: any) => {
          let calcStart = goal.start_date;
          let calcEnd = goal.end_date;

          if (goal.periodicity === 'daily') {
            calcStart = today;
            calcEnd = today;
          } else if (goal.periodicity === 'weekly') {
            calcStart = weekStart(today);
            calcEnd = weekEnd(today);
          } else if (goal.periodicity === 'monthly') {
            calcStart = monthStart(today);
            calcEnd = monthEnd(today);
          }

          const kpiOptions = {
            group_filter: goal.filter_group,
            unit_filter: normalizeUnitFilter(goal),
            collaborator: goal.collaborator,
            employee_id: goal.employee_id,
            team: goal.team,
            scope: goal.scope,
          };

          const isLinked = goal.linked_kpi_id && goal.linked_kpi_id !== 'manual';
          // Taxas e médias não são extrapoladas, então não vale gastar a consulta do dia.
          const isCumulative = resolveAggregation(goal.unit) === 'sum';
          const needsTodaySlice =
            isLinked && isCumulative && (goal.periodicity === 'monthly' || goal.periodicity === 'weekly');

          // Bug 1 - o realizado do dia corrente precisa ser conhecido para que a
          // projeção não conte um dia parcial como dia inteiro.
          const [periodResult, todayResult] = await Promise.all([
            isLinked ? calculateKpi(goal.linked_kpi_id, calcStart, calcEnd, kpiOptions) : Promise.resolve(null),
            needsTodaySlice ? calculateKpi(goal.linked_kpi_id, today, today, kpiOptions) : Promise.resolve(null),
          ]);

          const current = periodResult ? periodResult.currentValue : 0;
          const currentToday = needsTodaySlice ? todayResult?.currentValue ?? null : null;

          const configuredTarget = Number(goal.target_value || 0);
          const matchedMonthly =
            goal.periodicity === 'daily' && shouldDeriveDailyTarget(goal)
              ? monthlyTargetByKey.get(buildGoalMatchKey(goal))
              : undefined;
          const derivedTarget = matchedMonthly ? deriveDailyTargetFromMonthly(matchedMonthly.target, today) : null;
          const targetValue = derivedTarget && derivedTarget > 0 ? derivedTarget : configuredTarget;

          const percentage = targetValue > 0 ? Math.round((current / targetValue) * 100) : 0;

          return {
            goal_id: goal.id,
            name: goal.name,
            target: targetValue,
            configured_target: configuredTarget,
            target_source: derivedTarget && derivedTarget > 0 ? 'derived' : 'configured',
            target_source_name: derivedTarget && derivedTarget > 0 ? matchedMonthly?.name || null : null,
            current,
            current_today: currentToday,
            percentage,
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
            reference_date: today,
            status: percentage >= 100 ? 'SUCCESS' : percentage >= 70 ? 'WARNING' : 'DANGER',
          };
        })
      );

      return dashboardData;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error('Erro Dashboard Goals:', error);

    if (error.message && error.message.includes('no such table')) {
      return NextResponse.json([]);
    }

    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
