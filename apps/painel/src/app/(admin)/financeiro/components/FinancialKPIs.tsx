import React from 'react';
import { DollarSign, Ticket, UserPlus, Users } from 'lucide-react';

interface KPIData {
  total: number;
  qtd: number;
  newPatients?: number;
  totalPatients?: number;
}

const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumber = (value: number) => value.toLocaleString('pt-BR');
const fmtPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

export const FinancialKPIs = ({ data }: { data: KPIData }) => {
  const ticketAvg = data.qtd > 0 ? data.total / data.qtd : 0;
  const totalPatients = Number(data.totalPatients || 0);
  const newPatients = Number(data.newPatients || 0);
  const newPatientsShare = totalPatients > 0 ? (newPatients / totalPatients) * 100 : 0;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-blue-100 p-3 text-blue-600"><DollarSign /></div>
        <div>
          <p className="text-sm text-slate-500">Faturamento do período</p>
          <p className="text-2xl font-bold text-slate-800">{fmtMoney(data.total || 0)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-green-100 p-3 text-green-600"><Ticket /></div>
        <div>
          <p className="text-sm text-slate-500">Ticket médio</p>
          <p className="text-2xl font-bold text-slate-800">{fmtMoney(ticketAvg)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-purple-100 p-3 text-purple-600"><Users /></div>
        <div>
          <p className="text-sm text-slate-500">Atendimentos</p>
          <p className="text-2xl font-bold text-slate-800">{fmtNumber(data.qtd || 0)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg bg-amber-100 p-3 text-amber-600"><UserPlus /></div>
        <div>
          <p className="text-sm text-slate-500">Novos pacientes</p>
          <p className="text-2xl font-bold text-slate-800">{fmtNumber(newPatients)}</p>
          <p className="mt-1 text-xs text-slate-500">Primeiro agendamento no período</p>
          <p className="text-xs font-medium text-slate-600">
            {totalPatients > 0
              ? `${fmtPercent(newPatientsShare)} dos pacientes no período`
              : 'Sem pacientes para comparar no período'}
          </p>
        </div>
      </div>
    </div>
  );
};
