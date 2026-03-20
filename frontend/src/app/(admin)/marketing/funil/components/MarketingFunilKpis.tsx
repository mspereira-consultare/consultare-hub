import {
  BarChart3,
  Eye,
  MousePointerClick,
  Send,
  Target,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import type { MarketingFunilSummary } from './types';
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from './formatters';

type MarketingFunilKpisProps = {
  summary: MarketingFunilSummary | null;
};

const kpiTone = [
  { border: 'border-t-slate-700', chip: 'bg-slate-100 text-slate-700' },
  { border: 'border-t-sky-600', chip: 'bg-sky-50 text-sky-700' },
  { border: 'border-t-cyan-600', chip: 'bg-cyan-50 text-cyan-700' },
  { border: 'border-t-blue-600', chip: 'bg-blue-50 text-blue-700' },
  { border: 'border-t-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
  { border: 'border-t-violet-600', chip: 'bg-violet-50 text-violet-700' },
  { border: 'border-t-amber-600', chip: 'bg-amber-50 text-amber-700' },
  { border: 'border-t-rose-600', chip: 'bg-rose-50 text-rose-700' },
];

export function MarketingFunilKpis({ summary }: MarketingFunilKpisProps) {
  const getAppointmentCount = (statusId: number) =>
    summary?.appointments.byStatus.find((item) => item.statusId === statusId)?.count || 0;

  const items = [
    {
      label: 'Investimento',
      value: summary ? formatCurrency(summary.spend) : formatCurrency(0),
      helper: summary ? `${summary.campaigns} campanhas no período` : '0 campanhas no período',
      icon: Wallet,
    },
    {
      label: 'Impressões',
      value: formatNumber(summary?.impressions || 0),
      helper: summary ? `${formatPercent(summary.ctr)} de CTR` : `${formatPercent(0)} de CTR`,
      icon: Eye,
    },
    {
      label: 'Cliques',
      value: formatNumber(summary?.clicks || 0),
      helper: summary ? `${formatCurrency(summary.cpc)} de CPC` : `${formatCurrency(0)} de CPC`,
      icon: MousePointerClick,
    },
    {
      label: 'Sessões',
      value: formatNumber(summary?.sessions || 0),
      helper: summary ? `${formatNumber(summary.totalUsers)} usuários totais` : '0 usuários totais',
      icon: Users,
    },
    {
      label: 'Leads digitais',
      value: formatNumber(summary?.leads || 0),
      helper: summary ? `${formatCurrency(summary.cpl)} de CPL` : `${formatCurrency(0)} de CPL`,
      icon: Send,
    },
    {
      label: 'Conversões',
      value: formatNumber(summary?.conversions || 0, 0),
      helper: summary ? `${formatCurrency(summary.costPerConversion)} por conversão` : `${formatCurrency(0)} por conversão`,
      icon: Target,
    },
    {
      label: 'Agendamentos',
      value: formatNumber(summary?.appointments.totalValid || 0),
      helper: `Atendido: ${formatNumber(getAppointmentCount(3))} | Confirmado: ${formatNumber(getAppointmentCount(7))}`,
      icon: Workflow,
    },
    {
      label: 'Faturamento',
      value: formatCurrency(summary?.revenue.total || 0),
      helper: `Base: ${summary?.revenue.dateBasis || 'data de referência'}`,
      icon: BarChart3,
    },
    {
      label: 'Leads CRM CRC',
      value: formatNumber(summary?.crm.leadsCreatedCount || 0),
      helper: summary ? formatCompactCurrency(summary.crm.leadsCreatedValue || 0) : formatCompactCurrency(0),
      icon: Send,
    },
    {
      label: 'Pipeline CRC',
      value: formatNumber(summary?.crm.pipelineItemsCount || 0),
      helper: summary ? formatCompactCurrency(summary.crm.pipelineItemsValue || 0) : formatCompactCurrency(0),
      icon: Workflow,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((item, index) => {
        const Icon = item.icon;
        const tone = kpiTone[index % kpiTone.length];
        return (
          <article
            key={item.label}
            className={`rounded-xl border border-slate-200 border-t-[3px] bg-white px-4 py-3.5 shadow-sm ${tone.border}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                <p className="mt-2.5 text-[1.95rem] font-bold leading-none text-slate-900">{item.value}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${tone.chip}`}>
                <Icon size={16} />
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-slate-500">{item.helper}</p>
          </article>
        );
      })}
    </div>
  );
}
