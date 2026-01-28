'use client';

import React, { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, TrendingDown, RefreshCw, 
  Calendar, CheckCircle2, AlertTriangle, AlertCircle, Loader2,
  CreditCard, Building2
} from 'lucide-react';

interface DashboardGoal {
  goal_id: number;
  name: string;
  target: number;
  current: number;
  percentage: number;
  unit: string;
  periodicity: string;
  scope: 'CLINIC' | 'CARD';
  status: 'SUCCESS' | 'WARNING' | 'DANGER';
}

export default function GoalsDashboardPage() {
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/goals/dashboard', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGoals(Array.isArray(data) ? data : []);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh a cada 5 minutos
    const interval = setInterval(fetchData, 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  // --- CÁLCULOS DE RESUMO ---
  const totalGoals = goals.length;
  const successGoals = goals.filter(g => g.status === 'SUCCESS').length;
  const warningGoals = goals.filter(g => g.status === 'WARNING').length;
  const globalProgress = totalGoals > 0 
    ? Math.round(goals.reduce((acc, g) => acc + Math.min(g.percentage, 100), 0) / totalGoals) 
    : 0;

  // --- AGRUPAMENTO POR ESCOPO ---
  const clinicGoals = goals.filter(g => g.scope !== 'CARD'); // Padrão ou CLINIC
  const cardGoals = goals.filter(g => g.scope === 'CARD');

  // Helper de Formatação
  const formatValue = (val: number, unit: string) => {
    if (unit === 'currency') return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (unit === 'percent') return `${val.toFixed(1)}%`;
    if (unit === 'minutes') return `${val} min`;
    return val.toLocaleString('pt-BR'); // qtd
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-600" />
            Painel de Metas & OKRs
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            Acompanhamento em tempo real do desempenho.
            <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">
               Atualizado: {lastUpdated.toLocaleTimeString()}
            </span>
          </p>
        </div>
        
        <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm active:scale-95 disabled:opacity-70"
        >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            Atualizar
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Progresso Global</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">{globalProgress}%</h3>
            </div>
            <div className={`p-3 rounded-full ${globalProgress >= 80 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                <TrendingUp size={24} />
            </div>
         </div>

         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Metas Batidas</p>
                <h3 className="text-3xl font-bold text-emerald-600 mt-1">{successGoals}</h3>
            </div>
            <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={24} />
            </div>
         </div>

         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Atenção</p>
                <h3 className="text-3xl font-bold text-amber-500 mt-1">{warningGoals}</h3>
            </div>
            <div className="p-3 rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle size={24} />
            </div>
         </div>

         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Monitorado</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">{totalGoals}</h3>
            </div>
            <div className="p-3 rounded-full bg-slate-100 text-slate-600">
                <Target size={24} />
            </div>
         </div>
      </div>

      {loading && goals.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-20 text-slate-400">
             <Loader2 size={40} className="animate-spin mb-4 text-blue-600" />
             <p>Calculando indicadores...</p>
         </div>
      ) : (
         <div className="space-y-12">
            
            {/* SEÇÃO CLÍNICA */}
            {clinicGoals.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-200">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                            <Building2 size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">Clínica Consultare</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {clinicGoals.map(goal => <DashboardCard key={goal.goal_id} goal={goal} formatValue={formatValue} />)}
                    </div>
                </section>
            )}

            {/* SEÇÃO CARTÃO */}
            {cardGoals.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-200">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                            <CreditCard size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">Cartão Resolve</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {cardGoals.map(goal => <DashboardCard key={goal.goal_id} goal={goal} formatValue={formatValue} />)}
                    </div>
                </section>
            )}

            {goals.length === 0 && (
                <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                    Nenhuma meta configurada para o período atual.
                </div>
            )}
         </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENTE: CARD DA META ---
function DashboardCard({ goal, formatValue }: { goal: DashboardGoal, formatValue: (v: number, u: string) => string }) {
    // Cores baseadas no status
    const statusColors = {
        SUCCESS: 'bg-emerald-500',
        WARNING: 'bg-amber-500',
        DANGER: 'bg-red-500'
    };
    const statusText = {
        SUCCESS: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        WARNING: 'text-amber-700 bg-amber-50 border-amber-200',
        DANGER: 'text-red-700 bg-red-50 border-red-200'
    };
    
    // Limita visualmente a 100% (mas mostra o valor real no texto se passar)
    const progressVisual = Math.min(goal.percentage, 100);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg truncate pr-2">{goal.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar size={12} />
                            {goal.periodicity === 'monthly' ? 'Mensal' : goal.periodicity === 'daily' ? 'Diária' : 'Período'}
                        </span>
                    </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border uppercase ${statusText[goal.status]}`}>
                    {goal.percentage}%
                </span>
            </div>

            <div className="flex items-end justify-between mb-2">
                <div>
                    <span className="text-sm text-slate-500">Realizado</span>
                    <div className="text-2xl font-bold text-slate-900">
                        {formatValue(goal.current, goal.unit)}
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-xs text-slate-400">Meta</span>
                    <div className="text-sm font-medium text-slate-600">
                        {formatValue(goal.target, goal.unit)}
                    </div>
                </div>
            </div>

            {/* Barra de Progresso */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                    style={{ width: `${progressVisual}%` }} 
                    className={`h-full ${statusColors[goal.status]} transition-all duration-1000 ease-out`}
                />
            </div>
            
            {goal.percentage >= 100 && (
                <div className="absolute top-0 right-0 p-2">
                    <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20"></div>
                </div>
            )}
        </div>
    );
}