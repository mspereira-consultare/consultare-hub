'use client';

import React, { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, TrendingDown, RefreshCw, 
  Calendar, CheckCircle2, AlertTriangle, AlertCircle, Loader2,
  CreditCard, Building2
} from 'lucide-react';
import { GoalDetailsModal } from '../components/GoalDetailsModal';

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
  filter_group?: string;
  clinic_unit?: string;
  team?: string;
  collaborator?: string;
  linked_kpi_id?: string;
}

export default function GoalsDashboardPage() {
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedGoal, setSelectedGoal] = useState<DashboardGoal | null>(null);

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
    const interval = setInterval(fetchData, 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  const totalGoals = goals.length;
  const successGoals = goals.filter(g => g.status === 'SUCCESS').length;
  const warningGoals = goals.filter(g => g.status === 'WARNING').length;
  const globalProgress = totalGoals > 0 
    ? Math.round(goals.reduce((acc, g) => acc + Math.min(g.percentage, 100), 0) / totalGoals) 
    : 0;

  const clinicGoals = goals.filter(g => g.scope !== 'CARD');
  const cardGoals = goals.filter(g => g.scope === 'CARD');

  const billingGroupGoals = clinicGoals.filter(g => 
    g.filter_group !== null && g.filter_group !== '' && g.filter_group !== 'all'
  );

  const formatValue = (val: number, unit: string) => {
    if (unit === 'currency') return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (unit === 'percent') return `${val.toFixed(1)}%`;
    if (unit === 'minutes') return `${val} min`;
    return val.toLocaleString('pt-BR');
  };

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto min-h-screen bg-slate-50">
      
      {/* Header Compacto */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            Painel de Metas & OKRs
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Acompanhamento em tempo real
            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full text-slate-600 ml-2">
              {lastUpdated.toLocaleTimeString()}
            </span>
          </p>
        </div>
        
        <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 text-sm hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm active:scale-95 disabled:opacity-70"
        >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Atualizar
        </button>
      </div>

      {/* KPI Summary - Compacto */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-6">
         <div className="bg-white p-3 md:p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Global</p>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mt-0.5">{globalProgress}%</h3>
            </div>
            <div className="p-2 md:p-3 rounded-full bg-blue-100 text-blue-600">
                <TrendingUp size={18} />
            </div>
         </div>

         <div className="bg-white p-3 md:p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Batidas</p>
                <h3 className="text-2xl md:text-3xl font-bold text-emerald-600 mt-0.5">{successGoals}</h3>
            </div>
            <div className="p-2 md:p-3 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={18} />
            </div>
         </div>

         <div className="bg-white p-3 md:p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Atenção</p>
                <h3 className="text-2xl md:text-3xl font-bold text-amber-500 mt-0.5">{warningGoals}</h3>
            </div>
            <div className="p-2 md:p-3 rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle size={18} />
            </div>
         </div>

         <div className="bg-white p-3 md:p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">Total</p>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mt-0.5">{totalGoals}</h3>
            </div>
            <div className="p-2 md:p-3 rounded-full bg-slate-100 text-slate-600">
                <Target size={18} />
            </div>
         </div>
      </div>

      {loading && goals.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-20 text-slate-400">
             <Loader2 size={40} className="animate-spin mb-4 text-blue-600" />
             <p className="text-sm">Calculando indicadores...</p>
         </div>
      ) : (
         <div className="space-y-6">
            
            {/* METAS DE FATURAMENTO COM GRUPOS */}
            {billingGroupGoals.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                        <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
                            <CreditCard size={16} />
                        </div>
                        <h2 className="text-sm md:text-base font-bold text-slate-800">Faturamento por Grupo</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
                        {billingGroupGoals.map(goal => (
                            <DashboardCard key={goal.goal_id} goal={goal} formatValue={formatValue} compact onClick={() => setSelectedGoal(goal)} />
                        ))}
                    </div>
                </section>
            )}
            
            {/* SEÇÃO CLÍNICA */}
            {clinicGoals.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                        <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                            <Building2 size={16} />
                        </div>
                        <h2 className="text-sm md:text-base font-bold text-slate-800">Clínica Consultare</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
                        {clinicGoals.filter(g => !billingGroupGoals.includes(g)).map(goal => 
                            <DashboardCard key={goal.goal_id} goal={goal} formatValue={formatValue} compact onClick={() => setSelectedGoal(goal)} />
                        )}
                    </div>
                </section>
            )}

            {/* SEÇÃO CARTÃO */}
            {cardGoals.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                        <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                            <CreditCard size={16} />
                        </div>
                        <h2 className="text-sm md:text-base font-bold text-slate-800">Cartão Resolve</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
                        {cardGoals.map(goal => <DashboardCard key={goal.goal_id} goal={goal} formatValue={formatValue} compact onClick={() => setSelectedGoal(goal)} />)}
                    </div>
                </section>
            )}

            {goals.length === 0 && (
                <div className="text-center py-12 text-slate-500 bg-white rounded-lg border border-dashed border-slate-300 text-sm">
                    Nenhuma meta configurada para o período atual.
                </div>
            )}
         </div>
      )}

      {selectedGoal && (
        <GoalDetailsModal
          isOpen={!!selectedGoal}
          onClose={() => setSelectedGoal(null)}
          goal={selectedGoal}
          currentData={{ current: selectedGoal.current, percentage: selectedGoal.percentage }}
        />
      )}
    </div>
  );
}

// --- SUB-COMPONENTE: CARD COMPACTO DA META ---
function DashboardCard({ goal, formatValue, compact = true }: { 
  goal: DashboardGoal, 
  formatValue: (v: number, u: string) => string,
  compact?: boolean,
  onClick?: () => void
}) {
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
  
  const progressVisual = Math.min(goal.percentage, 100);

  const projection = (() => {
    if (!goal || typeof goal.current !== 'number') return null;
    const now = new Date();
    if (goal.periodicity === 'daily') {
      const hoursPassed = now.getHours();
      const hoursInDay = 11;
      const hourlyRate = hoursPassed > 0 ? goal.current / hoursPassed : 0;
      return hourlyRate * hoursInDay;
    }
    if (goal.periodicity === 'monthly') {
      const daysInMonth = 30;
      const daysPassed = Math.min(now.getDate(), daysInMonth);
      const dailyRate = daysPassed > 0 ? goal.current / daysPassed : 0;
      return dailyRate * daysInMonth;
    }
    return null;
  })();

  return (
    <div onClick={onClick} className="bg-white rounded-lg shadow-sm border border-slate-200 p-2.5 md:p-3 relative overflow-hidden group hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
      {/* Header */}
      <div className="flex justify-between items-start gap-1.5 mb-1.5">
        <h3 className="font-semibold text-slate-800 text-[10px] md:text-xs line-clamp-2 flex-1">{goal.name}</h3>
        <span className={`text-[8px] md:text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${statusText[goal.status]}`}>
          {goal.percentage}%
        </span>
      </div>

      {/* Tags de Parâmetros */}
      <div className="flex flex-wrap gap-0.5 mb-1.5">
        {goal.filter_group && (
          <span className="text-[7px] md:text-[8px] bg-violet-100 text-violet-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.filter_group}>
            📊 {goal.filter_group.substring(0, 10)}
          </span>
        )}
        {goal.clinic_unit && goal.clinic_unit !== 'all' && (
          <span className="text-[7px] md:text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.clinic_unit}>
            🏥 {goal.clinic_unit.substring(0, 8)}
          </span>
        )}
        {goal.team && (
          <span className="text-[7px] md:text-[8px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.team}>
            👥 {goal.team.substring(0, 8)}
          </span>
        )}
      </div>

      {/* Valores */}
      <div className="space-y-0.5 mb-1.5">
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-[9px] md:text-[10px] text-slate-500 font-medium">Real:</span>
          <span className="text-xs md:text-sm font-bold text-slate-900 truncate">
            {formatValue(goal.current, goal.unit)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-[9px] md:text-[10px] text-slate-500 font-medium">Meta:</span>
          <span className="text-[9px] md:text-[10px] font-semibold text-slate-600 truncate">
            {formatValue(goal.target, goal.unit)}
          </span>
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
        <div 
          style={{ width: `${progressVisual}%` }} 
          className={`h-full ${statusColors[goal.status]} transition-all duration-1000 ease-out`}
        />
      </div>

      {/* Periodicidade e Projeção */}
      <div className="flex justify-between items-center text-[7px] md:text-[8px] text-slate-500 font-semibold uppercase">
        <span>
          {goal.periodicity === 'monthly' ? '📅 Mês' : goal.periodicity === 'daily' ? '📆 Dia' : '⏱️ Período'}
        </span>
        {projection !== null && (
          <span className="text-slate-600 font-bold normal-case">
            Proj: {formatValue(projection, goal.unit)}
          </span>
        )}
      </div>

      {goal.percentage >= 100 && (
        <div className="absolute top-1 right-1 p-1">
          <div className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-60"></div>
        </div>
      )}
    </div>
  );
}
