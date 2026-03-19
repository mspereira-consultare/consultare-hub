import { ArrowRight } from 'lucide-react';
import type { MarketingFunilSummary } from './types';
import { formatCompactCurrency, formatNumber } from './formatters';

type MarketingFunilFunnelVisualProps = {
  summary: MarketingFunilSummary | null;
};

type FunnelStage = {
  label: string;
  value: string;
  helper: string;
  tone: string;
  placeholder?: boolean;
};

export function MarketingFunilFunnelVisual({ summary }: MarketingFunilFunnelVisualProps) {
  const stages: FunnelStage[] = [
    {
      label: 'Investimento',
      value: formatCompactCurrency(summary?.spend || 0),
      helper: 'Google Ads',
      tone: 'border-slate-300 bg-slate-900 text-white',
    },
    {
      label: 'Sessões',
      value: formatNumber(summary?.sessions || 0),
      helper: 'GA4',
      tone: 'border-blue-200 bg-blue-50 text-blue-900',
    },
    {
      label: 'Leads digitais',
      value: formatNumber(summary?.leads || 0),
      helper: 'GA4 key events',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    },
    {
      label: 'Leads CRM CRC',
      value: formatNumber(summary?.crm.leadsCreatedCount || 0),
      helper: 'Clinia CRM',
      tone: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    },
    {
      label: 'Pipeline CRC',
      value: formatNumber(summary?.crm.pipelineItemsCount || 0),
      helper: summary?.crm.pipelineSnapshotDate ? `Snapshot ${summary.crm.pipelineSnapshotDate}` : 'Clinia CRM',
      tone: 'border-violet-200 bg-violet-50 text-violet-900',
    },
    {
      label: 'Agendamentos',
      value: 'Em integração',
      helper: 'Feegow / próxim­a etapa',
      tone: 'border-dashed border-amber-300 bg-amber-50 text-amber-900',
      placeholder: true,
    },
    {
      label: 'Faturamento',
      value: 'Em integração',
      helper: 'Resultado real',
      tone: 'border-dashed border-rose-300 bg-rose-50 text-rose-900',
      placeholder: true,
    },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Funil Integrado</h2>
          <p className="text-sm text-slate-500">
            Fluxo atual entre mídia digital e CRM. Agendamentos, faturamento e ocupação entram na próxima camada.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Google-first + CRC
        </span>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <div key={stage.label} className="flex items-center gap-3">
            <article className={`min-w-[180px] rounded-2xl border p-4 shadow-sm ${stage.tone}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">{stage.label}</div>
              <div className="mt-3 text-xl font-bold">{stage.value}</div>
              <div className="mt-2 text-xs opacity-80">{stage.helper}</div>
            </article>
            {index < stages.length - 1 ? <ArrowRight className="shrink-0 text-slate-300" size={18} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
