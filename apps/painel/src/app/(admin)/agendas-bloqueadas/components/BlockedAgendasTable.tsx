"use client";

import type { BlockedAgendaItem } from '@/lib/agendas_bloqueadas/types';
import { formatBlockedAgendaWeekDaysShort } from '@/lib/agendas_bloqueadas/types';

type Props = {
  rows: BlockedAgendaItem[];
  loading: boolean;
};

const formatPeriod = (row: BlockedAgendaItem) =>
  row.dateStart === row.dateEnd ? row.dateStart : `${row.dateStart} ate ${row.dateEnd}`;

const formatTimeRange = (row: BlockedAgendaItem) => `${row.timeStart} - ${row.timeEnd}`;

export function BlockedAgendasTable({ rows, loading }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Medico</th>
              <th className="px-4 py-3 font-semibold">Unidade(s)</th>
              <th className="px-4 py-3 font-semibold">Periodo</th>
              <th className="px-4 py-3 font-semibold">Horario</th>
              <th className="px-4 py-3 font-semibold">Recorrencia</th>
              <th className="px-4 py-3 font-semibold">Motivo</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum bloqueio encontrado para os filtros atuais.
                </td>
              </tr>
            ) : null}

            {rows.map((row) => (
              <tr key={`${row.blockId}-${row.professionalId}`} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.professionalName}</div>
                  <div className="mt-1 text-xs text-slate-500">ID Feegow: {row.professionalId}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.unitNamesText}</td>
                <td className="px-4 py-3 text-slate-700">{formatPeriod(row)}</td>
                <td className="px-4 py-3 text-slate-700">{formatTimeRange(row)}</td>
                <td className="px-4 py-3 text-slate-700">
                  {row.isRecurring ? formatBlockedAgendaWeekDaysShort(row.weekDays) || 'Recorrente' : 'Pontual'}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <span className="whitespace-pre-wrap">{row.description || 'Sem descricao'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.statusLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}

            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  Carregando bloqueios...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
