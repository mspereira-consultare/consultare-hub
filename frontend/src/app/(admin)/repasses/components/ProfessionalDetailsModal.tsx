'use client';

import { Loader2, MessageSquareText, X } from 'lucide-react';

type RepasseLine = {
  dataExec: string;
  paciente: string;
  descricao: string;
  funcao: string;
  convenio: string;
  repasseValue: number;
};

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'ERROR' | 'NOT_PROCESSED';
  rowsCount: number;
  totalValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  paymentMinimumText: string | null;
};

type ProfessionalDetailsModalProps = {
  open: boolean;
  item: ProfessionalSummary | null;
  periodRef: string;
  rows: RepasseLine[];
  loadingRows: boolean;
  rowsError: string;
  noteValue: string;
  internalNoteValue: string;
  canEdit: boolean;
  savingNote: boolean;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onInternalNoteChange: (value: string) => void;
  onSaveNote: () => void;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toBrDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export function ProfessionalDetailsModal({
  open,
  item,
  periodRef,
  rows,
  loadingRows,
  rowsError,
  noteValue,
  internalNoteValue,
  canEdit,
  savingNote,
  onClose,
  onNoteChange,
  onInternalNoteChange,
  onSaveNote,
}: ProfessionalDetailsModalProps) {
  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[1240px] rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Detalhes do profissional</h3>
            <p className="text-xs text-slate-500">
              {item.professionalName} | Período: {periodRef}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-2 py-1 text-xs text-slate-700"
          >
            <span className="inline-flex items-center gap-1">
              <X size={13} />
              Fechar
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b bg-slate-50 px-4 py-3 md:grid-cols-4">
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Atendimentos</div>
            <div className="text-base font-bold text-slate-800">{item.rowsCount}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total repasse</div>
            <div className="text-base font-bold text-slate-800">{formatCurrency(item.totalValue)}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Status</div>
            <div className="text-sm font-semibold text-slate-700">{item.status}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Último processamento</div>
            <div className="text-sm font-semibold text-slate-700">{item.lastProcessedAt || '-'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[1fr_380px]">
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Atendimentos no período
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 text-left">Data Exec.</th>
                    <th className="px-2 py-2 text-left">Paciente</th>
                    <th className="px-2 py-2 text-left">Descrição</th>
                    <th className="px-2 py-2 text-left">Função</th>
                    <th className="px-2 py-2 text-left">Convênio</th>
                    <th className="px-2 py-2 text-right">Repasse</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-8 text-center text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" />
                          Carregando atendimentos...
                        </span>
                      </td>
                    </tr>
                  ) : rowsError ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-8 text-center text-rose-700">
                        {rowsError}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-8 text-center text-slate-500">
                        Sem atendimentos para este profissional no período.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={`${row.dataExec}-${row.paciente}-${idx}`} className="border-t text-slate-700">
                        <td className="px-2 py-1.5">{toBrDate(row.dataExec)}</td>
                        <td className="px-2 py-1.5">{row.paciente || '-'}</td>
                        <td className="px-2 py-1.5">{row.descricao || '-'}</td>
                        <td className="px-2 py-1.5">{row.funcao || '-'}</td>
                        <td className="px-2 py-1.5">{row.convenio || '-'}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(row.repasseValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <MessageSquareText size={14} />
                Observação do relatório
              </div>
              <textarea
                value={noteValue}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Este texto será incluído no PDF do repasse."
                className="min-h-[130px] w-full resize-y rounded border bg-white px-3 py-2 text-sm outline-none"
                disabled={!canEdit}
              />
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Observação interna
              </div>
              <textarea
                value={internalNoteValue}
                onChange={(e) => onInternalNoteChange(e.target.value)}
                placeholder="Anotação interna do time (não vai para o PDF)."
                className="min-h-[110px] w-full resize-y rounded border bg-white px-3 py-2 text-sm outline-none"
                disabled={!canEdit}
              />
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Pagamento mínimo (cadastro)
              </div>
              <div className="rounded border bg-white px-3 py-2 text-sm text-slate-700">
                {item.paymentMinimumText || '-'}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveNote}
                disabled={!canEdit || savingNote}
                className="inline-flex items-center gap-2 rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {savingNote ? <Loader2 size={14} className="animate-spin" /> : null}
                Salvar observações
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
