'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

const currency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type RepassesDivergenceBadgeProps = {
  hasDivergencia: boolean;
  divergenciaValue: number;
};

export function RepassesDivergenceBadge({
  hasDivergencia,
  divergenciaValue,
}: RepassesDivergenceBadgeProps) {
  if (!hasDivergencia) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 size={12} />
        Sem divergência
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
      title={`Diferença: ${currency(divergenciaValue)}`}
    >
      <AlertTriangle size={12} />
      {currency(divergenciaValue)}
    </span>
  );
}
