import type { LucideIcon } from 'lucide-react';
import { MarketingFunilInfoTooltip, type MarketingFunilTooltipSection } from './MarketingFunilInfoTooltip';

type MarketingFunilMetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  borderClassName: string;
  chipClassName: string;
  tooltipSections: MarketingFunilTooltipSection[];
};

export function MarketingFunilMetricCard({
  label,
  value,
  helper,
  icon: Icon,
  borderClassName,
  chipClassName,
  tooltipSections,
}: MarketingFunilMetricCardProps) {
  return (
    <article className={`rounded-xl border border-slate-200 border-t-[3px] bg-white px-4 py-3.5 shadow-sm ${borderClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <MarketingFunilInfoTooltip
              label={`Entenda como calculamos ${label.toLowerCase()}`}
              sections={tooltipSections}
            />
          </div>
          <p className="mt-2.5 text-[1.95rem] font-bold leading-none text-slate-900">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${chipClassName}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="mt-2.5 text-[11px] text-slate-500">{helper}</p>
    </article>
  );
}
