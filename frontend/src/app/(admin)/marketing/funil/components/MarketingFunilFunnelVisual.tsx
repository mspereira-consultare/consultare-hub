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
};

export function MarketingFunilFunnelVisual({ summary }: MarketingFunilFunnelVisualProps) {
  const stages: FunnelStage[] = [
    {
      label: 'Investimento',
      value: formatCompactCurrency(summary?.spend || 0),
      helper: 'Google Ads',
      tone: 'border-l-slate-500 bg-slate-50',
    },
    {
      label: 'Sess?es',
      value: formatNumber(summary?.sessions || 0),
      helper: 'GA4',
      tone: 'border-l-blue-500 bg-white',
    },
    {
      label: 'Leads digitais',
      value: formatNumber(summary?.leads || 0),
      helper: 'GA4 key events',
      tone: 'border-l-emerald-500 bg-white',
    },
    {
      label: 'Leads CRM CRC',
      value: formatNumber(summary?.crm.leadsCreatedCount || 0),
      helper: 'Clinia CRM',
      tone: 'border-l-cyan-500 bg-white',
    },
    {
      label: 'Pipeline CRC',
      value: formatNumber(summary?.crm.pipelineItemsCount || 0),
      helper: summary?.crm.pipelineSnapshotDate ? `Snapshot ${summary.crm.pipelineSnapshotDate}` : 'Clinia CRM',
      tone: 'border-l-violet-500 bg-white',
    },
    {
      label: 'Agendamentos',
      value: 'Em integra??o',
      helper: 'Feegow / pr?xima etapa',
      tone: 'border-l-amber-400 border-dashed bg-slate-50',
    },
    {
      label: 'Faturamento',
      value: 'Em integra??o',
      helper: 'Resultado real',
      tone: 'border-l-rose-400 border-dashed bg-slate-50',
    },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Funil Integrado</h2>
          <p className="text-sm text-slate-500">
            Fluxo atual entre m?dia digital e CRM. Agendamentos, faturamento e ocupa??o entram na pr?xima camada.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Google-first + CRC
        </span>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <div key={stage.label} className="flex items-center gap-3">
            <article className={`min-w-[180px] rounded-2xl border border-slate-200 border-l-4 p-4 shadow-sm ${stage.tone}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{stage.label}</div>
              <div className="mt-3 text-xl font-bold text-slate-900">{stage.value}</div>
              <div className="mt-2 text-xs text-slate-500">{stage.helper}</div>
            </article>
            {index < stages.length - 1 ? <ArrowRight className="shrink-0 text-slate-300" size={18} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
