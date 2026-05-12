'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';

type Variant = 'info' | 'tip' | 'warning';

const variantMap: Record<
  Variant,
  {
    wrapper: string;
    icon: typeof Info;
    iconClassName: string;
    eyebrowClassName: string;
  }
> = {
  info: {
    wrapper: 'border-blue-100 bg-blue-50/70',
    icon: Info,
    iconClassName: 'text-blue-600',
    eyebrowClassName: 'text-blue-700',
  },
  tip: {
    wrapper: 'border-emerald-100 bg-emerald-50/70',
    icon: Lightbulb,
    iconClassName: 'text-emerald-600',
    eyebrowClassName: 'text-emerald-700',
  },
  warning: {
    wrapper: 'border-amber-100 bg-amber-50/70',
    icon: AlertTriangle,
    iconClassName: 'text-amber-600',
    eyebrowClassName: 'text-amber-700',
  },
};

export function ExecutiveDashboardHelpCallout({
  title,
  children,
  variant = 'info',
}: {
  title: string;
  children: ReactNode;
  variant?: Variant;
}) {
  const config = variantMap[variant];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border px-4 py-3 ${config.wrapper}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconClassName}`} />
        <div className="min-w-0">
          <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${config.eyebrowClassName}`}>{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{children}</div>
        </div>
      </div>
    </div>
  );
}
