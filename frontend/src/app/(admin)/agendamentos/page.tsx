"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Loader2, Calendar, Clock } from 'lucide-react';
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Agendamentos</h2>
          <p className="text-sm text-slate-500">Visão histórica e evolução de agendamentos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <Calendar size={16} className="text-slate-500" />
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(d => ({ ...d, start: e.target.value }))} className="bg-transparent text-sm outline-none w-28 text-slate-700" />
            <span className="text-slate-400">até</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(d => ({ ...d, end: e.target.value }))} className="bg-transparent text-sm outline-none w-28 text-slate-700" />
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all shadow-sm border ${loading ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600">
            <Clock size={14} />
            <div>
              <div className="text-xs">Heartbeat</div>
              <div className="text-sm font-medium">{heartbeat?.status ?? 'UNKNOWN'}{heartbeat?.last_run ? ` — ${heartbeat.last_run}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
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
          <select value={filters.scheduled_by} onChange={(e) => setFilters(f => ({ ...f, scheduled_by: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <option value="all">Todos</option>
            {distincts.scheduled_by.map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Especialidade</label>
          <select value={filters.specialty} onChange={(e) => setFilters(f => ({ ...f, specialty: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <option value="all">Todas</option>
            {distincts.specialty.map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Especialidade</label>
          <select value={filters.specialty} onChange={(e) => setFilters(f => ({ ...f, specialty: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <option value="all">Todas</option>
            {distincts.specialty.map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Profissional</label>
          <select value={filters.professional} onChange={(e) => setFilters(f => ({ ...f, professional: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <option value="all">Todos</option>
            {distincts.professional.map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Status</label>
          <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <option value="all">Todos</option>
            {distincts.status_ids.map((v: any) => <option key={v} value={v}>{STATUS_MAP[v] ?? String(v)}</option>)}
          </select>
        </div>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded shadow">Total período: <strong>{stats?.totalPeriod ?? '-'}</strong></div>
        <div className="p-4 bg-white rounded shadow">Taxa confirmação: <strong>{(stats?.confirmedRate*100 || 0).toFixed(2)}%</strong></div>
        <div className="p-4 bg-white rounded shadow">Heartbeat: <strong>{heartbeat?.status || 'UNKNOWN'}</strong>{heartbeat?.last_run ? ` — ${heartbeat.last_run}` : ''}</div>
      </div>
    </div>
  );
}
