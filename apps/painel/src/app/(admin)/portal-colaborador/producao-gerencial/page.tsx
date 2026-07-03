'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';

type EntryType = 'ALL' | 'RESOLVE' | 'CHECKUP';
type MatchStatus = 'ALL' | 'MATCHED' | 'PENDING_MATCH' | 'MULTIPLE_MATCHES' | 'NO_MATCH';

type SelectOption = { value: string; label: string };

type ManagementEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  serviceDate: string;
  entryType: 'RESOLVE' | 'CHECKUP';
  patientNameRaw: string;
  matchStatus: 'PENDING_MATCH' | 'MATCHED' | 'MULTIPLE_MATCHES' | 'NO_MATCH';
  feegowPatientName: string | null;
  unitSnapshot: string | null;
  teamSnapshot: string | null;
  createdAt: string;
};

type ManagementSummary = {
  totalEntries: number;
  matchedEntries: number;
  resolveMatchedEntries: number;
  checkupMatchedEntries: number;
  pendingEntries: number;
  matchRate: number;
};

type ManagementSeriesItem = {
  date: string;
  totalEntries: number;
  matchedEntries: number;
  resolveMatchedEntries: number;
  checkupMatchedEntries: number;
  pendingEntries: number;
};

type ManagementRankingItem = {
  key: string;
  employeeId: string | null;
  employeeName: string | null;
  unit: string | null;
  team: string | null;
  totalEntries: number;
  matchedEntries: number;
  resolveMatchedEntries: number;
  checkupMatchedEntries: number;
  pendingEntries: number;
  matchRate: number;
};

type ManagementFilters = {
  startDate: string;
  endDate: string;
  employeeId: string;
  team: string;
  unit: string;
  entryType: EntryType;
  matchStatus: MatchStatus;
  page: number;
  pageSize: number;
};

type ManagementData = {
  generatedAt: string;
  filters: ManagementFilters;
  summary: ManagementSummary;
  series: ManagementSeriesItem[];
  collaboratorRanking: ManagementRankingItem[];
  teamRanking: ManagementRankingItem[];
  entries: ManagementEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filterOptions: {
    employees: SelectOption[];
    teams: string[];
    units: string[];
  };
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';

const entryTypeOptions: Array<{ value: EntryType; label: string }> = [
  { value: 'ALL', label: 'Todos os tipos' },
  { value: 'RESOLVE', label: 'Cartão Resolve' },
  { value: 'CHECKUP', label: 'Check-up' },
];

const matchStatusOptions: Array<{ value: MatchStatus; label: string }> = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'MATCHED', label: 'Vinculado' },
  { value: 'PENDING_MATCH', label: 'Pendente de vínculo' },
  { value: 'MULTIPLE_MATCHES', label: 'Múltiplos pacientes' },
  { value: 'NO_MATCH', label: 'Sem correspondência' },
];

const pageSizeOptions = [25, 50, 100, 200];

const getTodayIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getMonthStartIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).concat('-01');

const defaultFilters = (): ManagementFilters => ({
  startDate: getMonthStartIso(),
  endDate: getTodayIso(),
  employeeId: 'all',
  team: 'all',
  unit: 'all',
  entryType: 'ALL',
  matchStatus: 'ALL',
  page: 1,
  pageSize: 50,
});

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatDateTimeBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR');
const formatPercent = (value: number) => `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const buildQuery = (filters: ManagementFilters) => {
  const params = new URLSearchParams();
  params.set('startDate', filters.startDate);
  params.set('endDate', filters.endDate);
  if (filters.employeeId !== 'all') params.set('employeeId', filters.employeeId);
  if (filters.team !== 'all') params.set('team', filters.team);
  if (filters.unit !== 'all') params.set('unit', filters.unit);
  if (filters.entryType !== 'ALL') params.set('entryType', filters.entryType);
  if (filters.matchStatus !== 'ALL') params.set('matchStatus', filters.matchStatus);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return params.toString();
};

const buildExportQuery = (filters: ManagementFilters, format: 'xlsx' | 'pdf') => {
  const params = new URLSearchParams();
  params.set('format', format);
  params.set('startDate', filters.startDate);
  params.set('endDate', filters.endDate);
  if (filters.employeeId !== 'all') params.set('employeeId', filters.employeeId);
  if (filters.team !== 'all') params.set('team', filters.team);
  if (filters.unit !== 'all') params.set('unit', filters.unit);
  if (filters.entryType !== 'ALL') params.set('entryType', filters.entryType);
  if (filters.matchStatus !== 'ALL') params.set('matchStatus', filters.matchStatus);
  return params.toString();
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return payload as T;
};

function MetricCard({
  title,
  value,
  helper,
  tone = 'slate',
}: {
  title: string;
  value: string;
  helper: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber';
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-100 bg-blue-50 text-[#17407E]',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{helper}</div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${toneClass}`}>{title.split(' ')[0]}</div>
      </div>
    </div>
  );
}

function RankingTable({
  title,
  subtitle,
  rows,
  mode,
}: {
  title: string;
  subtitle: string;
  rows: ManagementRankingItem[];
  mode: 'collaborator' | 'team';
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {rows.length}
          </span>
        </div>
      </div>
      <div className="max-h-[26rem] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ranking</th>
              <th className="px-4 py-3">{mode === 'collaborator' ? 'Colaborador' : 'Equipe'}</th>
              {mode === 'collaborator' ? <th className="px-4 py-3">Unidade / equipe</th> : null}
              <th className="px-4 py-3 text-right">Vinculado</th>
              <th className="px-4 py-3 text-right">Lançado</th>
              <th className="px-4 py-3 text-right">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-500">#{index + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{mode === 'collaborator' ? (row.employeeName || 'Sem nome') : (row.team || 'Sem equipe')}</div>
                  <div className="text-xs text-slate-500">
                    Resolve {formatNumber(row.resolveMatchedEntries)} · Check-up {formatNumber(row.checkupMatchedEntries)}
                  </div>
                </td>
                {mode === 'collaborator' ? (
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {(row.unit || 'Sem unidade')} / {(row.team || 'Sem equipe')}
                  </td>
                ) : null}
                <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatNumber(row.matchedEntries)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.totalEntries)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatPercent(row.matchRate)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={mode === 'collaborator' ? 6 : 5} className="px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum dado encontrado para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EmployeePortalProductionManagementPage() {
  const [filters, setFilters] = useState<ManagementFilters>(defaultFilters());
  const [data, setData] = useState<ManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  const loadData = useCallback(async (nextFilters: ManagementFilters, mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError('');

    try {
      const query = buildQuery(nextFilters);
      const payload = await fetchJson<{ status: string; data: ManagementData }>(
        `/api/admin/portal-colaborador/producao-gerencial?${query}`,
      );
      setData(payload.data);
      setFilters(payload.data.filters);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar produção gerencial.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadData(defaultFilters(), 'initial'));
  }, [loadData]);

  const submitFilters = useCallback(() => {
    void loadData({ ...filters, page: 1 }, 'initial');
  }, [filters, loadData]);

  const resetFilters = useCallback(() => {
    const next = defaultFilters();
    setFilters(next);
    void loadData(next, 'initial');
  }, [loadData]);

  const changePage = useCallback((page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    void loadData(next, 'refresh');
  }, [filters, loadData]);

  const changePageSize = useCallback((pageSize: number) => {
    const next = { ...filters, pageSize, page: 1 };
    setFilters(next);
    void loadData(next, 'initial');
  }, [filters, loadData]);

  const handleExport = useCallback(async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const query = buildExportQuery(filters, format);
      const response = await fetch(`/api/admin/portal-colaborador/producao-gerencial/export?${query}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String((payload as { error?: unknown }).error || 'Falha ao exportar relatório.'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = format === 'pdf'
        ? 'portal-colaborador-producao-gerencial.pdf'
        : 'portal-colaborador-producao-gerencial.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : 'Falha ao exportar relatório.');
    } finally {
      setExporting(null);
    }
  }, [filters]);

  const paginationLabel = useMemo(() => {
    if (!data) return '';
    if (!data.pagination.total) return 'Nenhum lançamento encontrado';
    const start = (data.pagination.page - 1) * data.pagination.pageSize + 1;
    const end = Math.min(data.pagination.total, start + data.entries.length - 1);
    return `Mostrando ${formatNumber(start)}-${formatNumber(end)} de ${formatNumber(data.pagination.total)} lançamentos`;
  }, [data]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Inteligência</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Produção do portal do colaborador</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Visão gerencial consolidada dos lançamentos de Cartão Resolve e Check-up, com leitura histórica, filtros operacionais e foco no que efetivamente virou meta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData(filters, 'refresh')}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void handleExport('xlsx')}
              disabled={loading || exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting === 'xlsx' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              XLSX
            </button>
            <button
              type="button"
              onClick={() => void handleExport('pdf')}
              disabled={loading || exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-[#17407E] bg-[#17407E] px-3 py-2 text-sm font-medium text-white hover:bg-[#123564] disabled:opacity-60"
            >
              {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              PDF
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#17407E]">
          Apenas lançamentos com status <span className="font-semibold">Vinculado</span> entram nas metas. Os demais continuam visíveis aqui como produção registrada, mas ficam fora da contabilização gerencial.
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600">
            <Filter size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Filtros</h2>
            <p className="text-xs text-slate-500">Período, colaborador, recorte organizacional e status de vínculo.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Início</label>
            <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className={inputClassName} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fim</label>
            <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className={inputClassName} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Colaborador</label>
            <select value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))} className={inputClassName}>
              <option value="all">Todos</option>
              {data?.filterOptions.employees.map((employee) => (
                <option key={employee.value} value={employee.value}>{employee.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Equipe</label>
            <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))} className={inputClassName}>
              <option value="all">Todas</option>
              {data?.filterOptions.teams.map((team) => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unidade</label>
            <select value={filters.unit} onChange={(event) => setFilters((current) => ({ ...current, unit: event.target.value }))} className={inputClassName}>
              <option value="all">Todas</option>
              {data?.filterOptions.units.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo</label>
            <select value={filters.entryType} onChange={(event) => setFilters((current) => ({ ...current, entryType: event.target.value as EntryType }))} className={inputClassName}>
              {entryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status de vínculo</label>
            <select value={filters.matchStatus} onChange={(event) => setFilters((current) => ({ ...current, matchStatus: event.target.value as MatchStatus }))} className={inputClassName}>
              {matchStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Linhas por página</label>
            <select value={String(filters.pageSize)} onChange={(event) => changePageSize(Number(event.target.value))} className={inputClassName}>
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size} por página</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submitFilters}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#17407E] bg-[#17407E] px-3 py-2 text-sm font-medium text-white hover:bg-[#123564] disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={resetFilters}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Limpar
          </button>
          {data ? (
            <div className="ml-auto text-xs text-slate-500">
              Atualizado em {formatDateTimeBr(data.generatedAt)}
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-14 text-center shadow-sm">
          <Loader2 size={18} className="mx-auto animate-spin text-slate-500" />
          <div className="mt-3 text-sm text-slate-500">Carregando visão gerencial da produção do portal...</div>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Total lançado" value={formatNumber(data.summary.totalEntries)} helper="Tudo o que foi registrado no período filtrado." />
            <MetricCard title="Total vinculado" value={formatNumber(data.summary.matchedEntries)} helper="Somente o que encontrou paciente no Feegow." tone="emerald" />
            <MetricCard title="Resolve meta" value={formatNumber(data.summary.resolveMatchedEntries)} helper="Cartões Resolve contabilizados para meta." tone="blue" />
            <MetricCard title="Check-up meta" value={formatNumber(data.summary.checkupMatchedEntries)} helper="Check-ups contabilizados para meta." tone="blue" />
            <MetricCard title="Pendências" value={formatNumber(data.summary.pendingEntries)} helper={`Taxa de vínculo atual: ${formatPercent(data.summary.matchRate)}`} tone="amber" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Evolução diária</h2>
                <p className="mt-1 text-xs text-slate-500">Comparativo entre lançado, vinculado e contabilizado no período filtrado.</p>
              </div>
              <div className="max-h-[28rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 text-right">Lançado</th>
                      <th className="px-4 py-3 text-right">Vinculado</th>
                      <th className="px-4 py-3 text-right">Resolve</th>
                      <th className="px-4 py-3 text-right">Check-up</th>
                      <th className="px-4 py-3 text-right">Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.length ? data.series.map((item) => (
                      <tr key={item.date} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{formatDateBr(item.date)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(item.totalEntries)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatNumber(item.matchedEntries)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(item.resolveMatchedEntries)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(item.checkupMatchedEntries)}</td>
                        <td className="px-4 py-3 text-right text-amber-700">{formatNumber(item.pendingEntries)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          Sem série diária para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Leitura executiva</h2>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contabilizado para meta</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Apenas registros <span className="font-semibold">MATCHED</span> entram no consolidado de metas.
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Base analisada</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {formatDateBr(data.filters.startDate)} a {formatDateBr(data.filters.endDate)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {data.filters.employeeId !== 'all' ? 'Filtro por colaborador ativo.' : 'Todos os colaboradores considerados.'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cobertura</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {formatNumber(data.collaboratorRanking.length)} colaborador(es) e {formatNumber(data.teamRanking.length)} equipe(s) com registros no recorte.
                  </div>
                </div>
              </div>
            </section>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <RankingTable
              title="Ranking de colaboradores"
              subtitle="Ordenado por volume vinculado, com suporte ao acompanhamento individual."
              rows={data.collaboratorRanking}
              mode="collaborator"
            />
            <RankingTable
              title="Ranking de equipes"
              subtitle="Comparativo consolidado por equipe dentro do recorte atual."
              rows={data.teamRanking}
              mode="team"
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Lançamentos analíticos</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Histórico detalhado com nome completo do paciente informado para apoio ao vínculo e conferência gerencial.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  <Users size={14} />
                  {paginationLabel}
                </div>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Unidade / equipe</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Paciente informado</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Paciente Feegow</th>
                    <th className="px-4 py-3">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length ? data.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">{formatDateBr(entry.serviceDate)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{entry.employeeName}</div>
                        <div className="text-xs text-slate-500">{entry.employeeId}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {(entry.unitSnapshot || 'Sem unidade')} / {(entry.teamSnapshot || 'Sem equipe')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {entry.entryType === 'RESOLVE' ? 'Resolve' : 'Check-up'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{entry.patientNameRaw}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          entry.matchStatus === 'MATCHED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : entry.matchStatus === 'PENDING_MATCH'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}>
                          {entry.matchStatus === 'MATCHED'
                            ? 'Vinculado'
                            : entry.matchStatus === 'PENDING_MATCH'
                              ? 'Pendente'
                              : entry.matchStatus === 'MULTIPLE_MATCHES'
                                ? 'Múltiplos'
                                : 'Sem match'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{entry.feegowPatientName || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTimeBr(entry.createdAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                        Nenhum lançamento encontrado para os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-slate-500">{paginationLabel}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changePage(Math.max(1, filters.page - 1))}
                  disabled={filters.page <= 1 || refreshing}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Página {data.pagination.page} de {Math.max(1, data.pagination.totalPages)}
                </div>
                <button
                  type="button"
                  onClick={() => changePage(Math.min(data.pagination.totalPages, filters.page + 1))}
                  disabled={filters.page >= data.pagination.totalPages || refreshing}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
