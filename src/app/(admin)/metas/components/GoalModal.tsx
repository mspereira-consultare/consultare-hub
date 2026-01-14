'use client';
import React, { useState, useEffect } from 'react';
import { Goal, SECTORS, UNITS, AVAILABLE_KPIS, PERIODICITY_OPTIONS } from '../constants';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: Goal) => Promise<void>;
  initialData?: Goal;
}

const DEFAULT_GOAL: Goal = {
    sector: 'Comercial', name: '', start_date: '', end_date: '', 
    periodicity: 'monthly', target_value: 0, unit: 'qtd', linked_kpi_id: 'manual'
};

export const GoalModal = ({ isOpen, onClose, onSave, initialData }: GoalModalProps) => {
  const [formData, setFormData] = useState<Goal>(DEFAULT_GOAL);

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            setFormData(initialData);
        } else {
            // Default: Início hoje, Fim último dia do mês atual
            const now = new Date();
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setFormData({
                ...DEFAULT_GOAL,
                start_date: now.toISOString().split('T')[0],
                end_date: lastDay.toISOString().split('T')[0]
            });
        }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      await onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-700 text-lg">{formData.id ? 'Editar Meta' : 'Nova Meta'}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
            
            {/* SEÇÃO 1: DEFINIÇÃO BÁSICA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Setor Responsável</label>
                    <select 
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                        value={formData.sector}
                        onChange={e => setFormData({...formData, sector: e.target.value})}
                    >
                        {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome da Meta</label>
                    <input 
                        required type="text" 
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ex: Faturamento Janeiro 2026"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
            </div>

            <hr className="border-slate-100" />

            {/* SEÇÃO 2: VIGÊNCIA E FREQUÊNCIA (O PULO DO GATO) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-slate-700">Tempo e Recorrência</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    
                    {/* Datas */}
                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Período de Vigência da Meta</label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <span className="text-[10px] text-slate-400 block mb-1">Início</span>
                                <input 
                                    required type="date" className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    value={formData.start_date}
                                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                                />
                            </div>
                            <div className="flex-1">
                                <span className="text-[10px] text-slate-400 block mb-1">Fim</span>
                                <input 
                                    required type="date" className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                    value={formData.end_date}
                                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                            Define o intervalo de tempo em que esta meta estará ativa no painel.
                        </p>
                    </div>

                    {/* Frequência */}
                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Frequência de Apuração</label>
                        <select 
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                            value={formData.periodicity}
                            onChange={e => setFormData({...formData, periodicity: e.target.value as any})}
                        >
                            {PERIODICITY_OPTIONS.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-blue-600 leading-tight">
                            {formData.periodicity === 'daily' && "Ex: O sistema verificará se você atingiu o alvo TODOS OS DIAS dentro da vigência."}
                            {formData.periodicity === 'monthly' && "Ex: O sistema verificará o acumulado MENSAL dentro da vigência."}
                            {formData.periodicity === 'total' && "Ex: O alvo é para o período TOTAL (Início ao Fim), sem resetar."}
                        </p>
                    </div>
                </div>
            </div>

            <hr className="border-slate-100" />

            {/* SEÇÃO 3: VALORES E FONTE DE DADOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Alvo */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-green-500 rounded-full"></div>
                        <h4 className="text-sm font-bold text-slate-700">Valor Alvo</h4>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-1/3">
                            <select 
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                value={formData.unit}
                                onChange={e => setFormData({...formData, unit: e.target.value as any})}
                            >
                                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                        </div>
                        <div className="w-2/3">
                            <input 
                                required type="number" step="0.01"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700"
                                placeholder="0.00"
                                value={isNaN(formData.target_value) ? '' : formData.target_value}
                                onChange={e => setFormData({...formData, target_value: parseFloat(e.target.value)})}
                            />
                        </div>
                    </div>
                </div>

                {/* Vínculo */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                        <h4 className="text-sm font-bold text-slate-700">Fonte de Dados (Automática)</h4>
                    </div>
                    <select 
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        value={formData.linked_kpi_id}
                        onChange={e => setFormData({...formData, linked_kpi_id: e.target.value})}
                    >
                        {AVAILABLE_KPIS.map(kpi => (
                            <option key={kpi.id} value={kpi.id}>{kpi.group}: {kpi.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="pt-6 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">
                    Cancelar
                </button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition">
                    Salvar Meta
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};