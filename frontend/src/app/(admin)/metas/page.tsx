'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Filter, Building2, Settings } from 'lucide-react';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalTable } from './components/GoalTable';
import { GoalTabs } from './components/GoalTabs';
import { GoalDetailsModal } from './components/GoalDetailsModal';
import { TeamsModal } from './components/TeamsModal';

export default function GoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  // Armazena o progresso calculado pelo backend (KPI Engine)
  const [dashboardData, setDashboardData] = useState<Record<number, any>>({});
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // Filtro de Setor
  const [statusFilter, setStatusFilter] = useState('active'); // active | all
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(undefined);
  const [detailsGoal, setDetailsGoal] = useState<any>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Busca configurações das metas (Alvo)
        const resGoals = await fetch('/api/admin/goals', { cache: 'no-store' });
        const goalsList = await resGoals.json();
        
        // 2. Busca dados calculados (Realizado)
        const resDash = await fetch('/api/admin/goals/dashboard', { cache: 'no-store' });
        
        const validGoals = Array.isArray(goalsList) ? goalsList : [];
        setGoals(validGoals);
        
        if (resDash.ok) {
            const dashList = await resDash.json();
            // Transforma Array em Objeto para acesso rápido por ID: { 12: { current: 500... }, ... }
            const dashMap: Record<number, any> = {};
            if (Array.isArray(dashList)) {
                dashList.forEach((d: any) => {
                    dashMap[d.goal_id] = d;
                });
            }
            setDashboardData(dashMap);
        }
        
        // 3. Extrai unidades disponíveis dos goals
        const unitsSet = new Set<string>();
        validGoals.forEach((g: any) => {
            if (g.clinic_unit && g.clinic_unit !== 'all' && g.clinic_unit !== null) {
                unitsSet.add(g.clinic_unit);
            }
        });
        setAvailableUnits(Array.from(unitsSet).sort());
    } catch (error) {
        console.error("Erro ao carregar metas:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (goalData: any) => {
    try {
        const res = await fetch('/api/admin/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(goalData)
        });
        
        if (!res.ok) {
            const err = await res.json();
            alert(`Erro ao salvar: ${err.error}`);
            return;
        }

        setIsModalOpen(false);
        fetchData(); // Recarrega tudo
    } catch (e) {
        console.error(e);
        alert("Erro técnico ao salvar.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta meta? O histórico será perdido.")) return;
    
    try {
        await fetch(`/api/admin/goals?id=${id}`, { method: 'DELETE' });
        setGoals(prev => prev.filter(g => g.id !== id));
    } catch (e) {
        console.error(e);
    }
  };

  // --- FILTROS DE CLIENTE ---
  const filteredGoals = goals.filter(g => {
    // Filtro de Aba (Setor)
    if (activeTab !== 'all' && g.sector !== activeTab) return false;
    
    // Filtro de Status (Vigência)
    if (statusFilter === 'active') {
        const today = new Date().toISOString().split('T')[0];
        if (g.end_date < today) return false;
    }
    
    // Filtro de Unidade Clínica
    if (selectedUnit !== 'all') {
        return g.clinic_unit === selectedUnit;
    }
    
    return true;
  });

  // Contagem para as abas
  const sectorCounts = goals.reduce((acc: any, curr: any) => {
    acc[curr.sector] = (acc[curr.sector] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      <div className="p-6 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <GoalHeader 
              onNew={() => { setEditingGoal(undefined); setIsModalOpen(true); }} 
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              sectorFilter={activeTab} setSectorFilter={setActiveTab} 
            />
            <button
              onClick={() => setIsTeamsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
              title="Gerenciar equipes/setores"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Equipes</span>
            </button>
          </div>
          
          {/* Filtro de Unidade Clínica */}
          {availableUnits.length > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <Building2 size={18} className="text-slate-500" />
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas as Unidades</option>
                {availableUnits.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <GoalTabs activeTab={activeTab} onChange={setActiveTab} counts={sectorCounts} />

      <div className="p-6 flex-1 max-w-[1600px] mx-auto w-full">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                <span className="text-slate-500">Calculando indicadores...</span>
            </div>
        ) : filteredGoals.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 font-medium mb-2">Nenhuma meta encontrada para este filtro.</p>
                <button onClick={() => { setEditingGoal(undefined); setIsModalOpen(true); }} className="text-blue-600 hover:underline text-sm">
                    Criar nova meta
                </button>
            </div>
        ) : (
            <GoalTable 
                goals={filteredGoals}
                dashboardData={dashboardData} 
                onEdit={(g) => { setEditingGoal(g); setIsModalOpen(true); }} 
                onDelete={handleDelete} 
                onViewDetails={(g) => setDetailsGoal(g)}
            />
        )}
      </div>

      {/* --- BLOCO DE METAS POR GRUPO DE PROCEDIMENTO --- */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6 mx-6 mb-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Metas por Grupo de Procedimento (Faturamento)</h2>
        
        {filteredGoals && filteredGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGoals
              .filter((g: any) => g.sector === 'faturamento' || g.name?.toLowerCase().includes('faturamento'))
              .map((goal: any) => {
                const goalData = dashboardData[goal.id];
                return (
                  <div 
                    key={goal.id}
                    className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                      goalData?.status === 'SUCCESS' 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : goalData?.status === 'WARNING' 
                        ? 'bg-amber-50 border-amber-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                    onClick={() => setDetailsGoal(goal)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${
                          goalData?.status === 'SUCCESS' 
                            ? 'text-emerald-700' 
                            : goalData?.status === 'WARNING' 
                            ? 'text-amber-700' 
                            : 'text-red-700'
                        }`}>
                          {goal.name}
                        </p>
                        {goal.filter_group && (
                          <p className="text-xs text-slate-500 mt-1">Grupo: {goal.filter_group}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        goalData?.status === 'SUCCESS' 
                          ? 'bg-emerald-200 text-emerald-900' 
                          : goalData?.status === 'WARNING' 
                          ? 'bg-amber-200 text-amber-900' 
                          : 'bg-red-200 text-red-900'
                      }`}>
                        {goalData?.percentage || 0}%
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                      <div 
                        className={`h-full transition-all ${
                          goalData?.status === 'SUCCESS' 
                            ? 'bg-emerald-600' 
                            : goalData?.status === 'WARNING' 
                            ? 'bg-amber-600' 
                            : 'bg-red-600'
                        }`}
                        style={{ width: `${Math.min(goalData?.percentage || 0, 100)}%` }}
                      />
                    </div>

                    {/* Values */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">
                        {goal.unit === 'currency'
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goalData?.current || 0)
                          : goalData?.current?.toFixed(0) || '0'
                        }
                      </span>
                      <span className="text-slate-500">
                        / {goal.unit === 'currency'
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value)
                          : goal.target_value.toFixed(0)
                        }
                      </span>
                    </div>

                    {/* Projeção (quando disponível) */}
                    {goalData && (() => {
                      const isDaily = goal.periodicity === 'daily';
                      let projLabel = 'Projeção';
                      let projValue = 0;
                      if (isDaily) {
                        const now = new Date();
                        const hoursPassed = now.getHours();
                        const hoursInDay = 11;
                        const hourlyRate = hoursPassed > 0 ? (goalData?.current || 0) / hoursPassed : 0;
                        projValue = hourlyRate * hoursInDay;
                        projLabel = `Projeção (hoje - ${hoursInDay}h)`;
                      } else {
                        const daysInMonth = 30;
                        const daysPassed = Math.min(new Date().getDate(), daysInMonth);
                        const dailyRate = daysPassed > 0 ? (goalData?.current || 0) / daysPassed : 0;
                        projValue = dailyRate * daysInMonth;
                        projLabel = `Projeção (mês - ${daysInMonth}d)`;
                      }
                      return (
                        <div className="pt-2 mt-2 border-t border-slate-300/50 text-[10px]">
                          <p className="text-slate-500 mb-1">{projLabel}:</p>
                          <p className="font-bold text-slate-700">
                            {goal.unit === 'currency'
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(projValue)
                              : projValue.toFixed(0)
                            }
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Nenhuma meta de faturamento configurada.</p>
        )}
      </div>

      {/* Modais */}
      {isModalOpen && (
        <GoalModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            onSave={handleSave} 
            initialData={editingGoal} 
        />
      )}
      
      {detailsGoal && (
        <GoalDetailsModal 
            isOpen={!!detailsGoal}
            onClose={() => setDetailsGoal(null)}
            goal={detailsGoal}
            currentData={dashboardData[detailsGoal.id]}
        />
      )}

      <TeamsModal
        isOpen={isTeamsModalOpen}
        onClose={() => setIsTeamsModalOpen(false)}
        onTeamsUpdated={fetchData}
      />
    </div>
  );
}

