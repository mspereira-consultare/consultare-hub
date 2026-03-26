import {
  CalendarCheck2,
  ContactRound,
  MessageCircleMore,
  Send,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react';
import type { MarketingFunilSummary } from './types';
import { formatCurrency, formatNumber, formatPercent } from './formatters';
import { MarketingFunilMetricCard } from './MarketingFunilMetricCard';
import { buildOverviewTooltipSections } from './marketingFunilTooltipContent';

type MarketingFunilKpisProps = {
  summary: MarketingFunilSummary | null;
};

const kpiTone = [
  { border: 'border-t-slate-700', chip: 'bg-slate-100 text-slate-700' },
  { border: 'border-t-cyan-600', chip: 'bg-cyan-50 text-cyan-700' },
  { border: 'border-t-sky-600', chip: 'bg-sky-50 text-sky-700' },
  { border: 'border-t-blue-600', chip: 'bg-blue-50 text-blue-700' },
  { border: 'border-t-violet-600', chip: 'bg-violet-50 text-violet-700' },
  { border: 'border-t-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
  { border: 'border-t-amber-600', chip: 'bg-amber-50 text-amber-700' },
  { border: 'border-t-rose-600', chip: 'bg-rose-50 text-rose-700' },
];

export function MarketingFunilKpis({ summary }: MarketingFunilKpisProps) {
  const performance = summary?.performanceFunnel;
  const diagnostics = summary?.diagnostics;
  const operational = summary?.operationalContext;
  const tooltips = buildOverviewTooltipSections(summary);

  const items = [
    {
      label: 'Investimento',
      value: formatCurrency(performance?.googleSpend || 0),
      helper: summary ? `${summary.campaigns} campanhas no período` : '0 campanhas no período',
      icon: Wallet,
      tooltipSections: tooltips.investimento,
    },
    {
      label: 'Novos contatos Clinia (Google)',
      value: formatNumber(performance?.googleNewContacts || 0),
      helper: `${formatCurrency(performance?.costPerNewContact || 0)} por novo contato`,
      icon: Users,
      tooltipSections: tooltips.novosContatosCliniaGoogle,
    },
    {
      label: 'Contatos Clinia (Google)',
      value: formatNumber(performance?.googleContactsReceived || 0),
      helper: performance?.scopeLabel || 'Origem Google no Clinia Ads',
      icon: ContactRound,
      tooltipSections: tooltips.contatosCliniaGoogle,
    },
    {
      label: 'Agendamentos Clinia (Google)',
      value: formatNumber(performance?.googleAppointmentsConverted || 0),
      helper: `${formatCurrency(performance?.costPerAppointment || 0)} por agendamento`,
      icon: CalendarCheck2,
      tooltipSections: tooltips.agendamentosCliniaGoogle,
    },
    {
      label: 'Taxa de conversão',
      value: formatPercent(performance?.contactToAppointmentRate || 0),
      helper: 'Agendamentos Clinia / novos contatos',
      icon: TrendingUp,
      tooltipSections: tooltips.taxaConversao,
    },
    {
      label: 'Cliques em WhatsApp',
      value: formatNumber(diagnostics?.whatsappClicks || 0),
      helper: `${formatCurrency(diagnostics?.whatsappCostPerClick || 0)} por clique`,
      icon: Send,
      tooltipSections: tooltips.cliquesWhatsapp,
    },
    {
      label: 'Agendamentos válidos',
      value: formatNumber(operational?.appointmentsValid || 0),
      helper: `Confirmados/realizados: ${formatNumber(operational?.appointmentsConfirmedOrRealized || 0)}`,
      icon: MessageCircleMore,
      tooltipSections: tooltips.agendamentosValidos,
    },
    {
      label: 'Faturamento',
      value: formatCurrency(operational?.revenueTotal || 0),
      helper: 'Base: Faturamento Bruto Analítico',
      icon: WalletCards,
      tooltipSections: tooltips.faturamento,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const tone = kpiTone[index % kpiTone.length];
        return (
          <MarketingFunilMetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            helper={item.helper}
            icon={item.icon}
            borderClassName={tone.border}
            chipClassName={tone.chip}
            tooltipSections={item.tooltipSections}
          />
        );
      })}
    </div>
  );
}
