'use client';

import React from 'react';
import { Edit2, Trash2, Target, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface GoalCardProps {
  goal: any;
  currentValue: number;
  percentage: number;
  onEdit: (goal: any) => void;
  onDelete: (id: number) => void;
}

export function GoalCard({ goal, currentValue, percentage, onEdit, onDelete }: GoalCardProps) {
  
  // Formatador local
  const formatValue = (val: number) => {
    if (goal.unit === 'currency') return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    if (goal.unit === 'percent') return `${val.toFixed(1)}%`;
    if (goal.unit === 'minutes') return `${val} min`;
    return val.toLocaleString('pt-BR');
  };

  // Cores dinâmicas
  const progress = Math.min(Math.max(percentage, 0), 100);
  
  let statusColor = "bg-red-500";
  let textColor = "text-red-600";
  let Icon = AlertTriangle;

  if (percentage >= 100) {
      statusColor = "bg-emerald-500";
      textColor = "text-emerald-600";
      Icon = CheckCircle;
  } else if (percentage >= 70) {
      statusColor = "bg-amber-500";
      textColor = "text-amber-600";
      Icon = TrendingUp;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 relative group hover:shadow-md transition-all">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
            <div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase mb-1 inline-block ${
                    goal.scope === 'CARD' 
                    ? 'bg-purple-50 text-purple-700 border-purple-200' 
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                    {goal.scope === 'CARD' ? 'Cartão' : 'Clínica'}
                </span>
                <h3 className="font-bold text-slate-800 text-sm line-clamp-2 h-10 leading-tight">
                    {goal.name}
                </h3>
            </div>
            <div className={`p-2 rounded-lg bg-opacity-10 ${textColor.replace('text', 'bg')}`}>
                <Icon size={18} className={textColor} />
            </div>
        </div>

        {/* Valores */}
        <div className="flex items-end justify-between mb-3">
            <div>
                <p className="text-xs text-slate-500 font-medium uppercase">Realizado</p>
                <p className="text-xl font-bold text-slate-800">
                    {formatValue(currentValue)}
                </p>
            </div>
            <div className="text-right">
                <p className="text-xs text-slate-400">Meta</p>
                <p className="text-sm font-medium text-slate-500">
                    {formatValue(goal.target_value)}
                </p>
            </div>
        </div>

        {/* Barra */}
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div 
                style={{ width: `${progress}%` }} 
                className={`h-full ${statusColor} transition-all duration-700 ease-out`}
            />
        </div>
        
        <div className="flex justify-between items-center">
            <span className={`text-xs font-bold ${textColor}`}>
                {percentage}% atingido
            </span>
            <span className="text-[10px] text-slate-400">
                {goal.periodicity}
            </span>
        </div>

        {/* Hover Actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded backdrop-blur-sm">
            <button 
                onClick={(e) => { e.stopPropagation(); onEdit(goal); }} 
                className="p-1.5 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50"
            >
                <Edit2 size={14} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }} 
                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
            >
                <Trash2 size={14} />
            </button>
        </div>
    </div>
  );
}