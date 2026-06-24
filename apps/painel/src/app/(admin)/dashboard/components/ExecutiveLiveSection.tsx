import { Clock3 } from 'lucide-react';
import type { ExecutiveLiveHeartbeat } from '@/lib/dashboard_executive/types';
import { formatSnapshotTimestamp } from './dashboardExecutiveUtils';

function LiveHeartbeatCard({ heartbeat }: { heartbeat: ExecutiveLiveHeartbeat }) {
  const tone =
    heartbeat.status === 'COMPLETED'
      ? 'bg-emerald-500'
      : heartbeat.status === 'RUNNING'
        ? 'bg-amber-500'
        : heartbeat.status === 'ERROR'
          ? 'bg-rose-500'
          : 'bg-slate-400';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        <div>
          <p className="font-semibold text-slate-700">{heartbeat.serviceName}</p>
          <p className="text-xs uppercase tracking-wide text-slate-400">{heartbeat.status || 'UNKNOWN'}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">Última execução: {formatSnapshotTimestamp(heartbeat.lastRun)}</p>
      {heartbeat.details ? <p className="mt-2 text-sm text-slate-500">{heartbeat.details}</p> : null}
    </div>
  );
}

type LiveMetric = {
  label: string;
  value: number;
  helper: string;
};

function LiveMetricCard({ metric }: { metric: LiveMetric }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{metric.label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{metric.value}</p>
      <p className="mt-1 text-xs text-slate-500">{metric.helper}</p>
    </div>
  );
}

export function ExecutiveLiveSection({
  heartbeats,
  metrics,
}: {
  heartbeats: ExecutiveLiveHeartbeat[];
  metrics: LiveMetric[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock3 size={18} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Operação ao vivo</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <LiveMetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {heartbeats.length ? (
          heartbeats.map((heartbeat) => (
            <LiveHeartbeatCard
              key={`${heartbeat.serviceName}-${heartbeat.lastRun || 'never'}`}
              heartbeat={heartbeat}
            />
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm lg:col-span-3">
            Nenhum heartbeat operacional foi encontrado para este recorte.
          </div>
        )}
      </div>
    </section>
  );
}
