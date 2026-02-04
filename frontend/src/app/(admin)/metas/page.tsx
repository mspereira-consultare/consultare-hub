'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Filter, Settings } from 'lucide-react';
import { GoalHeader } from './components/GoalHeader';
import { GoalModal } from './components/GoalModal';
import { GoalTable } from './components/GoalTable';
import { GoalTabs } from './components/GoalTabs';
import { GoalDetailsModal } from './components/GoalDetailsModal';
import { TeamsModal } from './components/TeamsModal';
import { GOAL_SCOPES, KPIS_AVAILABLE, PERIODICITY_OPTIONS, UNITS, SECTORS } from './constants';

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
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  type GoalFilters = {
    name: string;
    scope: string;
    sector: string;
    periodicity: string;
    unit: string;
    linked_kpi_id: string;
    filter_group: string;
    clinic_unit: string;
    collaborator: string;
    team: string;
    start_date: string;
    end_date: string;
    target_min: string;
    target_max: string;
  };

  const DEFAULT_FILTERS: GoalFilters = {
    name: '',
    scope: 'all',
    sector: 'all',
    periodicity: 'all',
    unit: 'all',
    linked_kpi_id: 'all',
    filter_group: 'all',
    clinic_unit: 'all',
    collaborator: 'all',
    team: 'all',
    start_date: '',
    end_date: '',
    target_min: '',
    target_max: ''
  };

  const [filters, setFilters] = useState<GoalFilters>(DEFAULT_FILTERS);

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

  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      sector: activeTab === 'all' ? 'all' : activeTab
    }));
  }, [activeTab]);

  const normalizeKey = (value: string) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const matchesExact = (value: string | undefined, filterValue: string) => {
    if (!filterValue || filterValue === 'all') return true;
    return normalizeKey(value || '') === normalizeKey(filterValue);
  };

  const uniqueSorted = (values: Array<string | undefined | null>) => {
    const filtered = values
      .map(v => (v == null ? '' : String(v)))
      .filter(v => v && v !== 'all');
    return Array.from(new Set(filtered)).sort((a, b) => a.localeCompare(b));
  };

  const availableOptions = useMemo(() => {
    return {
      scopes: uniqueSorted(goals.map(g => g.scope)),
      sectors: uniqueSorted(goals.map(g => g.sector)),
      periodicities: uniqueSorted(goals.map(g => g.periodicity)),
      units: uniqueSorted(goals.map(g => g.unit)),
      kpis: uniqueSorted(goals.map(g => g.linked_kpi_id)),
      groups: uniqueSorted(goals.map(g => g.filter_group)),
      clinicUnits: uniqueSorted(goals.map(g => g.clinic_unit)),
      collaborators: uniqueSorted(goals.map(g => g.collaborator)),
      teams: uniqueSorted(goals.map(g => g.team))
    };
  }, [goals]);

  const kpiOptions = useMemo(() => {
    const map = new Map<string, string>();
    KPIS_AVAILABLE.forEach(k => map.set(k.id, k.label));
    availableOptions.kpis.forEach((id) => {
      if (!map.has(id)) map.set(id, id);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [availableOptions.kpis]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((val) => {
      if (typeof val !== 'string') return false;
      if (val === 'all') return false;
      return val.trim() !== '';
    });
  }, [filters]);

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

    const nameFilter = normalizeKey(filters.name);
    if (filters.name && !normalizeKey(g.name).includes(nameFilter)) return false;

    if (!matchesExact(g.scope, filters.scope)) return false;
    if (!matchesExact(g.sector, filters.sector)) return false;
    if (!matchesExact(g.periodicity, filters.periodicity)) return false;
    if (!matchesExact(g.unit, filters.unit)) return false;
    if (!matchesExact(g.linked_kpi_id, filters.linked_kpi_id)) return false;
    if (!matchesExact(g.filter_group, filters.filter_group)) return false;
    if (!matchesExact(g.clinic_unit, filters.clinic_unit)) return false;
    if (!matchesExact(g.collaborator, filters.collaborator)) return false;
    if (!matchesExact(g.team, filters.team)) return false;

    if (filters.start_date) {
        if (!g.start_date || g.start_date < filters.start_date) return false;
    }
    if (filters.end_date) {
        if (!g.end_date || g.end_date > filters.end_date) return false;
    }

    const targetMin = filters.target_min ? Number(filters.target_min) : null;
    const targetMax = filters.target_max ? Number(filters.target_max) : null;
    const targetValue = Number(g.target_value || 0);
    if (targetMin !== null && targetValue < targetMin) return false;
    if (targetMax !== null && targetValue > targetMax) return false;
    
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <GoalHeader 
              onNew={() => { setEditingGoal(undefined); setIsModalOpen(true); }} 
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              sectorFilter={activeTab} setSectorFilter={setActiveTab} 
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTeamsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                title="Gerenciar equipes/setores"
              >
                <Settings size={16} />
                <span className="hidden sm:inline">Equipes</span>
              </button>

              <button
                onClick={() => setFiltersExpanded(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-lg text-sm font-medium border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition"
              >
                <Filter size={16} />
                {filtersExpanded ? 'Recolher Filtros' : 'Filtros'}
              </button>

              <button
                onClick={() => { setFilters(DEFAULT_FILTERS); setActiveTab('all'); }}
                disabled={!hasActiveFilters && activeTab === 'all'}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition disabled:opacity-60"
                title="Limpar todos os filtros"
              >
                Limpar
              </button>
            </div>
          </div>
          
          {filtersExpanded && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Nome</label>
                  <input
                    type="text"
                    value={filters.name}
                    onChange={(e) => setFilters(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Buscar meta..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Escopo</label>
                  <select
                    value={filters.scope}
                    onChange={(e) => setFilters(prev => ({ ...prev, scope: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todos</option>
                    {GOAL_SCOPES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Setor</label>
                  <select
                    value={filters.sector}
                    onChange={(e) => { setFilters(prev => ({ ...prev, sector: e.target.value })); setActiveTab(e.target.value === 'all' ? 'all' : e.target.value); }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todos</option>
                    {(SECTORS.length ? SECTORS : availableOptions.sectors).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Periodicidade</label>
                  <select
                    value={filters.periodicity}
                    onChange={(e) => setFilters(prev => ({ ...prev, periodicity: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todas</option>
                    {PERIODICITY_OPTIONS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Unidade (Medida)</label>
                  <select
                    value={filters.unit}
                    onChange={(e) => setFilters(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todas</option>
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Indicador (KPI)</label>
                  <select
                    value={filters.linked_kpi_id}
                    onChange={(e) => setFilters(prev => ({ ...prev, linked_kpi_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todos</option>
                    {kpiOptions.map(k => (
                      <option key={k.id} value={k.id}>{k.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Grupo</label>
                  <select
                    value={filters.filter_group}
                    onChange={(e) => setFilters(prev => ({ ...prev, filter_group: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todos</option>
                    {availableOptions.groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Unidade Clínica</label>
                  <select
                    value={filters.clinic_unit}
                    onChange={(e) => setFilters(prev => ({ ...prev, clinic_unit: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todas</option>
                    {availableOptions.clinicUnits.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Colaborador</label>
                  <select
                    value={filters.collaborator}
                    onChange={(e) => setFilters(prev => ({ ...prev, collaborator: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todos</option>
                    {availableOptions.collaborators.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Equipe</label>
                  <select
                    value={filters.team}
                    onChange={(e) => setFilters(prev => ({ ...prev, team: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Todas</option>
                    {availableOptions.teams.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Vigência Início</label>
                  <input
                    type="date"
                    value={filters.start_date}
                    onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Vigência Fim</label>
                  <input
                    type="date"
                    value={filters.end_date}
                    onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Meta Mínima</label>
                  <input
                    type="number"
                    value={filters.target_min}
                    onChange={(e) => setFilters(prev => ({ ...prev, target_min: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Meta Máxima</label>
                  <input
                    type="number"
                    value={filters.target_max}
                    onChange={(e) => setFilters(prev => ({ ...prev, target_max: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <GoalTabs activeTab={activeTab} onChange={setActiveTab} counts={sectorCounts} />

      <div className="p-6 flex-1 max-w-[1600px] mx-auto w-full">
        {hasActiveFilters && (
          <div className="text-xs text-slate-500 mb-3">
            Exibindo {filteredGoals.length} de {goals.length} metas com os filtros aplicados.
          </div>
        )}
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

