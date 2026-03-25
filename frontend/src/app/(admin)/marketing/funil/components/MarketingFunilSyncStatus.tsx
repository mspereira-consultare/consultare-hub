import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';
import type { MarketingFunilLatestJob } from './types';
import { formatDateTime } from './formatters';

const getBadge = (status?: string | null) => {
  switch (String(status || '').toUpperCase()) {
    case 'RUNNING':
      return {
        label: 'Processando',
        tone: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: Loader2,
        spin: true,
      };
    case 'PENDING':
      return {
        label: 'Na fila',
        tone: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: Clock3,
        spin: false,
      };
    case 'FAILED':
      return {
        label: 'Falhou',
        tone: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: AlertTriangle,
        spin: false,
      };
    case 'PARTIAL':
      return {
        label: 'Parcial',
        tone: 'bg-orange-50 text-orange-700 border-orange-200',
        icon: AlertTriangle,
        spin: false,
      };
    case 'COMPLETED':
      return {
        label: 'Atualizado',
        tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: CheckCircle2,
        spin: false,
      };
    default:
      return {
        label: 'Sem job',
        tone: 'bg-slate-100 text-slate-600 border-slate-200',
        icon: RefreshCw,
        spin: false,
      };
  }
};

type MarketingFunilSyncStatusProps = {
  latestJob: MarketingFunilLatestJob | null;
  googleLastSyncAt?: string | null;
  refreshing?: boolean;
};

export function MarketingFunilSyncStatus({
  latestJob,
  googleLastSyncAt,
  refreshing = false,
}: MarketingFunilSyncStatusProps) {
  const badge = getBadge(latestJob?.status);
  const Icon = badge.icon;

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sincronização</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {refreshing ? 'Solicitando atualização...' : 'Status do módulo'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.tone}`}>
          <Icon size={14} className={badge.spin ? 'animate-spin' : ''} />
          {badge.label}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-slate-500">Google Ads / GA4</span>
          <span className="text-right text-slate-700">{formatDateTime(googleLastSyncAt)}</span>
        </div>
        {latestJob?.errorMessage ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-800">
            {latestJob.errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
