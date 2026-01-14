'use client';

import React, { useState, useEffect } from 'react';
import { Goal } from './constants';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalTable } from './components/GoalTable';
import { GoalDetailsModal } from './components/GoalDetailsModal'; // IMPORTAR

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
  
  const [statusFilter, setStatusFilter] = useState('active');
  const [sectorFilter, setSectorFilter] = useState('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithFilter | undefined>(undefined);

  // NOVO ESTADO: Controle do Drill-down
  const [detailsGoal, setDetailsGoal] = useState<GoalWithFilter | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Busca Configuração das Metas
        const resGoals = await fetch('/api/admin/goals', { cache: 'no-store' });
        const goalsList = await resGoals.json();

        // --- CORREÇÃO DE SEGURANÇA ---
        if (Array.isArray(goalsList)) {
            setGoals(goalsList);
        } else {
            console.error("ERRO CRÍTICO NA API DE METAS:", goalsList);
            // Se der erro, mantém lista vazia para não quebrar a tela
            setGoals([]); 
        }
        // ------------------------------

        // 2. Busca Dados Calculados (Dashboard)
        const resDash = await fetch('/api/admin/goals/dashboard', { 
            cache: 'no-store',
            headers: { 'Pragma': 'no-cache' } 
        });
        
        if (resDash.ok) {
            const dashList: DashboardData[] = await resDash.json();
            
            // Verifica se é array antes de rodar o reduce
            if (Array.isArray(dashList)) {
                const dashMap = dashList.reduce((acc, item) => {
                    acc[item.goal_id] = item;
                    return acc;
                }, {} as Record<number, DashboardData>);
                
                setDashboardData(dashMap);
            }
        }
    } catch (error) {
        console.error("Erro de conexão:", error);
        setGoals([]); // Garante que não quebre
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ... (handleSave e handleDelete iguais) ...
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
      if(!confirm('Confirmar exclusão?')) return;
      await fetch(`/api/admin/goals?id=${id}`, { method: 'DELETE' });
      fetchData();
  };

  const openNew = () => { setEditingGoal(undefined); setIsModalOpen(true); };
  const openEdit = (g: GoalWithFilter) => { setEditingGoal(g); setIsModalOpen(true); };

  const filteredGoals = goals.filter(g => {
      if (sectorFilter !== 'all' && g.sector !== sectorFilter) return false;
      const now = new Date().toISOString().split('T')[0];
      if (statusFilter === 'active') return now >= g.start_date && now <= g.end_date;
      if (statusFilter === 'future') return now < g.start_date;
      if (statusFilter === 'past') return now > g.end_date;
      return true; 
  });

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      <GoalHeader 
        onNew={openNew} 
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        sectorFilter={sectorFilter} setSectorFilter={setSectorFilter}
      />

      {loading ? (
          <div className="space-y-4 mt-6">
               {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse"></div>)}
          </div>
      ) : filteredGoals.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 mt-6">
              <p className="text-slate-500">Nenhuma meta encontrada.</p>
          </div>
      ) : (
          <div className="mt-6">
              <GoalTable 
                goals={filteredGoals}
                dashboardData={dashboardData} 
                onEdit={openEdit} 
                onDelete={handleDelete} 
                onViewDetails={(g) => setDetailsGoal(g)} // Abre o Drill-down
              />
          </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      <GoalModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingGoal}
      />

      {/* MODAL DE DETALHES (DRILL-DOWN) */}
      <GoalDetailsModal 
        goal={detailsGoal}
        onClose={() => setDetailsGoal(null)}
        currentValue={detailsGoal ? (dashboardData[detailsGoal.id!]?.current || 0) : 0}
      />
    </div>
  );
}