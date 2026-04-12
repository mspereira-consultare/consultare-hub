'use client';

import { Loader2, X } from 'lucide-react';
import type { PayrollLine, PayrollLineDetail } from '@/lib/payroll/types';
import { formatDateBr, formatMoney } from './formatters';

type DraftState = {
  adjustmentsAmount: string;
  adjustmentsNotes: string;
  payrollNotes: string;
  lineStatus: string;
};

export function PayrollLineDrawer({
  line,
  detail,
  open,
  canEdit,
  saving,
  onClose,
  onSave,
}: {
  line: PayrollLine | null;
  detail: PayrollLineDetail | null;
  open: boolean;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: DraftState) => void;
}) {
  if (!open || !line) return null;

  const current = detail?.line || line;
  const draft: DraftState = {
    adjustmentsAmount: String(current.adjustmentsAmount ?? 0),
    adjustmentsNotes: current.adjustmentsNotes || '',
    payrollNotes: current.payrollNotes || '',
    lineStatus: current.lineStatus,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <div className="h-full w-full max-w-3xl overflow-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{line.employeeName}</h2>
            <p className="mt-1 text-sm text-slate-500">Memória de cálculo, ponto do período e ajustes da folha.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className="grid gap-4 md:grid-cols-3">
            <Stat label="Salário base" value={formatMoney(current.salaryBase)} />
            <Stat label="Proventos" value={formatMoney(current.totalProvents)} />
            <Stat label="Líquido operacional" value={formatMoney(current.netOperational)} />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card title="Ajustes manuais">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Valor do ajuste</label>
                  <input defaultValue={draft.adjustmentsAmount} disabled={!canEdit || saving} id="payroll-adjustments-amount" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Observações do ajuste</label>
                  <textarea defaultValue={draft.adjustmentsNotes} disabled={!canEdit || saving} id="payroll-adjustments-notes" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Observações da folha</label>
                  <textarea defaultValue={draft.payrollNotes} disabled={!canEdit || saving} id="payroll-notes" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Status da linha</label>
                  <select defaultValue={draft.lineStatus} disabled={!canEdit || saving} id="payroll-line-status" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                    <option value="RASCUNHO">Rascunho</option>
                    <option value="EM_REVISAO">Em revisão</option>
                    <option value="APROVADO">Aprovado</option>
                  </select>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const amount = (document.getElementById('payroll-adjustments-amount') as HTMLInputElement | null)?.value || '';
                      const notes = (document.getElementById('payroll-adjustments-notes') as HTMLTextAreaElement | null)?.value || '';
                      const payrollNotes = (document.getElementById('payroll-notes') as HTMLTextAreaElement | null)?.value || '';
                      const lineStatus = (document.getElementById('payroll-line-status') as HTMLSelectElement | null)?.value || 'RASCUNHO';
                      onSave({ adjustmentsAmount: amount, adjustmentsNotes: notes, payrollNotes, lineStatus });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    Salvar ajustes
                  </button>
                ) : null}
              </div>
            </Card>
            <Card title="Comparação com a base do RH">
              {detail?.differences?.length ? (
                <div className="space-y-2">
                  {detail.differences.map((item, index) => (
                    <div key={`${item.field}-${index}`} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <strong>{item.field}:</strong> sistema {item.systemValue} | base {item.referenceValue}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Sem divergências no recorte comparado.</div>
              )}
            </Card>
          </section>

          <Card title="Ponto do período">
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Marcações</th>
                    <th className="px-3 py-2 text-center">Trabalhado</th>
                    <th className="px-3 py-2 text-center">Atraso</th>
                    <th className="px-3 py-2 text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.pointDays || []).map((day) => (
                    <tr key={day.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{formatDateBr(day.pointDate)}</td>
                      <td className="px-3 py-2">{day.marks.join(' · ') || '-'}</td>
                      <td className="px-3 py-2 text-center">{day.workedMinutes} min</td>
                      <td className="px-3 py-2 text-center">{day.lateMinutes} min</td>
                      <td className="px-3 py-2 text-slate-600">{day.justificationText || (day.absenceFlag ? 'Falta apontada no relatório' : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Memória de cálculo">
            <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{detail?.line?.calculationMemoryJson || current.calculationMemoryJson || '{}'}</pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
