"use client";

import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown } from 'lucide-react';
import type { BlockedAgendaItem } from '@/lib/agendas_bloqueadas/types';
import {
  formatBlockedAgendaDate,
  formatBlockedAgendaTime,
  formatBlockedAgendaWeekDaysShort,
} from '@/lib/agendas_bloqueadas/types';

export type BlockedAgendasSortKey =
  | 'professionalName'
  | 'unitNamesText'
  | 'dateStart'
  | 'timeStart'
  | 'recurrence'
  | 'description'
  | 'status';

type Props = {
  rows: BlockedAgendaItem[];
  loading: boolean;
  sortKey: BlockedAgendasSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: BlockedAgendasSortKey) => void;
};

const formatPeriod = (row: BlockedAgendaItem) =>
  row.dateStart === row.dateEnd
    ? formatBlockedAgendaDate(row.dateStart)
    : `${formatBlockedAgendaDate(row.dateStart)} ate ${formatBlockedAgendaDate(row.dateEnd)}`;

const formatTimeRange = (row: BlockedAgendaItem) =>
  `${formatBlockedAgendaTime(row.timeStart)} - ${formatBlockedAgendaTime(row.timeEnd)}`;

const SortButton = ({
  active,
  dir,
  label,
  onClick,
}: {
  active: boolean;
  dir: 'asc' | 'desc';
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 font-semibold text-slate-600 transition hover:text-slate-900"
  >
    <span>{label}</span>
    {active ? (dir === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />) : <ArrowUpDown size={14} />}
  </button>
);

export function BlockedAgendasTable({ rows, loading, sortKey, sortDir, onSort }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'professionalName'} dir={sortDir} label="Medico" onClick={() => onSort('professionalName')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'unitNamesText'} dir={sortDir} label="Unidade(s)" onClick={() => onSort('unitNamesText')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'dateStart'} dir={sortDir} label="Periodo" onClick={() => onSort('dateStart')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'timeStart'} dir={sortDir} label="Horario" onClick={() => onSort('timeStart')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'recurrence'} dir={sortDir} label="Recorrencia" onClick={() => onSort('recurrence')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'description'} dir={sortDir} label="Motivo" onClick={() => onSort('description')} />
              </th>
              <th className="px-4 py-3">
                <SortButton active={sortKey === 'status'} dir={sortDir} label="Status" onClick={() => onSort('status')} />
              </th>
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
