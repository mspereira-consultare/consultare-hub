import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ExecutiveIndicator, ExecutiveTrend } from '@/lib/dashboard_executive/types';
import { formatIndicatorValue, formatSnapshotTimestamp } from './dashboardExecutiveUtils';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';

function TrendIcon({ trend }: { trend: ExecutiveTrend }) {
  if (trend === 'up') return <ArrowUpRight size={16} className="text-emerald-600" />;
  if (trend === 'down') return <ArrowDownRight size={16} className="text-rose-600" />;
  return <ArrowRight size={16} className="text-slate-400" />;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

export function ExecutiveIndicatorCard({ indicator }: { indicator: ExecutiveIndicator }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{indicator.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            {formatIndicatorValue(indicator, indicator.currentValue)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon trend={indicator.trend} />
          <ExecutiveStatusBadge status={indicator.status} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 xl:grid-cols-5">
        <MiniMetric label="Dia" value={formatIndicatorValue(indicator, indicator.dayValue)} />
        <MiniMetric label="Semana" value={formatIndicatorValue(indicator, indicator.weekValue)} />
        <MiniMetric label="Mês" value={formatIndicatorValue(indicator, indicator.monthValue)} />
        <MiniMetric label="Meta" value={formatIndicatorValue(indicator, indicator.targetValue)} />
        <MiniMetric label="Projeção" value={formatIndicatorValue(indicator, indicator.projectionValue)} />
      </div>

      {indicator.note ? <p className="mt-3 text-sm text-slate-500">{indicator.note}</p> : null}
      <p className="mt-3 text-xs text-slate-400">
        Atualizado em {formatSnapshotTimestamp(indicator.sourceUpdatedAt)}
      </p>
    </div>
  );
}
