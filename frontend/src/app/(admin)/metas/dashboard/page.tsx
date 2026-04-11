'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Filter,
  LayoutList,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import { GoalDetailsModal } from '../components/GoalDetailsModal';
import { GOAL_SCOPES, KPIS_AVAILABLE, PERIODICITY_OPTIONS, SECTORS, UNITS } from '../constants';
import { GoalsDashboardExecutiveView } from './components/GoalsDashboardExecutiveView';
import { GoalsDashboardTable } from './components/GoalsDashboardTable';
import { GoalsDashboardTabNav } from './components/GoalsDashboardTabNav';
import { DashboardGoal, GoalFilters } from './types';

const DEFAULT_FILTERS: GoalFilters = {
  name: '',
  status: 'all',
  scope: 'all',
  periodicity: 'all',
  clinic_unit: 'all',
  unit: 'all',
  sector: 'all',
  linked_kpi_id: 'all',
  filter_group: 'all',
  collaborator: 'all',
  team: 'all',
  start_date: '',
  end_date: '',
  target_min: '',
  target_max: '',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'SUCCESS', label: 'Batida' },
  { value: 'WARNING', label: 'Atenção' },
  { value: 'DANGER', label: 'Em risco' },
] as const;

const SCOPE_LABELS = Object.fromEntries(GOAL_SCOPES.map((item) => [item.value, item.label])) as Record<string, string>;
const PERIODICITY_LABELS = Object.fromEntries(PERIODICITY_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>;
const UNIT_LABELS = Object.fromEntries(UNITS.map((item) => [item.value, item.label])) as Record<string, string>;
const KPI_LABELS = Object.fromEntries(KPIS_AVAILABLE.map((item) => [item.id, item.label])) as Record<string, string>;
const STATUS_LABELS: Record<DashboardGoal['status'], string> = {
  SUCCESS: 'Batida',
  WARNING: 'Atenção',
  DANGER: 'Em risco',
};

function compareText(a?: string | null, b?: string | null) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
}

function sortGoalsByName(goals: DashboardGoal[]) {
  return [...goals].sort((a, b) => compareText(a.name, b.name));
}

function normalizeKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesExact(value: string | undefined, filterValue: string) {
  if (!filterValue || filterValue === 'all') return true;
  return normalizeKey(value || '') === normalizeKey(filterValue);
}

function uniqueSorted(values: Array<string | undefined | null>) {
  const filtered = values
    .map((value) => (value == null ? '' : String(value)))
    .filter((value) => value && value !== 'all');

  return Array.from(new Set(filtered)).sort(compareText);
}

function getExecutiveOrderedGoals(goals: DashboardGoal[]) {
  const grouped = {
    danger: sortGoalsByName(goals.filter((goal) => goal.status === 'DANGER')),
    warning: sortGoalsByName(goals.filter((goal) => goal.status === 'WARNING')),
    success: sortGoalsByName(goals.filter((goal) => goal.status === 'SUCCESS')),
  };

  return [...grouped.danger, ...grouped.warning, ...grouped.success];
}

function formatLastUpdated(value: Date) {
  return value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GoalsDashboardPage() {
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedGoal, setSelectedGoal] = useState<DashboardGoal | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<GoalFilters>(DEFAULT_FILTERS);
  const [groupsOptions, setGroupsOptions] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState('executive');

  const fetchData = async (forceFresh = false) => {
    setLoading(true);
    setErrorMessage('');

    try {
      const refreshParam = forceFresh ? `?refresh=${Date.now()}` : '';
      const response = await fetch(`/api/admin/goals/dashboard${refreshParam}`, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('Não foi possível carregar o dashboard de metas.');
      }

      const data = await response.json();
      setGoals(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Erro ao carregar dashboard de metas:', error);
      setErrorMessage('Não foi possível atualizar o painel agora. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingGroups(true);
      try {
        const response = await fetch('/api/admin/options/groups', { cache: 'no-store' });
        if (!response.ok) throw new Error('Falha ao carregar grupos');
        const data = await response.json();
        if (mounted && Array.isArray(data)) {
          setGroupsOptions(data.map((item: unknown) => (item == null ? '' : String(item))).filter(Boolean));
        }
      } catch (_error) {
        if (mounted) setGroupsOptions([]);
      } finally {
        if (mounted) setLoadingGroups(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const availableOptions = useMemo(
    () => ({
      sectors: uniqueSorted(goals.map((goal) => goal.sector)),
      clinicUnits: uniqueSorted(goals.map((goal) => goal.clinic_unit)),
      collaborators: uniqueSorted(goals.map((goal) => goal.collaborator)),
      teams: uniqueSorted(goals.map((goal) => goal.team)),
    }),
    [goals]
  );

  const filteredGoals = useMemo(() => {
    const nameFilter = normalizeKey(filters.name);
    const targetMin = filters.target_min ? Number(filters.target_min) : null;
    const targetMax = filters.target_max ? Number(filters.target_max) : null;

    const result = goals.filter((goal) => {
      if (filters.name && !normalizeKey(goal.name).includes(nameFilter)) return false;
      if (!matchesExact(goal.status, filters.status)) return false;
      if (!matchesExact(goal.scope, filters.scope)) return false;
      if (!matchesExact(goal.periodicity, filters.periodicity)) return false;
      if (!matchesExact(goal.clinic_unit, filters.clinic_unit)) return false;
      if (!matchesExact(goal.unit, filters.unit)) return false;
      if (!matchesExact(goal.sector, filters.sector)) return false;
      if (!matchesExact(goal.linked_kpi_id, filters.linked_kpi_id)) return false;
      if (!matchesExact(goal.filter_group, filters.filter_group)) return false;
      if (!matchesExact(goal.collaborator, filters.collaborator)) return false;
      if (!matchesExact(goal.team, filters.team)) return false;

      if (filters.start_date && (!goal.start_date || goal.start_date < filters.start_date)) return false;
      if (filters.end_date && (!goal.end_date || goal.end_date > filters.end_date)) return false;

      const targetValue = Number(goal.target || 0);
      if (targetMin !== null && targetValue < targetMin) return false;
      if (targetMax !== null && targetValue > targetMax) return false;

      return true;
    });

    return sortGoalsByName(result);
  }, [filters, goals]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((value) => {
      if (typeof value !== 'string') return false;
      if (value === 'all') return false;
      return value.trim() !== '';
    });
  }, [filters]);

  const executiveOrderedGoals = useMemo(() => getExecutiveOrderedGoals(filteredGoals), [filteredGoals]);
  const clinicGoals = useMemo(() => filteredGoals.filter((goal) => goal.scope !== 'CARD'), [filteredGoals]);
  const resolveGoals = useMemo(() => filteredGoals.filter((goal) => goal.scope === 'CARD'), [filteredGoals]);

  const sectorTabs = useMemo(() => {
    const sectors = uniqueSorted(clinicGoals.map((goal) => goal.sector || 'Clínica'));
    return sectors.map((sector) => ({
      id: `sector:${sector}`,
      label: sector,
      count: clinicGoals.filter((goal) => (goal.sector || 'Clínica') === sector).length,
    }));
  }, [clinicGoals]);

  const tabDefinitions = useMemo(() => {
    const tabs: Array<{ id: string; label: string; count: number }> = [
      { id: 'executive', label: 'Executivo', count: filteredGoals.length },
      ...sectorTabs,
    ];

    if (resolveGoals.length > 0) {
      tabs.push({ id: 'resolve', label: 'Resolve', count: resolveGoals.length });
    }

    return tabs;
  }, [filteredGoals.length, resolveGoals.length, sectorTabs]);

  useEffect(() => {
    if (!tabDefinitions.some((tab) => tab.id === activeTab)) {
      setActiveTab('executive');
    }
  }, [activeTab, tabDefinitions]);

  const totalGoals = filteredGoals.length;
  const successGoals = filteredGoals.filter((goal) => goal.status === 'SUCCESS').length;
  const warningGoals = filteredGoals.filter((goal) => goal.status === 'WARNING').length;
  const globalProgress =
    totalGoals > 0
      ? Math.round(filteredGoals.reduce((accumulator, goal) => accumulator + Math.min(goal.percentage, 100), 0) / totalGoals)
      : 0;

  const riskGoals = useMemo(() => sortGoalsByName(filteredGoals.filter((goal) => goal.status === 'DANGER')), [filteredGoals]);
  const attentionGoals = useMemo(() => sortGoalsByName(filteredGoals.filter((goal) => goal.status === 'WARNING')), [filteredGoals]);

  const areaSummaries = useMemo(() => {
    const grouped = new Map<string, DashboardGoal[]>();

    filteredGoals.forEach((goal) => {
      const area = goal.scope === 'CARD' ? 'Resolve' : goal.sector || 'Clínica';
      const current = grouped.get(area) || [];
      current.push(goal);
      grouped.set(area, current);
    });

    return Array.from(grouped.entries())
      .map(([sector, areaGoals]) => ({
        sector,
        totalGoals: areaGoals.length,
        successGoals: areaGoals.filter((goal) => goal.status === 'SUCCESS').length,
        warningGoals: areaGoals.filter((goal) => goal.status === 'WARNING').length,
        dangerGoals: areaGoals.filter((goal) => goal.status === 'DANGER').length,
        avgPercentage:
          areaGoals.length > 0
            ? Math.round(areaGoals.reduce((accumulator, goal) => accumulator + Math.min(goal.percentage, 100), 0) / areaGoals.length)
            : 0,
      }))
      .sort((a, b) => compareText(a.sector, b.sector));
  }, [filteredGoals]);

  const visibleGoals = useMemo(() => {
    if (activeTab === 'executive') return executiveOrderedGoals;
    if (activeTab === 'resolve') return resolveGoals;
    if (activeTab.startsWith('sector:')) {
      const sectorName = activeTab.replace('sector:', '');
      return clinicGoals.filter((goal) => (goal.sector || 'Clínica') === sectorName);
    }
    return executiveOrderedGoals;
  }, [activeTab, clinicGoals, executiveOrderedGoals, resolveGoals]);

  const appliedFilters = useMemo(() => {
    const entries: Array<{ label: string; value: string }> = [];

    if (filters.name.trim()) entries.push({ label: 'Nome', value: filters.name.trim() });
    if (filters.status !== 'all') {
      entries.push({
        label: 'Status',
        value: STATUS_OPTIONS.find((item) => item.value === filters.status)?.label || filters.status,
      });
    }
    if (filters.scope !== 'all') entries.push({ label: 'Escopo', value: SCOPE_LABELS[filters.scope] || filters.scope });
    if (filters.periodicity !== 'all') {
      entries.push({
        label: 'Periodicidade',
        value: PERIODICITY_LABELS[filters.periodicity] || filters.periodicity,
      });
    }
    if (filters.clinic_unit !== 'all') entries.push({ label: 'Unidade clínica', value: filters.clinic_unit });
    if (filters.unit !== 'all') entries.push({ label: 'Unidade de medida', value: UNIT_LABELS[filters.unit] || filters.unit });
    if (filters.sector !== 'all') entries.push({ label: 'Setor', value: filters.sector });
    if (filters.linked_kpi_id !== 'all') {
      entries.push({
        label: 'Indicador (KPI)',
        value: KPI_LABELS[filters.linked_kpi_id] || filters.linked_kpi_id,
      });
    }
    if (filters.filter_group !== 'all') entries.push({ label: 'Grupo de procedimento', value: filters.filter_group });
    if (filters.collaborator !== 'all') entries.push({ label: 'Colaborador', value: filters.collaborator });
    if (filters.team !== 'all') entries.push({ label: 'Equipe', value: filters.team });
    if (filters.start_date) entries.push({ label: 'Vigência inicial', value: filters.start_date });
    if (filters.end_date) entries.push({ label: 'Vigência final', value: filters.end_date });
    if (filters.target_min) entries.push({ label: 'Meta mínima', value: filters.target_min });
    if (filters.target_max) entries.push({ label: 'Meta máxima', value: filters.target_max });

    return entries;
  }, [filters]);

  const goalsForExport = useMemo(() => visibleGoals, [visibleGoals]);

  const formatValue = (value: number, unit: string) => {
    if (unit === 'currency') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'minutes') return `${value} min`;
    return value.toLocaleString('pt-BR');
  };

  const getIndicatorLabel = (goal: DashboardGoal) => KPI_LABELS[goal.linked_kpi_id || ''] || goal.linked_kpi_id || 'Sem vínculo';
  const getPeriodicityLabel = (goal: DashboardGoal) => PERIODICITY_LABELS[goal.periodicity] || goal.periodicity;

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
    goals: goalsForExport.map((goal) => ({
      name: goal.name,
      scopeLabel: SCOPE_LABELS[goal.scope] || goal.scope,
      sector: goal.sector || '—',
      periodicityLabel: getPeriodicityLabel(goal),
      unitLabel: UNIT_LABELS[goal.unit] || goal.unit,
      indicatorLabel: getIndicatorLabel(goal),
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-6 py-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-sm">
                <Target size={24} />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-slate-900 md:text-[2rem]">Metas / Dashboard</h1>
                <p className="max-w-3xl text-sm text-slate-500">
                  Acompanhamento consolidado das metas por área, com leitura executiva, filtros e detalhamento por indicador.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExport('xlsx')}
                disabled={loading || exportingXlsx || exportingPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {exportingXlsx ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                Exportar XLSX
              </button>

              <button
                onClick={() => handleExport('pdf')}
                disabled={loading || exportingXlsx || exportingPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {exportingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
                Exportar PDF
              </button>

              <button
                onClick={() => fetchData(true)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Atualizar
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Filtros do painel</div>
                <p className="text-sm text-slate-500">
                  {filtersVisible
                    ? 'Refine o recorte por nome, status, escopo, periodicidade e contexto.'
                    : 'Filtros recolhidos para priorizar a leitura do painel.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Última atualização: {formatLastUpdated(lastUpdated)}
                </span>

                <button
                  onClick={() => setFiltersVisible((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {filtersVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {filtersVisible ? 'Recolher filtros' : 'Mostrar filtros'}
                </button>
              </div>
            </div>

            {filtersVisible && (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-1.5 xl:col-span-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Buscar meta</label>
                    <input
                      type="text"
                      value={filters.name}
                      onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="Digite o nome da meta"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</label>
                    <select
                      value={filters.status}
                      onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Escopo</label>
                    <select
                      value={filters.scope}
                      onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todos os escopos</option>
                      {GOAL_SCOPES.map((scope) => (
                        <option key={scope.value} value={scope.value}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Periodicidade</label>
                    <select
                      value={filters.periodicity}
                      onChange={(event) => setFilters((current) => ({ ...current, periodicity: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todas as periodicidades</option>
                      {PERIODICITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Unidade clínica</label>
                    <select
                      value={filters.clinic_unit}
                      onChange={(event) => setFilters((current) => ({ ...current, clinic_unit: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todas as unidades</option>
                      {availableOptions.clinicUnits.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {hasActiveFilters
                      ? `${appliedFilters.length} filtro(s) ativo(s) no recorte atual.`
                      : 'Sem filtros adicionais aplicados.'}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setFiltersExpanded((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Filter size={16} />
                      {filtersExpanded ? 'Recolher filtros avançados' : 'Filtros avançados'}
                    </button>

                    <button
                      onClick={() => {
                        setFilters(DEFAULT_FILTERS);
                        setActiveTab('executive');
                      }}
                      disabled={!hasActiveFilters}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>

                {filtersExpanded && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Setor</label>
                        <select
                          value={filters.sector}
                          onChange={(event) => setFilters((current) => ({ ...current, sector: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        >
                          <option value="all">Todos os setores</option>
                          {(SECTORS.length ? SECTORS : availableOptions.sectors).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Indicador (KPI)</label>
                    <select
                      value={filters.linked_kpi_id}
                      onChange={(event) => setFilters((current) => ({ ...current, linked_kpi_id: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todos os indicadores</option>
                      {KPIS_AVAILABLE.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Unidade de medida</label>
                    <select
                      value={filters.unit}
                      onChange={(event) => setFilters((current) => ({ ...current, unit: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todas as unidades</option>
                      {UNITS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Grupo de procedimento</label>
                    <select
                      value={filters.filter_group}
                      onChange={(event) => setFilters((current) => ({ ...current, filter_group: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todos os grupos</option>
                      {(loadingGroups ? [] : groupsOptions).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {loadingGroups && <span className="text-[11px] text-slate-400">Carregando grupos...</span>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Colaborador</label>
                    <select
                      value={filters.collaborator}
                      onChange={(event) => setFilters((current) => ({ ...current, collaborator: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todos os colaboradores</option>
                      {availableOptions.collaborators.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Equipe</label>
                    <select
                      value={filters.team}
                      onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="all">Todas as equipes</option>
                      {availableOptions.teams.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Vigência inicial</label>
                    <input
                      type="date"
                      value={filters.start_date}
                      onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Vigência final</label>
                    <input
                      type="date"
                      value={filters.end_date}
                      onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Meta mínima</label>
                    <input
                      type="number"
                      value={filters.target_min}
                      onChange={(event) => setFilters((current) => ({ ...current, target_min: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Meta máxima</label>
                    <input
                      type="number"
                      value={filters.target_max}
                      onChange={(event) => setFilters((current) => ({ ...current, target_max: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )}

                {hasActiveFilters && (
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
                    Exibindo <span className="font-bold">{filteredGoals.length}</span> de <span className="font-bold">{goals.length}</span>{' '}
                    metas com filtros aplicados.
                  </div>
                )}

                {errorMessage && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                )}
              </>
            )}

            {!filtersVisible && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  {hasActiveFilters
                    ? `${appliedFilters.length} filtro(s) ativo(s) com o painel recolhido.`
                    : 'Nenhum filtro adicional aplicado no momento.'}
                </div>
                {errorMessage && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total de metas"
            value={String(totalGoals)}
            subtitle="Recorte atual do dashboard"
            icon={<Target size={18} />}
            tone="slate"
          />
          <SummaryCard
            title="Metas batidas"
            value={String(successGoals)}
            subtitle="Atingimento igual ou acima de 100%"
            icon={<CheckCircle2 size={18} />}
            tone="emerald"
          />
          <SummaryCard
            title="Em atenção"
            value={String(warningGoals)}
            subtitle="Entre 70% e 99% da meta"
            icon={<AlertTriangle size={18} />}
            tone="amber"
          />
          <SummaryCard
            title="Progresso global"
            value={`${globalProgress}%`}
            subtitle="Média do atingimento das metas visíveis"
            icon={<TrendingUp size={18} />}
            tone="blue"
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LayoutList size={16} className="text-blue-600" />
            Navegação por área
          </div>

          <GoalsDashboardTabNav tabs={tabDefinitions} activeTab={activeTab} onChange={setActiveTab} />

          {loading && goals.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-400 shadow-sm">
              <Loader2 size={40} className="mb-4 animate-spin text-blue-600" />
              <p className="text-sm">Calculando indicadores...</p>
            </div>
          ) : activeTab === 'executive' ? (
            <GoalsDashboardExecutiveView
              riskGoals={riskGoals}
              warningGoals={attentionGoals}
              sectorSummaries={areaSummaries}
              formatValue={formatValue}
              onSelectGoal={setSelectedGoal}
            />
          ) : (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{tabDefinitions.find((tab) => tab.id === activeTab)?.label || 'Metas'}</h2>
                    <p className="text-sm text-slate-500">Lista analítica ordenada alfabeticamente para leitura rápida e comparação entre metas.</p>
                  </div>
                  <div className="text-sm text-slate-500">{visibleGoals.length} meta(s) na aba atual</div>
                </div>
              </div>

              <GoalsDashboardTable
                goals={visibleGoals}
                formatValue={formatValue}
                getIndicatorLabel={getIndicatorLabel}
                getPeriodicityLabel={getPeriodicityLabel}
                onSelectGoal={setSelectedGoal}
                emptyMessage="Nenhuma meta encontrada nesta área com os filtros atuais."
              />
            </section>
          )}

          {!loading && goals.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              Nenhuma meta configurada para o período atual.
            </div>
          )}

          {!loading && goals.length > 0 && filteredGoals.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              Nenhuma meta encontrada com os filtros aplicados.
            </div>
          )}
        </section>
      </div>

      {selectedGoal && (() => {
        const modalGoal = {
          ...selectedGoal,
          id: (selectedGoal as DashboardGoal & { id?: number }).id ?? selectedGoal.goal_id,
          target_value: (selectedGoal as DashboardGoal & { target_value?: number }).target_value ?? selectedGoal.target,
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

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: 'slate' | 'emerald' | 'amber' | 'blue';
}) {
  const styles = {
    slate: 'border-slate-200 bg-white text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-700',
    blue: 'border-blue-200 bg-blue-50/70 text-blue-700',
  } as const;

  return (
    <div className={`rounded-[24px] border px-4 py-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <h3 className="mt-2.5 text-2xl font-bold text-slate-900 md:text-[1.75rem]">{value}</h3>
          <p className="mt-1.5 text-xs text-slate-500 md:text-sm">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-white/90 p-2.5 shadow-sm">{icon}</div>
      </div>
    </div>
  );
}
