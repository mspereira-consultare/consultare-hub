'use client';

import { Loader2, X } from 'lucide-react';

export function PayrollNewPeriodModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { monthRef: string; minWageAmount: string; lateToleranceMinutes: string; vtDiscountCapPercent: string }) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Nova competência</h2>
            <p className="mt-1 text-sm text-slate-500">A competência define o período operacional automático de 21 a 20.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={16} /></button>
        </div>
        <div className="space-y-4 px-6 py-6">
          <Field label="Competência (mês)"><input id="payroll-new-month" type="month" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Salário mínimo"><input id="payroll-new-min-wage" defaultValue="1518" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="Tolerância de atraso (min)"><input id="payroll-new-late" defaultValue="15" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="Teto de VT (%)"><input id="payroll-new-vt-cap" defaultValue="6" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancelar</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSubmit({
              monthRef: (document.getElementById('payroll-new-month') as HTMLInputElement | null)?.value || '',
              minWageAmount: (document.getElementById('payroll-new-min-wage') as HTMLInputElement | null)?.value || '',
              lateToleranceMinutes: (document.getElementById('payroll-new-late') as HTMLInputElement | null)?.value || '',
              vtDiscountCapPercent: (document.getElementById('payroll-new-vt-cap') as HTMLInputElement | null)?.value || '',
            })}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Criar competência
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
