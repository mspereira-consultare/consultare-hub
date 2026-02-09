'use client';

import React from 'react';
import { DollarSign, Ticket, Users } from 'lucide-react';

type Totals = {
  total: number;
  qtd: number;
};

type ComparisonKPIProps = {
  base: Totals;
  compare: Totals;
  labelA: string;
  labelB: string;
};

const fmtMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtNumber = (value: number) => value.toLocaleString('pt-BR');

const formatDelta = (current: number, previous: number, money = false) => {
  const delta = current - previous;
  const pct = previous === 0 ? null : (delta / previous) * 100;
  const valueLabel = money ? fmtMoney(delta) : fmtNumber(delta);
  const pctLabel = pct === null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return {
    delta,
    valueLabel,
    pctLabel,
  };
};

const DeltaBadge = ({ delta, label }: { delta: number; label: string }) => (
  <span
    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
    }`}
  >
    {label}
  </span>
);

export const FinancialComparisonKPIs = ({ base, compare, labelA, labelB }: ComparisonKPIProps) => {
  const baseTicket = base.qtd > 0 ? base.total / base.qtd : 0;
  const compareTicket = compare.qtd > 0 ? compare.total / compare.qtd : 0;

  const totalDelta = formatDelta(base.total, compare.total, true);
  const ticketDelta = formatDelta(baseTicket, compareTicket, true);
  const qtdDelta = formatDelta(base.qtd, compare.qtd, false);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
          <DollarSign />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Faturamento</p>
          <p className="text-xl font-bold text-slate-800">{fmtMoney(base.total)}</p>
          <p className="text-xs text-slate-500 mt-1">Periodo A: {labelA}</p>
          <p className="text-xs text-slate-500">Periodo B: {fmtMoney(compare.total)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={totalDelta.delta} label={`${totalDelta.valueLabel} (${totalDelta.pctLabel})`} />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-green-100 text-green-600 rounded-lg">
          <Ticket />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Ticket Medio</p>
          <p className="text-xl font-bold text-slate-800">{fmtMoney(baseTicket)}</p>
          <p className="text-xs text-slate-500 mt-1">Periodo A: {labelA}</p>
          <p className="text-xs text-slate-500">Periodo B: {fmtMoney(compareTicket)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={ticketDelta.delta} label={`${ticketDelta.valueLabel} (${ticketDelta.pctLabel})`} />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
          <Users />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Atendimentos</p>
          <p className="text-xl font-bold text-slate-800">{fmtNumber(base.qtd)}</p>
          <p className="text-xs text-slate-500 mt-1">Periodo A: {labelA}</p>
          <p className="text-xs text-slate-500">Periodo B: {fmtNumber(compare.qtd)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={qtdDelta.delta} label={`${qtdDelta.valueLabel} (${qtdDelta.pctLabel})`} />
          </div>
        </div>
      </div>
    </div>
  );
};
