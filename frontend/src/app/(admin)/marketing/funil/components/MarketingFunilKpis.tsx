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
      label: 'Leads CRM CRC',
      value: formatNumber(summary?.crm.leadsCreatedCount || 0),
      helper: summary ? formatCompactCurrency(summary.crm.leadsCreatedValue || 0) : formatCompactCurrency(0),
      icon: BarChart3,
    },
    {
      label: 'Pipeline CRC',
      value: formatNumber(summary?.crm.pipelineItemsCount || 0),
      helper: summary ? formatCompactCurrency(summary.crm.pipelineItemsValue || 0) : formatCompactCurrency(0),
      icon: Workflow,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        const tone = kpiTone[index % kpiTone.length];
        return (
          <article
            key={item.label}
            className={`rounded-3xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${tone.border}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-2xl font-bold text-slate-900">{item.value}</p>
              </div>
              <div className={`rounded-2xl p-3 ${tone.chip}`}>
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{item.helper}</p>
          </article>
        );
      })}
    </div>
  );
}
