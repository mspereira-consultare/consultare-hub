'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalTable } from './components/GoalTable';
import { GoalTabs } from './components/GoalTabs';
import { GoalDetailsModal } from './components/GoalDetailsModal';

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
        return g.end_date >= today;
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
          <GoalHeader 
            onNew={() => { setEditingGoal(undefined); setIsModalOpen(true); }} 
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            sectorFilter={activeTab} setSectorFilter={setActiveTab} 
          />
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
            // Passa os dados calculados para o modal de detalhes também
            currentData={dashboardData[detailsGoal.id]}
        />
      )}
    </div>
  );
}