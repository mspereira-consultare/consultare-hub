'use client';

import React, { useState, useMemo } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronRight, CheckCircle2, Target, Calendar, TrendingUp, AlertCircle, Filter } from 'lucide-react';
import { Goal } from '../constants';

interface GoalTableProps {
    goals: Goal[];
    dashboardData: Record<number, { current: number, percentage: number }>;
    onEdit: (goal: Goal) => void;
    onDelete: (id: number) => void;
    onViewDetails: (goal: Goal) => void;
}

export const GoalTable = ({ goals, dashboardData, onEdit, onDelete, onViewDetails }: GoalTableProps) => {
    
    // Agrupa metas por setor (Acordeão)
    const groupedGoals = useMemo(() => {
        return goals.reduce((acc, goal) => {
            const group = goal.sector || 'Geral';
            if (!acc[group]) acc[group] = [];
            acc[group].push(goal);
            return acc;
        }, {} as Record<string, Goal[]>);
    }, [goals]);

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        const initialGroups: Record<string, boolean> = {};
        Object.keys(groupedGoals).forEach(key => { initialGroups[key] = true; });
        return initialGroups;
    });

    const toggleGroup = (sector: string) => {
        setExpandedGroups(prev => ({ ...prev, [sector]: !prev[sector] }));
    };

    const formatValue = (val: number, unit: string) => {
        const v = val || 0;
        if (unit === 'currency') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
        if (unit === 'percent') return `${v.toFixed(1)}%`;
        if (unit === 'minutes') return `${v} min`;
        return v.toLocaleString('pt-BR');
    };

    return (
        <div className="space-y-6">
            {Object.entries(groupedGoals).map(([sector, sectorGoals]) => {
                const isExpanded = expandedGroups[sector];
                const totalGoals = sectorGoals.length;
                const completedGoals = sectorGoals.filter(g => (dashboardData[g.id!]?.percentage || 0) >= 100).length;

                return (
                    <div key={sector} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Header do Grupo */}
                        <div 
                            className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleGroup(sector)}
                        >
                            <div className="flex items-center gap-3">
                                <button className="text-slate-400 hover:text-slate-600">
                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </button>
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                    {sector}
                                    <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{totalGoals}</span>
                                </h3>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                <CheckCircle2 size={14} className={completedGoals > 0 ? "text-emerald-500" : "text-slate-300"} />
                                <span>{completedGoals}/{totalGoals} Batidas</span>
                            </div>
                        </div>

                        {/* Tabela do Grupo */}
                        {isExpanded && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-white text-[10px] uppercase text-slate-400 font-bold border-b border-slate-100">
                                        <tr>
                                            <th className="px-6 py-3 w-1/3">Meta / Fonte</th>
                                            <th className="px-6 py-3">Escopo</th>
                                            <th className="px-6 py-3">Alvo</th>
                                            <th className="px-6 py-3">Realizado</th>
                                            <th className="px-6 py-3 w-48">Progresso</th>
                                            <th className="px-6 py-3 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 text-sm">
                                        {sectorGoals.map((goal) => {
                                            const data = dashboardData[goal.id!] || { current: 0, percentage: 0 };
                                            const progress = Math.min(Math.max(data.percentage, 0), 100);

                                            // Cores
                                            let statusColor = "bg-red-500";
                                            let icon = <AlertCircle size={18} className="text-red-500" />;
                                            let bgIcon = "bg-red-50";

                                            if (data.percentage >= 100) {
                                                statusColor = "bg-emerald-500";
                                                icon = <CheckCircle2 size={18} className="text-emerald-500" />;
                                                bgIcon = "bg-emerald-50";
                                            } else if (data.percentage >= 70) {
                                                statusColor = "bg-amber-500";
                                                icon = <TrendingUp size={18} className="text-amber-500" />;
                                                bgIcon = "bg-amber-50";
                                            }

                                            return (
                                                <tr key={goal.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => onViewDetails(goal)}>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bgIcon}`}>
                                                                {icon}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-slate-800 truncate pr-2">{goal.name}</div>
                                                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                                    <span className="flex items-center gap-1">
                                                                        <Calendar size={10} />
                                                                        {goal.periodicity}
                                                                    </span>
                                                                    {/* EXIBIÇÃO DO FILTRO DE GRUPO (RESTAURADO) */}
                                                                    {goal.filter_group && (
                                                                        <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-1.5 rounded border border-blue-100">
                                                                            <Filter size={8} />
                                                                            {goal.filter_group}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-6 py-4">
                                                        <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase ${
                                                            goal.scope === 'CARD' 
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                        }`}>
                                                            {goal.scope === 'CARD' ? 'Cartão' : 'Clínica'}
                                                        </span>
                                                    </td>

                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                                                            <Target size={14} />
                                                            {formatValue(goal.target_value, goal.unit)}
                                                        </div>
                                                    </td>

                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-800 text-base">
                                                            {formatValue(data.current, goal.unit)}
                                                        </div>
                                                    </td>

                                                    <td className="px-6 py-4">
                                                        <div className="w-full">
                                                            <div className="flex justify-between text-xs mb-1.5 font-bold">
                                                                <span className={data.percentage >= 100 ? "text-emerald-600" : "text-slate-600"}>
                                                                    {data.percentage}%
                                                                </span>
                                                            </div>
                                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div style={{ width: `${progress}%` }} className={`h-full ${statusColor} transition-all duration-700 ease-out`} />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); onEdit(goal); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); onDelete(goal.id!); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                                <Trash2 size={16} />
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