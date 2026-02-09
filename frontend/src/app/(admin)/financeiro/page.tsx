'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DollarSign,
  FilterX,
  Calendar,
  Stethoscope,
  ChevronDown,
  Search,
  ChevronRight,
  Building2,
  RefreshCw,
  Loader2,
  GitCompareArrows,
} from 'lucide-react';
import { FinancialKPIs } from './components/FinancialKPIs';
import { HistoryTable } from './components/HistoryTable';
import { GroupList } from './components/GroupList';
import { HistoryChart } from './components/HistoryChart';
import { FinancialComparisonKPIs } from './components/FinancialComparisonKPIs';
import { ComparisonHistoryChart } from './components/ComparisonHistoryChart';
import { ComparisonHistoryTable } from './components/ComparisonHistoryTable';
import { GroupComparisonList } from './components/GroupComparisonList';

type SelectOption = { name: string; label?: string };
type DateRange = { start: string; end: string };
type ChartPoint = { label: string; total: number; qtd: number; sortKey: string };
type GroupPoint = { procedure_group: string; total: number; qtd: number };
type Totals = { total: number; qtd: number };
type Heartbeat = { status: string; last_run: string; details: string };
type ComparisonMode = 'previous' | 'yoy' | 'custom';
type ComparisonRow = {
  key: string;
  label: string;
  periodLabelA: string;
  periodLabelB: string;
  totalA: number;
  totalB: number;
  qtdA: number;
  qtdB: number;
  deltaTotal: number;
  deltaPct: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDate = (value: string) => new Date(`${value}T00:00:00`);

const addDays = (value: string, days: number) => {
  const base = parseDate(value);
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return toDateInput(next);
};

const daysBetweenInclusive = (start: string, end: string) => {
  const startMs = parseDate(start).getTime();
  const endMs = parseDate(end).getTime();
  const diff = Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
  return Math.max(diff, 1);
};

const formatMonthLabel = (value: string) => {
  const parts = String(value).split('-').map((p) => Number(p));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return '-';
  const [year, month] = parts;
  const date = new Date(year, month - 1, 1);
  try {
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
  } catch {
    return '-';
  }
};

const formatPeriodLabel = (range: DateRange) => `${range.start.split('-').reverse().join('/')} - ${range.end.split('-').reverse().join('/')}`;

const alignSeriesByPosition = (
  base: ChartPoint[],
  compare: ChartPoint[],
  kind: 'daily' | 'monthly'
): ComparisonRow[] => {
  const baseSorted = [...base].sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  const compareSorted = [...compare].sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  const maxRows = Math.max(baseSorted.length, compareSorted.length);

  return Array.from({ length: maxRows }).map((_, index) => {
    const a = baseSorted[index];
    const b = compareSorted[index];
    const totalA = a?.total || 0;
    const totalB = b?.total || 0;
    const qtdA = a?.qtd || 0;
    const qtdB = b?.qtd || 0;
    const deltaTotal = totalA - totalB;
    const deltaPct = totalB === 0 ? null : (deltaTotal / totalB) * 100;
    const periodLabelA = a?.label || '-';
    const periodLabelB = b?.label || '-';
    const label =
      periodLabelA === periodLabelB
        ? periodLabelA
        : kind === 'daily'
          ? `Dia ${index + 1}`
          : `Mes ${index + 1}`;

    return {
      key: `${kind}-${index + 1}`,
      label,
      periodLabelA,
      periodLabelB,
      totalA,
      totalB,
      qtdA,
      qtdB,
      deltaTotal,
      deltaPct,
    };
  });
};

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) => (opt.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedLabel = value === 'all' ? placeholder : value;

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer min-w-[220px] justify-between hover:bg-slate-100 transition"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Stethoscope size={16} className="text-slate-500 flex-shrink-0" />
          <span className="text-sm text-slate-700 truncate max-w-[180px]">{selectedLabel}</span>
        </div>
        <ChevronDown size={14} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-[300px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center bg-white px-2 rounded-lg border border-slate-200">
              <Search size={14} className="text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Pesquisar..."
                className="w-full p-2 text-sm outline-none bg-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
            <div
              onClick={() => {
                onChange('all');
                setIsOpen(false);
              }}
              className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${
                value === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'
              }`}
            >
              Todos
            </div>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt.name}
                  onClick={() => {
                    onChange(opt.name);
                    setIsOpen(false);
                  }}
                  className={`px-4 py-2 text-sm cursor-pointer border-t border-slate-50 hover:bg-blue-50 hover:text-blue-700 ${
                    value === opt.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'
                  }`}
                >
                  {opt.name}
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">Nenhum encontrado.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function FinancialPage() {
  const today = toDateInput(new Date());
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedProcedure, setSelectedProcedure] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState('all');

  const [dateRange, setDateRange] = useState<DateRange>({
    start: toDateInput(new Date(new Date().getFullYear(), 0, 1)),
    end: today,
  });

  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previous');
  const [comparisonCustomRange, setComparisonCustomRange] = useState<DateRange>({
    start: addDays(today, -30),
    end: today,
  });
  const [lockDuration, setLockDuration] = useState(true);

  const [daily, setDaily] = useState<ChartPoint[]>([]);
  const [monthly, setMonthly] = useState<ChartPoint[]>([]);
  const [groupStats, setGroupStats] = useState<GroupPoint[]>([]);
  const [groups, setGroups] = useState<SelectOption[]>([]);
  const [procedures, setProcedures] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<SelectOption[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, qtd: 0 });

  const [compareDaily, setCompareDaily] = useState<ChartPoint[]>([]);
  const [compareMonthly, setCompareMonthly] = useState<ChartPoint[]>([]);
  const [compareGroupStats, setCompareGroupStats] = useState<GroupPoint[]>([]);
  const [compareTotals, setCompareTotals] = useState<Totals>({ total: 0, qtd: 0 });

  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const comparisonRange = useMemo<DateRange>(() => {
    const duration = daysBetweenInclusive(dateRange.start, dateRange.end);

    if (comparisonMode === 'previous') {
      const end = addDays(dateRange.start, -1);
      const start = addDays(end, -(duration - 1));
      return { start, end };
    }

    if (comparisonMode === 'yoy') {
      const startDate = parseDate(dateRange.start);
      const endDate = parseDate(dateRange.end);
      const start = toDateInput(new Date(startDate.getFullYear() - 1, startDate.getMonth(), startDate.getDate()));
      const end = toDateInput(new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate()));
      return { start, end };
    }

    if (!lockDuration) return comparisonCustomRange;

    const end = addDays(comparisonCustomRange.start, duration - 1);
    return { start: comparisonCustomRange.start, end };
  }, [comparisonMode, comparisonCustomRange, dateRange.start, dateRange.end, lockDuration]);

  const labelA = useMemo(() => formatPeriodLabel(dateRange), [dateRange]);
  const labelB = useMemo(() => formatPeriodLabel(comparisonRange), [comparisonRange]);

  const normalizeDaily = (rows: Array<{ d: string; total: number; qtd: number }>): ChartPoint[] =>
    (rows || []).map((row) => ({
      label: row.d?.split('-').reverse().slice(0, 2).join('/') || '?',
      total: Number(row.total || 0),
      qtd: Number(row.qtd || 0),
      sortKey: row.d || '',
    }));

  const normalizeMonthly = (rows: Array<{ m: string; total: number; qtd: number }>): ChartPoint[] =>
    (rows || []).map((row) => ({
      label: formatMonthLabel(row.m),
      total: Number(row.total || 0),
      qtd: Number(row.qtd || 0),
      sortKey: row.m || '',
    }));

  const fetchFinancial = async (range: DateRange, forceFresh = false) => {
    const params = new URLSearchParams({
      unit: selectedUnit,
      group: selectedGroup,
      procedure: selectedProcedure,
      startDate: range.start,
      endDate: range.end,
    });
    if (forceFresh) params.set('refresh', Date.now().toString());

    const res = await fetch(`/api/admin/financial/history?${params.toString()}`);
    return res.json();
  };

  const fetchData = async (forceFresh = false) => {
    if (!heartbeat) setLoading(true);

    try {
      const requests: [Promise<any>, Promise<any> | null] = [
        fetchFinancial(dateRange, forceFresh),
        comparisonEnabled ? fetchFinancial(comparisonRange, forceFresh) : null,
      ];

      const [baseData, compareData] = await Promise.all([
        requests[0],
        requests[1] ?? Promise.resolve(null),
      ]);

      if (baseData && !baseData.error) {
        setDaily(normalizeDaily(baseData.daily || []));
        setMonthly(normalizeMonthly(baseData.monthly || []));

        if (selectedUnit === 'all') {
          setUnits(
            (baseData.units || []).map((item: SelectOption) => ({
              ...item,
              label: item.name,
            }))
          );
        }
        if (selectedGroup === 'all') {
          setGroups(
            (baseData.groups || []).map((item: any) => ({
              ...item,
              label: item.procedure_group || item.label || item.name || 'Desconhecido',
            }))
          );
        }
        if (selectedProcedure === 'all') {
          setProcedures(baseData.procedures || []);
        }

        setGroupStats(baseData.groupStats || baseData.groups || []);
        setTotals(baseData.totals || { total: 0, qtd: 0 });

        if (baseData.heartbeat) {
          setHeartbeat(baseData.heartbeat);
          if (baseData.heartbeat.status === 'RUNNING' || baseData.heartbeat.status === 'PENDING') {
            setIsUpdating(true);
            setTimeout(() => fetchData(true), 3000);
          } else {
            setIsUpdating(false);
          }
        }
      }

      if (comparisonEnabled && compareData && !compareData.error) {
        setCompareDaily(normalizeDaily(compareData.daily || []));
        setCompareMonthly(normalizeMonthly(compareData.monthly || []));
        setCompareGroupStats(compareData.groupStats || compareData.groups || []);
        setCompareTotals(compareData.totals || { total: 0, qtd: 0 });
      } else {
        setCompareDaily([]);
        setCompareMonthly([]);
        setCompareGroupStats([]);
        setCompareTotals({ total: 0, qtd: 0 });
      }
    } catch (error) {
      console.error('Erro Financeiro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdate = async () => {
    setIsUpdating(true);
    try {
      await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'worker_faturamento_scraping' }),
      });
      setTimeout(() => fetchData(true), 1000);
    } catch (error) {
      console.error(error);
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedUnit,
    selectedGroup,
    selectedProcedure,
    dateRange.start,
    dateRange.end,
    comparisonEnabled,
    comparisonMode,
    comparisonCustomRange.start,
    comparisonCustomRange.end,
    lockDuration,
  ]);

  const formatLastUpdate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
    try {
      const parsed = new Date(isoString);
      return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleString('pt-BR');
    } catch {
      return dateString;
    }
  };

  const monthlyComparisonRows = useMemo<ComparisonRow[]>(
    () => alignSeriesByPosition(monthly, compareMonthly, 'monthly'),
    [monthly, compareMonthly]
  );

  const dailyComparisonRows = useMemo<ComparisonRow[]>(
    () => alignSeriesByPosition(daily, compareDaily, 'daily'),
    [daily, compareDaily]
  );

  const groupComparisonRows = useMemo(() => {
    const baseMap = new Map(
      groupStats.map((item) => [String(item.procedure_group || '').trim(), { total: Number(item.total || 0), qtd: Number(item.qtd || 0) }])
    );
    const compareMap = new Map(
      compareGroupStats.map((item) => [String(item.procedure_group || '').trim(), { total: Number(item.total || 0), qtd: Number(item.qtd || 0) }])
    );

    const keys = Array.from(new Set([...baseMap.keys(), ...compareMap.keys()]))
      .filter((key) => key.length > 0)
      .sort((a, b) => a.localeCompare(b));

    return keys.map((key) => {
      const a = baseMap.get(key);
      const b = compareMap.get(key);
      const totalA = a?.total || 0;
      const totalB = b?.total || 0;
      const qtdA = a?.qtd || 0;
      const qtdB = b?.qtd || 0;
      const deltaTotal = totalA - totalB;
      const deltaPct = totalB === 0 ? null : (deltaTotal / totalB) * 100;
      return {
        group: key,
        totalA,
        totalB,
        qtdA,
        qtdB,
        deltaTotal,
        deltaPct,
      };
    });
  }, [groupStats, compareGroupStats]);

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative">
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md">
              <DollarSign size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Financeiro</h1>
              <p className="text-slate-500 text-xs">Analise de faturamento, volume e ticket medio.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {heartbeat && (
              <div className="hidden sm:flex flex-col items-end text-xs border-r border-slate-200 pr-4">
                <span className="font-bold uppercase text-slate-400 tracking-wider mb-0.5">Ultima Sincronizacao</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${isUpdating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="font-medium text-slate-600">{formatLastUpdate(heartbeat.last_run)}</span>
                </div>
              </div>
            )}

            <button
              onClick={handleManualUpdate}
              disabled={isUpdating}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all border whitespace-nowrap ${
                isUpdating
                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-wait'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              {isUpdating ? 'Sincronizando...' : 'Atualizar'}
            </button>

            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600"
              title={filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            >
              {filtersExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>

        {filtersExpanded && (
          <div className="p-6 space-y-4 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Calendar size={14} />
                  Periodo de Analise (A)
                </label>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                  <span className="text-slate-300">→</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Building2 size={14} />
                  Unidade
                </label>
                <SearchableSelect options={units} value={selectedUnit} onChange={setSelectedUnit} placeholder="Todas as Unidades" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Grupo de Procedimento</label>
                <SearchableSelect options={groups} value={selectedGroup} onChange={setSelectedGroup} placeholder="Todos os Grupos" />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Procedimento</label>
                <SearchableSelect
                  options={procedures}
                  value={selectedProcedure}
                  onChange={setSelectedProcedure}
                  placeholder="Todos Procedimentos"
                />
              </div>

              <div>
                {(selectedUnit !== 'all' || selectedGroup !== 'all' || selectedProcedure !== 'all') && (
                  <button
                    onClick={() => {
                      setSelectedUnit('all');
                      setSelectedGroup('all');
                      setSelectedProcedure('all');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition font-medium text-sm"
                    title="Limpar todos os filtros"
                  >
                    <FilterX size={16} />
                    Limpar Filtros
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GitCompareArrows size={16} className="text-slate-600" />
                  <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Comparacao de Periodos</span>
                </div>
                <button
                  onClick={() => setComparisonEnabled((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    comparisonEnabled
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {comparisonEnabled ? 'Comparacao ativada' : 'Ativar comparacao'}
                </button>
              </div>

              {comparisonEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider block">Modelo do Periodo Comparado (B)</label>
                    <select
                      value={comparisonMode}
                      onChange={(e) => setComparisonMode(e.target.value as ComparisonMode)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="previous">Periodo anterior equivalente</option>
                      <option value="yoy">Mesmo periodo do ano anterior</option>
                      <option value="custom">Periodo personalizado</option>
                    </select>
                    {comparisonMode === 'custom' && (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={lockDuration}
                          onChange={(e) => setLockDuration(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        Manter a mesma duracao do periodo A
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Faixa de Datas do Periodo B</label>
                    <div className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-lg border border-slate-200">
                      <input
                        type="date"
                        value={comparisonRange.start}
                        onChange={(e) => setComparisonCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                        disabled={comparisonMode !== 'custom'}
                        className="bg-transparent text-sm text-slate-700 outline-none flex-1 disabled:text-slate-400"
                      />
                      <span className="text-slate-300">→</span>
                      <input
                        type="date"
                        value={comparisonRange.end}
                        onChange={(e) => setComparisonCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                        disabled={comparisonMode !== 'custom' || lockDuration}
                        className="bg-transparent text-sm text-slate-700 outline-none flex-1 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {comparisonEnabled ? (
        <FinancialComparisonKPIs base={totals} compare={compareTotals} labelA={labelA} labelB={labelB} />
      ) : (
        <FinancialKPIs data={totals} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        <div className="lg:col-span-1">
          {comparisonEnabled ? (
            <GroupComparisonList
              rows={groupComparisonRows}
              selected={selectedGroup}
              onSelect={(group) => {
                setSelectedGroup(group);
                setSelectedProcedure('all');
              }}
              className="h-[350px]"
            />
          ) : (
            <GroupList
              groups={groupStats}
              selected={selectedGroup}
              onSelect={(group) => {
                setSelectedGroup(group);
                setSelectedProcedure('all');
              }}
              className="h-[350px]"
            />
          )}
        </div>

        <div className="lg:col-span-1">
          {comparisonEnabled ? (
            <ComparisonHistoryChart
              title="Evolucao Mensal (Comparativo)"
              data={monthlyComparisonRows}
              labelA={labelA}
              labelB={labelB}
              className="h-[350px]"
            />
          ) : (
            <HistoryChart title="Evolucao Mensal" data={monthly} color="#1e3a8a" className="h-[350px]" />
          )}
        </div>

        <div className="lg:col-span-1">
          {comparisonEnabled ? (
            <ComparisonHistoryTable title="Detalhe Mensal (Comparativo)" data={monthlyComparisonRows} className="h-[350px]" />
          ) : (
            <HistoryTable title="Detalhe Mensal" data={monthly} className="h-[350px]" />
          )}
        </div>

        <div className="lg:col-span-2">
          {comparisonEnabled ? (
            <ComparisonHistoryChart
              title="Curva Diaria (Comparativo)"
              data={dailyComparisonRows}
              labelA={labelA}
              labelB={labelB}
              className="h-[400px]"
            />
          ) : (
            <HistoryChart title="Curva Diaria" data={daily} color="#0ea5e9" className="h-[400px]" />
          )}
        </div>

        <div className="lg:col-span-1">
          {comparisonEnabled ? (
            <ComparisonHistoryTable title="Detalhe Diario (Comparativo)" data={dailyComparisonRows} className="h-[400px]" />
          ) : (
            <HistoryTable title="Detalhe Diario" data={daily} className="h-[400px]" />
          )}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm">
            <Loader2 className="animate-spin text-blue-600" size={16} />
            <span className="text-sm text-slate-700">Carregando dados financeiros...</span>
          </div>
        </div>
      )}
    </div>
  );
}
