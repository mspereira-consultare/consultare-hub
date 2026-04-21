import { ArrowRight } from 'lucide-react';
import type { MarketingFunilSummary } from './types';
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from './formatters';
import { MarketingFunilInfoTooltip } from './MarketingFunilInfoTooltip';
import { buildOverviewTooltipSections } from './marketingFunilTooltipContent';

type MarketingFunilFunnelVisualProps = {
  summary: MarketingFunilSummary | null;
};

type FunnelStage = {
  label: string;
  value: string;
  helper: string;
  tone: string;
  tooltipKey:
    | 'investimento'
    | 'novosContatosCliniaGoogle'
    | 'agendamentosCliniaGoogle';
};

export function MarketingFunilFunnelVisual({ summary }: MarketingFunilFunnelVisualProps) {
  const performance = summary?.performanceFunnel;
  const diagnostics = summary?.diagnostics;
  const operational = summary?.operationalContext;
  const tooltips = buildOverviewTooltipSections(summary);

  const stages: FunnelStage[] = [
    {
      label: 'Investimento Google Ads',
      value: formatCompactCurrency(performance?.googleSpend || 0),
      helper: 'Mídia paga consolidada',
      tone: 'border-l-slate-500 bg-slate-50',
      tooltipKey: 'investimento',
    },
    {
      label: 'Novos contatos Clinia (Google)',
      value: formatNumber(performance?.googleNewContacts || 0),
      helper: performance?.scopeLabel || 'Origem Google no Clinia Ads',
      tone: 'border-l-cyan-500 bg-slate-50/80',
      tooltipKey: 'novosContatosCliniaGoogle',
    },
    {
      label: 'Agendamentos Clinia (Google)',
      value: formatNumber(performance?.googleAppointmentsConverted || 0),
      helper: `Conversão: ${formatPercent(performance?.contactToAppointmentRate || 0)}`,
      tone: 'border-l-blue-500 bg-slate-50/80',
      tooltipKey: 'agendamentosCliniaGoogle',
    },
  ];

  const contextCards = [
    {
      label: 'Cliques em WhatsApp',
      value: formatNumber(diagnostics?.whatsappClicks || 0),
      helper: `${formatCurrency(diagnostics?.whatsappCostPerClick || 0)} por clique`,
      tooltipSections: tooltips.cliquesWhatsapp,
    },
    {
      label: 'Google não mapeado',
      value: formatNumber(diagnostics?.googleUnmappedNewContacts || 0),
      helper: `${formatNumber(diagnostics?.googleUnmappedAppointments || 0)} agendamentos no Clinia`,
      tooltipSections: tooltips.googleNaoMapeado,
    },
    {
      label: 'Agendamentos válidos',
      value: formatNumber(operational?.appointmentsValid || 0),
      helper: `Confirmados/realizados: ${formatNumber(operational?.appointmentsConfirmedOrRealized || 0)}`,
      tooltipSections: tooltips.agendamentosValidos,
    },
    {
      label: 'Faturamento',
      value: formatCompactCurrency(operational?.revenueTotal || 0),
      helper: 'Base: Faturamento Bruto Analítico',
      tooltipSections: tooltips.faturamento,
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Funil de performance atribuída</h2>
          <p className="text-sm text-slate-500">
            Leitura principal do Google Ads até os novos contatos e agendamentos convertidos no Clinia, com contexto
            operacional separado abaixo.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Google Ads + Clinia Ads
        </span>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <div key={stage.label} className="flex items-center gap-3">
            <article className={`min-w-[210px] rounded-2xl border border-slate-200 border-l-4 p-4 shadow-sm ${stage.tone}`}>
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{stage.label}</div>
                <MarketingFunilInfoTooltip
                  label={`Entenda como calculamos ${stage.label.toLowerCase()}`}
                  sections={tooltips[stage.tooltipKey]}
                />
              </div>
              <div className="mt-3 text-xl font-bold text-slate-900">{stage.value}</div>
              <div className="mt-2 text-xs text-slate-500">{stage.helper}</div>
            </article>
            {index < stages.length - 1 ? <ArrowRight className="shrink-0 text-slate-300" size={18} /> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">Contexto e diagnóstico</h3>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            Não entra no cálculo principal do funil
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {contextCards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</div>
                <MarketingFunilInfoTooltip
                  label={`Entenda como calculamos ${card.label.toLowerCase()}`}
                  sections={card.tooltipSections}
                />
              </div>
              <div className="mt-3 text-xl font-bold text-slate-900">{card.value}</div>
              <div className="mt-2 text-xs text-slate-500">{card.helper}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
