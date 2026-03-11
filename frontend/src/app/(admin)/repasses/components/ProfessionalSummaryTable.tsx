'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Loader2, MessageSquareText, Wallet } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { RepassesComparisonColumns } from './RepassesComparisonColumns';
import { RepassesDivergenceBadge } from './RepassesDivergenceBadge';

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'SKIPPED' | 'ERROR' | 'NOT_PROCESSED';
  rowsCount: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  repasseTotalConsolidadoTabela: number;
  repasseTotalConsolidadoAConferir: number;
  hasDivergencia: boolean;
  divergenciaValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  internalNote: string | null;
  paymentMinimumText: string | null;
};

type ProfessionalSummaryTableProps = {
  items: ProfessionalSummary[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
  selectedIds: Set<string>;
  selectedCount: number;
  onToggleRow: (professionalId: string, checked: boolean) => void;
  onToggleVisible: (professionalIds: string[], checked: boolean) => void;
  onOpenDetails: (item: ProfessionalSummary) => void;
};

const currency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toBrDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR');
};

export function ProfessionalSummaryTable({
  items,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  selectedIds,
  selectedCount,
  onToggleRow,
  onToggleVisible,
  onOpenDetails,
}: ProfessionalSummaryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const visibleIds = useMemo(() => items.map((item) => item.professionalId), [items]);
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleChecked = visibleIds.some((id) => selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = !allVisibleChecked && someVisibleChecked;
  }, [allVisibleChecked, someVisibleChecked]);

  return (
    <section className="rounded-xl border bg-white">
      <header className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Profissionais (conferência de consolidação)
          </h3>
          <div className="text-[11px] text-slate-500">
            {start}-{end} de {total} | Selecionados: {selectedCount}
          </div>
        </div>
      </header>

      <div className="max-h-[860px] overflow-auto">
        <table className="w-full min-w-[1800px] text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-2 py-2 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => onToggleVisible(visibleIds, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-2 py-2 text-left">Profissional</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-right">Atendimentos</th>
              <th className="px-2 py-2 text-right">Total repasse</th>
              <th className="px-2 py-2 text-right">Cons. qtd</th>
              <th className="px-2 py-2 text-right">Cons. valor</th>
              <th className="px-2 py-2 text-right">Não cons. qtd</th>
              <th className="px-2 py-2 text-right">Não cons. valor</th>
              <th className="px-2 py-2 text-right">Não recebido</th>
              <th className="px-2 py-2 text-left">Divergência</th>
              <th className="px-2 py-2 text-left">Último processamento</th>
              <th className="w-[100px] px-2 py-2 text-center">Indicadores</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="px-2 py-6 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando profissionais...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-2 py-6 text-center text-slate-500">
                  Nenhum profissional encontrado para os filtros.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.professionalId}
                  className={`border-t text-slate-700 hover:bg-slate-50 ${
                    item.hasDivergencia ? 'bg-rose-50/40' : ''
                  }`}
                  onDoubleClick={() => onOpenDetails(item)}
                  title="Duplo clique para abrir detalhes"
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.professionalId)}
                      onChange={(e) => onToggleRow(item.professionalId, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-1.5" title={item.professionalName}>
                    <button
                      type="button"
                      onClick={() => onOpenDetails(item)}
                      className="truncate text-left font-semibold text-[#17407E] hover:underline"
                    >
                      {item.professionalName}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={item.status} />
                    {item.status === 'ERROR' && item.errorMessage ? (
                      <div
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-700"
                        title={item.errorMessage}
                      >
                        <AlertCircle size={12} />
                        <span className="max-w-[180px] truncate">{item.errorMessage}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.rowsCount}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.totalValue)}</td>
                  <RepassesComparisonColumns
                    consolidadoQty={item.consolidadoQty}
                    consolidadoValue={item.consolidadoValue}
                    naoConsolidadoQty={item.naoConsolidadoQty}
                    naoConsolidadoValue={item.naoConsolidadoValue}
                  />
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {item.naoRecebidoQty} ({currency(item.naoRecebidoValue)})
                  </td>
                  <td className="px-2 py-1.5">
                    <RepassesDivergenceBadge
                      hasDivergencia={item.hasDivergencia}
                      divergenciaValue={item.divergenciaValue}
                    />
                  </td>
                  <td className="px-2 py-1.5">{toBrDateTime(item.lastProcessedAt)}</td>
                  <td className="px-2 py-1.5 text-center">
                    {item.note || item.paymentMinimumText ? (
                      <div className="inline-flex items-center justify-center gap-1">
                        {item.note ? (
                          <span
                            className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-50 p-1 text-amber-700"
                            title={item.note}
                          >
                            <MessageSquareText size={14} />
                          </span>
                        ) : null}
                        {item.paymentMinimumText ? (
                          <span
                            className="inline-flex items-center justify-center rounded-md border border-sky-300 bg-sky-50 p-1 text-sky-700"
                            title={item.paymentMinimumText}
                          >
                            <Wallet size={14} />
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t px-3 py-2 text-xs text-slate-600">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </footer>
    </section>
  );
}
