"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
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
  const [dataJob, setDataJob] = useState<BlockedAgendaJob | null>(null);
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
        setDataJob(data?.data?.dataJob || null);
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
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Agendas bloqueadas</h1>
              <p className="text-xs text-slate-500">
                Mapa operacional para revisar bloqueios ativos e recorrentes dos medicos no Feegow.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                A tela abre com o mes atual e mais 2 meses futuros para apoiar a liberacao e o ajuste da agenda.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[170px_170px_200px_160px]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'all' | '2' | '3' | '12')}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadData()}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
              >
                Atualizar tela
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              <option value="">Todos os medicos</option>
              {professionals.map((item) => (
                <option key={item.professionalId} value={String(item.professionalId)}>
                  {item.professionalName}
                </option>
              ))}
            </select>

            <select
              value={situation}
              onChange={(e) => setSituation(e.target.value as 'active' | 'all')}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              {situationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as 'all' | 'recurring' | 'single')}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              {recurrenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no motivo do bloqueio"
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!canRefresh || refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar dados
          </button>

          <button
            type="button"
            onClick={() => onExport('xlsx')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar XLSX
          </button>

          <button
            type="button"
            onClick={() => onExport('pdf')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar PDF
          </button>

          <span className="text-xs text-slate-500">
            Job atual: {latestJob ? `${latestJob.status} | ${formatDateTime(latestJob.updatedAt)}` : 'nenhum'}
          </span>
          <span className="text-xs text-slate-500">
            Snapshot visivel: {dataJob ? `${dataJob.id.slice(0, 8)} | ${formatDateTime(dataJob.updatedAt)}` : 'nenhum'}
          </span>
          <span className="text-xs text-slate-500">
            Worker: {heartbeat.status} | {formatDateTime(heartbeat.lastRun)}
          </span>
          {polling ? <span className="text-xs text-slate-500">Sincronizando status sem recarregar a tela...</span> : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Bloqueios no recorte</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.totalBlocks)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Bloqueios ativos</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.activeBlocks)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Medicos com bloqueio ativo</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.professionalsWithActiveBlocks)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Bloqueios recorrentes</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.recurringBlocks)}</p>
        </div>
      </section>

      <BlockedAgendasTable rows={sortedRows} loading={loading} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
    </div>
  );
}
