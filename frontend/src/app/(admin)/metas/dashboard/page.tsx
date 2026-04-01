'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Target, TrendingUp, RefreshCw, Filter,
  CheckCircle2, AlertTriangle, Loader2,
  CreditCard, Building2, FileSpreadsheet, FileDown
} from 'lucide-react';
import { GoalDetailsModal } from '../components/GoalDetailsModal';
import { GOAL_SCOPES, KPIS_AVAILABLE, PERIODICITY_OPTIONS, UNITS, SECTORS } from '../constants';

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
  sector?: string;
  start_date?: string;
  end_date?: string;
  filter_group?: string;
  clinic_unit?: string;
  team?: string;
  collaborator?: string;
  linked_kpi_id?: string;
}

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

const SCOPE_LABELS = Object.fromEntries(GOAL_SCOPES.map((item) => [item.value, item.label])) as Record<string, string>;
const PERIODICITY_LABELS = Object.fromEntries(PERIODICITY_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>;
const UNIT_LABELS = Object.fromEntries(UNITS.map((item) => [item.value, item.label])) as Record<string, string>;
const KPI_LABELS = Object.fromEntries(KPIS_AVAILABLE.map((item) => [item.id, item.label])) as Record<string, string>;
const STATUS_LABELS: Record<DashboardGoal['status'], string> = {
  SUCCESS: 'Batida',
  WARNING: 'Atenção',
  DANGER: 'Em risco',
};

export default function GoalsDashboardPage() {
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedGoal, setSelectedGoal] = useState<DashboardGoal | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<GoalFilters>(DEFAULT_FILTERS);
  const [groupsOptions, setGroupsOptions] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchData = async (forceFresh = false) => {
    setLoading(true);
    try {
      const refreshParam = forceFresh ? `?refresh=${Date.now()}` : '';
      const res = await fetch(`/api/admin/goals/dashboard${refreshParam}`, { cache: 'no-store' });
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingGroups(true);
      try {
        const res = await fetch('/api/admin/options/groups', { cache: 'no-store' });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (mounted && Array.isArray(data)) {
          setGroupsOptions(data.map((g: any) => (g == null ? '' : String(g))).filter(Boolean));
        }
      } catch (e) {
        if (mounted) setGroupsOptions([]);
      } finally {
        if (mounted) setLoadingGroups(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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

  const filteredGoals = useMemo(() => {
    const nameFilter = normalizeKey(filters.name);
    const targetMin = filters.target_min ? Number(filters.target_min) : null;
    const targetMax = filters.target_max ? Number(filters.target_max) : null;

    return goals.filter(g => {
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

      const targetValue = Number(g.target || 0);
      if (targetMin !== null && targetValue < targetMin) return false;
      if (targetMax !== null && targetValue > targetMax) return false;

      return true;
    });
  }, [goals, filters]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((val) => {
      if (typeof val !== 'string') return false;
      if (val === 'all') return false;
      return val.trim() !== '';
    });
  }, [filters]);

  const totalGoals = filteredGoals.length;
  const successGoals = filteredGoals.filter(g => g.status === 'SUCCESS').length;
  const warningGoals = filteredGoals.filter(g => g.status === 'WARNING').length;
  const globalProgress = totalGoals > 0 
    ? Math.round(filteredGoals.reduce((acc, g) => acc + Math.min(g.percentage, 100), 0) / totalGoals) 
    : 0;

  const clinicGoals = filteredGoals.filter(g => g.scope !== 'CARD');
  const cardGoals = filteredGoals.filter(g => g.scope === 'CARD');

  const billingGroupGoals = clinicGoals.filter(g => 
    g.filter_group !== null && g.filter_group !== '' && g.filter_group !== 'all'
  );

  const formatValue = (val: number, unit: string) => {
    if (unit === 'currency') return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (unit === 'percent') return `${val.toFixed(1)}%`;
    if (unit === 'minutes') return `${val} min`;
    return val.toLocaleString('pt-BR');
  };

  const appliedFilters = useMemo(() => {
    const entries: Array<{ label: string; value: string }> = [];

    if (filters.name.trim()) entries.push({ label: 'Nome', value: filters.name.trim() });
    if (filters.scope !== 'all') entries.push({ label: 'Escopo', value: SCOPE_LABELS[filters.scope] || filters.scope });
    if (filters.sector !== 'all') entries.push({ label: 'Setor', value: filters.sector });
    if (filters.periodicity !== 'all') {
      entries.push({ label: 'Periodicidade', value: PERIODICITY_LABELS[filters.periodicity] || filters.periodicity });
    }
    if (filters.unit !== 'all') entries.push({ label: 'Unidade de medida', value: UNIT_LABELS[filters.unit] || filters.unit });
    if (filters.linked_kpi_id !== 'all') {
      entries.push({ label: 'Indicador (KPI)', value: KPI_LABELS[filters.linked_kpi_id] || filters.linked_kpi_id });
    }
    if (filters.filter_group !== 'all') entries.push({ label: 'Grupo de procedimento', value: filters.filter_group });
    if (filters.clinic_unit !== 'all') entries.push({ label: 'Unidade clínica', value: filters.clinic_unit });
    if (filters.collaborator !== 'all') entries.push({ label: 'Colaborador', value: filters.collaborator });
    if (filters.team !== 'all') entries.push({ label: 'Equipe', value: filters.team });
    if (filters.start_date) entries.push({ label: 'Vigência início', value: filters.start_date });
    if (filters.end_date) entries.push({ label: 'Vigência fim', value: filters.end_date });
    if (filters.target_min) entries.push({ label: 'Meta mínima', value: filters.target_min });
    if (filters.target_max) entries.push({ label: 'Meta máxima', value: filters.target_max });

    return entries;
  }, [filters]);

  const buildExportPayload = (format: 'xlsx' | 'pdf') => ({
    format,
    generatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    filters: appliedFilters,
    summary: {
      totalGoals,
      successGoals,
      warningGoals,
      globalProgress,
    },
    goals: filteredGoals.map((goal) => ({
      name: goal.name,
      scopeLabel: SCOPE_LABELS[goal.scope] || goal.scope,
      sector: goal.sector || '—',
      periodicityLabel: PERIODICITY_LABELS[goal.periodicity] || goal.periodicity,
      unitLabel: UNIT_LABELS[goal.unit] || goal.unit,
      indicatorLabel: KPI_LABELS[goal.linked_kpi_id || ''] || goal.linked_kpi_id || '—',
      groupLabel: goal.filter_group || '—',
      clinicUnitLabel: goal.clinic_unit || '—',
      collaboratorLabel: goal.collaborator || '—',
      teamLabel: goal.team || '—',
      startDate: goal.start_date || '—',
      endDate: goal.end_date || '—',
      targetLabel: formatValue(goal.target, goal.unit),
      currentLabel: formatValue(goal.current, goal.unit),
      percentageLabel: `${goal.percentage}%`,
      statusLabel: STATUS_LABELS[goal.status],
      status: goal.status,
    })),
  });

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    if (format === 'xlsx') {
      setExportingXlsx(true);
    } else {
      setExportingPdf(true);
    }

    try {
      const response = await fetch('/api/admin/goals/dashboard/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildExportPayload(format)),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || 'Falha ao exportar relatório.'));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metas-dashboard.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar dashboard de metas:', error);
    } finally {
      setExportingXlsx(false);
      setExportingPdf(false);
    }
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
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={loading || exportingXlsx || exportingPdf}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm hover:bg-emerald-100 transition-all shadow-sm active:scale-95 disabled:opacity-70"
          >
            {exportingXlsx ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
            Exportar XLSX
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={loading || exportingXlsx || exportingPdf}
            className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm hover:bg-blue-100 transition-all shadow-sm active:scale-95 disabled:opacity-70"
          >
            {exportingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
            Exportar PDF
          </button>

          <button 
              onClick={() => fetchData(true)} 
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 text-sm hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm active:scale-95 disabled:opacity-70"
          >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Atualizar
          </button>

          <button
            onClick={() => setFiltersExpanded(prev => !prev)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 text-sm hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm active:scale-95"
          >
            <Filter size={16} />
            {filtersExpanded ? 'Recolher Filtros' : 'Filtros'}
          </button>

          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={!hasActiveFilters}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-sm hover:text-slate-700 hover:bg-slate-200 transition-all shadow-sm active:scale-95 disabled:opacity-60"
            title="Limpar todos os filtros"
          >
            Limpar
          </button>
        </div>
      </div>

      {filtersExpanded && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
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
                onChange={(e) => setFilters(prev => ({ ...prev, sector: e.target.value }))}
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
                {KPIS_AVAILABLE.map(k => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-500">Grupo de Procedimento</label>
              <select
                value={filters.filter_group}
                onChange={(e) => setFilters(prev => ({ ...prev, filter_group: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="all">Todos</option>
                {(loadingGroups ? [] : groupsOptions).map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {loadingGroups && (
                <span className="text-[10px] text-slate-400">Carregando grupos...</span>
              )}
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

      {hasActiveFilters && (
        <div className="text-xs text-slate-500 mb-4">
          Exibindo {filteredGoals.length} de {goals.length} metas com os filtros aplicados.
        </div>
      )}

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
            {goals.length > 0 && filteredGoals.length === 0 && (
                <div className="text-center py-12 text-slate-500 bg-white rounded-lg border border-dashed border-slate-300 text-sm">
                    Nenhuma meta encontrada com os filtros aplicados.
                </div>
            )}
         </div>
      )}

      {selectedGoal && (() => {
        const modalGoal = {
          ...selectedGoal,
          id: (selectedGoal as any).id ?? selectedGoal.goal_id,
          target_value: (selectedGoal as any).target_value ?? selectedGoal.target
        };
        return (
          <GoalDetailsModal
            isOpen={!!selectedGoal}
            onClose={() => setSelectedGoal(null)}
            goal={modalGoal}
            currentData={{ current: selectedGoal.current, percentage: selectedGoal.percentage }}
          />
        );
      })()}
    </div>
  );
}

// --- SUB-COMPONENTE: CARD COMPACTO DA META ---
function DashboardCard({ goal, formatValue, compact = true, onClick }: { 
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
      const hoursNow = now.getHours() + now.getMinutes() / 60;
      const workStart = 8;
      const workEnd = 19;
      const hoursInDay = workEnd - workStart;
      const hoursPassed = Math.min(Math.max(hoursNow - workStart, 0), hoursInDay);
      const hourlyRate = hoursPassed > 0 ? goal.current / hoursPassed : 0;
      return hourlyRate * hoursInDay;
    }
    if (goal.periodicity === 'weekly') {
      const day = now.getDay(); // 0=domingo ... 6=sabado
      const daysInWeek = 7;
      const daysPassed = day === 0 ? 7 : day;
      const dailyRate = daysPassed > 0 ? goal.current / daysPassed : 0;
      return dailyRate * daysInWeek;
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
        <h3 className="font-semibold text-slate-800 text-[11px] md:text-sm line-clamp-2 flex-1">{goal.name}</h3>
        <span className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${statusText[goal.status]}`}>
          {goal.percentage}%
        </span>
      </div>

      {/* Tags de parâmetros */}
      <div className="flex flex-wrap gap-0.5 mb-1.5">
        {goal.filter_group && (
          <span className="text-[8px] md:text-[9px] bg-violet-100 text-violet-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.filter_group}>
            Grupo: {goal.filter_group.substring(0, 10)}
          </span>
        )}
        {goal.clinic_unit && goal.clinic_unit !== 'all' && (
          <span className="text-[8px] md:text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.clinic_unit}>
            Unidade: {goal.clinic_unit.substring(0, 8)}
          </span>
        )}
        {goal.team && (
          <span className="text-[8px] md:text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-medium truncate max-w-full" title={goal.team}>
            Equipe: {goal.team.substring(0, 8)}
          </span>
        )}
      </div>

      {/* Valores */}
      <div className="space-y-0.5 mb-1.5">
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-[10px] md:text-[11px] text-slate-500 font-medium">Real:</span>
          <span className="text-sm md:text-base font-bold text-slate-900 truncate">
            {formatValue(goal.current, goal.unit)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-[10px] md:text-[11px] text-slate-500 font-medium">Meta:</span>
          <span className="text-[10px] md:text-[11px] font-semibold text-slate-600 truncate">
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

      {/* Periodicidade e projeção */}
      <div className="flex justify-between items-center text-[8px] md:text-[9px] text-slate-500 font-semibold uppercase">
        <span>
          {goal.periodicity === 'monthly' ? 'Mês' : goal.periodicity === 'weekly' ? 'Semana' : goal.periodicity === 'daily' ? 'Dia' : 'Período'}
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
