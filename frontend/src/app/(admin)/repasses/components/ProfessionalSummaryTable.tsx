'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Eye, Loader2, MessageSquareText, Wallet } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { RepassesDivergenceBadge } from './RepassesDivergenceBadge';

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'SKIPPED' | 'ERROR' | 'NOT_PROCESSED';
  execucaoQty: number;
  execucaoValue: number;
  execucaoPending: boolean;
  producaoQty: number;
  producaoValue: number;
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
  repasseFinalValue: number;
  produtividadeValue: number;
  percentualProdutividadeValue: number;
  totalFinalValue: number;
  hasRepasseFinalOverride: boolean;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  internalNote: string | null;
  paymentMinimumText: string | null;
  lastPdfAt: string | null;
  lastPdfArtifactId: string | null;
};

type SaveFinancialPatch = {
  repasseFinalValue?: number | null;
  produtividadeValue?: number | null;
};

type ProfessionalSummaryTableProps = {
  items: ProfessionalSummary[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canEdit: boolean;
  onPageChange: (next: number) => void;
  selectedIds: Set<string>;
  selectedCount: number;
  onToggleRow: (professionalId: string, checked: boolean) => void;
  onToggleVisible: (professionalIds: string[], checked: boolean) => void;
  onOpenDetails: (item: ProfessionalSummary) => void;
  onSaveFinancialInput: (
    professionalId: string,
    patch: SaveFinancialPatch
  ) => Promise<{ ok: boolean; error?: string }>;
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
  const dt = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('pt-BR');
};

const formatMoneyInput = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseMoneyInput = (raw: string): number | null => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error('Valor invalido');
  return Math.round(parsed * 100) / 100;
};

type EditableMoneyCellProps = {
  value: number | null | undefined;
  disabled: boolean;
  title: string;
  placeholder?: string;
  onCommit: (value: number | null) => Promise<{ ok: boolean; error?: string }>;
};

function EditableMoneyCell({
  value,
  disabled,
  title,
  placeholder = 'padrao',
  onCommit,
}: EditableMoneyCellProps) {
  const [draft, setDraft] = useState(formatMoneyInput(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatMoneyInput(value));
  }, [value]);

  const commit = async () => {
    if (disabled || saving) return;

    let next: number | null;
    try {
      next = parseMoneyInput(draft);
      setError(null);
    } catch {
      setError('Valor invalido');
      return;
    }

    const current = value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100;
    if (current === next) {
      setDraft(formatMoneyInput(next));
      return;
    }

    setSaving(true);
    const result = await onCommit(next);
    setSaving(false);
    if (!result.ok) {
      setError(result.error || 'Falha ao salvar');
      return;
    }

    setError(null);
    setDraft(formatMoneyInput(next));
  };

  return (
    <div className="space-y-1">
      <input
        value={draft}
        disabled={disabled || saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        title={title}
        className={`h-8 w-[120px] rounded border px-2 text-right text-xs tabular-nums outline-none ${
          error ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
        }`}
      />
      {saving ? <div className="text-[10px] text-slate-500">salvando...</div> : null}
      {error ? <div className="text-[10px] text-rose-600">{error}</div> : null}
    </div>
  );
}

export function ProfessionalSummaryTable({
  items,
  loading,
  page,
  pageSize,
  total,
  canEdit,
  onPageChange,
  selectedIds,
  selectedCount,
  onToggleRow,
  onToggleVisible,
  onOpenDetails,
  onSaveFinancialInput,
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
            Profissionais (conferencia de fechamento)
          </h3>
          <div className="text-[11px] text-slate-500">
            {start}-{end} de {total} | Selecionados: {selectedCount}
          </div>
        </div>
      </header>

      <div className="max-h-[860px] overflow-auto">
        <table className="w-full min-w-[2800px] text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th rowSpan={2} className="w-10 px-2 py-2 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => onToggleVisible(visibleIds, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th rowSpan={2} className="px-2 py-2 text-left">Profissional</th>
              <th rowSpan={2} className="px-2 py-2 text-left">Status</th>

              <th colSpan={2} className="border-l px-2 py-2 text-center">Execucao</th>
              <th colSpan={2} className="border-l px-2 py-2 text-center">Producao (Feegow)</th>
              <th colSpan={6} className="border-l px-2 py-2 text-center">Consolidacao (A conferir)</th>
              <th colSpan={4} className="border-l px-2 py-2 text-center">Calculo final</th>
              <th colSpan={4} className="border-l px-2 py-2 text-center">Controle</th>
            </tr>
            <tr>
              <th className="border-l px-2 py-2 text-right">Qtd</th>
              <th className="px-2 py-2 text-right">Valor</th>

              <th className="border-l px-2 py-2 text-right">Atend.</th>
              <th className="px-2 py-2 text-right">Valor</th>

              <th className="border-l px-2 py-2 text-right">Cons. qtd</th>
              <th className="px-2 py-2 text-right">Cons. valor</th>
              <th className="px-2 py-2 text-right">Nao cons. qtd</th>
              <th className="px-2 py-2 text-right">Nao cons. valor</th>
              <th className="px-2 py-2 text-right">Nao receb. qtd</th>
              <th className="px-2 py-2 text-right">Nao receb. valor</th>

              <th className="border-l px-2 py-2 text-right">Repasse final</th>
              <th className="px-2 py-2 text-right">Produtividade</th>
              <th className="px-2 py-2 text-right">5% produt.</th>
              <th className="px-2 py-2 text-right">Total</th>

              <th className="border-l px-2 py-2 text-left">Divergencia</th>
              <th className="px-2 py-2 text-left">Ultimo proc.</th>
              <th className="px-2 py-2 text-left">PDF</th>
              <th className="w-[100px] px-2 py-2 text-center">Indicadores</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={21} className="px-2 py-6 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando profissionais...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={21} className="px-2 py-6 text-center text-slate-500">
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
                  <td className="max-w-[320px] truncate px-2 py-1.5" title={item.professionalName}>
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

                  <td className="border-l px-2 py-1.5 text-right tabular-nums">
                    {item.execucaoPending ? 'N/D' : item.execucaoQty}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {item.execucaoPending ? 'N/D' : currency(item.execucaoValue)}
                  </td>

                  <td className="border-l px-2 py-1.5 text-right tabular-nums">{item.producaoQty}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.producaoValue)}</td>

                  <td className="border-l px-2 py-1.5 text-right tabular-nums">{item.consolidadoQty}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.consolidadoValue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.naoConsolidadoQty}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.naoConsolidadoValue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.naoRecebidoQty}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.naoRecebidoValue)}</td>

                  <td className="border-l px-2 py-1.5 text-right">
                    <EditableMoneyCell
                      value={item.hasRepasseFinalOverride ? item.repasseFinalValue : null}
                      disabled={!canEdit}
                      title={item.hasRepasseFinalOverride ? 'Valor manual' : 'Usando padrão da produção Feegow'}
                      placeholder={formatMoneyInput(item.producaoValue)}
                      onCommit={async (next) =>
                        onSaveFinancialInput(item.professionalId, {
                          repasseFinalValue: next,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditableMoneyCell
                      value={item.produtividadeValue}
                      disabled={!canEdit}
                      title="Produtividade manual"
                      placeholder="0,00"
                      onCommit={async (next) =>
                        onSaveFinancialInput(item.professionalId, {
                          produtividadeValue: next,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {currency(item.percentualProdutividadeValue)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                    {currency(item.totalFinalValue)}
                  </td>

                  <td className="border-l px-2 py-1.5">
                    <RepassesDivergenceBadge
                      hasDivergencia={item.hasDivergencia}
                      divergenciaValue={item.divergenciaValue}
                    />
                  </td>
                  <td className="px-2 py-1.5">{toBrDateTime(item.lastProcessedAt)}</td>
                  <td className="px-2 py-1.5">
                    {item.lastPdfArtifactId ? (
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2">
                          <a
                            href={`/api/admin/repasses/artifacts/${encodeURIComponent(
                              item.lastPdfArtifactId
                            )}/download?disposition=inline`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                          >
                            <Eye size={13} /> Visualizar
                          </a>
                          <a
                            href={`/api/admin/repasses/artifacts/${encodeURIComponent(item.lastPdfArtifactId)}/download`}
                            className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                          >
                            <Download size={13} /> Baixar
                          </a>
                        </div>
                        <div className="text-[10px] text-slate-500">{toBrDateTime(item.lastPdfAt)}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
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
          Pagina {page} de {totalPages}
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
            Proxima
          </button>
        </div>
      </footer>
    </section>
  );
}
