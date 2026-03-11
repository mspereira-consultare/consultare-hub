'use client';

import type {
  RepasseConsolidacaoLineMarkColor,
  RepasseConsolidacaoMarkLegend,
} from '@/lib/repasses/types';

type DetailRow = {
  sourceRowHash: string;
  detailRepasseValue: number;
};

type ManualMarkingPanelProps = {
  rows: DetailRow[];
  marks: Record<string, RepasseConsolidacaoLineMarkColor | null>;
  legend: RepasseConsolidacaoMarkLegend;
};

const currency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const colorClass: Record<RepasseConsolidacaoLineMarkColor, string> = {
  green: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  yellow: 'border-amber-300 bg-amber-50 text-amber-700',
  red: 'border-rose-300 bg-rose-50 text-rose-700',
};

export function ManualMarkingPanel({ rows, marks, legend }: ManualMarkingPanelProps) {
  const summary = rows.reduce(
    (acc, row) => {
      const color = marks[row.sourceRowHash];
      if (!color) return acc;
      acc[color].count += 1;
      acc[color].value += Number(row.detailRepasseValue || 0);
      return acc;
    },
    {
      green: { count: 0, value: 0 },
      yellow: { count: 0, value: 0 },
      red: { count: 0, value: 0 },
    }
  );

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        Controle interno manual
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        As marcações por cor são apenas para conferência interna e ficam salvas por usuário.
      </p>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(Object.keys(summary) as Array<RepasseConsolidacaoLineMarkColor>).map((key) => (
          <div key={key} className={`rounded border px-2 py-1.5 text-xs ${colorClass[key]}`}>
            <div className="font-semibold">{legend[key]}</div>
            <div>Itens: {summary[key].count}</div>
            <div>Repasse: {currency(summary[key].value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
