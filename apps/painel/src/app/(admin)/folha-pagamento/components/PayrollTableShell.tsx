'use client';

import type { ReactNode } from 'react';
import type { PayrollDataSource } from '@/lib/payroll/types';
import { PayrollSectionHeader } from './PayrollSectionHeader';

export function PayrollTableShell({
  title,
  description,
  countLabel,
  sources,
  sourceNote,
  children,
}: {
  title: string;
  description: string;
  countLabel?: string;
  sources?: PayrollDataSource[];
  sourceNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PayrollSectionHeader
        title={title}
        description={description}
        countLabel={countLabel}
        sources={sources}
        sourceNote={sourceNote}
      />
      <div className="max-h-[68vh] overflow-auto">{children}</div>
    </section>
  );
}
