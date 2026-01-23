'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, HelpCircle, Filter, Building2, CreditCard, Database } from 'lucide-react';
import { SECTORS, UNITS, PERIODICITY_OPTIONS, KPIS_AVAILABLE, GOAL_SCOPES, Goal } from '../constants';

interface GoalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (goal: Goal) => void;
    initialData?: Goal;
}

export const GoalModal = ({ isOpen, onClose, onSave, initialData }: GoalModalProps) => {
    
    const defaultGoal: Goal = {
        name: '',
        scope: 'CLINIC',
        sector: 'Comercial',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        periodicity: 'monthly',
        target_value: 0,
        unit: 'currency',
        linked_kpi_id: 'manual',
        filter_group: '' 
    };

    const [formData, setFormData] = useState<Goal>(defaultGoal);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    ...defaultGoal, // Garante campos padrão
                    ...initialData,
                    // Garante datas válidas
                    start_date: initialData.start_date?.split('T')[0] || defaultGoal.start_date,
                    end_date: initialData.end_date?.split('T')[0] || defaultGoal.end_date,
                });
            } else {
                setFormData(defaultGoal);
            }
        }
    }, [isOpen, initialData]);

    // 1. Filtra KPIs pelo Escopo (Clínica ou Cartão)
    const availableKpis = KPIS_AVAILABLE.filter(k => k.scope === 'ALL' || k.scope === formData.scope);
    
    // 2. Verifica se o KPI selecionado suporta Filtro de Grupo
    const selectedKpiConfig = KPIS_AVAILABLE.find(k => k.id === formData.linked_kpi_id);
    const showGroupFilter = selectedKpiConfig?.supportsFilter;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        {initialData ? <Save size={18} className="text-blue-600" /> : <Filter size={18} className="text-blue-600" />}
                        {initialData ? 'Editar Meta' : 'Nova Meta & OKR'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    
                    {/* SEÇÃO 1: Identificação e Escopo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Nome da Meta</label>
                            <input 
                                type="text" 
                                required
                                placeholder="Ex: Faturamento Consultas - Unidade Matriz"
                                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Escopo (Empresa)</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {GOAL_SCOPES.map(scope => (
                                    <button
                                        key={scope.value}
                                        type="button"
                                        onClick={() => setFormData({...formData, scope: scope.value as any, linked_kpi_id: 'manual', filter_group: ''})}
                                        className={`flex-1 text-xs font-bold py-2 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                                            formData.scope === scope.value 
                                            ? 'bg-white text-blue-700 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {scope.value === 'CLINIC' ? <Building2 size={14} /> : <CreditCard size={14} />}
                                        {scope.label.split(' ')[0]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Setor Responsável</label>
                            <select 
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.sector}
                                onChange={e => setFormData({...formData, sector: e.target.value})}
                            >
                                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* SEÇÃO 2: Fonte de Dados (Engine) - AQUI ESTÁ A CORREÇÃO */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <Database size={64} className="text-blue-600" />
                        </div>

                        <div className="flex items-center gap-2 text-blue-800 mb-1 relative z-10">
                            <Database size={18} />
                            <h3 className="font-bold text-sm">Fonte de Dados (Automação)</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-blue-700">Indicador (KPI)</label>
                                <select 
                                    className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                    value={formData.linked_kpi_id}
                                    onChange={e => setFormData({...formData, linked_kpi_id: e.target.value})}
                                >
                                    {availableKpis.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                                </select>
                            </div>

                            {/* Campo de Filtro Avançado (Restaurado) */}
                            {showGroupFilter && (
                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-xs font-bold uppercase text-blue-700 flex items-center justify-between">
                                        Grupo de Procedimento
                                        <HelpCircle size={12} title="Filtra os dados do Feegow por grupo (Ex: Consultas, Exames, Cirurgias)" />
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: Consultas, Exames..."
                                        className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-blue-300"
                                        value={formData.filter_group || ''}
                                        onChange={e => setFormData({...formData, filter_group: e.target.value})}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="text-[11px] text-blue-600/80 italic relative z-10 mt-2">
                            {formData.linked_kpi_id === 'manual' 
                                ? "⚠ Os dados deverão ser atualizados manualmente." 
                                : `✓ O valor será calculado automaticamente baseado no indicador selecionado${showGroupFilter && formData.filter_group ? ` e filtrado por '${formData.filter_group}'` : ''}.`
                            }
                        </div>
                    </div>

                    {/* SEÇÃO 3: Valores e Datas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase text-slate-400 border-b pb-1">Período de Vigência</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Início</label>
                                    <input 
                                        type="date" 
                                        required
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        value={formData.start_date}
                                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Fim</label>
                                    <input 
                                        type="date" 
                                        required
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        value={formData.end_date}
                                        onChange={e => setFormData({...formData, end_date: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase text-slate-400 border-b pb-1">Meta a Atingir</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Valor Alvo</label>
                                    <input 
                                        type="number" 
                                        required
                                        step="0.01"
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800"
                                        value={formData.target_value}
                                        onChange={e => setFormData({...formData, target_value: parseFloat(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Periodicidade</label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                                        value={formData.periodicity}
                                        onChange={e => setFormData({...formData, periodicity: e.target.value})}
                                    >
                                        {PERIODICITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            {/* Unidade */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Unidade de Medida</label>
                                <select 
                                    className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                                    value={formData.unit}
                                    onChange={e => setFormData({...formData, unit: e.target.value})}
                                >
                                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                </form>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
                    <button type="submit" onClick={handleSubmit} className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition flex items-center gap-2">
                        <Save size={18} /> Salvar Meta
                    </button>
                </div>
            </div>
        </div>
    );
};