'use client';

import { AlertTriangle, Loader2, X } from 'lucide-react';
import { pendingDataCodeDescriptionMap, pendingDataCodeLabelMap } from './formatters';

type PendingState = {
  pendingEmployeesCount: number;
  pendingCodes: string[];
  sampleEmployees: Array<{ employeeId: string | null; employeeName: string; employeeCpf: string | null }>;
} | null;

export function PayrollGenerateConfirmationModal({
  open,
  pending,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: PendingState;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-generate-confirmation-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-amber-200 bg-amber-50 p-2 text-amber-700">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 id="payroll-generate-confirmation-title" className="text-lg font-bold text-slate-900">
                Gerar folha com pendências cadastrais
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Existem {pending.pendingEmployeesCount} colaborador(es) elegíveis com informações pendentes. A folha será gerada parcialmente e a aprovação seguirá bloqueada até regularização.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar modal">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {pending.pendingCodes.map((code) => (
              <span key={code} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {pendingDataCodeLabelMap[code] || code}
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Os campos afetados ficarão em branco na prévia e no XLSX final.
            {pending.pendingCodes.length ? ` Pendências detectadas: ${pending.pendingCodes.map((code) => pendingDataCodeDescriptionMap[code] || code).join('; ')}.` : ''}
          </div>

          {pending.sampleEmployees.length ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Exemplos</div>
              <div className="space-y-2">
                {pending.sampleEmployees.map((sample, index) => (
                  <div key={`${sample.employeeId || sample.employeeCpf || sample.employeeName}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{sample.employeeName}</span>
                    {sample.employeeCpf ? <span className="text-slate-500"> · {sample.employeeCpf}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Gerar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
