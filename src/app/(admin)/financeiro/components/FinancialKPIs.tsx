import React from 'react';
import { DollarSign, Users, Ticket } from 'lucide-react';

interface KPIData {
    total: number;
    qtd: number;
}

export const FinancialKPIs = ({ data }: { data: KPIData }) => {
    const ticketAvg = data.qtd > 0 ? data.total / data.qtd : 0;
    
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><DollarSign /></div>
                <div>
                    <p className="text-sm text-slate-500">Faturamento (Mês)</p>
                    <p className="text-2xl font-bold text-slate-800">{fmt(data.total || 0)}</p>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Ticket /></div>
                <div>
                    <p className="text-sm text-slate-500">Ticket Médio</p>
                    <p className="text-2xl font-bold text-slate-800">{fmt(ticketAvg)}</p>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><Users /></div>
                <div>
                    <p className="text-sm text-slate-500">Atendimentos</p>
                    <p className="text-2xl font-bold text-slate-800">{data.qtd || 0}</p>
                </div>
            </div>
        </div>
    );
};