'use client';

import { CircleHelp } from 'lucide-react';

export function PayrollColumnTooltip({
  label,
  description,
  source,
  formula,
  align = 'left',
}: {
  label: string;
  description: string;
  source?: string;
  formula?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const tooltipPositionClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0';

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      <span className="group relative inline-flex items-center">
        <CircleHelp size={12} className="text-slate-400 transition-colors group-hover:text-slate-600" />
        <span
          className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case tracking-normal text-slate-600 shadow-lg group-hover:block ${tooltipPositionClass}`}
        >
          <strong className="block text-slate-800">{label}</strong>
          <span className="mt-1 block">{description}</span>
          {source ? <span className="mt-1 block"><strong>Fonte:</strong> {source}</span> : null}
          {formula ? <span className="mt-1 block"><strong>Cálculo:</strong> {formula}</span> : null}
        </span>
      </span>
    </span>
  );
}
