'use client';

import React from 'react';
import { MousePointerClick } from 'lucide-react';

type GroupComparisonRow = {
  group: string;
  totalA: number;
  totalB: number;
  qtdA: number;
  qtdB: number;
  deltaTotal: number;
  deltaPct: number | null;
};

type GroupComparisonListProps = {
  rows: GroupComparisonRow[];
  selected: string;
  onSelect: (group: string) => void;
  className?: string;
};

const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDeltaPct = (value: number | null) => {
  if (value === null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export const GroupComparisonList = ({ rows, selected, onSelect, className }: GroupComparisonListProps) => {
  return (
    <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
      <h3 className="font-bold text-slate-700 mb-1 text-sm uppercase">Grupos de Procedimento (Comparativo)</h3>

      <div className="flex items-center gap-1.5 mb-3 bg-blue-50 px-2 py-1.5 rounded-md w-fit">
        <MousePointerClick size={12} className="text-blue-500" />
        <p className="text-[10px] font-medium text-blue-600">Clique em um grupo para aplicar filtro na comparacao</p>
      </div>

      <div className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] uppercase text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Grupo</th>
              <th className="px-2 py-1.5 text-right">Periodo A</th>
              <th className="px-2 py-1.5 text-right">Periodo B</th>
              <th className="px-2 py-1.5 text-right">Delta</th>
              <th className="px-2 py-1.5 text-right">Delta %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr
              onClick={() => onSelect('all')}
              className={`cursor-pointer transition ${
                selected === 'all' ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'
              }`}
            >
              <td className="px-2 py-2.5 font-bold text-blue-700">TODOS</td>
              <td className="px-2 py-2.5" />
              <td className="px-2 py-2.5" />
              <td className="px-2 py-2.5" />
              <td className="px-2 py-2.5" />
            </tr>
            {rows.map((item) => {
              const isSelected = selected === item.group;
              return (
                <tr
                  key={item.group}
                  onClick={() => onSelect(item.group)}
                  className={`cursor-pointer transition ${
                    isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : 'hover:bg-slate-50 border-l-4 border-transparent'
                  }`}
                >
                  <td className="px-2 py-2 text-slate-700 truncate max-w-[120px]" title={item.group}>
                    {item.group}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700">{fmtMoney(item.totalA)}</td>
                  <td className="px-2 py-2 text-right text-slate-700">{fmtMoney(item.totalB)}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${item.deltaTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmtMoney(item.deltaTotal)}
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold ${item.deltaTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmtDeltaPct(item.deltaPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
