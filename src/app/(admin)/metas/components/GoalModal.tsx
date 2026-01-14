'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, HelpCircle, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { Goal, SECTORS, UNITS, PERIODICITY_OPTIONS, AVAILABLE_KPIS } from '../constants';

interface GoalWithFilter extends Goal {
    filter_group?: string;
}

interface GoalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (goal: GoalWithFilter) => void;
    initialData?: GoalWithFilter;
}

export const GoalModal = ({ isOpen, onClose, onSave, initialData }: GoalModalProps) => {
    
    // Estado do formulário
    const defaultGoal: GoalWithFilter = {
        name: '',
        sector: 'Comercial',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        periodicity: 'monthly',
        target_value: 0,
        unit: 'currency',
        linked_kpi_id: 'manual',
        filter_group: '' 
    };

    const [formData, setFormData] = useState<GoalWithFilter>(defaultGoal);
    
    // Estado para controle visual
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<string[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Carrega opções de grupos do backend
    useEffect(() => {
        if (isOpen) {
            setLoadingGroups(true);
            fetch('/api/admin/options/groups')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setAvailableGroups(data);
                    }
                })
                .catch(err => console.error("Erro ao carregar grupos:", err))
                .finally(() => setLoadingGroups(false));
        }
    }, [isOpen]);

    // Preenche dados ao abrir para edição
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({ 
                    ...initialData,
                    filter_group: initialData.filter_group || '' 
                });
                // Abre o filtro se já houver um valor selecionado
                if (initialData.filter_group) setIsFiltersOpen(true);
            } else {
                setFormData(defaultGoal);
                setIsFiltersOpen(false);
            }
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    // Garante que o valor selecionado exista na lista (fallback para evitar bug visual)
    const currentGroup = formData.filter_group || '';
    const groupsToList = (!currentGroup || availableGroups.includes(currentGroup))
        ? availableGroups
        : [currentGroup, ...availableGroups];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Cabeçalho */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            {initialData ? 'Editar Meta' : 'Nova Meta'}
                        </h2>
                        <p className="text-xs text-slate-500">Defina os parâmetros e o alvo</p>
                    </div>
                    {/* Botão de Fechar com type="button" explícito */}
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* Linha 1: Nome e Setor */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Nome da Meta</label>
                            <input 
                                required
                                type="text" 
                                placeholder="Ex: Faturamento Exames Jan/26"
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Setor Responsável</label>
                            <select 
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                value={formData.sector}
                                onChange={e => setFormData({...formData, sector: e.target.value})}
                            >
                                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Linha 2: Fonte de Dados (KPI) */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            Fonte de Dados (KPI)
                            <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Automático</span>
                        </label>
                        <select 
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                            value={formData.linked_kpi_id}
                            onChange={e => setFormData({...formData, linked_kpi_id: e.target.value})}
                        >
                            {AVAILABLE_KPIS.map(kpi => (
                                <option key={kpi.id} value={kpi.id}>
                                    [{kpi.group}] {kpi.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Linha 3: Filtros Avançados (Colapsável) */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                            type="button" 
                            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                            className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                                <Filter size={16} className="text-blue-600" />
                                Filtros Avançados
                            </div>
                            {isFiltersOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                        </button>
                        
                        {isFiltersOpen && (
                            <div className="p-4 bg-white border-t border-slate-100 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                        Grupo de Procedimento
                                        <HelpCircle size={12} className="text-slate-400" title="Filtra os dados para considerar apenas este grupo" />
                                    </label>
                                    
                                    {/* DROPDOWN BLINDADO */}
                                    <select
                                        className="w-full p-2 border border-slate-300 rounded focus:border-blue-500 outline-none text-sm bg-white"
                                        value={formData.filter_group || ''}
                                        onChange={e => setFormData({...formData, filter_group: e.target.value})}
                                        disabled={loadingGroups}
                                    >
                                        <option value="">(Todos os Grupos)</option>
                                        {groupsToList.map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400">
                                        Selecione um grupo para restringir o cálculo desta meta.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Linha 4: Datas e Periodicidade */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Início Vigência</label>
                            <input 
                                type="date" 
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                value={formData.start_date}
                                onChange={e => setFormData({...formData, start_date: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Fim Vigência</label>
                            <input 
                                type="date" 
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                value={formData.end_date}
                                onChange={e => setFormData({...formData, end_date: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Periodicidade</label>
                            <select 
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                                value={formData.periodicity}
                                onChange={e => setFormData({...formData, periodicity: e.target.value as any})}
                            >
                                {PERIODICITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.short}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Linha 5: O Alvo */}
                    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-blue-800">Valor Alvo (Meta)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    className="w-full p-2.5 border-2 border-blue-200 rounded-lg focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none text-lg font-bold text-slate-800"
                                    value={formData.target_value}
                                    onChange={e => setFormData({...formData, target_value: parseFloat(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">Unidade de Medida</label>
                                <select 
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white h-[46px]"
                                    value={formData.unit}
                                    onChange={e => setFormData({...formData, unit: e.target.value as any})}
                                >
                                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                </form>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit" 
                        onClick={handleSubmit}
                        className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition flex items-center gap-2"
                    >
                        <Save size={18} />
                        Salvar Meta
                    </button>
                </div>
            </div>
        </div>
    );
};