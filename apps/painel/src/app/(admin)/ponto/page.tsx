'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Calendar, CircleHelp, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type {
  PointDailyControlRow,
  PointDateRange,
  PointFilters,
  PointHoursBalanceMonthly,
  PointOptions,
  PointOverview,
  PointServiceHeartbeat,
  PointSignatureMonthly,
  PointSyncRun,
  PointVacationRow,
} from '@/lib/point/types';
import { DEFAULT_POINT_FILTERS } from '@/lib/point/filters';
import { PayrollDailyPanel } from '../folha-pagamento/components/PayrollDailyPanel';
import { PayrollFilterMultiSelect } from '../folha-pagamento/components/PayrollFilterMultiSelect';
import { PayrollHelpModal } from '../folha-pagamento/components/PayrollHelpModal';
import { PayrollHoursBalancePanel } from '../folha-pagamento/components/PayrollHoursBalancePanel';
import { PayrollSignaturesPanel } from '../folha-pagamento/components/PayrollSignaturesPanel';
import { buildSyncProgressMeta, getSyncStageLabel, PayrollSyncProgress, useSyncEstimatedLabel } from '../folha-pagamento/components/PayrollSyncProgress';
import { PAYROLL_POINT_TABS, PayrollTabNav, type PayrollTabKey } from '../folha-pagamento/components/PayrollTabNav';
import { PayrollVacationsPanel } from '../folha-pagamento/components/PayrollVacationsPanel';

const emptyOptions: PointOptions = {
  centersCost: [],
  units: [],
  contractTypes: [],
};

type DataTabKey = 'controle_diario' | 'banco_horas' | 'ferias' | 'assinaturas';

const TAB_ENDPOINTS: Record<DataTabKey, string> = {
  controle_diario: '/api/admin/ponto/daily',
  banco_horas: '/api/admin/ponto/hours-balance',
  ferias: '/api/admin/ponto/vacations',
  assinaturas: '/api/admin/ponto/signatures',
};

type AppliedQuery = {
  startDate: string;
  endDate: string;
  filters: PointFilters;
};

type TabCache = {
  key: string;
  data: Partial<Record<DataTabKey, unknown[]>>;
};

const filterInputClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

const emptyHeartbeat: PointServiceHeartbeat = {
  serviceName: 'point_sync',
  status: 'UNKNOWN',
  lastRun: null,
  details: null,
};

const emptyOverview: PointOverview = {
  dateRange: { startDate: '', endDate: '' },
  heartbeat: emptyHeartbeat,
  syncWindow: null,
  latestRun: null,
  latestArtifact: null,
  alerts: [],
};

const isWorkerUpdating = (status: string | null | undefined) => ['RUNNING', 'PENDING'].includes(String(status || '').toUpperCase());

const getHeartbeatTone = (status: string | null | undefined) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'HEALTHY') return 'bg-emerald-500';
  if (normalized === 'FAILED' || normalized === 'ERROR') return 'bg-rose-500';
  if (normalized === 'RUNNING' || normalized === 'PENDING') return 'bg-amber-500';
  return 'bg-slate-300';
};

const formatDateTimeBr = (value: string | null | undefined) => {
  if (!value) return 'Sem execução registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const getDefaultDateRange = (): PointDateRange => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const formatLocalDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(now),
  };
};

const buildQueryString = (query: AppliedQuery) => {
  const params = new URLSearchParams();
  params.set('startDate', query.startDate);
  params.set('endDate', query.endDate);
  Object.entries(query.filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (String(item || '').trim()) params.append(key === 'contractTypes' ? 'contractType' : key, String(item));
      });
      return;
    }
    if (String(value || '').trim()) params.set(key, String(value));
  });
  return params.toString();
};

export default function PontoPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'ponto', 'view', role);
  const canEdit = hasPermission(permissions, 'ponto', 'edit', role);
  const canRefresh = hasPermission(permissions, 'ponto', 'refresh', role);

  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const defaultQuery = useMemo<AppliedQuery>(
    () => ({ startDate: defaultDateRange.startDate, endDate: defaultDateRange.endDate, filters: DEFAULT_POINT_FILTERS }),
    [defaultDateRange],
  );

  const [options, setOptions] = useState<PointOptions>(emptyOptions);
  const [filterOptions, setFilterOptions] = useState({ centersCost: [] as string[], units: [] as string[], contracts: [] as string[] });
  const [dateRange, setDateRange] = useState<PointDateRange>(defaultDateRange);
  const [filters, setFilters] = useState<PointFilters>(DEFAULT_POINT_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState<AppliedQuery>(defaultQuery);
  const appliedKey = useMemo(() => JSON.stringify(appliedQuery), [appliedQuery]);

  const [overview, setOverview] = useState<PointOverview>({ ...emptyOverview, dateRange: defaultDateRange });
  const [cache, setCache] = useState<TabCache>({ key: appliedKey, data: {} });
  const [tabFetching, setTabFetching] = useState(true);
  const [activeTab, setActiveTab] = useState<PayrollTabKey>('controle_diario');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [syncingPoint, setSyncingPoint] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);
  const [visibleSyncRun, setVisibleSyncRun] = useState<PointSyncRun | null>(null);

  const hasPointSyncInProgress = useMemo(() => isWorkerUpdating(overview.heartbeat.status), [overview.heartbeat.status]);
  const hasVisibleSyncProgress = syncingPoint || hasPointSyncInProgress || String(visibleSyncRun?.status || '').toUpperCase() === 'FAILED';

  // Refs para callbacks assíncronos (polling / conclusão da sync) sempre lerem o estado atual.
  const appliedKeyRef = useRef(appliedKey);
  const appliedQueryRef = useRef(appliedQuery);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    appliedKeyRef.current = appliedKey;
    appliedQueryRef.current = appliedQuery;
  }, [appliedKey, appliedQuery]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const runStatus = String(overview.latestRun?.status || '').toUpperCase();
    if (overview.latestRun && ['PENDING', 'RUNNING', 'FAILED'].includes(runStatus)) {
      setVisibleSyncRun(overview.latestRun);
      return;
    }
    if (!syncingPoint && !hasPointSyncInProgress) {
      setVisibleSyncRun(null);
    }
  }, [hasPointSyncInProgress, overview.latestRun, syncingPoint]);

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    const payload = await fetchJson<{ status: string; data: PointOptions }>('/api/admin/ponto/options');
    setOptions(payload.data || emptyOptions);
    setFilterOptions({
      centersCost: payload.data?.centersCost || [],
      units: payload.data?.units || [],
      contracts: payload.data?.contractTypes || [],
    });
  }, [canView]);

  const loadOverview = useCallback(async (query: AppliedQuery) => {
    const payload = await fetchJson<{ status: string; data: PointOverview }>(`/api/admin/ponto/overview?${buildQueryString(query)}`);
    setOverview(payload.data || { ...emptyOverview, dateRange: { startDate: query.startDate, endDate: query.endDate } });
  }, []);

  useEffect(() => {
    loadOptions().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [loadOptions]);

  // Overview (heartbeat/alertas) recarrega apenas quando o recorte aplicado muda.
  useEffect(() => {
    if (!canView) return;
    loadOverview(appliedQuery).catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [canView, appliedKey, appliedQuery, loadOverview]);

  // Carrega sob demanda somente os dados da aba ativa, com cache por recorte aplicado.
  useEffect(() => {
    if (!canView) return;
    const endpoint = TAB_ENDPOINTS[activeTab as DataTabKey];
    if (!endpoint) {
      setTabFetching(false);
      return;
    }
    if (cache.key === appliedKey && cache.data[activeTab as DataTabKey] !== undefined) {
      setTabFetching(false);
      return;
    }

    let alive = true;
    const key = appliedKey;
    const tab = activeTab as DataTabKey;
    setTabFetching(true);
    setError('');
    fetchJson<{ status: string; data: { items: unknown[] } }>(`${endpoint}?${buildQueryString(appliedQuery)}`)
      .then((payload) => {
        if (!alive) return;
        setCache((prev) => {
          const base = prev.key === key ? prev.data : {};
          return { key, data: { ...base, [tab]: payload.data?.items || [] } };
        });
      })
      .catch((fetchError: any) => {
        if (alive) setError(String(fetchError?.message || fetchError));
      })
      .finally(() => {
        if (alive) setTabFetching(false);
      });

    return () => {
      alive = false;
    };
  }, [canView, activeTab, appliedKey, appliedQuery, cache]);

  const applyFilters = useCallback(() => {
    setAppliedQuery({ startDate: dateRange.startDate, endDate: dateRange.endDate, filters });
  }, [dateRange.endDate, dateRange.startDate, filters]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_POINT_FILTERS);
    setDateRange(defaultDateRange);
    setAppliedQuery(defaultQuery);
  }, [defaultDateRange, defaultQuery]);

  // "Recarregar tela": revalida opções, overview e a aba ativa (invalidando o cache).
  const reloadAll = useCallback(async () => {
    setError('');
    setCache({ key: appliedKeyRef.current, data: {} });
    await Promise.all([
      loadOptions().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError))),
      loadOverview(appliedQueryRef.current).catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError))),
    ]);
  }, [loadOptions, loadOverview]);

  const handlePointSync = useCallback(async () => {
    setSyncingPoint(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetchJson<{ status: string; data: { window: { startDate: string; endDate: string } } }>(`/api/admin/ponto/sync`, {
        method: 'POST',
      });
      await loadOverview(appliedQueryRef.current);
      setSuccessMessage(`Sincronização enfileirada para a janela ${response.data.window.startDate} a ${response.data.window.endDate}.`);
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setSyncingPoint(false);
    }
  }, [loadOverview]);

  // Enquanto a sync roda, apenas o heartbeat é reconsultado (leve, não repinta as tabelas).
  useEffect(() => {
    if (!hasPointSyncInProgress) return;
    const intervalId = window.setInterval(() => {
      loadOverview(appliedQueryRef.current).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [hasPointSyncInProgress, loadOverview]);

  // Ao concluir a sync, recarrega os dados em segundo plano sem esvaziar a tabela visível.
  const prevInProgressRef = useRef(false);
  useEffect(() => {
    if (prevInProgressRef.current && !hasPointSyncInProgress) {
      const key = appliedKeyRef.current;
      const tab = activeTabRef.current as DataTabKey;
      const endpoint = TAB_ENDPOINTS[tab];
      if (endpoint) {
        fetchJson<{ status: string; data: { items: unknown[] } }>(`${endpoint}?${buildQueryString(appliedQueryRef.current)}`)
          .then((payload) => setCache({ key, data: { [tab]: payload.data?.items || [] } }))
          .catch(() => undefined);
      } else {
        setCache({ key, data: {} });
      }
      loadOverview(appliedQueryRef.current).catch(() => undefined);
    }
    prevInProgressRef.current = hasPointSyncInProgress;
  }, [hasPointSyncInProgress, loadOverview]);

  const currentRows = cache.key === appliedKey ? cache.data[activeTab as DataTabKey] : undefined;
  const activeLoading = currentRows === undefined && tabFetching;

  const heartbeatLabel = hasPointSyncInProgress ? 'Sincronização em andamento' : 'Última sincronização';
  const heartbeatTone = getHeartbeatTone(overview.heartbeat.status);
  const syncButtonDisabled = syncingPoint || hasPointSyncInProgress;
  const syncHelperText = 'Atualiza os últimos 30 dias da Sólides e preserva o histórico já sincronizado no painel.';
  const syncStageLabel = getSyncStageLabel(overview.latestRun?.currentStage);
  const syncMetaLabel = buildSyncProgressMeta(overview.latestRun);
  const syncEstimatedLabel = useSyncEstimatedLabel(overview.latestRun);

  if (!canView) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Você não possui permissão para acessar o módulo de ponto.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
              <Calendar size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Ponto</h1>
              <p className="mt-1 text-xs text-slate-500">
                Acompanhamento operacional por data com leitura da base sincronizada da Sólides.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto lg:max-w-[560px] lg:justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CircleHelp size={16} /> Fontes e regras
            </button>
            {canRefresh ? (
              <button
                type="button"
                onClick={() => reloadAll()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={16} /> Recarregar tela
              </button>
            ) : null}
            {canEdit ? (
              <div
                className="relative"
                onMouseEnter={() => setRefreshHovered(true)}
                onMouseLeave={() => setRefreshHovered(false)}
              >
                <button
                  type="button"
                  onClick={handlePointSync}
                  disabled={syncButtonDisabled}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123462] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncingPoint || hasPointSyncInProgress ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {syncingPoint ? 'Solicitando...' : hasPointSyncInProgress ? 'Sincronizando...' : 'Atualizar dados'}
                </button>

                {refreshHovered ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {heartbeatLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${heartbeatTone} ${hasPointSyncInProgress ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-medium text-slate-700">{formatDateTimeBr(overview.heartbeat.lastRun)}</span>
                    </div>
                    {hasPointSyncInProgress ? (
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        {syncStageLabel}
                        {syncMetaLabel ? ` · ${syncMetaLabel}` : ''}
                        {syncEstimatedLabel ? ` · ${syncEstimatedLabel}` : ''}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {hasPointSyncInProgress
                        ? 'Sincronizando a janela móvel dos últimos 30 dias em segundo plano.'
                        : overview.heartbeat.details || 'Acompanhe aqui a última execução do worker da Sólides.'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{syncHelperText}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Filtros operacionais</h2>
              <p className="mt-1 text-xs text-slate-500">Escolha qualquer intervalo para analisar ponto, férias, banco de horas e assinaturas já sincronizadas.</p>
            </div>
            <button type="button" onClick={() => setFiltersExpanded((value) => !value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            </button>
          </div>
          {filtersExpanded ? (
            <>
              <div className="grid gap-3 px-6 pb-4 lg:grid-cols-3">
                <Field label="Data inicial">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(event) => setDateRange((current) => ({ ...current, startDate: event.target.value }))}
                    className={filterInputClassName}
                  />
                </Field>
                <Field label="Data final">
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(event) => setDateRange((current) => ({ ...current, endDate: event.target.value }))}
                    className={filterInputClassName}
                  />
                </Field>
              </div>

              <div className="grid gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Buscar colaborador">
                  <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} className={filterInputClassName} placeholder="Nome ou CPF" />
                </Field>
                <Field label="Centro de custo">
                  <select value={filters.centerCost} onChange={(event) => setFilters((current) => ({ ...current, centerCost: event.target.value }))} className={filterInputClassName}>
                    <option value="all">Todos</option>
                    {filterOptions.centersCost.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Unidade">
                  <select value={filters.unit} onChange={(event) => setFilters((current) => ({ ...current, unit: event.target.value }))} className={filterInputClassName}>
                    <option value="all">Todas</option>
                    {filterOptions.units.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Contrato">
                  <PayrollFilterMultiSelect
                    options={filterOptions.contracts}
                    value={filters.contractTypes}
                    onChange={(contractTypes) => setFilters((current) => ({ ...current, contractTypes }))}
                    allLabel="Todos"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Limpar filtros
                </button>
                <button type="button" onClick={applyFilters} className="rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white">
                  Aplicar filtros
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {hasVisibleSyncProgress && visibleSyncRun ? (
        <PayrollSyncProgress run={visibleSyncRun} scopeLabel="ponto, férias, banco de horas e assinaturas" className="min-h-[108px]" />
      ) : null}
      {!error && overview.alerts.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {overview.alerts.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      ) : null}

      <PayrollTabNav activeTab={activeTab} onChange={setActiveTab} tabs={PAYROLL_POINT_TABS} />

      {activeTab === 'controle_diario' ? <PayrollDailyPanel rows={(currentRows as PointDailyControlRow[]) || []} loading={activeLoading} /> : null}
      {activeTab === 'banco_horas' ? <PayrollHoursBalancePanel rows={(currentRows as PointHoursBalanceMonthly[]) || []} loading={activeLoading} /> : null}
      {activeTab === 'ferias' ? <PayrollVacationsPanel rows={(currentRows as PointVacationRow[]) || []} loading={activeLoading} /> : null}
      {activeTab === 'assinaturas' ? <PayrollSignaturesPanel rows={(currentRows as PointSignatureMonthly[]) || []} loading={activeLoading} /> : null}

      <PayrollHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
