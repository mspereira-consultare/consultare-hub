import { ChevronRight } from 'lucide-react';
import { calculateGoalProjection, calculateGoalRemaining } from '@/lib/goals_metrics';
import { DashboardGoal } from '../types';

interface GoalsDashboardTableProps {
  goals: DashboardGoal[];
  formatValue: (value: number, unit: string) => string;
  getIndicatorLabel: (goal: DashboardGoal) => string;
  getPeriodicityLabel: (goal: DashboardGoal) => string;
  onSelectGoal: (goal: DashboardGoal) => void;
  emptyMessage: string;
}

const STATUS_STYLES: Record<DashboardGoal['status'], string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
  DANGER: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_LABELS: Record<DashboardGoal['status'], string> = {
  SUCCESS: 'Batida',
  WARNING: 'Atenção',
  DANGER: 'Em risco',
};

function buildContext(goal: DashboardGoal) {
  const parts: string[] = [];

  if (goal.filter_group) parts.push(`Grupo: ${goal.filter_group}`);
  if (goal.clinic_unit && goal.clinic_unit !== 'all') parts.push(`Unidade: ${goal.clinic_unit}`);
  if (goal.team) parts.push(`Equipe: ${goal.team}`);
  if (goal.collaborator) parts.push(`Colaborador: ${goal.collaborator}`);

  return parts.join(' • ') || 'Sem contexto adicional';
}

export function GoalsDashboardTable({
  goals,
  formatValue,
  getIndicatorLabel,
  getPeriodicityLabel,
  onSelectGoal,
  emptyMessage,
}: GoalsDashboardTableProps) {
  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-[13px]">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Meta</th>
              <th className="px-4 py-3 text-left">Indicador</th>
              <th className="px-4 py-3 text-left">Meta</th>
              <th className="px-4 py-3 text-left">Realizado</th>
              <th className="px-4 py-3 text-left">Projeção</th>
              <th className="px-4 py-3 text-left">Restante</th>
              <th className="px-4 py-3 text-left">%</th>
              <th className="px-4 py-3 text-left">Contexto</th>
              <th className="px-4 py-3 text-right">Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {goals.map((goal) => {
              const boundedPercentage = Math.max(0, Math.min(goal.percentage, 100));
              const projection = calculateGoalProjection({
                current: goal.current,
                target: goal.target,
                periodicity: goal.periodicity,
              });
              const remaining = calculateGoalRemaining({
                current: goal.current,
                target: goal.target,
              });

              return (
                <tr
                  key={goal.goal_id}
                  onClick={() => onSelectGoal(goal)}
                  className="cursor-pointer bg-white transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-semibold text-slate-800">{goal.name}</div>
                    <div className="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {goal.scope === 'CARD' ? 'Resolve' : goal.sector || 'Clínica'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">{getIndicatorLabel(goal)}</td>
                  <td className="px-4 py-3 align-top font-semibold text-slate-700">{formatValue(goal.target, goal.unit)}</td>
                  <td className="px-4 py-3 align-top font-semibold text-slate-900">{formatValue(goal.current, goal.unit)}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-700">{formatValue(projection, goal.unit)}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{getPeriodicityLabel(goal)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-700">{formatValue(remaining, goal.unit)}</div>
                    <div className="mt-1 text-[11px] text-slate-500">Falta para a meta</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="min-w-[110px] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-700">{goal.percentage}%</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[goal.status]}`}>
                          {STATUS_LABELS[goal.status]}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${goal.status === 'SUCCESS' ? 'bg-emerald-500' : goal.status === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${boundedPercentage}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">
                    <span className="block max-w-md line-clamp-2">{buildContext(goal)}</span>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectGoal(goal);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Ver
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
