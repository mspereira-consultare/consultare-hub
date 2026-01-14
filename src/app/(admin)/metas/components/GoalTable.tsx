'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronRight, CheckCircle2, Target, Calendar, BarChart2, Filter } from 'lucide-react';
import { Goal } from '../constants';

interface GoalWithFilter extends Goal {
    filter_group?: string;
}

interface GoalTableProps {
    goals: GoalWithFilter[];
    dashboardData: Record<number, { current: number, percentage: number }>;
    onEdit: (goal: GoalWithFilter) => void;
    onDelete: (id: number) => void;
    onViewDetails: (goal: GoalWithFilter) => void;
}

export const GoalTable = ({ goals, dashboardData, onEdit, onDelete, onViewDetails }: GoalTableProps) => {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
        goals.reduce((acc, g) => ({ ...acc, [g.sector || 'Geral']: true }), {})
    );

    const toggleGroup = (sector: string) => {
        setExpandedGroups(prev => ({ ...prev, [sector]: !prev[sector] }));
    };

    const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    const fmtNum = (v: number) => v.toLocaleString('pt-BR');

    const formatValue = (val: number, unit: string) => {
        if (unit === 'currency') return fmtMoney(val);
        if (unit === 'percent') return `${val}%`;
        return fmtNum(val);
    };

    // --- CÁLCULO DE PROJEÇÃO (Mensal e Diária) ---
    const calculateProjection = (goal: GoalWithFilter, current: number) => {
        const today = new Date();
        
        // Lógica Diária (Baseada em horário comercial 08:00 - 18:00)
        if (goal.periodicity === 'daily') {
            const startHour = 8;
            const endHour = 18;
            const currentHour = today.getHours() + (today.getMinutes() / 60); // Ex: 14.5 para 14:30
            
            // Se ainda não começou ou já acabou o dia
            if (currentHour < startHour) return 0;
            if (currentHour >= endHour) return current;

            // Extrapolação linear
            const hoursPassed = currentHour - startHour;
            const totalHours = endHour - startHour;
            
            if (hoursPassed <= 0) return 0;
            return (current / hoursPassed) * totalHours;
        }

        // Lógica Mensal / Total (Baseada em dias corridos)
        if (goal.periodicity === 'monthly' || goal.periodicity === 'total') {
            const start = new Date(goal.start_date);
            const end = new Date(goal.end_date);
            const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
            const daysPassed = Math.max(1, (Math.min(today.getTime(), end.getTime()) - start.getTime()) / 86400000);
            
            if (daysPassed <= 0) return 0;
            return (current / daysPassed) * totalDays;
        }

        return null;
    };

    const groupedGoals = goals.reduce((acc, goal) => {
        const sector = goal.sector || 'Geral';
        if (!acc[sector]) acc[sector] = [];
        acc[sector].push(goal);
        return acc;
    }, {} as Record<string, GoalWithFilter[]>);

    return (
        <div className="space-y-4">
            {Object.entries(groupedGoals).map(([sector, sectorGoals]) => {
                const isExpanded = expandedGroups[sector];
                
                const groupStats = sectorGoals.reduce((acc, g) => {
                    const data = dashboardData[g.id!] || { percentage: 0 };
                    return { 
                        sumPct: acc.sumPct + Math.min(data.percentage, 100), 
                        count: acc.count + 1 
                    };
                }, { sumPct: 0, count: 0 });
                const groupAvg = groupStats.count > 0 ? Math.round(groupStats.sumPct / groupStats.count) : 0;
                
                return (
                    <div key={sector} className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
                        
                        <div 
                            onClick={() => toggleGroup(sector)}
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 border-b ${isExpanded ? 'border-slate-100' : 'border-transparent'}`}
                        >
                            <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                                    {sector}
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">
                                        {sectorGoals.length}
                                    </span>
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${groupAvg >= 100 ? 'bg-green-500' : groupAvg >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${groupAvg}%` }}></div>
                                </div>
                                <span className={`text-xs font-bold ${groupAvg >= 100 ? 'text-green-600' : 'text-slate-600'}`}>{groupAvg}%</span>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="bg-white">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-400 font-medium border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-2 w-[40%]">Detalhes</th>
                                            <th className="px-4 py-2 w-[20%] text-right">Alvo</th>
                                            <th className="px-4 py-2 w-[30%] text-right">Realizado / Projeção</th>
                                            <th className="px-4 py-2 w-[10%] text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {sectorGoals.map((goal) => {
                                            const data = dashboardData[goal.id!] || { current: 0, percentage: 0 };
                                            const isDone = data.percentage >= 100;
                                            const projection = calculateProjection(goal, data.current);

                                            return (
                                                <tr 
                                                    key={goal.id} 
                                                    className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                                    onClick={() => onViewDetails(goal)}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-start gap-3">
                                                            {isDone 
                                                                ? <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-1" />
                                                                : <Target size={18} className="text-blue-600 shrink-0 mt-1" />
                                                            }
                                                            <div className="space-y-1">
                                                                <p className="font-bold text-slate-700 text-sm group-hover:text-blue-700 transition-colors">{goal.name}</p>
                                                                
                                                                {/* FILTRO AVANÇADO (VISÍVEL) */}
                                                                {goal.filter_group && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                                                            <Filter size={8} />
                                                                            {goal.filter_group}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                <div className="text-slate-400 flex items-center gap-1 pt-0.5">
                                                                    <Calendar size={10}/>
                                                                    <span className="text-[10px]">
                                                                        {new Date(goal.start_date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} - {new Date(goal.end_date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-right align-middle">
                                                        <span className="text-sm font-semibold text-slate-500 block">
                                                            {formatValue(goal.target_value, goal.unit)}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                                            {goal.periodicity === 'daily' ? 'Diária' : 'Mensal'}
                                                        </span>
                                                    </td>

                                                    {/* COLUNA REALIZADO COM DESTAQUE */}
                                                    <td className="px-4 py-3 text-right">
                                                         {/* Valor Grande e Destacado */}
                                                         <div className="font-black text-blue-700 text-lg leading-tight">
                                                            {formatValue(data.current, goal.unit)} 
                                                         </div>
                                                         
                                                         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex justify-end my-1.5">
                                                            <div className={`h-full rounded-full ${isDone ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(data.percentage, 100)}%` }}></div>
                                                         </div>
                                                         
                                                         <div className="flex justify-end items-center gap-3">
                                                             <span className={`text-xs font-bold ${isDone ? 'text-green-600' : 'text-slate-500'}`}>
                                                                {data.percentage}%
                                                             </span>

                                                             {/* PROJEÇÃO (Agora suporta Diária) */}
                                                             {projection !== null && !isDone && (
                                                                 <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                                     <BarChart2 size={10} className="text-amber-500"/>
                                                                     <span className="text-[10px] font-medium text-slate-500">
                                                                        Proj: <span className="text-amber-700 font-bold">{formatValue(projection, goal.unit)}</span>
                                                                     </span>
                                                                 </div>
                                                             )}
                                                         </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-center align-middle">
                                                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); onEdit(goal); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); onDelete(goal.id!); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};