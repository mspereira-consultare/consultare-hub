'use client';

import React, { useState, useEffect } from 'react';
import { Goal } from './constants';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalTable } from './components/GoalTable';
import { GoalDetailsModal } from './components/GoalDetailsModal';
import { GoalTabs } from './components/GoalTabs'; // <--- NOVO COMPONENTE

interface GoalWithFilter extends Goal {
    filter_group?: string;
}

interface DashboardData {
    goal_id: number;
    current: number;
    percentage: number;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalWithFilter[]>([]);
  const [dashboardData, setDashboardData] = useState<Record<number, DashboardData>>({});
  const [loading, setLoading] = useState(true);
  
  // ESTADO DAS ABAS (Substitui o antigo sectorFilter)
  const [activeTab, setActiveTab] = useState('all');
  
  // Filtro de Status (Vigência) continua existindo no Header
  const [statusFilter, setStatusFilter] = useState('active');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithFilter | undefined>(undefined);
  const [detailsGoal, setDetailsGoal] = useState<GoalWithFilter | null>(null);

  // --- FETCH DE DADOS (Blindado conforme corrigimos antes) ---
  const fetchData = async () => {
    setLoading(true);
    try {
        const resGoals = await fetch('/api/admin/goals', { cache: 'no-store' });
        const goalsList = await resGoals.json();

        if (Array.isArray(goalsList)) {
            setGoals(goalsList);
        } else {
            setGoals([]); 
        }

        const resDash = await fetch('/api/admin/goals/dashboard', { 
            cache: 'no-store',
            headers: { 'Pragma': 'no-cache' } 
        });
        
        if (resDash.ok) {
            const dashList: DashboardData[] = await resDash.json();
            if (Array.isArray(dashList)) {
                const dashMap = dashList.reduce((acc, item) => {
                    acc[item.goal_id] = item;
                    return acc;
                }, {} as Record<number, DashboardData>);
                setDashboardData(dashMap);
            }
        }
    } catch (error) {
        console.error("Erro ao carregar:", error);
        setGoals([]);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- LÓGICA DE CONTAGEM PARA AS ABAS ---
  // Calcula quantas metas existem em cada setor (para mostrar na badge)
  const sectorCounts = goals.reduce((acc, goal) => {
      const sec = goal.sector || 'Outros';
      acc[sec] = (acc[sec] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);

  // --- FILTRAGEM ---
  const filteredGoals = goals.filter(g => {
      // 1. Filtro da Aba (Setor)
      if (activeTab !== 'all' && g.sector !== activeTab) return false;
      
      // 2. Filtro de Status (Header)
      const now = new Date().toISOString().split('T')[0];
      if (statusFilter === 'active') return now >= g.start_date && now <= g.end_date;
      if (statusFilter === 'future') return now < g.start_date;
      if (statusFilter === 'past') return now > g.end_date;
      
      return true; 
  });

  // Handlers de Ação
  const handleSave = async (goal: GoalWithFilter) => {
      const payload = { ...goal, target_value: Number(goal.target_value) || 0 };
      await fetch('/api/admin/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      setIsModalOpen(false);
      fetchData(); 
  };

  const handleDelete = async (id: number) => {
      if(!confirm('Deseja realmente excluir esta meta?')) return;
      await fetch(`/api/admin/goals?id=${id}`, { method: 'DELETE' });
      fetchData();
  };

  const openNew = () => { setEditingGoal(undefined); setIsModalOpen(true); };
  const openEdit = (g: GoalWithFilter) => { setEditingGoal(g); setIsModalOpen(true); };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* 1. Header (Título e Filtro de Status) */}
      <div className="bg-white px-6 py-4 border-b border-slate-200">
          <GoalHeader 
            onNew={openNew} 
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            // Removemos o sectorFilter daqui, pois virou abas
            sectorFilter="all" setSectorFilter={() => {}} 
          />
      </div>

      {/* 2. Abas de Setores */}
      <GoalTabs 
        activeTab={activeTab} 
        onChange={setActiveTab} 
        counts={sectorCounts}
      />

      {/* 3. Conteúdo Principal */}
      <div className="p-6 flex-1">
        {loading ? (
            <div className="space-y-4">
                 {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl animate-pulse"></div>)}
            </div>
        ) : filteredGoals.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 font-medium mb-2">Nenhuma meta encontrada nesta aba.</p>
                <p className="text-xs text-slate-400">Verifique os filtros de vigência ou crie uma nova.</p>
                <button onClick={openNew} className="mt-4 text-blue-600 font-bold hover:underline text-sm">
                    + Criar nova meta em {activeTab !== 'all' ? activeTab : 'Geral'}
                </button>
            </div>
        ) : (
            <GoalTable 
                goals={filteredGoals}
                dashboardData={dashboardData} 
                onEdit={openEdit} 
                onDelete={handleDelete} 
                onViewDetails={(g) => setDetailsGoal(g)}
            />
        )}
      </div>

      {/* Modais */}
      <GoalModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingGoal}
      />

      <GoalDetailsModal 
        goal={detailsGoal}
        onClose={() => setDetailsGoal(null)}
        currentValue={detailsGoal ? (dashboardData[detailsGoal.id!]?.current || 0) : 0}
      />
    </div>
  );
}