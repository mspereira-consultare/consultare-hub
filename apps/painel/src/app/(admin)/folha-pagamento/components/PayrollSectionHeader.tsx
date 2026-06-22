'use client';

import type { ReactNode } from 'react';
import type { PayrollDataSource } from '@/lib/payroll/types';
import { PayrollSourceBadge } from './PayrollSourceBadge';

export function PayrollSectionHeader({
  title,
  description,
  countLabel,
  sources = [],
  sourceNote,
  className = 'border-b border-slate-200 px-6 py-4',
}: {
  title: string;
  description: string;
  countLabel?: string;
  sources?: PayrollDataSource[];
  sourceNote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {countLabel ? (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {countLabel}
          </span>
        ) : null}
      </div>

      {sources.length || sourceNote ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {sources.length ? <span className="font-medium text-slate-500">Fontes:</span> : null}
          {sources.map((source) => (
            <PayrollSourceBadge key={source} source={source} />
          ))}
          {sourceNote ? <span>{sourceNote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
