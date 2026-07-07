'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Calculator, CheckCircle2, CircleHelp, Download, Loader2, Plus, RefreshCw, SendHorizontal } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { DEFAULT_PAYROLL_LINE_FILTERS } from '@/lib/payroll/filters';
import type {
  PayrollBenefitRow,
  PayrollBenefitsSummary,
  PayrollLine,
  PayrollLineDetail,
  PayrollLineFilters,
  PayrollOptions,
  PayrollPeriodDetail,
  PayrollPreviewRow,
} from '@/lib/payroll/types';
import { PayrollBenefitsPanel } from './components/PayrollBenefitsPanel';
import { PayrollClosingTable } from './components/PayrollClosingTable';
import { formatDateBr, formatDateTimeBr, formatMoney, statusLabelMap } from './components/formatters';
import { PayrollHelpModal } from './components/PayrollHelpModal';
import { PayrollLineDrawer } from './components/PayrollLineDrawer';
import { PayrollNewPeriodModal } from './components/PayrollNewPeriodModal';
import { PayrollPreviewTable } from './components/PayrollPreviewTable';
import { PayrollReadinessPanel } from './components/PayrollReadinessPanel';
import { PayrollSummaryCards } from './components/PayrollSummaryCards';
import { PAYROLL_CLOSING_TABS, PayrollTabNav, type PayrollTabKey } from './components/PayrollTabNav';

const emptyOptions: PayrollOptions = {
  periods: [],
  centersCost: [],
  units: [],
  contractTypes: [],
  periodStatuses: [],
  lineStatuses: [],
  transportVoucherModes: [],
  occurrenceTypes: [],
};

const emptyDetail: PayrollPeriodDetail | null = null;
const filterInputClassName =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const getHeartbeatTone = (status: string | null | undefined) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'HEALTHY') return 'bg-emerald-500';
  if (normalized === 'FAILED' || normalized === 'ERROR') return 'bg-rose-500';
  if (normalized === 'RUNNING' || normalized === 'PENDING') return 'bg-amber-500';
  return 'bg-slate-300';
};

const formatMonthRef = (monthRef: string) => {
  const [year, month] = String(monthRef || '').split('-');
  const monthIndex = Number(month || 0) - 1;
  if (!year || monthIndex < 0) return monthRef;
  const date = new Date(Date.UTC(Number(year), monthIndex, 1));
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

export default function FolhaPagamentoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'folha_pagamento', 'view', role);
  const canEdit = hasPermission(permissions, 'folha_pagamento', 'edit', role);
  const canRefresh = hasPermission(permissions, 'folha_pagamento', 'refresh', role);

  const [options, setOptions] = useState<PayrollOptions>(emptyOptions);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [detail, setDetail] = useState<PayrollPeriodDetail | null>(emptyDetail);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [benefitRows, setBenefitRows] = useState<PayrollBenefitRow[]>([]);
  const [benefitsSummary, setBenefitsSummary] = useState<PayrollBenefitsSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PayrollPreviewRow[]>([]);
  const [filters, setFilters] = useState<PayrollLineFilters>(DEFAULT_PAYROLL_LINE_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ centersCost: [] as string[], units: [] as string[], contracts: [] as string[] });
  const [activeTab, setActiveTab] = useState<PayrollTabKey>('fechamento');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [syncingPoint, setSyncingPoint] = useState(false);
  const [selectedLine, setSelectedLine] = useState<PayrollLine | null>(null);
  const [lineDetail, setLineDetail] = useState<PayrollLineDetail | null>(null);
  const [lineDetailOpen, setLineDetailOpen] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);
  const requestedPeriodId = useMemo(() => String(searchParams.get('periodId') || '').trim(), [searchParams]);

  const currentPeriod = useMemo(
    () => options.periods.find((item) => item.id === selectedPeriodId) || detail?.period || null,
    [detail?.period, options.periods, selectedPeriodId],
  );
  const hasPointSyncInProgress = useMemo(
    () => (detail?.syncRuns || []).some((item) => ['PENDING', 'RUNNING'].includes(item.status)),
    [detail?.syncRuns],
  );
  const hasPointPipelineInProgress = hasPointSyncInProgress;
  const readiness = detail?.readiness || null;
  const approvalReadiness = detail?.approvalReadiness || null;
  const generationBlockedByReadiness = readiness?.status === 'BLOCKED';
  const approvalBlockedByReadiness = approvalReadiness?.status === 'BLOCKED';
  const latestCompletedSync = useMemo(
    () => (detail?.syncRuns || []).find((item) => item.status === 'COMPLETED') || null,
    [detail?.syncRuns],
  );
  const latestSyncRun = useMemo(() => (detail?.syncRuns || [])[0] || null, [detail?.syncRuns]);
  const latestSyncStatus = hasPointPipelineInProgress ? latestSyncRun?.status || 'RUNNING' : latestCompletedSync?.status || latestSyncRun?.status || 'UNKNOWN';
  const syncHeartbeatLabel = hasPointPipelineInProgress ? 'Sincronização em andamento' : 'Última sincronização';
  const syncHeartbeatTime = hasPointPipelineInProgress
    ? latestSyncRun?.startedAt || latestSyncRun?.createdAt || latestCompletedSync?.finishedAt || null
    : latestCompletedSync?.finishedAt || latestSyncRun?.finishedAt || latestSyncRun?.createdAt || null;
  const syncHeartbeatTone = getHeartbeatTone(latestSyncStatus);
  const syncHeartbeatDetails = hasPointPipelineInProgress
    ? 'Sincronização da Sólides em andamento para atualizar a base usada no fechamento desta competência.'
      : latestCompletedSync
        ? latestCompletedSync.details || `${latestCompletedSync.synchronizedEmployees} colaborador(es) e ${latestCompletedSync.synchronizedDays} registro(s) diário(s) sincronizados.`
      : 'Ainda não há sincronização concluída da Sólides para esta competência.';
  const syncButtonDisabled = syncingPoint || hasPointPipelineInProgress || !selectedPeriodId;
  const generateActionTitle = hasPointPipelineInProgress
    ? 'Aguarde a conclusão da sincronização do ponto para gerar a folha.'
    : generationBlockedByReadiness
      ? readiness?.guidance || 'Resolva os bloqueios críticos da competência antes de gerar a folha.'
      : 'Gerar folha';
  const approveActionTitle = approvalBlockedByReadiness
    ? approvalReadiness?.guidance || 'Resolva as pendências críticas antes de aprovar a folha.'
    : 'Aprovar competência';
  const markSentBlocked = currentPeriod?.status !== 'APROVADA';

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    const payload = await fetchJson<{ status: string; data: PayrollOptions }>('/api/admin/folha-pagamento/options');
    setOptions(payload.data || emptyOptions);
    const availablePeriods = payload.data?.periods || [];
    const persistedPeriodId =
      typeof window !== 'undefined' ? String(window.localStorage.getItem('payroll:selected-period-id') || '').trim() : '';
    const candidatePeriodId = selectedPeriodId || requestedPeriodId || persistedPeriodId;

    if (candidatePeriodId && availablePeriods.some((period) => period.id === candidatePeriodId)) {
      setSelectedPeriodId(candidatePeriodId);
      return;
    }

    if (availablePeriods[0]?.id) {
      setSelectedPeriodId(availablePeriods[0].id);
    }
  }, [canView, requestedPeriodId, selectedPeriodId]);

  const buildFilterQuery = useCallback(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (String(value || '').trim()) query.set(key, String(value));
    });
    return query.toString();
  }, [filters]);

  const loadPeriod = useCallback(async () => {
    if (!canView || !selectedPeriodId) return;
    setLoading(true);
    setPreviewLoading(true);
    setError('');
    try {
      const [benefitsPayload, detailPayload, linesPayload, previewPayload] = await Promise.all([
        fetchJson<{ status: string; data: { items: PayrollBenefitRow[]; summary: PayrollBenefitsSummary } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/benefits?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: PayrollPeriodDetail }>(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}`),
        fetchJson<{ status: string; data: { items: PayrollLine[]; availableCentersCost: string[]; availableUnits: string[]; availableContracts: string[] } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/lines?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollPreviewRow[] } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/preview?${buildFilterQuery()}`,
        ),
      ]);

      setBenefitRows(benefitsPayload.data?.items || []);
      setBenefitsSummary(benefitsPayload.data?.summary || null);
      setDetail(detailPayload.data || emptyDetail);
      setLines(linesPayload.data?.items || []);
      setPreviewRows(previewPayload.data?.items || []);
      setFilterOptions({
        centersCost: linesPayload.data?.availableCentersCost || [],
        units: linesPayload.data?.availableUnits || [],
        contracts: linesPayload.data?.availableContracts || [],
      });
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setLoading(false);
      setPreviewLoading(false);
    }
  }, [buildFilterQuery, canView, selectedPeriodId]);

  useEffect(() => {
    loadOptions().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [loadOptions]);

  useEffect(() => {
    if (!requestedPeriodId || requestedPeriodId === selectedPeriodId) return;
    if (options.periods.some((period) => period.id === requestedPeriodId)) {
      setSelectedPeriodId(requestedPeriodId);
    }
  }, [options.periods, requestedPeriodId, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('payroll:selected-period-id', selectedPeriodId);
    }

    const params = new URLSearchParams(searchParams.toString());
    if (params.get('periodId') === selectedPeriodId) return;
    params.set('periodId', selectedPeriodId);
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, selectedPeriodId]);

  useEffect(() => {
    loadPeriod().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [loadPeriod]);

  const reloadAll = async () => {
    await loadOptions();
    await loadPeriod();
  };

  const handlePointSync = useCallback(async () => {
    if (!selectedPeriodId) return;
    setSyncingPoint(true);
    setError('');
    setSuccessMessage('');
    try {
      await fetchJson(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/sync-point`, {
        method: 'POST',
      });
      await loadPeriod();
      setSuccessMessage('Sincronização da competência enfileirada com sucesso.');
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setSyncingPoint(false);
    }
  }, [loadPeriod, selectedPeriodId]);

  const handleCreatePeriod = async (payload: { monthRef: string; minWageAmount: string; lateToleranceMinutes: string; vtDiscountCapPercent: string }) => {
    setCreatingPeriod(true);
    setError('');
    setSuccessMessage('');
    try {
      const body = {
        monthRef: payload.monthRef,
        minWageAmount: payload.minWageAmount,
        lateToleranceMinutes: payload.lateToleranceMinutes,
        vtDiscountCapPercent: payload.vtDiscountCapPercent,
      };
      const response = await fetchJson<{ status: string; data: PayrollPeriodDetail }>('/api/admin/folha-pagamento/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNewPeriodOpen(false);
      setSelectedPeriodId(response.data.period.id);
      await reloadAll();
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setCreatingPeriod(false);
    }
  };

  const runPeriodAction = async (path: string, successMessage?: string) => {
    if (!selectedPeriodId) return;
    setActionLoading(path);
    setError('');
    setSuccessMessage('');
    try {
      await fetchJson(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/${path}`, { method: 'POST' });
      await reloadAll();
      if (successMessage) setSuccessMessage(successMessage);
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setActionLoading('');
    }
  };

  const openLineDetail = async (line: PayrollLine) => {
    setSelectedLine(line);
    setLineDetailOpen(true);
    setLineDetail(null);
    try {
      const payload = await fetchJson<{ status: string; data: PayrollLineDetail }>(`/api/admin/folha-pagamento/lines/${encodeURIComponent(line.id)}`);
      setLineDetail(payload.data || null);
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    }
  };

  const openPreviewLine = async (lineId: string) => {
    const line = lines.find((item) => item.id === lineId);
    if (!line) return;
    await openLineDetail(line);
  };

  const handleSaveLine = async (draft: { adjustmentsAmount: string; adjustmentsNotes: string; payrollNotes: string; lineStatus: string }) => {
    if (!selectedLine) return;
    setLineSaving(true);
    try {
      const payload = await fetchJson<{ status: string; data: PayrollLineDetail }>(`/api/admin/folha-pagamento/lines/${encodeURIComponent(selectedLine.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setLineDetail(payload.data || null);
      await loadPeriod();
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setLineSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedPeriodId || !hasPointPipelineInProgress) return;
    const intervalId = window.setInterval(() => {
      loadPeriod().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [hasPointPipelineInProgress, loadPeriod, selectedPeriodId]);

  if (!canView) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Você não possui permissão para acessar a folha de pagamento.</div>;
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
              <Calculator size={18} />
            </div>
            <div>
              <h1 className="text-[1.75rem] font-bold leading-tight text-slate-800">Fechamento da folha</h1>
              <p className="mt-1 max-w-3xl text-[13px] text-slate-500">
                Fechamento mensal com base sincronizada da Sólides, cálculo operacional no painel, benefícios locais e revisão por exceções antes da aprovação.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto lg:max-w-[660px] lg:justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CircleHelp size={16} /> Fontes e regras
            </button>
            {canRefresh ? (
              <div className="relative" onMouseEnter={() => setRefreshHovered(true)} onMouseLeave={() => setRefreshHovered(false)}>
                <button
                  type="button"
                  onClick={handlePointSync}
                  disabled={syncButtonDisabled}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncingPoint ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {syncingPoint ? 'Solicitando...' : 'Atualizar dados'}
                </button>
                {refreshHovered ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {syncHeartbeatLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${syncHeartbeatTone} ${hasPointPipelineInProgress ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-medium text-slate-700">{formatDateTimeBr(syncHeartbeatTime)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{syncHeartbeatDetails}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Atualiza a leitura local da Sólides usada no fechamento, preservando o histórico já sincronizado da competência.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {selectedPeriodId ? (
              <button
                type="button"
                onClick={() => window.open(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/export?${buildFilterQuery()}`, '_blank', 'noopener,noreferrer')}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"
              >
                <Download size={16} /> Exportar XLSX
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" onClick={() => setNewPeriodOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#17407E] px-3 text-sm font-semibold text-white">
                <Plus size={16} /> Nova competência
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Filtros da competência</h2>
              <p className="mt-1 text-[12px] text-slate-500">Refine o recorte do fechamento, da memória de benefícios e da prévia por colaborador, centro de custo, unidade, regime contratual e status.</p>
            </div>
            <button type="button" onClick={() => setFiltersExpanded((value) => !value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            </button>
          </div>
          {filtersExpanded ? (
            <>
              <div className="grid gap-3 px-5 pb-3 lg:grid-cols-4">
                <label className="block lg:col-span-2">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Competência</span>
                  <select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100">
                    <option value="">Selecione uma competência</option>
                    {options.periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {formatMonthRef(period.monthRef)} | {formatDateBr(period.periodStart)} a {formatDateBr(period.periodEnd)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{currentPeriod ? statusLabelMap[currentPeriod.status] || currentPeriod.status : 'Sem competência selecionada'}</div>
                  {currentPeriod ? <div className="mt-1 text-xs text-slate-500">Período operacional: {formatDateBr(currentPeriod.periodStart)} a {formatDateBr(currentPeriod.periodEnd)}</div> : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Regras da competência</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{detail?.period.rules ? `${formatMoney(detail.period.rules.minWageAmount)} | atraso ${detail.period.rules.lateToleranceMinutes} min` : 'Carregue uma competência'}</div>
                  {detail?.period.rules ? <div className="mt-1 text-xs text-slate-500">Teto de VT: {detail.period.rules.vtDiscountCapPercent}% do salário básico</div> : null}
                </div>
              </div>

              <div className="grid gap-3 px-5 pb-4 md:grid-cols-2 xl:grid-cols-5">
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
                <Field label="Regime contratual">
                  <select value={filters.contractType} onChange={(event) => setFilters((current) => ({ ...current, contractType: event.target.value }))} className={filterInputClassName}>
                    <option value="all">Todos</option>
                    {filterOptions.contracts.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Status da linha">
                  <select value={filters.lineStatus} onChange={(event) => setFilters((current) => ({ ...current, lineStatus: event.target.value }))} className={filterInputClassName}>
                    <option value="all">Todos</option>
                    {options.lineStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
                <button type="button" onClick={() => setFilters(DEFAULT_PAYROLL_LINE_FILTERS)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                  Limpar filtros
                </button>
                <button type="button" onClick={() => loadPeriod()} className="rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white">
                  Aplicar filtros
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {readiness && approvalReadiness ? (
        <PayrollReadinessPanel generateReadiness={readiness} approvalReadiness={approvalReadiness} />
      ) : null}

      <PayrollSummaryCards summary={detail?.summary || null} eligibilitySummary={detail?.eligibilitySummary || null} />

      {hasPointPipelineInProgress ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Há uma sincronização de ponto em andamento nesta competência. A tela está atualizando automaticamente e a geração da folha ficará disponível após a conclusão.
        </div>
      ) : null}

      <PayrollTabNav
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={PAYROLL_CLOSING_TABS}
        actions={selectedPeriodId && canEdit ? (
          <>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">Ações da competência</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runPeriodAction('generate')}
                disabled={hasPointPipelineInProgress || generationBlockedByReadiness || actionLoading === 'generate'}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                  hasPointPipelineInProgress || generationBlockedByReadiness
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                title={generateActionTitle}
              >
                {actionLoading === 'generate' ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />} Gerar folha
              </button>
              <button
                type="button"
                onClick={() => runPeriodAction('approve')}
                disabled={approvalBlockedByReadiness || actionLoading === 'approve'}
                title={approveActionTitle}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                  approvalBlockedByReadiness
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {actionLoading === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aprovar
              </button>
              <button
                type="button"
                onClick={() => runPeriodAction('mark-sent')}
                disabled={markSentBlocked || actionLoading === 'mark-sent'}
                title={markSentBlocked ? 'A competência precisa estar aprovada antes do envio.' : 'Marcar como enviada'}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                  markSentBlocked
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-blue-200 bg-blue-50 text-[#17407E]'
                }`}
              >
                {actionLoading === 'mark-sent' ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={15} />} Marcar como enviada
              </button>
              <button type="button" onClick={() => runPeriodAction('reopen')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">
                {actionLoading === 'reopen' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reabrir competência
              </button>
            </div>
          </>
        ) : null}
      />

      {activeTab === 'fechamento' ? <PayrollClosingTable rows={lines} loading={loading} onOpenDetail={openLineDetail} /> : null}
      {activeTab === 'beneficios' ? (
        <PayrollBenefitsPanel rows={benefitRows} summary={benefitsSummary} loading={loading || previewLoading} onOpenLine={openPreviewLine} />
      ) : null}
      {activeTab === 'previa' ? <PayrollPreviewTable rows={previewRows} loading={loading || previewLoading} onOpenLine={openPreviewLine} /> : null}

      <PayrollNewPeriodModal open={newPeriodOpen} saving={creatingPeriod} onClose={() => setNewPeriodOpen(false)} onSubmit={handleCreatePeriod} />
      <PayrollHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PayrollLineDrawer line={selectedLine} detail={lineDetail} open={lineDetailOpen} canEdit={canEdit} saving={lineSaving} onClose={() => setLineDetailOpen(false)} onSave={handleSaveLine} />
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
