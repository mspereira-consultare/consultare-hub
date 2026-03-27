import React from 'react';
import { DollarSign, Ticket, UserPlus, Users } from 'lucide-react';

interface KPIData {
  total: number;
  qtd: number;
  newPatients?: number;
}

export const FinancialKPIs = ({ data }: { data: KPIData }) => {
  const ticketAvg = data.qtd > 0 ? data.total / data.qtd : 0;
  const fmtMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNumber = (value: number) => value.toLocaleString('pt-BR');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><DollarSign /></div>
        <div>
          <p className="text-sm text-slate-500">Faturamento do período</p>
          <p className="text-2xl font-bold text-slate-800">{fmtMoney(data.total || 0)}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Ticket /></div>
        <div>
          <p className="text-sm text-slate-500">Ticket médio</p>
          <p className="text-2xl font-bold text-slate-800">{fmtMoney(ticketAvg)}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><Users /></div>
        <div>
          <p className="text-sm text-slate-500">Atendimentos</p>
          <p className="text-2xl font-bold text-slate-800">{fmtNumber(data.qtd || 0)}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-amber-100 text-amber-600 rounded-lg"><UserPlus /></div>
        <div>
          <p className="text-sm text-slate-500">Novos pacientes</p>
          <p className="text-2xl font-bold text-slate-800">{fmtNumber(data.newPatients || 0)}</p>
          <p className="text-xs text-slate-500 mt-1">Primeiro agendamento no período</p>
        </div>
      </div>
    </div>
  );
};
