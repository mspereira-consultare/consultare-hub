'use client';

import React from 'react';
import { DollarSign, Ticket, UserPlus, Users } from 'lucide-react';

type Totals = {
  total: number;
  qtd: number;
  newPatients?: number;
  totalPatients?: number;
};

type ComparisonKPIProps = {
  base: Totals;
  compare: Totals;
  labelA: string;
  labelB: string;
};

const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumber = (value: number) => value.toLocaleString('pt-BR');
const fmtPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

const formatDelta = (current: number, previous: number, money = false) => {
  const delta = current - previous;
  const pct = previous === 0 ? null : (delta / previous) * 100;
  const valueLabel = money ? fmtMoney(delta) : fmtNumber(delta);
  const pctLabel = pct === null ? '-' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return { delta, valueLabel, pctLabel };
};

const DeltaBadge = ({ delta, label }: { delta: number; label: string }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
    }`}
  >
    {label}
  </span>
);

const formatShareLabel = (newPatients: number, totalPatients: number) => {
  if (totalPatients <= 0) return 'Sem pacientes para comparar';
  return `${fmtPercent((newPatients / totalPatients) * 100)} dos pacientes`;
};

export const FinancialComparisonKPIs = ({ base, compare, labelA, labelB }: ComparisonKPIProps) => {
  const baseTicket = base.qtd > 0 ? base.total / base.qtd : 0;
  const compareTicket = compare.qtd > 0 ? compare.total / compare.qtd : 0;

  const totalDelta = formatDelta(base.total, compare.total, true);
  const ticketDelta = formatDelta(baseTicket, compareTicket, true);
  const qtdDelta = formatDelta(base.qtd, compare.qtd, false);
  const newPatientsDelta = formatDelta(base.newPatients || 0, compare.newPatients || 0, false);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
          <DollarSign />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Faturamento</p>
          <p className="text-xl font-bold text-slate-800">{fmtMoney(base.total)}</p>
          <p className="mt-1 text-xs text-slate-500">Período A: {labelA}</p>
          <p className="text-xs text-slate-500">Período B: {fmtMoney(compare.total)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={totalDelta.delta} label={`${totalDelta.valueLabel} (${totalDelta.pctLabel})`} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-green-100 p-3 text-green-600">
          <Ticket />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Ticket médio</p>
          <p className="text-xl font-bold text-slate-800">{fmtMoney(baseTicket)}</p>
          <p className="mt-1 text-xs text-slate-500">Período A: {labelA}</p>
          <p className="text-xs text-slate-500">Período B: {fmtMoney(compareTicket)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={ticketDelta.delta} label={`${ticketDelta.valueLabel} (${ticketDelta.pctLabel})`} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-purple-100 p-3 text-purple-600">
          <Users />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Atendimentos</p>
          <p className="text-xl font-bold text-slate-800">{fmtNumber(base.qtd)}</p>
          <p className="mt-1 text-xs text-slate-500">Período A: {labelA}</p>
          <p className="text-xs text-slate-500">Período B: {fmtNumber(compare.qtd)} ({labelB})</p>
          <div className="mt-2">
            <DeltaBadge delta={qtdDelta.delta} label={`${qtdDelta.valueLabel} (${qtdDelta.pctLabel})`} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-amber-100 p-3 text-amber-600">
          <UserPlus />
        </div>
        <div className="w-full">
          <p className="text-sm text-slate-500">Novos pacientes</p>
          <p className="text-xl font-bold text-slate-800">{fmtNumber(base.newPatients || 0)}</p>
          <p className="mt-1 text-xs text-slate-500">Período A: {labelA} · {formatShareLabel(base.newPatients || 0, base.totalPatients || 0)}</p>
          <p className="text-xs text-slate-500">Período B: {fmtNumber(compare.newPatients || 0)} ({labelB}) · {formatShareLabel(compare.newPatients || 0, compare.totalPatients || 0)}</p>
          <div className="mt-2">
            <DeltaBadge delta={newPatientsDelta.delta} label={`${newPatientsDelta.valueLabel} (${newPatientsDelta.pctLabel})`} />
          </div>
        </div>
      </div>
    </div>
  );
};
