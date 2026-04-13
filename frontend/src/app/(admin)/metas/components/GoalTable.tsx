'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit2,
  Filter,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { calculateGoalProjection, calculateGoalRemaining } from '@/lib/goals_metrics';
import { Goal } from '../constants';

interface GoalTableProps {
  goals: Goal[];
  dashboardData: Record<number, { current: number; percentage: number }>;
  onEdit: (goal: Goal) => void;
  onDelete: (id: number) => void;
  onViewDetails: (goal: Goal) => void;
}

export const GoalTable = ({ goals, dashboardData, onEdit, onDelete, onViewDetails }: GoalTableProps) => {
  const groupedGoals = useMemo(() => {
    const grouped = goals.reduce((acc, goal) => {
      const group = goal.sector || 'Geral';
      if (!acc[group]) acc[group] = [];
      acc[group].push(goal);
      return acc;
    }, {} as Record<string, Goal[]>);

    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    });

    return grouped;
  }, [goals]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initialGroups: Record<string, boolean> = {};
    Object.keys(groupedGoals).forEach((key) => {
      initialGroups[key] = true;
    });
    return initialGroups;
  });

  const toggleGroup = (sector: string) => {
    setExpandedGroups((prev) => ({ ...prev, [sector]: !prev[sector] }));
  };

  const formatValue = (value: number, unit: string) => {
    const safeValue = value || 0;
    if (unit === 'currency') {
      return safeValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      });
    }
    if (unit === 'percent') return `${safeValue.toFixed(1)}%`;
    if (unit === 'minutes') return `${safeValue} min`;
    return safeValue.toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {Object.entries(groupedGoals).map(([sector, sectorGoals]) => {
        const isExpanded = expandedGroups[sector];
        const totalGoals = sectorGoals.length;
        const completedGoals = sectorGoals.filter((goal) => (dashboardData[goal.id!]?.percentage || 0) >= 100).length;

        return (
          <div key={sector} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
              className="flex cursor-pointer items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4 transition-colors hover:bg-slate-100"
              onClick={() => toggleGroup(sector)}
            >
              <div className="flex items-center gap-3">
                <button type="button" className="text-slate-400 hover:text-slate-600" aria-label={`Alternar grupo ${sector}`}>
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
                  {sector}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">{totalGoals}</span>
                </h3>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <CheckCircle2 size={14} className={completedGoals > 0 ? 'text-emerald-500' : 'text-slate-300'} />
                <span>
                  {completedGoals}/{totalGoals} batidas
                </span>
              </div>
            </div>

            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left">
                  <thead className="border-b border-slate-100 bg-white text-[10px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="w-[28%] px-4 py-2.5">Meta / Fonte</th>
                      <th className="px-4 py-2.5">Escopo</th>
                      <th className="px-4 py-2.5">Alvo</th>
                      <th className="px-4 py-2.5">Realizado</th>
                      <th className="px-4 py-2.5">Projeção</th>
                      <th className="px-4 py-2.5">Restante</th>
                      <th className="w-44 px-4 py-2.5">Progresso</th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {sectorGoals.map((goal) => {
                      const data = dashboardData[goal.id!] || { current: 0, percentage: 0 };
                      const progress = Math.min(Math.max(data.percentage, 0), 100);
                      const projection = calculateGoalProjection({
                        current: data.current || 0,
                        target: goal.target_value,
                        periodicity: goal.periodicity,
                      });
                      const remaining = calculateGoalRemaining({
                        current: data.current || 0,
                        target: goal.target_value,
                      });

                      let statusColor = 'bg-red-500';
                      let icon = <AlertCircle size={18} className="text-red-500" />;
                      let bgIcon = 'bg-red-50';

                      if (data.percentage >= 100) {
                        statusColor = 'bg-emerald-500';
                        icon = <CheckCircle2 size={18} className="text-emerald-500" />;
                        bgIcon = 'bg-emerald-50';
                      } else if (data.percentage >= 70) {
                        statusColor = 'bg-amber-500';
                        icon = <TrendingUp size={18} className="text-amber-500" />;
                        bgIcon = 'bg-amber-50';
                      }

                      return (
                        <tr
                          key={goal.id}
                          className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                          onClick={() => onViewDetails(goal)}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bgIcon}`}>
                                {icon}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate pr-2 font-semibold text-slate-800">{goal.name}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Calendar size={10} />
                                    {goal.periodicity}
                                  </span>
                                  {goal.filter_group && (
                                    <span className="flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-1.5 text-blue-600">
                                      <Filter size={8} />
                                      {goal.filter_group}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${
                                goal.scope === 'CARD'
                                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                                  : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              }`}
                            >
                              {goal.scope === 'CARD' ? 'Cartão' : 'Clínica'}
                            </span>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 font-medium text-slate-500">
                              <Target size={14} />
                              {formatValue(goal.target_value, goal.unit)}
                            </div>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="text-base font-bold text-slate-800">{formatValue(data.current, goal.unit)}</div>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="text-xs font-semibold text-slate-700">{formatValue(projection, goal.unit)}</div>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="text-xs font-semibold text-slate-700">{formatValue(remaining, goal.unit)}</div>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${data.percentage >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                {data.percentage}%
                              </span>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  style={{ width: `${progress}%` }}
                                  className={`h-full transition-all duration-700 ease-out ${statusColor}`}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEdit(goal);
                                }}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                                aria-label={`Editar ${goal.name}`}
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDelete(goal.id!);
                                }}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                aria-label={`Excluir ${goal.name}`}
                              >
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
