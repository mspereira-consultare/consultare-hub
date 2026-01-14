'use client';
import React from 'react';
import { Edit2, Trash2, Calendar, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { Goal, AVAILABLE_KPIS, PERIODICITY_OPTIONS } from '../constants';

interface GoalCardProps {
  goal: Goal;
  currentValue?: number; // Marcado como opcional para evitar erros se não vier
  percentage?: number;
  onEdit: (g: Goal) => void;
  onDelete: (id: number) => void;
}

export const GoalCard = ({ goal, currentValue, percentage, onEdit, onDelete }: GoalCardProps) => {
  const kpiLabel = AVAILABLE_KPIS.find(k => k.id === goal.linked_kpi_id)?.label || 'Manual';
  const periodicityLabel = PERIODICITY_OPTIONS.find(p => p.value === goal.periodicity)?.short || goal.periodicity;
  
  // Garante valores numéricos (fallback para 0 se for undefined/null)
  const safeCurrent = currentValue ?? 0;
  const safeTarget = goal.target_value ?? 0;
  const safePercentage = percentage ?? 0;

  const formatDate = (d: string) => {
      if (!d) return '--/--';
      return d.split('-').reverse().slice(0, 2).join('/'); 
  };
  const formatYear = (d: string) => d ? d.split('-')[0] : '';

  const getBadgeColor = (p: string) => {
      switch(p) {
          case 'daily': return 'bg-purple-100 text-purple-700 border-purple-200';
          case 'weekly': return 'bg-amber-100 text-amber-700 border-amber-200';
          case 'monthly': return 'bg-blue-100 text-blue-700 border-blue-200';
          default: return 'bg-slate-100 text-slate-600 border-slate-200';
      }
  };

  // Lógica de Cor da Barra
  let progressColor = 'bg-blue-600';
  if (safePercentage >= 100) progressColor = 'bg-green-500';
  else if (safePercentage < 30) progressColor = 'bg-red-500';
  else if (safePercentage < 70) progressColor = 'bg-yellow-500';

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition relative group flex flex-col justify-between h-full">
        
        {/* HEADER */}
        <div>
            <div className="flex justify-between items-start mb-3">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase flex items-center gap-1 ${getBadgeColor(goal.periodicity)}`}>
                    <RefreshCw size={10} /> {periodicityLabel}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => onEdit(goal)} className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded"><Edit2 size={14}/></button>
                    <button onClick={() => onDelete(goal.id!)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14}/></button>
                </div>
            </div>
            <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{goal.name}</h3>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{goal.sector}</span>
        </div>

        {/* VALORES E PROGRESSO */}
        <div className="py-4">
            <div className="flex items-end justify-between mb-1">
                <div>
                    <span className="text-xs text-slate-400 block">Realizado</span>
                    <div className="flex items-baseline gap-1">
                        {goal.unit === 'currency' && <span className="text-xs font-medium text-slate-500">R$</span>}
                        <span className="text-2xl font-bold text-slate-800">
                            {/* AQUI ESTAVA O ERRO: Agora usamos safeCurrent */}
                            {safeCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-xs text-slate-400 block">Meta</span>
                    <span className="text-sm font-bold text-slate-400">
                        {goal.unit === 'currency' ? 'R$ ' : ''}
                        {safeTarget.toLocaleString('pt-BR')}
                    </span>
                </div>
            </div>

            {/* Barra de Progresso */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div 
                    className={`h-2.5 rounded-full transition-all duration-1000 ${progressColor}`} 
                    style={{ width: `${Math.min(safePercentage, 100)}%` }}
                ></div>
            </div>
            <div className="text-right mt-1">
                <span className={`text-xs font-bold ${safePercentage >= 100 ? 'text-green-600' : 'text-slate-500'}`}>
                    {safePercentage}% atingido
                </span>
            </div>
        </div>

        {/* FOOTER */}
        <div className="mt-auto pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">
                <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400"/>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-slate-600">Vigência</span>
                        <span className="text-[10px] mt-0.5">{formatDate(goal.start_date)} a {formatDate(goal.end_date)}</span>
                    </div>
                </div>
                <span className="text-[10px] text-slate-300 font-medium">{formatYear(goal.end_date)}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 px-1">
                <LinkIcon size={12} className={goal.linked_kpi_id === 'manual' ? 'text-slate-300' : 'text-green-500'}/>
                <span className="truncate">{kpiLabel}</span>
            </div>
        </div>
    </div>
  );
};