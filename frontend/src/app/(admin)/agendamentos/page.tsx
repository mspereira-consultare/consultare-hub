'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Calendar,
  Stethoscope,
  Search,
  FilterX,
} from 'lucide-react';
import { AgendamentoKPIs } from './AgendamentoKPIs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type SelectOption = { name: string; label?: string };
type DateRange = { start: string; end: string };
type Heartbeat = { status: string; last_run: string; details: string };

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

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

// Mesmo SearchableSelect do /financeiro (mantém padrão visual e comportamento)
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

  const filteredOptions = options.filter((opt) =>
    (opt.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
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

export default function AgendamentosPage() {
  const STATUS_MAP: Record<number, string> = {
    1: 'MARCADO - NÃO CONFIRMADO',
    2: 'EM ANDAMENTO',
    3: 'ATENDIDO',
    4: 'EM ATENDIMENTO/AGUARDANDO',
    6: 'NÃO COMPARECEU',
    7: 'MARCADO - CONFIRMADO',
    11: 'DESMARCADO PELO PACIENTE',
    15: 'REMARCADO',
    16: 'DESMARCADO PELO PROFISSIONAL',
    22: 'CANCELADO PELO PROFISSIONAL',
  };

  const today = toDateInput(new Date());
  const monthStart = toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange>({ start: monthStart, end: today });
  const [aggregateBy, setAggregateBy] = useState<'day' | 'month' | 'year'>('day');

  const [filters, setFilters] = useState({
    scheduled_by: 'all',
    specialty: 'all',
    professional: 'all',
    status: 'all',
  });

  const [distincts, setDistincts] = useState<{
    scheduled_by: string[];
    specialty: string[];
    professional: string[];
    status_ids: number[];
  }>({
    scheduled_by: [],
    specialty: [],
    professional: [],
    status_ids: [],
  });

  const [series, setSeries] = useState<Array<{ period: string; total: number; confirmados: number; nao_compareceu?: number }>>(
    []
  );
  const [stats, setStats] = useState<{ totalPeriod: number; confirmedRate: number }>({ totalPeriod: 0, confirmedRate: 0 });

  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const hasAnyFilter =
    aggregateBy !== 'day' ||
    filters.scheduled_by !== 'all' ||
    filters.specialty !== 'all' ||
    filters.professional !== 'all' ||
    filters.status !== 'all';

  const fetchData = async (forceFresh = false) => {
    if (!heartbeat) setLoading(true);

    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        aggregateBy,
        scheduled_by: filters.scheduled_by,
        specialty: filters.specialty,
        professional: filters.professional,
        status: filters.status,
        distincts: 'true',
      });

      if (forceFresh) params.set('refresh', Date.now().toString());

      const res = await fetch(`/api/admin/agendamentos?${params.toString()}`);
      const j = await res.json();

      setSeries(j.series || []);
      setStats(j.stats || { totalPeriod: 0, confirmedRate: 0 });

      if (j.distincts) {
        setDistincts({
          scheduled_by: j.distincts.scheduled_by || [],
          specialty: j.distincts.specialty || [],
          professional: j.distincts.professional || [],
          status_ids: j.distincts.status_ids || [],
        });
      }

      if (j.heartbeat) {
        setHeartbeat(j.heartbeat);
        const running = j.heartbeat.status === 'RUNNING' || j.heartbeat.status === 'PENDING';
        setIsUpdating(running);

        if (running) {
          setTimeout(() => fetchData(true), 3000);
        }
      }
    } catch (error) {
      console.error('Erro Agendamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdate = async () => {
    setIsUpdating(true);
    try {
      await fetch('/api/admin/agendamentos', { method: 'POST' });
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
    dateRange.start,
    dateRange.end,
    aggregateBy,
    filters.scheduled_by,
    filters.specialty,
    filters.professional,
    filters.status,
  ]);

  const chartData = useMemo(() => {
    return (series || []).map((row) => ({
      period: row.period,
      total: Number(row.total || 0),
      confirmados: Number(row.confirmados || 0),
      nao_compareceu: Number(row.nao_compareceu || 0),
    }));
  }, [series]);

  const formatPeriodTick = (value: any) => {
    const v = String(value || '');
    if (!v) return '-';

    if (aggregateBy === 'day') {
      // YYYY-MM-DD -> DD/MM
      const parts = v.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
      return v;
    }

    if (aggregateBy === 'month') {
      // YYYY-MM -> MM/YY
      const parts = v.split('-');
      if (parts.length === 2) return `${parts[1]}/${String(parts[0]).slice(2)}`;
      return v;
    }

    return v; // year
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative">
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md">
              <CalendarCheck size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Agendamentos</h1>
              <p className="text-slate-500 text-xs">Histórico e evolução de agendamentos.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {heartbeat && (
              <div className="hidden sm:flex flex-col items-end text-xs border-r border-slate-200 pr-4">
                <span className="font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                  Ultima Sincronizacao
                </span>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isUpdating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-medium text-slate-600">
                    {formatLastUpdate(heartbeat.last_run)}
                  </span>
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
            {/* LINHA 1 (igual padrão do /financeiro): Período + (Agrupar por + Status) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Calendar size={14} />
                  Periodo de Analise
                </label>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setDateRange((prev) => ({
                        start: nextStart,
                        end: prev.end && prev.end < nextStart ? nextStart : prev.end,
                      }));
                    }}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                  <span className="text-slate-300">→</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setDateRange((prev) => ({
                        start: prev.start && prev.start > nextEnd ? nextEnd : prev.start,
                        end: nextEnd,
                      }));
                    }}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">
                    Agrupar por
                  </label>
                  <select
                    value={aggregateBy}
                    onChange={(e) => setAggregateBy(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700"
                  >
                    <option value="day">Dia</option>
                    <option value="month">Mes</option>
                    <option value="year">Ano</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">
                    Status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700"
                  >
                    <option value="all">Todos</option>
                    {(distincts.status_ids || []).map((v) => (
                      <option key={v} value={String(v)}>
                        {STATUS_MAP[v] ?? String(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* LINHA 2: Responsável / Especialidade / Profissional */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">
                  Responsavel
                </label>
                <SearchableSelect
                  options={(distincts.scheduled_by || []).map((name) => ({ name }))}
                  value={filters.scheduled_by}
                  onChange={(val) => setFilters((f) => ({ ...f, scheduled_by: val }))}
                  placeholder="Todos"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">
                  Especialidade
                </label>
                <SearchableSelect
                  options={(distincts.specialty || []).map((name) => ({ name }))}
                  value={filters.specialty}
                  onChange={(val) => setFilters((f) => ({ ...f, specialty: val }))}
                  placeholder="Todas"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">
                  Profissional
                </label>
                <SearchableSelect
                  options={(distincts.professional || []).map((name) => ({ name }))}
                  value={filters.professional}
                  onChange={(val) => setFilters((f) => ({ ...f, professional: val }))}
                  placeholder="Todos"
                />
              </div>
            </div>

            {/* LINHA 3: Botão limpar (padrão idêntico ao /financeiro) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="hidden md:block" />
              <div className="hidden md:block" />
              <div>
                {hasAnyFilter && (
                  <button
                    onClick={() => {
                      setAggregateBy('day');
                      setFilters({ scheduled_by: 'all', specialty: 'all', professional: 'all', status: 'all' });
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
          </div>
        )}
      </div>

      <AgendamentoKPIs total={stats.totalPeriod || 0} confirmRate={stats.confirmedRate || 0} />

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" style={{ height: 360 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tickFormatter={formatPeriodTick} />
              <YAxis />
              <Tooltip labelFormatter={(label) => formatPeriodTick(label)} />
              <Line type="monotone" dataKey="total" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="confirmados" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="nao_compareceu" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
