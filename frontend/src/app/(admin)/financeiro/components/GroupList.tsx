'use client';
import React from 'react';
import { MousePointerClick } from 'lucide-react';

export const GroupList = ({ groups, onSelect, selected, className }: { groups: any[], onSelect: (g: string) => void, selected: string, className?: string }) => {
    const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
            <h3 className="font-bold text-slate-700 mb-1 text-sm uppercase">Grupos de Procedimento</h3>
            
            {/* Aviso visual para clique */}
            <div className="flex items-center gap-1.5 mb-3 bg-blue-50 px-2 py-1.5 rounded-md w-fit">
                <MousePointerClick size={12} className="text-blue-500" />
                <p className="text-[10px] font-medium text-blue-600">
                    Clique em um grupo para filtrar os gráficos
                </p>
            </div>
            
            <div className="overflow-auto custom-scrollbar flex-1">
                <table className="w-full text-xs text-left">
                    <thead className="text-[10px] uppercase text-slate-400">
                        <tr>
                            <th className="px-2 py-1.5">Grupo</th>
                            <th className="px-2 py-1.5 text-right">Qtd</th>
                            <th className="px-2 py-1.5 text-right">Ticket</th>
                            <th className="px-2 py-1.5 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr 
                            onClick={() => onSelect('all')}
                            className={`cursor-pointer transition ${selected === 'all' ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                        >
                            <td className="px-2 py-2.5 font-bold text-blue-700">TODOS</td>
                            <td className="px-2 py-2.5"></td>
                            <td className="px-2 py-2.5"></td>
                            <td className="px-2 py-2.5"></td>
                        </tr>
                        {groups.map((item, idx) => {
                             const isSelected = selected === item.procedure_group;
                             const qtd = Number(item.qtd || 0);
                             const total = Number(item.total || 0);
                             const ticket = qtd > 0 ? total / qtd : 0;
                             return (
                                <tr 
                                    key={idx} 
                                    onClick={() => onSelect(item.procedure_group)}
                                    className={`cursor-pointer transition ${isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                                >
                                    <td className="px-2 py-2 text-slate-700 truncate max-w-[120px]" title={item.procedure_group}>
                                        {item.procedure_group || 'Geral'}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600">{qtd}</td>
                                    <td className="px-2 py-2 text-right text-slate-700">
                                        {fmtMoney(ticket)}
                                    </td>
                                    <td className="px-2 py-2 text-right font-semibold text-slate-700">
                                        {fmtMoney(total)}
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
