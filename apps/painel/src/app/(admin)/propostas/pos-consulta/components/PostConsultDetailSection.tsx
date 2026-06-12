'use client';

import { Loader2 } from 'lucide-react';
import { formatCurrency, formatPercent } from './formatters';
import { PostConsultDetailTable } from './PostConsultDetailTable';
import type { PostConsultDetailResponse, PostConsultFollowupSaveResult } from './types';

type Props = {
  detailData: PostConsultDetailResponse;
  loading: boolean;
  canEdit: boolean;
  nonClosureReasons: Array<{ value: string; label: string }>;
  onChangePage: (page: number) => void;
  onRowSaved: (result: PostConsultFollowupSaveResult) => void;
};

export function PostConsultDetailSection({ detailData, loading, canEdit, nonClosureReasons, onChangePage, onRowSaved }: Props) {
  const fromRow = detailData.totalRows === 0 ? 0 : (detailData.page - 1) * detailData.pageSize + 1;
  const toRow = Math.min(detailData.totalRows, detailData.page * detailData.pageSize);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold text-slate-800">Base operacional</h2>
        <p className="mt-1 text-sm text-slate-500">
          Acompanhamento da recepção após consulta, agrupando as propostas geradas no mesmo dia do atendimento.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
            Exibindo {fromRow}-{toRow} de {detailData.totalRows} atendimento(s)
          </span>
          <span>{detailData.summary.totalEvents} atendimento(s) no cálculo da conversão</span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total de propostas</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{detailData.summary.totalProposals}</p>
            <p className="mt-1 text-xs text-slate-500">{detailData.summary.totalEvents} atendimento(s) vinculados</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Fechamentos no pós-consulta</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800">{detailData.summary.totalClosedEvents}</p>
            <p className="mt-1 text-xs text-emerald-700/80">Contagem por paciente + consulta</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Taxa de conversão</p>
            <p className="mt-1 text-2xl font-bold text-blue-800">{formatPercent(detailData.summary.conversionRate)}</p>
            <p className="mt-1 text-xs text-blue-700/80">Fechamentos / atendimentos · Meta mínima 40%</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pendentes de contato</p>
            <p className="mt-1 text-2xl font-bold text-amber-800">{detailData.summary.pendingPatients}</p>
            <p className="mt-1 text-xs text-amber-700/80">Pacientes sem 1º contato registrado</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Sem fechamento após 2º contato</p>
            <p className="mt-1 text-2xl font-bold text-rose-800">{detailData.summary.afterSecondNoClosePatients}</p>
            <p className="mt-1 text-xs text-rose-700/80">Pacientes distintos no recorte</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Valor executado no pós-consulta</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800">{formatCurrency(detailData.summary.executedProposalValue)}</p>
            <p className="mt-1 text-xs text-emerald-700/80">Somente propostas executadas no recorte</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <p className="text-sm">Carregando base de pós-consulta...</p>
          </div>
        ) : detailData.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            Nenhum atendimento com proposta vinculada foi encontrado para o recorte atual.
          </div>
        ) : (
          <>
            <PostConsultDetailTable rows={detailData.rows} canEdit={canEdit} nonClosureReasons={nonClosureReasons} onSaved={onRowSaved} />
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
