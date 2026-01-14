'use client';
import React from 'react';
import { Plus, Filter } from 'lucide-react';
import { SECTORS } from '../constants';

interface GoalHeaderProps {
  onNew: () => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  sectorFilter: string;
  setSectorFilter: (v: string) => void;
}

export const GoalHeader = ({ onNew, statusFilter, setStatusFilter, sectorFilter, setSectorFilter }: GoalHeaderProps) => {
  return (
    <div className="mb-8 space-y-4">
      {/* Linha 1: Título e Botão */}
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Gestão de Metas</h1>
            <p className="text-slate-500 text-sm">Acompanhe e configure os objetivos da clínica</p>
        </div>
        <button onClick={onNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm font-medium">
            <Plus size={18} /> Nova Meta
        </button>
      </div>

      {/* Linha 2: Filtros */}
      <div className="flex flex-wrap gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm items-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2">
            <Filter size={14} /> Filtros:
        </div>
        
        <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:border-blue-500"
        >
            <option value="active">Em Andamento (Ativas)</option>
            <option value="future">Futuras (Agendadas)</option>
            <option value="past">Encerradas (Passadas)</option>
            <option value="all">Todas</option>
        </select>

        <select 
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:border-blue-500"
        >
            <option value="all">Todos os Setores</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
};