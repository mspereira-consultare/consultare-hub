import React from 'react';
import { CalendarCheck, PercentCircle } from 'lucide-react';

export function AgendamentoKPIs({ total, confirmRate }: { total: number; confirmRate: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><CalendarCheck /></div>
        <div>
          <p className="text-sm text-slate-500">Total de Agendamentos</p>
          <p className="text-2xl font-bold text-slate-800">{total.toLocaleString('pt-BR')}</p>
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-green-100 text-green-600 rounded-lg"><PercentCircle /></div>
        <div>
          <p className="text-sm text-slate-500">Taxa de Confirmação</p>
          <p className="text-2xl font-bold text-slate-800">{(confirmRate * 100).toFixed(2)}%</p>
        </div>
      </div>
    </div>
  );
}
