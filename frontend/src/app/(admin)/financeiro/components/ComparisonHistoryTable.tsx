'use client';

import React from 'react';

type ComparisonRow = {
  key: string;
  label: string;
  totalA: number;
  totalB: number;
  qtdA: number;
  qtdB: number;
  deltaTotal: number;
  deltaPct: number | null;
};

type ComparisonHistoryTableProps = {
  title: string;
  data: ComparisonRow[];
  className?: string;
};

const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDeltaPct = (value: number | null) => {
  if (value === null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export const ComparisonHistoryTable = ({ title, data, className = 'h-[300px]' }: ComparisonHistoryTableProps) => {
  return (
    <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
      <h3 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">{title}</h3>
      <div className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2">Periodo</th>
              <th className="px-2 py-2 text-right">Periodo A</th>
              <th className="px-2 py-2 text-right">Periodo B</th>
              <th className="px-2 py-2 text-right">Delta</th>
              <th className="px-2 py-2 text-right">Delta %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item) => (
              <tr key={item.key} className="hover:bg-slate-50 transition-colors">
                <td className="px-2 py-2 text-slate-600 font-medium">{item.label}</td>
                <td className="px-2 py-2 text-right text-slate-700">{fmtMoney(item.totalA)}</td>
                <td className="px-2 py-2 text-right text-slate-700">{fmtMoney(item.totalB)}</td>
                <td className={`px-2 py-2 text-right font-semibold ${item.deltaTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmtMoney(item.deltaTotal)}
                </td>
                <td className={`px-2 py-2 text-right font-semibold ${item.deltaTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmtDeltaPct(item.deltaPct)}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-slate-400">
                  Sem dados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
