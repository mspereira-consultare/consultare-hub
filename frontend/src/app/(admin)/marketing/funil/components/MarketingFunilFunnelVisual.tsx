import { ArrowRight } from 'lucide-react';
import type { MarketingFunilSummary } from './types';
import { formatCompactCurrency, formatNumber, formatPercent } from './formatters';

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
  const attendedAppointments = summary?.appointments.byStatus.find((item) => item.statusId === 3)?.count || 0;
  const futureConfirmedAppointments = summary?.appointments.byStatus.find((item) => item.statusId === 7)?.count || 0;
  const confirmedAppointments = attendedAppointments + futureConfirmedAppointments;

  const stages: FunnelStage[] = [
    {
      label: 'Investimento',
      value: formatCompactCurrency(summary?.spend || 0),
      helper: 'Google Ads',
      tone: 'border-l-slate-500 bg-slate-50',
    },
    {
      label: 'Leads (WhatsApp)',
      value: formatNumber(summary?.leads || 0),
      helper: 'Cliques no CTA de WhatsApp',
      tone: 'border-l-emerald-500 bg-slate-50/70',
    },
    {
      label: 'Contatos Clinia',
      value: formatNumber(summary?.cliniaAds.contactsReceived || 0),
      helper: 'Contatos recebidos pelos anúncios',
      tone: 'border-l-cyan-500 bg-slate-50/70',
    },
    {
      label: 'Agendamentos Clinia',
      value: formatNumber(summary?.cliniaAds.appointmentsConverted || 0),
      helper: `Conversão: ${formatPercent(summary?.cliniaAds.conversionRate || 0)}`,
      tone: 'border-l-blue-500 bg-slate-50/70',
    },
    {
      label: 'Agendamentos válidos',
      value: formatNumber(summary?.appointments.totalValid || 0),
      helper: `Confirmados/realizados: ${formatNumber(confirmedAppointments)}`,
      tone: 'border-l-amber-500 bg-slate-50/70',
    },
    {
      label: 'Faturamento',
      value: formatCompactCurrency(summary?.revenue.total || 0),
      helper: 'Base: Faturamento Bruto Analítico',
      tone: 'border-l-rose-500 bg-slate-50/70',
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Funil Integrado</h2>
          <p className="text-sm text-slate-500">
            Leitura de mídia, intenção via WhatsApp, contatos recebidos no Clinia, avanço para agendamento e resultado
            operacional.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Google + Clinia Ads
        </span>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <div key={stage.label} className="flex items-center gap-3">
            <article className={`min-w-[190px] rounded-2xl border border-slate-200 border-l-4 p-4 shadow-sm ${stage.tone}`}>
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
