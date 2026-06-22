'use client';

import type { PayrollDataSource } from '@/lib/payroll/types';

const sourceToneMap: Record<PayrollDataSource, string> = {
  SOLIDES: 'border-blue-200 bg-blue-50 text-blue-700',
  PAINEL: 'border-slate-200 bg-slate-100 text-slate-700',
  LEGADO: 'border-amber-200 bg-amber-50 text-amber-700',
};

const sourceLabelMap: Record<PayrollDataSource, string> = {
  SOLIDES: 'Sólides/Tangerino',
  PAINEL: 'Painel',
  LEGADO: 'Legado',
};

export const getPayrollSourceLabel = (source: PayrollDataSource) => sourceLabelMap[source];

export function PayrollSourceBadge({ source }: { source: PayrollDataSource }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${sourceToneMap[source]}`}>
      {sourceLabelMap[source]}
    </span>
  );
}
