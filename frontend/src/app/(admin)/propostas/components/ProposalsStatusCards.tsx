import { AlertCircle, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from './formatters';
import type { Summary } from './types';

type Props = {
  summary: Summary;
  percentageOfTotal: (value: number) => number;
  onOpenAwaitingBase: () => void;
};

export function ProposalsStatusCards({ summary, percentageOfTotal, onOpenAwaitingBase }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Status do funil (cliente)</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="bg-amber-50/70 border border-amber-100 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Aguardando aprovação do cliente</p>
              <div className="mt-1 text-xl font-semibold text-amber-900">{formatCurrency(summary.awaitingClientApprovalValue)}</div>
              <div className="mt-1 text-xs text-amber-800/80">
                {summary.awaitingClientApprovalQtd} propostas · {percentageOfTotal(summary.awaitingClientApprovalValue).toFixed(1)}% do valor
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAwaitingBase}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <ArrowDownToLine size={14} />
              Ver base
            </button>
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Aprovada pelo cliente</p>
          <div className="mt-1 text-xl font-semibold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 size={16} />
            {formatCurrency(summary.approvedByClientValue)}
          </div>
          <div className="mt-1 text-xs text-emerald-800/80">
            {summary.approvedByClientQtd} propostas · {percentageOfTotal(summary.approvedByClientValue).toFixed(1)}% do valor
          </div>
        </div>

        <div className="bg-rose-50/70 border border-rose-100 rounded-xl px-4 py-3 shadow-sm sm:col-span-2 xl:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Rejeitada pelo cliente</p>
          <div className="mt-1 text-xl font-semibold text-rose-900 flex items-center gap-2">
            <AlertCircle size={16} />
            {formatCurrency(summary.rejectedByClientValue)}
          </div>
          <div className="mt-1 text-xs text-rose-800/80">
            {summary.rejectedByClientQtd} propostas · {percentageOfTotal(summary.rejectedByClientValue).toFixed(1)}% do valor
          </div>
        </div>
      </div>
    </div>
  );
}
