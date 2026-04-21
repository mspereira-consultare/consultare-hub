'use client';

import { CircleAlert, CircleCheckBig, Landmark, ReceiptText } from 'lucide-react';
import type { PayrollPeriodSummary } from '@/lib/payroll/types';
import { formatMoney } from './formatters';

const cards = [
  { key: 'totalLines', title: 'Colaboradores na folha', helper: 'Linhas geradas na competência.', icon: ReceiptText, tone: 'slate' },
  { key: 'totalProvents', title: 'Proventos', helper: 'Soma de salário, insalubridade e ajustes positivos.', icon: Landmark, tone: 'emerald' },
  { key: 'totalDiscounts', title: 'Descontos', helper: 'Faltas, atrasos, VT, Totalpass e ajustes negativos.', icon: CircleAlert, tone: 'amber' },
  { key: 'totalNet', title: 'Líquido operacional', helper: 'Recorte atual da competência.', icon: CircleCheckBig, tone: 'blue' },
];

export function PayrollSummaryCards({ summary }: { summary: PayrollPeriodSummary | null }) {
  const data = summary || {
    totalLines: 0,
    totalNet: 0,
    totalDiscounts: 0,
    totalProvents: 0,
    importsCompleted: 0,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = card.key === 'totalLines' ? String(data.totalLines) : formatMoney((data as any)[card.key] || 0);
        const toneClass = card.tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/70'
          : card.tone === 'amber'
            ? 'border-amber-200 bg-amber-50/70'
            : card.tone === 'blue'
              ? 'border-blue-200 bg-blue-50/70'
              : 'border-slate-200 bg-white';

        return (
          <div key={card.key} className={`rounded-xl border ${toneClass} p-4 shadow-sm`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{card.title}</div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{card.helper}</div>
              </div>
              <div className="rounded-full border border-white/70 bg-white/90 p-3 text-slate-600 shadow-sm">
                <Icon size={16} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
