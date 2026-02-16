"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
// SearchableSelect igual ao financeiro
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  icon: Icon,
}: {
  options: { name: string; label?: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: any;
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
  const selectedLabel = value === 'all' ? placeholder : (options.find(o => o.name === value)?.label || value);

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer min-w-[220px] justify-between hover:bg-slate-100 transition"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {Icon && <Icon size={16} className="text-slate-500 flex-shrink-0" />}
          <span className="text-sm text-slate-700 truncate max-w-[180px]">{selectedLabel}</span>
        </div>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-slate-400"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-[300px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center bg-white px-2 rounded-lg border border-slate-200">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="text-slate-400"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
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
          <div className="max-h-60 overflow-y-auto">
            <div
              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
              onClick={() => { onChange('all'); setIsOpen(false); }}
            >
              {placeholder}
            </div>
            {filteredOptions.map((opt) => (
              <div
                key={opt.name}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
                onClick={() => { onChange(opt.name); setIsOpen(false); }}
              >
                {opt.label || opt.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
import { RefreshCw, Loader2, Calendar, Clock, CalendarCheck } from 'lucide-react';
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

export default function AgendamentosPage() {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
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
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const monthStartStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

  const [dateRange, setDateRange] = useState({ start: monthStartStr, end: todayStr });
  const [aggregateBy, setAggregateBy] = useState<'day'|'month'|'year'>('day');
  const [filters, setFilters] = useState({ scheduled_by: 'all', specialty: 'all', professional: 'all', status: 'all' });
  const [distincts, setDistincts] = useState<any>({ scheduled_by: [], specialty: [], professional: [], status_ids: [] });
  const [series, setSeries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const buildQuery = () => {
    const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end, aggregateBy });
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') params.set(k, String(v)); });
    params.set('distincts', 'true');
    return `/api/admin/agendamentos?${params.toString()}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildQuery());
      const j = await res.json();
      setSeries(j.series || []);
      setStats(j.stats || null);
      setHeartbeat(j.heartbeat || null);
      if (j.distincts) setDistincts(j.distincts);
    } catch (e) {
      console.error('Erro fetch agendamentos', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [dateRange, aggregateBy, filters]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch('/api/admin/agendamentos', { method: 'POST' });
      // trigger a refetch
      setTimeout(fetchData, 1000);
    } finally { setLoading(false); }
  };

  const chartData = useMemo(() => {
    return series.map((s: any) => ({ x: s.period, total: Number(s.total || 0), confirmados: Number(s.confirmados || 0) }));
  }, [series]);

  const formatPeriodLabel = (period: string) => {
    if (!period) return '-';
    try {
      if (aggregateBy === 'day') {
        // period expected YYYY-MM-DD
        const [y, m, d] = String(period).split('-');
        if (y && m && d) return `${d}/${m}/${y}`;
        return period;
      }
      if (aggregateBy === 'month') {
        // period expected YYYY-MM
        const [y, m] = String(period).split('-');
        if (y && m) return `${m}/${y}`;
        return period;
      }
      if (aggregateBy === 'year') {
        return String(period);
      }
      return period;
    } catch {
      return period;
    }
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative mb-6">
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
                <span className="font-bold uppercase text-slate-400 tracking-wider mb-0.5">Última Sincronização</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${heartbeat.status === 'RUNNING' || heartbeat.status === 'PENDING' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="font-medium text-slate-600">{heartbeat?.last_run ?? 'Nunca'}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all border whitespace-nowrap ${loading ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
            <button
              onClick={() => setFiltersExpanded((v) => !v)}
              className="ml-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 text-xs font-medium"
            >
              {filtersExpanded ? 'Recolher Filtros' : 'Expandir Filtros'}
            </button>
          </div>
        </div>
        {filtersExpanded && (
          <div className="p-6 pb-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Agrupar por</label>
                <select value={aggregateBy} onChange={(e) => setAggregateBy(e.target.value as any)} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <option value="day">Dia</option>
                  <option value="month">Mês</option>
                  <option value="year">Ano</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Responsável</label>
                <SearchableSelect
                  options={[{ name: 'all', label: 'Todos' }, ...distincts.scheduled_by.map((v: any) => ({ name: v, label: v }))]}
                  value={filters.scheduled_by}
                  onChange={val => setFilters(f => ({ ...f, scheduled_by: val }))}
                  placeholder="Todos"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Especialidade</label>
                <SearchableSelect
                  options={[{ name: 'all', label: 'Todas' }, ...distincts.specialty.map((v: any) => ({ name: v, label: v }))]}
                  value={filters.specialty}
                  onChange={val => setFilters(f => ({ ...f, specialty: val }))}
                  placeholder="Todas"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Profissional</label>
                <SearchableSelect
                  options={[{ name: 'all', label: 'Todos' }, ...distincts.professional.map((v: any) => ({ name: v, label: v }))]}
                  value={filters.professional}
                  onChange={val => setFilters(f => ({ ...f, professional: val }))}
                  placeholder="Todos"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Status</label>
                <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <option value="all">Todos</option>
                  {distincts.status_ids.map((v: any) => <option key={v} value={v}>{STATUS_MAP[v] ?? String(v)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <AgendamentoKPIs total={stats?.totalPeriod || 0} confirmRate={stats?.confirmedRate || 0} />

      <div className="bg-white p-4 rounded shadow mb-6" style={{ height: 360 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin"/></div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tickFormatter={(v) => formatPeriodLabel(String(v))} />
              <YAxis />
              <Tooltip labelFormatter={(label) => formatPeriodLabel(String(label))} />
              <Line type="monotone" dataKey="total" stroke="#8884d8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="confirmados" stroke="#82ca9d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
