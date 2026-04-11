import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, TrendingUp } from 'lucide-react';
import { DashboardGoal } from '../types';

interface SectorSummary {
  sector: string;
  totalGoals: number;
  successGoals: number;
  warningGoals: number;
  dangerGoals: number;
  avgPercentage: number;
}

interface GoalsDashboardExecutiveViewProps {
  riskGoals: DashboardGoal[];
  warningGoals: DashboardGoal[];
  sectorSummaries: SectorSummary[];
  formatValue: (value: number, unit: string) => string;
  onSelectGoal: (goal: DashboardGoal) => void;
}

function StatusList({
  title,
  icon,
  tone,
  goals,
  onSelectGoal,
  formatValue,
  emptyMessage,
}: {
  title: string;
  icon: ReactNode;
  tone: 'danger' | 'warning';
  goals: DashboardGoal[];
  onSelectGoal: (goal: DashboardGoal) => void;
  formatValue: (value: number, unit: string) => string;
  emptyMessage: string;
}) {
  const palette =
    tone === 'danger'
      ? {
          wrapper: 'border-rose-200 bg-rose-50/70',
          title: 'text-rose-700',
          chip: 'bg-rose-100 text-rose-700',
        }
      : {
          wrapper: 'border-amber-200 bg-amber-50/70',
          title: 'text-amber-700',
          chip: 'bg-amber-100 text-amber-700',
        };

  return (
    <div className={`rounded-2xl border ${palette.wrapper} p-5 shadow-sm`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-white/80 p-2 text-slate-700 shadow-sm">{icon}</div>
          <div>
            <h3 className={`text-sm font-bold ${palette.title}`}>{title}</h3>
            <p className="text-xs text-slate-500">Ordenado por nome para facilitar a leitura.</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${palette.chip}`}>{goals.length}</span>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
          {goals.map((goal) => (
            <button
              key={goal.goal_id}
              type="button"
              onClick={() => onSelectGoal(goal)}
              className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/80 bg-white/90 px-4 py-3 text-left transition hover:border-slate-200 hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">{goal.name}</div>
                <div className="mt-1 text-xs text-slate-500">{goal.scope === 'CARD' ? 'Resolve' : goal.sector || 'Clínica'}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-slate-900">{goal.percentage}%</div>
                <div className="text-xs text-slate-500">
                  {formatValue(goal.current, goal.unit)} / {formatValue(goal.target, goal.unit)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalsDashboardExecutiveView({
  riskGoals,
  warningGoals,
  sectorSummaries,
  formatValue,
  onSelectGoal,
}: GoalsDashboardExecutiveViewProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <StatusList
          title="Metas em risco"
          icon={<CircleAlert size={18} className="text-rose-600" />}
          tone="danger"
          goals={riskGoals}
          onSelectGoal={onSelectGoal}
          formatValue={formatValue}
          emptyMessage="Nenhuma meta em risco no recorte atual."
        />
        <StatusList
          title="Metas em atenção"
          icon={<AlertTriangle size={18} className="text-amber-600" />}
          tone="warning"
          goals={warningGoals}
          onSelectGoal={onSelectGoal}
          formatValue={formatValue}
          emptyMessage="Nenhuma meta em atenção no recorte atual."
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-full bg-blue-50 p-2 text-blue-600">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Resumo por área</h3>
            <p className="text-xs text-slate-500">Panorama consolidado para identificar onde estão os maiores gargalos.</p>
          </div>
        </div>

        {sectorSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nenhuma área disponível com os filtros atuais.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {sectorSummaries.map((summary) => {
              const boundedProgress = Math.max(0, Math.min(summary.avgPercentage, 100));
              return (
                <div key={summary.sector} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{summary.sector}</div>
                      <div className="mt-1 text-xs text-slate-500">{summary.totalGoals} meta(s) ativas no recorte</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700 shadow-sm">{summary.avgPercentage}%</div>
                  </div>

                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${boundedProgress}%` }} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                      <div className="font-bold">{summary.successGoals}</div>
                      <div>Batidas</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
                      <div className="font-bold">{summary.warningGoals}</div>
                      <div>Atenção</div>
                    </div>
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                      <div className="font-bold">{summary.dangerGoals}</div>
                      <div>Risco</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
