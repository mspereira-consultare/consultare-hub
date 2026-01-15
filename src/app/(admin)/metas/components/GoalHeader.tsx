import React from 'react';
import { Plus, Filter } from 'lucide-react';

interface GoalHeaderProps {
    onNew: () => void;
    statusFilter: string;
    setStatusFilter: (val: string) => void;
    // Props antigas (mantidas apenas para compatibilidade se necessário, mas ignoradas no render)
    sectorFilter?: string;
    setSectorFilter?: (val: string) => void;
}

export const GoalHeader = ({ onNew, statusFilter, setStatusFilter }: GoalHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Metas & Performance</h1>
                <p className="text-sm text-slate-500">Configure e acompanhe os objetivos da clínica</p>
            </div>

            <div className="flex items-center gap-3">
                
                {/* Filtro de Vigência (Ativas/Passadas/Futuras) */}
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Filter size={14} className="text-slate-400" />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none hover:bg-slate-100 transition-colors appearance-none cursor-pointer"
                    >
                        <option value="active">Em Andamento</option>
                        <option value="future">Futuras</option>
                        <option value="past">Finalizadas</option>
                    </select>
                </div>

                <button 
                    onClick={onNew}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-sm hover:shadow-md"
                >
                    <Plus size={18} />
                    <span className="hidden md:inline">Nova Meta</span>
                    <span className="md:hidden">Nova</span>
                </button>
            </div>
        </div>
    );
};