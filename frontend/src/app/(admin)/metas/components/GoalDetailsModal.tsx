'use client';

import React, { useEffect, useState } from 'react';
import { X, Calendar, Target, TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

interface GoalDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: any;
  currentData: { current: number; percentage: number };
}

export function GoalDetailsModal({ isOpen, onClose, goal, currentData }: GoalDetailsModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const goalId = goal?.id ?? goal?.goal_id;
  const targetValue = goal?.target_value ?? goal?.target ?? 0;

  useEffect(() => {
    if (isOpen && goalId) {
      fetchHistory(goalId);
    }
  }, [isOpen, goalId]);

  const fetchHistory = async (id: any) => {
    setLoading(true);
    try {
      // Busca histórico da API (Async/Turso)
      const res = await fetch(`/api/admin/goals/history?goal_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !goal) return null;

  // Formatador
  const formatValue = (val: number) => {
    if (goal?.unit === 'currency') return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (goal?.unit === 'percent') return `${val.toFixed(1)}%`;
    if (goal?.unit === 'minutes') return `${val} min`;
    return val.toLocaleString('pt-BR');
  };

  // Cores dinâmicas
  const isSuccess = currentData?.percentage >= 100;
  const colorClass = isSuccess ? 'text-emerald-600' : currentData?.percentage >= 70 ? 'text-amber-600' : 'text-red-600';
  const bgClass = isSuccess ? 'bg-emerald-50' : currentData?.percentage >= 70 ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity size={20} className="text-blue-600" />
              Detalhes da Meta
            </h2>
            <p className="text-sm text-slate-500">{goal.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
          
          {/* Resumo Principal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Card Alvo */}
             <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Target size={16} />
                    <span className="text-xs font-bold uppercase">Meta (Alvo)</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatValue(targetValue)}
                </div>
             </div>

             {/* Card Realizado */}
             <div className={`${bgClass} p-4 rounded-xl border border-transparent`}>
                <div className={`flex items-center gap-2 ${colorClass} mb-2`}>
                    <TrendingUp size={16} />
                    <span className="text-xs font-bold uppercase">Realizado</span>
                </div>
                <div className={`text-2xl font-bold ${colorClass}`}>
                    {formatValue(currentData?.current || 0)}
                </div>
             </div>

             {/* Card Progresso */}
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                    <div className="text-slate-500 text-xs font-bold uppercase">Atingimento</div>
                    <div className={`text-3xl font-bold ${colorClass}`}>
                        {Math.round(currentData?.percentage || 0)}%
                    </div>
                </div>
                <div className="h-12 w-12 rounded-full border-4 border-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                    {goal.periodicity === 'monthly' ? 'MÊS' : goal.periodicity === 'weekly' ? 'SEM' : 'DIA'}
                </div>
             </div>
          </div>

          {/* Gráfico de Evolução */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                Histórico de Evolução
            </h3>
            
            <div className="h-64 w-full bg-slate-50 rounded-xl border border-slate-100 p-4 relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                        Carregando histórico...
                    </div>
                ) : history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="date" 
                                tick={{fontSize: 10, fill: '#64748b'}} 
                                tickLine={false} 
                                axisLine={false}
                                tickFormatter={(val) => {
                                    // Formata data YYYY-MM-DD para DD/MM
                                    const d = new Date(val);
                                    return `${d.getDate()}/${d.getMonth()+1}`;
                                }}
                            />
                            <YAxis 
                                tick={{fontSize: 10, fill: '#64748b'}} 
                                tickLine={false} 
                                axisLine={false}
                                width={40}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelFormatter={(label) => new Date(label).toLocaleDateString('pt-BR')}
                                formatter={(value) => {
                                  const n = typeof value === 'number' ? value : Number(value);
                                  return [formatValue(Number.isFinite(n) ? n : 0), 'Realizado'];
                                }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#2563eb" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill="url(#colorValue)" 
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                        <AlertCircle size={32} className="mb-2 opacity-50" />
                        <p className="text-sm">Nenhum dado histórico disponível.</p>
                    </div>
                )}
            </div>
          </div>

          {/* Configuração Técnica */}
          <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-500 border border-slate-200">
             <span className="font-bold">Info Técnica:</span> 
             {' '}Indicador vinculado: <span className="font-mono bg-white px-1 py-0.5 rounded border">{goal.linked_kpi_id}</span>
             {' '} • Escopo: <span className="font-bold">{goal.scope === 'CARD' ? 'Cartão' : 'Clínica'}</span>
             {goal.filter_group && <> • Filtro: <span className="font-mono">{goal.filter_group}</span></>}
          </div>

        </div>
      </div>
    </div>
  );
}
