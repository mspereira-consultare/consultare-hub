'use client';
import React from 'react';

export const HistoryTable = ({ title, data, className = "h-[300px]" }: { title: string, data: any[], className?: string }) => {
    const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
            <h3 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">{title}</h3>
            <div className="overflow-auto custom-scrollbar flex-1">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2">Período</th>
                            <th className="px-2 py-2 text-right">Qtd</th>
                            <th className="px-2 py-2 text-right">Médio</th>
                            <th className="px-2 py-2 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((item, idx) => {
                            const ticket = item.qtd > 0 ? item.total / item.qtd : 0;
                            return (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-2 py-2 text-slate-600 font-medium">{item.label}</td>
                                    <td className="px-2 py-2 text-right text-slate-400">{item.qtd}</td>
                                    <td className="px-2 py-2 text-right text-slate-500">{fmtMoney(ticket)}</td>
                                    <td className="px-2 py-2 text-right font-bold text-slate-700">{fmtMoney(item.total)}</td>
                                </tr>
                            );
                        })}
                        {data.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-4 text-slate-400">Sem dados</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};