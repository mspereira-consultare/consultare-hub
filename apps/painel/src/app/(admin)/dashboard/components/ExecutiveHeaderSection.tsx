import { BrainCircuit, Download, Loader2, RefreshCw, Target } from 'lucide-react';
import type { ExecutiveSnapshot } from '@/lib/dashboard_executive/types';
import {
  formatProfileLabel,
  formatResolutionSourceLabel,
  formatScopeLabel,
  formatSnapshotTimestamp,
  truncateText,
} from './dashboardExecutiveUtils';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';

type OverviewCard = {
  label: string;
  value: string;
  helper: string;
};

type ExecutiveHeaderSectionProps = {
  snapshot: ExecutiveSnapshot | null;
  overviewCards: OverviewCard[];
  priorityHighlights: Array<{ key: string; label: string; tone: string }>;
  refreshing: boolean;
  exportingPdf: boolean;
  onRefresh: () => void;
  onExportPdf: () => void;
};

export function ExecutiveHeaderSection({
  snapshot,
  overviewCards,
  priorityHighlights,
  refreshing,
  exportingPdf,
  onRefresh,
  onExportPdf,
}: ExecutiveHeaderSectionProps) {
  const aiStatus = snapshot?.metrics.aiStatus || 'PENDING_PHASE_2';
  const aiSummary = truncateText(
    snapshot?.aiSummary?.executiveSummary || snapshot?.metrics.executiveSummary || 'Sem snapshot executivo disponível no momento.',
    220
  );
  const aiStatusLabel =
    aiStatus === 'READY'
      ? 'IA pronta'
      : aiStatus === 'FAILED'
        ? 'IA indisponível'
        : aiStatus === 'UNAVAILABLE'
          ? 'IA não disponível'
          : 'IA pendente';
  const aiStatusTone =
    aiStatus === 'READY'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : aiStatus === 'FAILED'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white shadow-sm">
            <Target size={20} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              <BrainCircuit size={14} />
              Painel Executivo
            </div>
            <h1 className="text-xl font-bold text-slate-800">Visão consolidada para priorização da liderança</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">{aiSummary}</p>
              {priorityHighlights.length ? (
                <div className="flex flex-wrap gap-2">
                {priorityHighlights.map((item) => (
                  <span
                    key={item.key}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${item.tone}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${aiStatusTone}`}>
            {aiStatusLabel}
          </span>
          <ExecutiveStatusBadge status={snapshot?.metrics.overallStatus || 'NO_DATA'} />
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exportingPdf || !snapshot}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {exportingPdf ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            {exportingPdf ? 'Exportando PDF...' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            {refreshing ? 'Atualizando painel...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Contexto do painel
              </div>
              <p className="text-xs text-slate-500">Perfil: {formatProfileLabel(snapshot?.metrics.profile.profileKey || null)}</p>
              <p className="text-xs text-slate-500">Escopo: {formatScopeLabel(snapshot)}</p>
              <p className="text-xs text-slate-500">
                Governança: {snapshot?.metrics.profile.matchedGroupLabel || formatResolutionSourceLabel(snapshot?.metrics.profile.resolutionSource || 'unconfigured')}
              </p>
            </div>

          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
            Última atualização: {formatSnapshotTimestamp(snapshot?.completedAt || snapshot?.createdAt)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
