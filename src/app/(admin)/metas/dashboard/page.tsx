'use client';

import React, { useState, useEffect } from 'react';
import { Goal } from './constants';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalCard } from './components/GoalCard';

// Interface para os dados do Dashboard (Calculados)
interface DashboardData {
    goal_id: number;
    current: number;
    percentage: number;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dashboardData, setDashboardData] = useState<Record<number, DashboardData>>({}); // Mapa ID -> Dados
  const [loading, setLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState('active');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);

  // --- BUSCA DADOS ---
  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Busca Configurações das Metas
        const resGoals = await fetch('/api/admin/goals');
        if (!resGoals.ok) throw new Error('Falha ao buscar metas');
        const goalsList = await resGoals.json();
        setGoals(goalsList);

        // 2. Busca Valores Calculados (KPIs)
        const resDash = await fetch('/api/admin/goals/dashboard');
        if (resDash.ok) {
            const dashList: DashboardData[] = await resDash.json();
            // Transforma lista em Objeto para acesso rápido por ID
            const dashMap = dashList.reduce((acc, item) => {
                acc[item.goal_id] = item;
                return acc;
            }, {} as Record<number, DashboardData>);
            setDashboardData(dashMap);
        }
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (goal: Goal) => {
      const payload = { ...goal, target_value: isNaN(goal.target_value) ? 0 : goal.target_value };
      await fetch('/api/admin/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      setIsModalOpen(false);
      fetchData(); // Recarrega tudo
  };

  const handleDelete = async (id: number) => {
      if(!confirm('Excluir esta meta permanentemente?')) return;
      await fetch(`/api/admin/goals?id=${id}`, { method: 'DELETE' });
      fetchData();
  };

  const openNew = () => { setEditingGoal(undefined); setIsModalOpen(true); };
  const openEdit = (g: Goal) => { setEditingGoal(g); setIsModalOpen(true); };

  // Filtros
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {[1,2,3].map(i => <div key={i} className="h-40 bg-slate-200 rounded-xl animate-pulse"></div>)}
          </div>
      ) : filteredGoals.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-slate-500 font-medium">Nenhuma meta encontrada.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredGoals.map(goal => {
                  // Pega os dados calculados ou assume 0
                  const data = dashboardData[goal.id!] || { current: 0, percentage: 0 };
                  
                  return (
                      <GoalCard 
                        key={goal.id} 
                        goal={goal}
                        currentValue={data.current} // Passa o valor real
                        percentage={data.percentage} // Passa a %
                        onEdit={openEdit} 
                        onDelete={handleDelete} 
                      />
                  );
              })}
          </div>
      )}

      <GoalModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingGoal}
      />
    </div>
  );
}