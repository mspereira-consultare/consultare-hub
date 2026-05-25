import { AlertTriangle } from 'lucide-react';
import { priorityStyles } from './dashboardExecutiveUtils';

export type DashboardPriorityItem = {
  key: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  helper?: string | null;
};

function PriorityCard({ priority }: { priority: DashboardPriorityItem }) {
  const tone =
    priority.severity === 'critical'
      ? priorityStyles.high
      : priority.severity === 'high'
        ? priorityStyles.high
        : priority.severity === 'medium'
          ? priorityStyles.medium
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">
        {priority.severity === 'critical'
          ? 'Prioridade crítica'
          : priority.severity === 'high'
            ? 'Prioridade alta'
            : priority.severity === 'medium'
              ? 'Prioridade moderada'
              : 'Prioridade de apoio'}
      </p>
      <p className="mt-2 font-semibold">{priority.title}</p>
      <p className="mt-1 text-sm opacity-90">{priority.description}</p>
      {priority.helper ? <p className="mt-2 text-xs opacity-75">{priority.helper}</p> : null}
    </div>
  );
}

export function ExecutivePrioritiesSection({ priorities }: { priorities: DashboardPriorityItem[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Prioridades do momento</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {priorities.length ? (
          priorities.map((priority) => (
            <PriorityCard key={priority.key} priority={priority} />
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm lg:col-span-3">
            Nenhum alerta quantitativo apareceu neste snapshot. Os indicadores atuais não sinalizam criticidade
            imediata neste momento.
          </div>
        )}
      </div>
    </section>
  );
}
