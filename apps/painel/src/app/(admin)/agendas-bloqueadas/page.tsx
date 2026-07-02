"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Calendar,
  CalendarX2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Stethoscope,
} from 'lucide-react';
import { getBlockedAgendasDefaultRange } from '@/lib/agendas_bloqueadas/date_range';
import type { BlockedAgendaItem, BlockedAgendaJob } from '@/lib/agendas_bloqueadas/types';
import { hasPermission } from '@/lib/permissions';
import { BlockedAgendasTable, type BlockedAgendasSortKey } from './components/BlockedAgendasTable';

type Totals = {
  totalBlocks: number;
  activeBlocks: number;
  professionalsWithActiveBlocks: number;
  recurringBlocks: number;
};

const unitOptions = [
  { value: 'all', label: 'Todas as unidades' },
  { value: '2', label: 'Ouro Verde' },
  { value: '3', label: 'Centro Cambui' },
  { value: '12', label: 'Shopping Campinas' },
] as const;

const recurrenceOptions = [
  { value: 'all', label: 'Todos os bloqueios' },
  { value: 'recurring', label: 'Somente recorrentes' },
  { value: 'single', label: 'Somente pontuais' },
] as const;

const situationOptions = [
  { value: 'active', label: 'Ativos no recorte' },
  { value: 'all', label: 'Todos do recorte' },
] as const;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR');

export default function AgendasBloqueadasPage() {
  const { data: session } = useSession();
  type SessionUser = { role?: string; permissions?: unknown };
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || 'OPERADOR');

  const canView = hasPermission(sessionUser.permissions, 'agendas_bloqueadas', 'view', role);
  const canRefresh = hasPermission(sessionUser.permissions, 'agendas_bloqueadas', 'refresh', role);

  const defaults = getBlockedAgendasDefaultRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [unit, setUnit] = useState<'all' | '2' | '3' | '12'>('all');
  const [professionalId, setProfessionalId] = useState('');
  const [recurrence, setRecurrence] = useState<'all' | 'recurring' | 'single'>('all');
  const [situation, setSituation] = useState<'active' | 'all'>('active');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<BlockedAgendaItem[]>([]);
  const [totals, setTotals] = useState<Totals>({
    totalBlocks: 0,
    activeBlocks: 0,
    professionalsWithActiveBlocks: 0,
    recurringBlocks: 0,
  });
  const [professionals, setProfessionals] = useState<Array<{ professionalId: number; professionalName: string }>>([]);
  const [latestJob, setLatestJob] = useState<BlockedAgendaJob | null>(null);
  const [heartbeat, setHeartbeat] = useState<{ status: string; lastRun: string | null; details: string }>({
    status: 'UNKNOWN',
    lastRun: null,
    details: '',
  });

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sortKey, setSortKey] = useState<BlockedAgendasSortKey>('dateStart');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [refreshHovered, setRefreshHovered] = useState(false);

  const loadData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!canView) return;

      if (silent) {
        setPolling(true);
      } else {
        setLoading(true);
        setError('');
      }

      try {
        const qs = new URLSearchParams({
          startDate,
          endDate,
          unit,
          professionalId,
          recurrence,
          situation,
          search,
        }).toString();
        const res = await fetch(`/api/admin/agendas-bloqueadas?${qs}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Falha ao carregar agendas bloqueadas.');

        setRows(Array.isArray(data?.data?.rows) ? data.data.rows : []);
        setTotals(
          data?.data?.totals || {
            totalBlocks: 0,
            activeBlocks: 0,
            professionalsWithActiveBlocks: 0,
            recurringBlocks: 0,
          }
        );
        setProfessionals(Array.isArray(data?.data?.professionals) ? data.data.professionals : []);
        setLatestJob(data?.data?.latestJob || null);
        setHeartbeat(data?.data?.heartbeat || { status: 'UNKNOWN', lastRun: null, details: '' });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
      } finally {
        if (silent) {
          setPolling(false);
        } else {
          setLoading(false);
        }
      }
    },
    [canView, endDate, professionalId, recurrence, search, situation, startDate, unit]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!latestJob) return;
    const running = ['PENDING', 'RUNNING'].includes(String(latestJob.status || '').toUpperCase());
    if (!running) return;

    const timer = setTimeout(() => {
      loadData({ silent: true });
    }, 4000);

    return () => clearTimeout(timer);
  }, [latestJob, loadData]);

  const sortedRows = useMemo(() => {
    const recurrenceLabel = (row: BlockedAgendaItem) =>
      row.isRecurring ? `1-${row.weekDays.join(',')}` : '0-pontual';
    const statusLabel = (row: BlockedAgendaItem) => row.statusLabels.join(' | ');

    const getComparableValue = (row: BlockedAgendaItem, key: BlockedAgendasSortKey) => {
      if (key === 'recurrence') return recurrenceLabel(row);
      if (key === 'status') return statusLabel(row);
      if (key === 'description') return row.description || '';
      return row[key];
    };

    return [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const left = getComparableValue(a, sortKey);
      const right = getComparableValue(b, sortKey);

      if (sortKey === 'dateStart') {
        const dateCompare = a.dateStart.localeCompare(b.dateStart) || a.dateEnd.localeCompare(b.dateEnd);
        return dateCompare * dir;
      }

      if (sortKey === 'timeStart') {
        const timeCompare = a.timeStart.localeCompare(b.timeStart) || a.timeEnd.localeCompare(b.timeEnd);
        return timeCompare * dir;
      }

      return String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [rows, sortDir, sortKey]);

  const onSort = (key: BlockedAgendasSortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'professionalName' || key === 'unitNamesText' || key === 'description' || key === 'status' ? 'asc' : 'desc');
  };

  const heartbeatLabel = polling ? 'Atualizando status' : 'Ultima sincronizacao';
  const heartbeatTone =
    polling || ['PENDING', 'RUNNING'].includes(String(latestJob?.status || '').toUpperCase())
      ? 'bg-amber-500'
      : heartbeat.status === 'HEALTHY' || heartbeat.status === 'COMPLETED'
        ? 'bg-emerald-500'
        : heartbeat.status === 'FAILED'
          ? 'bg-rose-500'
          : 'bg-slate-400';

  const onRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/agendas-bloqueadas/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          unit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao solicitar atualizacao.');

      setNotice('Atualizacao enfileirada. O ultimo snapshot concluido segue visivel ate a nova execucao terminar.');
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao solicitar atualizacao.');
    } finally {
      setRefreshing(false);
    }
  };

  const onExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    setError('');
    try {
      const qs = new URLSearchParams({
        startDate,
        endDate,
        unit,
        professionalId,
        recurrence,
        situation,
        search,
        format,
      }).toString();
      const res = await fetch(`/api/admin/agendas-bloqueadas/export?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Falha ao exportar ${format.toUpperCase()}.`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agendas-bloqueadas-${startDate}_${endDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro na exportacao.');
    } finally {
      setExporting(null);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Sem permissao para visualizar este modulo.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex flex-col gap-6">
        <header className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#17407E] via-blue-600 to-cyan-500" />
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-[#17407E] p-3 text-white shadow-md">
                  <CalendarX2 size={24} />
                </div>
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-slate-800">Agendas bloqueadas</h1>
                  <p className="text-sm text-slate-500">
                    Mapa operacional para revisar bloqueios ativos e recorrentes dos medicos no Feegow.
                  </p>
                  <p className="text-xs text-slate-400">
                    A tela abre com o mes atual e mais 2 meses futuros para apoiar a liberacao e o ajuste da agenda.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div
                    className="relative"
                    onMouseEnter={() => setRefreshHovered(true)}
                    onMouseLeave={() => setRefreshHovered(false)}
                  >
                    <button
                      type="button"
                      onClick={onRefresh}
                      disabled={!canRefresh || refreshing}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#17407E] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123462] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                      {refreshing ? 'Solicitando...' : 'Atualizar dados'}
                    </button>

                    {refreshHovered ? (
                      <div className="absolute right-0 top-full z-20 mt-2 w-[320px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          {heartbeatLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${heartbeatTone} ${polling ? 'animate-pulse' : ''}`} />
                          <span className="text-sm font-medium text-slate-700">
                            {formatDateTime(heartbeat.lastRun)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {polling
                            ? 'Sincronizando status em segundo plano.'
                            : heartbeat.details || 'Acompanhamento do worker dedicado do relatorio.'}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onExport('xlsx')}
                    disabled={exporting !== null}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Exportar XLSX
                  </button>

                  <button
                    type="button"
                    onClick={() => onExport('pdf')}
                    disabled={exporting !== null}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Exportar PDF
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltersExpanded((current) => !current)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      title={filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
                    >
                      {filtersExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {filtersExpanded ? (
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      <Calendar size={14} />
                      Periodo de analise
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          const nextStart = e.target.value;
                          setStartDate(nextStart);
                          if (endDate && endDate < nextStart) setEndDate(nextStart);
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
                      />
                      <span className="text-slate-300">→</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          const nextEnd = e.target.value;
                          setEndDate(nextEnd);
                          if (startDate && startDate > nextEnd) setStartDate(nextEnd);
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Unidade
                      </label>
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value as 'all' | '2' | '3' | '12')}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                      >
                        {unitOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Situacao
                      </label>
                      <select
                        value={situation}
                        onChange={(e) => setSituation(e.target.value as 'active' | 'all')}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                      >
                        {situationOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Recorrencia
                      </label>
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as 'all' | 'recurring' | 'single')}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                      >
                        {recurrenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      <Stethoscope size={14} />
                      Medico
                    </label>
                    <select
                      value={professionalId}
                      onChange={(e) => setProfessionalId(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                    >
                      <option value="">Todos os medicos</option>
                      {professionals.map((item) => (
                        <option key={item.professionalId} value={String(item.professionalId)}>
                          {item.professionalName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      <Search size={14} />
                      Motivo ou descricao
                    </label>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar no motivo do bloqueio"
                      className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {(error || notice) && (
          <div className="space-y-3">
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Bloqueios no recorte</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">{formatNumber(totals.totalBlocks)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Bloqueios ativos</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">{formatNumber(totals.activeBlocks)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Medicos com bloqueio ativo</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">{formatNumber(totals.professionalsWithActiveBlocks)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Bloqueios recorrentes</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">{formatNumber(totals.recurringBlocks)}</p>
          </div>
        </section>

        <BlockedAgendasTable rows={sortedRows} loading={loading} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      </div>
    </div>
  );
}
