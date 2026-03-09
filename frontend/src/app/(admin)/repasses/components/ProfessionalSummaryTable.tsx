'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Loader2, MessageSquareText, Search, Wallet } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

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
  lastPdfAt: string | null;
  lastPdfArtifactId: string | null;
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
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onApplySearch: () => void;
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
  searchDraft,
  onSearchDraftChange,
  onApplySearch,
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
      <header className="flex flex-col gap-2 border-b bg-slate-50 px-3 py-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Profissionais (visão consolidada)
          </h3>
          <div className="text-[11px] text-slate-500">
            {start}-{end} de {total} | Selecionados: {selectedCount}
          </div>
        </div>
        <div className="w-full max-w-[360px]">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Busca na tabela
          </label>
          <div className="flex h-9 items-center gap-2 rounded-lg border bg-white px-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={searchDraft}
              onChange={(e) => onSearchDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onApplySearch();
              }}
              placeholder="Buscar por profissional"
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={onApplySearch}
              className="rounded border px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              Buscar
            </button>
          </div>
        </div>
      </header>

      <div className="max-h-[760px] overflow-auto">
        <table className="w-full min-w-[1160px] text-xs">
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
              <th className="px-2 py-2 text-left">Último processamento</th>
              <th className="w-[110px] px-2 py-2 text-center">Indicadores</th>
              <th className="px-2 py-2 text-left">Relatório</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando profissionais...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                  Nenhum profissional encontrado para os filtros.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.professionalId}
                  className="border-t text-slate-700 hover:bg-slate-50"
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
                      title="Abrir detalhes"
                    >
                      {item.professionalName}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={item.status} />
                    {item.status === 'ERROR' && item.errorMessage ? (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-700" title={item.errorMessage}>
                        <AlertCircle size={12} />
                        <span className="max-w-[220px] truncate">{item.errorMessage}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.rowsCount}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.totalValue)}</td>
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
                  <td className="px-2 py-1.5">
                    {item.lastPdfArtifactId ? (
                      <div className="inline-flex flex-col gap-1">
                        <a
                          href={`/api/admin/repasses/artifacts/${encodeURIComponent(
                            item.lastPdfArtifactId
                          )}/download?disposition=inline`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#17407E] hover:underline"
                        >
                          Visualizar
                        </a>
                        <span className="text-[10px] text-slate-500">{toBrDateTime(item.lastPdfAt)}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">-</span>
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
