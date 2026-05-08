import { AlertTriangle } from 'lucide-react';
import type { ExecutivePriority } from '@/lib/dashboard_executive/types';
import { priorityStyles } from './dashboardExecutiveUtils';

function PriorityCard({ priority }: { priority: ExecutivePriority }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${priorityStyles[priority.severity]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">
        {priority.severity === 'high' ? 'Prioridade alta' : 'Prioridade moderada'}
      </p>
      <p className="mt-2 font-semibold">{priority.title}</p>
      <p className="mt-1 text-sm opacity-90">{priority.description}</p>
    </div>
  );
}

export function ExecutivePrioritiesSection({ priorities }: { priorities: ExecutivePriority[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Prioridades do momento</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {priorities.length ? (
          priorities.map((priority) => (
            <PriorityCard key={`${priority.areaKey}-${priority.title}`} priority={priority} />
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
