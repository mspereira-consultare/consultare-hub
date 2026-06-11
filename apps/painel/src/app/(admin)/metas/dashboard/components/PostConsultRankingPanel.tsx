'use client';

import { Loader2 } from 'lucide-react';
import type { PostConsultRankingResponse } from '@/app/(admin)/propostas/pos-consulta/components/types';

type Props = {
  data: PostConsultRankingResponse;
  loading: boolean;
  errorMessage: string;
  dateRange: { start: string; end: string };
  selectedUnit: string;
  unitOptions: string[];
  onChangeDateRange: (next: { start: string; end: string }) => void;
  onChangeUnit: (value: string) => void;
};

const formatPercent = (value: number) => `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
const formatCurrency = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PostConsultRankingPanel({
  data,
  loading,
  errorMessage,
  dateRange,
  selectedUnit,
  unitOptions,
  onChangeDateRange,
  onChangeUnit,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Pós-consulta</h2>
            <p className="mt-1 text-xs text-slate-500">
              Ranking operacional das atendentes por taxa de conversão do pós-consulta. Meta mínima 40%.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Data inicial</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(event) => onChangeDateRange({ ...dateRange, start: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Data final</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(event) => onChangeDateRange({ ...dateRange, end: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Unidade</label>
              <select
                value={selectedUnit}
                onChange={(event) => onChangeUnit(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">Todas as unidades</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Atendentes no ranking</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{data.summary.totalAttendants}</h3>
          <p className="mt-1 text-[11px] text-slate-500 md:text-xs">Responsáveis com atendimento elegível no recorte</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Fechamentos</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{data.summary.totalClosedEvents}</h3>
          <p className="mt-1 text-[11px] text-emerald-700/80 md:text-xs">Atendimentos fechados no pós-consulta</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Taxa de conversão</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{formatPercent(data.summary.conversionRate)}</h3>
          <p className="mt-1 text-[11px] text-blue-700/80 md:text-xs">Fechamentos / atendimentos · Meta mínima 40%</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Valor executado</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{formatCurrency(data.summary.executedProposalValue)}</h3>
          <p className="mt-1 text-[11px] text-amber-700/80 md:text-xs">Somente propostas executadas no recorte</p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Ranking por taxa de conversão</h3>
              <p className="text-xs text-slate-500">Ordenado do maior para o menor, com desempate por fechamentos, valor executado e nome.</p>
            </div>
            <div className="text-xs text-slate-500">{data.rows.length} atendente(s)</div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={30} className="animate-spin text-blue-600" />
            <p className="text-sm">Carregando ranking de pós-consulta...</p>
          </div>
        ) : data.rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Nenhum atendimento elegível para o ranking no recorte atual.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Atendente</th>
                  <th className="px-4 py-3 text-right">Atend.</th>
                  <th className="px-4 py-3 text-right">Fech.</th>
                  <th className="px-4 py-3 text-right">Conversão</th>
                  <th className="px-4 py-3 text-right">Pendentes</th>
                  <th className="px-4 py-3 text-right">Sem fechar após 2º</th>
                  <th className="px-4 py-3 text-right">Propostas</th>
                  <th className="px-4 py-3 text-right">Valor executado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.attendantResponsible} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.attendantResponsible}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.totalEvents}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.totalClosedEvents}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatPercent(row.conversionRate)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.pendingPatients}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.afterSecondNoClosePatients}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.totalProposals}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(row.executedProposalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
