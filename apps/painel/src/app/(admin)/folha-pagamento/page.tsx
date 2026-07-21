'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Calculator, CheckCircle2, CircleHelp, Download, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
  PayrollPointSyncRun,
  PayrollPreviewRow,
} from '@/lib/payroll/types';
import { PayrollBenefitsPanel } from './components/PayrollBenefitsPanel';
import { PayrollClosingTable } from './components/PayrollClosingTable';
import { formatDateBr, formatDateTimeBr, formatMoney, statusLabelMap } from './components/formatters';
import { PayrollHelpModal } from './components/PayrollHelpModal';
import { PayrollLineDrawer } from './components/PayrollLineDrawer';
import { PayrollFilterMultiSelect } from './components/PayrollFilterMultiSelect';
import { PayrollGenerateConfirmationModal } from './components/PayrollGenerateConfirmationModal';
import { PayrollNewPeriodModal } from './components/PayrollNewPeriodModal';
import { PayrollPreviewTable } from './components/PayrollPreviewTable';
import { PayrollReadinessPanel } from './components/PayrollReadinessPanel';
import { PayrollSummaryCards } from './components/PayrollSummaryCards';
import { buildSyncProgressMeta, getSyncStageLabel, PayrollSyncProgress, useSyncEstimatedLabel } from './components/PayrollSyncProgress';
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
    const error = new Error(String((payload as any)?.error || 'Falha ao carregar dados.')) as Error & {
      status?: number;
      code?: string;
      data?: unknown;
    };
    error.status = response.status;
    error.code = String((payload as any)?.code || '');
    error.data = (payload as any)?.data;
    throw error;
  }
  return payload as T;
}

type PayrollGenerateConfirmationState = {
  pendingEmployeesCount: number;
  pendingCodes: string[];
  sampleEmployees: Array<{ employeeId: string | null; employeeName: string; employeeCpf: string | null }>;
};

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
  const [displayedPeriodId, setDisplayedPeriodId] = useState('');
  const [detail, setDetail] = useState<PayrollPeriodDetail | null>(emptyDetail);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [benefitRows, setBenefitRows] = useState<PayrollBenefitRow[]>([]);
  const [benefitsSummary, setBenefitsSummary] = useState<PayrollBenefitsSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PayrollPreviewRow[]>([]);
  const [filters, setFilters] = useState<PayrollLineFilters>(DEFAULT_PAYROLL_LINE_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ centersCost: [] as string[], units: [] as string[], contracts: [] as string[] });
  const [activeTab, setActiveTab] = useState<PayrollTabKey>('fechamento');
  const [optionsLoaded, setOptionsLoaded] = useState(false);
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
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);
  const [visibleSyncRun, setVisibleSyncRun] = useState<PayrollPointSyncRun | null>(null);
  const [generateConfirmation, setGenerateConfirmation] = useState<PayrollGenerateConfirmationState | null>(null);
  const selectedPeriodIdRef = useRef('');
  const displayedPeriodIdRef = useRef('');
  const hasVisiblePeriodDataRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastObservedUrlPeriodIdRef = useRef('');
  const requestedPeriodId = useMemo(() => String(searchParams.get('periodId') || '').trim(), [searchParams]);
  const hasVisiblePeriodData = detail !== null || lines.length > 0 || benefitRows.length > 0 || previewRows.length > 0;

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
  const syncStageLabel = getSyncStageLabel(latestSyncRun?.currentStage);
  const syncMetaLabel = buildSyncProgressMeta(latestSyncRun);
  const syncEstimatedLabel = useSyncEstimatedLabel(latestSyncRun);
  const syncHeartbeatDetails = hasPointPipelineInProgress
    ? 'Sincronização da Sólides em andamento para atualizar a base usada no fechamento desta competência.'
      : latestCompletedSync
        ? latestCompletedSync.details || `${latestCompletedSync.synchronizedEmployees} colaborador(es) e ${latestCompletedSync.synchronizedDays} registro(s) diário(s) sincronizados.`
      : 'Ainda não há sincronização concluída da Sólides para esta competência.';
  const syncButtonDisabled = syncingPoint || hasPointPipelineInProgress || !selectedPeriodId;
  const hasVisibleSyncProgress = syncingPoint || hasPointPipelineInProgress || String(visibleSyncRun?.status || '').toUpperCase() === 'FAILED';
  const isSwitchingPeriod = Boolean(selectedPeriodId && displayedPeriodId && selectedPeriodId !== displayedPeriodId);
  const generateActionTitle = hasPointPipelineInProgress
    ? 'Aguarde a conclusão da sincronização do ponto para gerar a folha.'
    : generationBlockedByReadiness
      ? readiness?.guidance || 'Resolva os bloqueios críticos da competência antes de gerar a folha.'
      : 'Gerar folha';
  const approvalBlockedHasLineIssues = Boolean(
    approvalReadiness?.issues?.some((issue) =>
      issue.code === 'LINES_PENDING_REVIEW' || issue.code === 'BENEFIT_RULES_UPDATED_AFTER_GENERATION',
    ),
  );
  const approveActionTitle = approvalBlockedByReadiness
    ? approvalBlockedHasLineIssues
      ? 'Todos os colaboradores elegíveis precisam estar aprovados individualmente para fechar a competência. Resolva as linhas em revisão, pendências cadastrais ou linhas que exigem recálculo antes de continuar.'
      : approvalReadiness?.guidance || 'Resolva as pendências críticas antes de aprovar a folha.'
    : 'Aprovar competência';
  useEffect(() => {
    selectedPeriodIdRef.current = selectedPeriodId;
  }, [selectedPeriodId]);

  useEffect(() => {
    displayedPeriodIdRef.current = displayedPeriodId;
  }, [displayedPeriodId]);

  useEffect(() => {
    hasVisiblePeriodDataRef.current = hasVisiblePeriodData;
  }, [hasVisiblePeriodData]);

  useEffect(() => {
    lastObservedUrlPeriodIdRef.current = requestedPeriodId;
  }, []);

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    const payload = await fetchJson<{ status: string; data: PayrollOptions }>('/api/admin/folha-pagamento/options');
    setOptions(payload.data || emptyOptions);
    setOptionsLoaded(true);
  }, [canView, requestedPeriodId]);

  const resetVisiblePeriodState = useCallback(() => {
    setDetail(emptyDetail);
    setLines([]);
    setBenefitRows([]);
    setBenefitsSummary(null);
    setPreviewRows([]);
    setFilterOptions({ centersCost: [], units: [], contracts: [] });
    setDisplayedPeriodId('');
    setSelectedLine(null);
    setLineDetail(null);
    setLineDetailOpen(false);
    setSelectedLineIds([]);
  }, []);

  const buildFilterQuery = useCallback(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (String(item || '').trim()) query.append(key === 'contractTypes' ? 'contractType' : key, String(item));
        });
        return;
      }
      if (String(value || '').trim()) query.set(key, String(value));
    });
    return query.toString();
  }, [filters]);

  const fetchPeriodData = useCallback(async (periodId: string, { background = false }: { background?: boolean } = {}) => {
    if (!canView || !periodId) return;
    const requestId = ++requestIdRef.current;
    const preserveCurrentScreen = background && displayedPeriodIdRef.current === periodId && hasVisiblePeriodDataRef.current;
    if (!preserveCurrentScreen) {
      setLoading(true);
      setPreviewLoading(true);
    }
    setError('');
    try {
      const [detailPayload, linesPayload] = await Promise.all([
        fetchJson<{ status: string; data: PayrollPeriodDetail }>(`/api/admin/folha-pagamento/periods/${encodeURIComponent(periodId)}`),
        fetchJson<{ status: string; data: { items: PayrollLine[]; availableCentersCost: string[]; availableUnits: string[]; availableContracts: string[] } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(periodId)}/lines?${buildFilterQuery()}`,
        ),
      ]);
      const [benefitsResult, previewResult] = await Promise.allSettled([
        fetchJson<{ status: string; data: { items: PayrollBenefitRow[]; summary: PayrollBenefitsSummary } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(periodId)}/benefits?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollPreviewRow[] } }>(
          `/api/admin/folha-pagamento/periods/${encodeURIComponent(periodId)}/preview?${buildFilterQuery()}`,
        ),
      ]);

      if (requestId !== requestIdRef.current) return;

      setDetail(detailPayload.data || emptyDetail);
      setLines(linesPayload.data?.items || []);
      setDisplayedPeriodId(periodId);
      setFilterOptions({
        centersCost: linesPayload.data?.availableCentersCost || [],
        units: linesPayload.data?.availableUnits || [],
        contracts: linesPayload.data?.availableContracts || [],
      });

      const softErrors: string[] = [];

      if (benefitsResult.status === 'fulfilled') {
        setBenefitRows(benefitsResult.value.data?.items || []);
        setBenefitsSummary(benefitsResult.value.data?.summary || null);
      } else {
        setBenefitRows([]);
        setBenefitsSummary(null);
        softErrors.push(String(benefitsResult.reason?.message || 'Não foi possível carregar a aba de benefícios nesta tentativa.'));
      }

      if (previewResult.status === 'fulfilled') {
        setPreviewRows(previewResult.value.data?.items || []);
      } else {
        setPreviewRows([]);
        softErrors.push(String(previewResult.reason?.message || 'Não foi possível carregar a prévia da planilha nesta tentativa.'));
      }

      if (softErrors.length > 0) {
        setError(softErrors.join(' '));
      }
    } catch (fetchError: any) {
      if (requestId !== requestIdRef.current) return;
      setError(String(fetchError?.message || fetchError));
    } finally {
      if (requestId !== requestIdRef.current) return;
      if (!preserveCurrentScreen) {
        setLoading(false);
        setPreviewLoading(false);
      }
    }
  }, [buildFilterQuery, canView]);

  const loadPeriod = useCallback(
    async ({ background = false, periodId = selectedPeriodIdRef.current }: { background?: boolean; periodId?: string } = {}) => {
      if (!periodId) return;
      await fetchPeriodData(periodId, { background });
    },
    [fetchPeriodData],
  );

  useEffect(() => {
    loadOptions().catch((fetchError) => {
      setLoading(false);
      setPreviewLoading(false);
      setError(String((fetchError as Error)?.message || fetchError));
    });
  }, [loadOptions]);

  useEffect(() => {
    if (!optionsLoaded) return;
    if (!options.periods.length) {
      setSelectedPeriodId('');
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('payroll:selected-period-id');
      }
      const params = new URLSearchParams(searchParams.toString());
      if (params.has('periodId')) {
        params.delete('periodId');
        const nextQuery = params.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      }
      resetVisiblePeriodState();
      setLoading(false);
      setPreviewLoading(false);
      return;
    }

    const persistedPeriodId =
      typeof window !== 'undefined' ? String(window.localStorage.getItem('payroll:selected-period-id') || '').trim() : '';
    const candidatePeriodId = requestedPeriodId || selectedPeriodIdRef.current || persistedPeriodId;
    const resolvedPeriodId =
      (candidatePeriodId && options.periods.some((period) => period.id === candidatePeriodId) ? candidatePeriodId : '') || options.periods[0]?.id || '';

    if (resolvedPeriodId && resolvedPeriodId !== selectedPeriodIdRef.current) {
      setSelectedPeriodId(resolvedPeriodId);
    }
  }, [options.periods, optionsLoaded, pathname, requestedPeriodId, resetVisiblePeriodState, router, searchParams]);

  useEffect(() => {
    if (!requestedPeriodId) return;
    if (requestedPeriodId === lastObservedUrlPeriodIdRef.current) return;
    lastObservedUrlPeriodIdRef.current = requestedPeriodId;
    if (requestedPeriodId === selectedPeriodIdRef.current) return;
    if (options.periods.some((period) => period.id === requestedPeriodId)) {
      setSelectedPeriodId(requestedPeriodId);
    }
  }, [options.periods, requestedPeriodId]);

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
    setSelectedLineIds([]);
  }, [selectedPeriodId, filters.centerCost, filters.contractTypes, filters.lineStatus, filters.search, filters.unit]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    loadPeriod({ background: hasVisiblePeriodDataRef.current, periodId: selectedPeriodId }).catch((fetchError) =>
      setError(String((fetchError as Error)?.message || fetchError)),
    );
  }, [loadPeriod, selectedPeriodId]);

  useEffect(() => {
    const runStatus = String(latestSyncRun?.status || '').toUpperCase();
    if (latestSyncRun && ['PENDING', 'RUNNING', 'FAILED'].includes(runStatus)) {
      setVisibleSyncRun(latestSyncRun);
      return;
    }
    if (!syncingPoint && !hasPointPipelineInProgress) {
      setVisibleSyncRun(null);
    }
  }, [hasPointPipelineInProgress, latestSyncRun, syncingPoint]);

  const reloadAll = async () => {
    await loadOptions();
    if (selectedPeriodIdRef.current) {
      await loadPeriod({ background: true, periodId: selectedPeriodIdRef.current });
    }
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
      await loadPeriod({ background: true, periodId: selectedPeriodId });
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

  const handleToggleLine = useCallback((lineId: string, checked: boolean) => {
    setSelectedLineIds((current) => {
      if (checked) return current.includes(lineId) ? current : [...current, lineId];
      return current.filter((item) => item !== lineId);
    });
  }, []);

  const handleToggleAllLines = useCallback((checked: boolean) => {
    setSelectedLineIds(checked ? lines.map((line) => line.id) : []);
  }, [lines]);

  const executeGenerateAction = async (allowPendingEmployees = false) => {
    if (!selectedPeriodId) return;
    setActionLoading('generate');
    setError('');
    setSuccessMessage('');
    try {
      await fetchJson(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowPendingEmployees }),
      });
      setGenerateConfirmation(null);
      await reloadAll();
      setSuccessMessage(
        allowPendingEmployees
          ? 'Folha gerada com pendências cadastrais sinalizadas para revisão antes da aprovação.'
          : 'Folha gerada com sucesso.',
      );
    } catch (fetchError: any) {
      if (!allowPendingEmployees && fetchError?.code === 'PAYROLL_PENDING_CONFIRMATION' && fetchError?.data) {
        setGenerateConfirmation(fetchError.data as PayrollGenerateConfirmationState);
        return;
      }
      setError(String(fetchError?.message || fetchError));
    } finally {
      setActionLoading('');
    }
  };

  const runPeriodAction = async (path: string, successMessage?: string) => {
    if (!selectedPeriodId) return;
    if (path === 'generate') {
      await executeGenerateAction(false);
      return;
    }
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

  const handleRecalculateSelected = async () => {
    if (!selectedPeriodId || selectedLineIds.length === 0) return;
    setActionLoading('recalculate-selected');
    setError('');
    setSuccessMessage('');
    try {
      const payload = await fetchJson<{
        status: string;
        data: {
          updatedLineIds: string[];
          skipped: Array<{ lineId: string; employeeName: string; reason: string }>;
        };
      }>(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/recalculate-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds: selectedLineIds }),
      });
      await reloadAll();
      setSelectedLineIds([]);
      const updatedCount = payload.data?.updatedLineIds?.length || 0;
      const skippedCount = payload.data?.skipped?.length || 0;
      setSuccessMessage(
        skippedCount > 0
          ? `${updatedCount} linha(s) recalculada(s). ${skippedCount} item(ns) ignorado(s) por não pertencer(em) mais à base elegível atual.`
          : `${updatedCount} linha(s) recalculada(s) com sucesso.`,
      );
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setActionLoading('');
    }
  };

  const handleApproveSelected = async () => {
    if (!selectedPeriodId || selectedLineIds.length === 0) return;
    setActionLoading('approve-selected');
    setError('');
    setSuccessMessage('');
    try {
      const payload = await fetchJson<{
        status: string;
        data: {
          updatedLineIds: string[];
          skipped: Array<{ lineId: string; employeeName: string; reason: string }>;
        };
      }>(`/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}/approve-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds: selectedLineIds }),
      });
      await reloadAll();
      setSelectedLineIds([]);
      const updatedCount = payload.data?.updatedLineIds?.length || 0;
      const skippedCount = payload.data?.skipped?.length || 0;
      setSuccessMessage(
        skippedCount > 0
          ? `${updatedCount} linha(s) aprovada(s). ${skippedCount} item(ns) não puderam ser aprovados.`
          : `${updatedCount} linha(s) aprovada(s) com sucesso.`,
      );
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setActionLoading('');
    }
  };

  const handleDeletePeriod = async () => {
    if (!selectedPeriodId) return;
    const periodLabel = currentPeriod ? `${formatMonthRef(currentPeriod.monthRef)} | ${formatDateBr(currentPeriod.periodStart)} a ${formatDateBr(currentPeriod.periodEnd)}` : 'esta competência';
    const confirmed = window.confirm(
      `Excluir ${periodLabel}?\n\nIsso removerá os dados locais da folha desta competência. A base compartilhada de ponto da Sólides será preservada.`,
    );
    if (!confirmed) return;

    setActionLoading('delete');
    setError('');
    setSuccessMessage('');
    try {
      const payload = await fetchJson<{ status: string; data: { deletedPeriodId: string; nextPeriodId: string | null } }>(
        `/api/admin/folha-pagamento/periods/${encodeURIComponent(selectedPeriodId)}`,
        { method: 'DELETE' },
      );
      await loadOptions();
      if (payload.data?.nextPeriodId) {
        setSelectedPeriodId(payload.data.nextPeriodId);
      } else {
        resetVisiblePeriodState();
        setSelectedPeriodId('');
        const params = new URLSearchParams(searchParams.toString());
        params.delete('periodId');
        const nextQuery = params.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      }
      setSuccessMessage('Competência excluída com sucesso.');
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
      await loadPeriod({ periodId: selectedPeriodIdRef.current });
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setLineSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedPeriodId || !displayedPeriodId || selectedPeriodId !== displayedPeriodId) return;
    if (!hasPointPipelineInProgress) return;
    const intervalId = window.setInterval(() => {
      loadPeriod({ background: true, periodId: selectedPeriodId }).catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [displayedPeriodId, hasPointPipelineInProgress, loadPeriod, selectedPeriodId]);

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
                  {syncingPoint || hasPointPipelineInProgress ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {syncingPoint ? 'Solicitando...' : hasPointPipelineInProgress ? 'Sincronizando...' : 'Atualizar dados'}
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
                    {hasPointPipelineInProgress ? (
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        {syncStageLabel}
                        {syncMetaLabel ? ` · ${syncMetaLabel}` : ''}
                        {syncEstimatedLabel ? ` · ${syncEstimatedLabel}` : ''}
                      </p>
                    ) : null}
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
                  <PayrollFilterMultiSelect
                    options={filterOptions.contracts}
                    value={filters.contractTypes}
                    onChange={(contractTypes) => setFilters((current) => ({ ...current, contractTypes }))}
                    allLabel="Todos"
                  />
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
      {isSwitchingPeriod ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700">Carregando a competência selecionada sem limpar os dados atuais.</div> : null}
      {hasVisibleSyncProgress && visibleSyncRun ? (
        <PayrollSyncProgress run={visibleSyncRun} scopeLabel="fechamento desta competência" className="min-h-[108px]" />
      ) : null}

      {readiness && approvalReadiness ? (
        <PayrollReadinessPanel generateReadiness={readiness} approvalReadiness={approvalReadiness} />
      ) : null}

      <PayrollSummaryCards summary={detail?.summary || null} eligibilitySummary={detail?.eligibilitySummary || null} />

      <PayrollTabNav
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={PAYROLL_CLOSING_TABS}
        actions={selectedPeriodId && canEdit ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">Ações da competência</div>
              {activeTab === 'fechamento' && selectedLineIds.length > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {selectedLineIds.length} selecionada(s)
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeTab === 'fechamento' ? (
                <button
                  type="button"
                  onClick={handleApproveSelected}
                  disabled={selectedLineIds.length === 0 || actionLoading === 'approve-selected' || hasPointPipelineInProgress}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                    selectedLineIds.length === 0 || hasPointPipelineInProgress
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                  title={
                    hasPointPipelineInProgress
                      ? 'Aguarde a conclusão da sincronização da competência antes de aprovar linhas específicas.'
                      : 'Aprovar somente as linhas selecionadas para liberar a aprovação da competência.'
                  }
                >
                  {actionLoading === 'approve-selected' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Aprovar selecionados
                </button>
              ) : null}
              {activeTab === 'fechamento' ? (
                <button
                  type="button"
                  onClick={handleRecalculateSelected}
                  disabled={selectedLineIds.length === 0 || actionLoading === 'recalculate-selected' || hasPointPipelineInProgress}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                    selectedLineIds.length === 0 || hasPointPipelineInProgress
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                  }`}
                  title={
                    hasPointPipelineInProgress
                      ? 'Aguarde a conclusão da sincronização da competência antes de recalcular linhas específicas.'
                      : 'Recalcular somente as linhas selecionadas usando a base já sincronizada e o cadastro local atual.'
                  }
                >
                  {actionLoading === 'recalculate-selected' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Recalcular selecionados
                </button>
              ) : null}
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
              <div title={approvalBlockedByReadiness ? approveActionTitle : undefined}>
                <button
                  type="button"
                  onClick={() => runPeriodAction('approve')}
                  disabled={approvalBlockedByReadiness || actionLoading === 'approve'}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                    approvalBlockedByReadiness
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {actionLoading === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aprovar competência
                </button>
              </div>
              <button type="button" onClick={() => runPeriodAction('reopen')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">
                {actionLoading === 'reopen' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reabrir competência
              </button>
              <button
                type="button"
                onClick={handleDeletePeriod}
                disabled={actionLoading === 'delete' || hasPointPipelineInProgress || currentPeriod?.status === 'ENVIADA'}
                title={
                  currentPeriod?.status === 'ENVIADA'
                    ? 'Competências enviadas não podem ser excluídas.'
                    : hasPointPipelineInProgress
                      ? 'Aguarde a conclusão da sincronização da competência antes de excluí-la.'
                      : 'Excluir competência'
                }
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                  currentPeriod?.status === 'ENVIADA' || hasPointPipelineInProgress
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {actionLoading === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Excluir competência
              </button>
            </div>
          </>
        ) : null}
      />

      {activeTab === 'fechamento' ? (
        <PayrollClosingTable
          rows={lines}
          loading={loading}
          onOpenDetail={openLineDetail}
          selectedLineIds={selectedLineIds}
          onToggleLine={handleToggleLine}
          onToggleAll={handleToggleAllLines}
        />
      ) : null}
      {activeTab === 'beneficios' ? (
        <PayrollBenefitsPanel rows={benefitRows} summary={benefitsSummary} loading={loading || previewLoading} onOpenLine={openPreviewLine} />
      ) : null}
      {activeTab === 'previa' ? <PayrollPreviewTable rows={previewRows} loading={loading || previewLoading} onOpenLine={openPreviewLine} /> : null}

      <PayrollNewPeriodModal open={newPeriodOpen} saving={creatingPeriod} onClose={() => setNewPeriodOpen(false)} onSubmit={handleCreatePeriod} />
      <PayrollGenerateConfirmationModal
        open={Boolean(generateConfirmation)}
        pending={generateConfirmation}
        saving={actionLoading === 'generate'}
        onClose={() => setGenerateConfirmation(null)}
        onConfirm={() => executeGenerateAction(true)}
      />
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
