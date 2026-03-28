'use client';

import { Download, FilterX, Loader2, Search } from 'lucide-react';
import { useMemo } from 'react';
import { AWAITING_CLIENT_APPROVAL_STATUS } from '@/lib/proposals/constants';
import { ProposalsDetailTable } from './ProposalsDetailTable';
import type { ProposalDetailResponse, ProposalDetailRow, ProposalFollowupOptions } from './types';

type Props = {
  detailData: ProposalDetailResponse;
  followupOptions: ProposalFollowupOptions;
  availableStatuses: string[];
  selectedStatus: string;
  detailStatus: string;
  detailSearch: string;
  loading: boolean;
  exporting: boolean;
  canEdit: boolean;
  onChangeDetailStatus: (value: string) => void;
  onChangeDetailSearch: (value: string) => void;
  onClearDetailFilters: () => void;
  onExport: () => void;
  onChangePage: (page: number) => void;
  onRowSaved: (row: ProposalDetailRow) => void;
};

export function ProposalsDetailSection({
  detailData,
  followupOptions,
  availableStatuses,
  selectedStatus,
  detailStatus,
  detailSearch,
  loading,
  exporting,
  canEdit,
  onChangeDetailStatus,
  onChangeDetailSearch,
  onClearDetailFilters,
  onExport,
  onChangePage,
  onRowSaved,
}: Props) {
  const detailStatuses = useMemo(
    () => Array.from(new Set(availableStatuses)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [availableStatuses],
  );
  const globalStatusLocked = selectedStatus !== 'all';
  const hasActiveLocalFilters = Boolean(detailSearch) || (!globalStatusLocked && detailStatus !== AWAITING_CLIENT_APPROVAL_STATUS);
  const fromRow = detailData.totalRows === 0 ? 0 : (detailData.page - 1) * detailData.pageSize + 1;
  const toRow = Math.min(detailData.totalRows, detailData.page * detailData.pageSize);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm" id="base-detalhada-propostas">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Base de trabalho</h2>
          <p className="text-sm text-slate-500 mt-1">
            Fila operacional para follow-up da equipe, com conversão, responsável e histórico da última edição.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
              Status aplicado: {detailData.detailStatusApplied}
            </span>
            <span>
              Exibindo {fromRow}-{toRow} de {detailData.totalRows} registro(s)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar XLSX
          </button>
        </div>
      </div>

      <div className="p-5 border-b border-slate-100 bg-slate-50/70">
        <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_160px] gap-3">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Status da base</label>
            <select
              value={detailStatus}
              onChange={(e) => onChangeDetailStatus(e.target.value)}
              disabled={globalStatusLocked}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            >
              {detailStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {globalStatusLocked
                ? 'O status detalhado está seguindo o filtro global da página.'
                : 'Quando o filtro global estiver em “Todos”, a base começa em “Aguardando aprovação do cliente”.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Buscar na base</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={detailSearch}
                onChange={(e) => onChangeDetailSearch(e.target.value)}
                placeholder="Paciente, telefone, procedimento, unidade ou profissional"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={onClearDetailFilters}
              disabled={!hasActiveLocalFilters}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FilterX size={14} />
              Limpar base
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <p className="text-sm">Carregando base de trabalho...</p>
          </div>
        ) : detailData.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            Nenhum registro encontrado para o recorte atual.
          </div>
        ) : (
          <>
            <ProposalsDetailTable
              rows={detailData.rows}
              canEdit={canEdit}
              followupOptions={followupOptions}
              onSaved={onRowSaved}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Página {detailData.page} de {detailData.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangePage(detailData.page - 1)}
                  disabled={detailData.page <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => onChangePage(detailData.page + 1)}
                  disabled={detailData.page >= detailData.totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
