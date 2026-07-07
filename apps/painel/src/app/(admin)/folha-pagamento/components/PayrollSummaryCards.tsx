'use client';

import { CircleAlert, CircleCheckBig, Landmark, ReceiptText } from 'lucide-react';
import type { PayrollEligibilitySummary, PayrollPeriodSummary } from '@/lib/payroll/types';
import { formatMoney } from './formatters';

const cards = [
  { key: 'totalLines', title: 'Elegíveis para a folha', helper: 'Base elegível do fechamento mensal.', icon: ReceiptText, tone: 'slate' },
  { key: 'totalProvents', title: 'Proventos', helper: 'Soma de salário, insalubridade e ajustes positivos.', icon: Landmark, tone: 'emerald' },
  { key: 'totalDiscounts', title: 'Descontos', helper: 'Faltas, atrasos, VT, Totalpass e ajustes negativos.', icon: CircleAlert, tone: 'amber' },
  { key: 'totalNet', title: 'Líquido operacional', helper: 'Recorte atual da competência.', icon: CircleCheckBig, tone: 'blue' },
];

export function PayrollSummaryCards({
  summary,
  eligibilitySummary,
}: {
  summary: PayrollPeriodSummary | null;
  eligibilitySummary: PayrollEligibilitySummary | null;
}) {
  const data = summary || {
    totalLines: 0,
    totalNet: 0,
    totalDiscounts: 0,
    totalProvents: 0,
    importsCompleted: 0,
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = card.key === 'totalLines'
          ? String(eligibilitySummary?.totalEligibleEmployees ?? data.totalLines)
          : formatMoney((data as any)[card.key] || 0);
        const helper = card.key === 'totalLines'
          ? eligibilitySummary
            ? `${eligibilitySummary.totalOperationalEmployees} colaborador(es) operacionais. ${eligibilitySummary.excludedPjEmployees} PJ fora da folha.`
            : 'Base elegível do fechamento mensal.'
          : card.helper;
        const toneClass = card.tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/70'
          : card.tone === 'amber'
            ? 'border-amber-200 bg-amber-50/70'
            : card.tone === 'blue'
              ? 'border-blue-200 bg-blue-50/70'
              : 'border-slate-200 bg-white';

        return (
          <div key={card.key} className={`rounded-xl border ${toneClass} px-4 py-3 shadow-sm`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{card.title}</div>
                <div className="mt-2 text-[1.9rem] font-bold leading-none text-slate-900">{value}</div>
                <div className="mt-1 text-[12px] text-slate-500">{helper}</div>
              </div>
              <div className="rounded-full border border-white/70 bg-white/90 p-2.5 text-slate-600 shadow-sm">
                <Icon size={15} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
