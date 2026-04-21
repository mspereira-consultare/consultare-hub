import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { calculateKpi } from '@/lib/kpi_engine';
import { withCache, buildCacheKey } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 5 * 60 * 1000;

const formatSaoPauloDate = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

const getSaoPauloToday = () => {
  const todayIso = formatSaoPauloDate(new Date());
  const [year, month, day] = todayIso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
};

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      const today = formatSaoPauloDate(new Date());

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

      const dashboardData = await Promise.all(
        goals.map(async (goal: any) => {
          let calcStart = goal.start_date;
          let calcEnd = goal.end_date;
          const todaySp = getSaoPauloToday();

          if (goal.periodicity === 'daily') {
            const todayIso = formatSaoPauloDate(todaySp);
            calcStart = todayIso;
            calcEnd = todayIso;
          } else if (goal.periodicity === 'weekly') {
            const current = new Date(todaySp);
            const day = current.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            const monday = new Date(current);
            monday.setDate(current.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            calcStart = formatSaoPauloDate(monday);
            calcEnd = formatSaoPauloDate(sunday);
          } else if (goal.periodicity === 'monthly') {
            const year = todaySp.getFullYear();
            const month = todaySp.getMonth();
            calcStart = formatSaoPauloDate(new Date(year, month, 1, 12, 0, 0));
            calcEnd = formatSaoPauloDate(new Date(year, month + 1, 0, 12, 0, 0));
          }

          let current = 0;
          if (goal.linked_kpi_id && goal.linked_kpi_id !== 'manual') {
            const unitFilter = normalizeUnitFilter(goal);
            const result = await calculateKpi(goal.linked_kpi_id, calcStart, calcEnd, {
              group_filter: goal.filter_group,
              unit_filter: unitFilter,
              collaborator: goal.collaborator,
              team: goal.team,
              scope: goal.scope,
            });
            current = result.currentValue;
          }

          const targetValue = Number(goal.target_value || 0);
          const percentage = targetValue > 0 ? Math.round((current / targetValue) * 100) : 0;

          return {
            goal_id: goal.id,
            name: goal.name,
            target: goal.target_value,
            current,
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
