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
  'from-slate-900 via-slate-800 to-slate-700 text-white',
  'from-sky-100 via-white to-sky-50 text-sky-900',
  'from-cyan-100 via-white to-cyan-50 text-cyan-900',
  'from-blue-100 via-white to-blue-50 text-blue-900',
  'from-emerald-100 via-white to-emerald-50 text-emerald-900',
  'from-violet-100 via-white to-violet-50 text-violet-900',
  'from-amber-100 via-white to-amber-50 text-amber-900',
  'from-rose-100 via-white to-rose-50 text-rose-900',
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
        return (
          <article
            key={item.label}
            className={`rounded-3xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm ${kpiTone[index % kpiTone.length]}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">{item.label}</p>
                <p className="mt-3 text-2xl font-bold">{item.value}</p>
              </div>
              <div className="rounded-2xl bg-white/20 p-3">
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-3 text-xs opacity-80">{item.helper}</p>
          </article>
        );
      })}
    </div>
  );
}
