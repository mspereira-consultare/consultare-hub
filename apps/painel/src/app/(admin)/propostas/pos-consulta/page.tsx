'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Download, HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import { JobQueueHeartbeat } from '@/components/JobQueueHeartbeat';
import { hasPermission } from '@/lib/permissions';
import { ProposalsFiltersPanel } from '../components/ProposalsFiltersPanel';
import { PostConsultDetailSection } from './components/PostConsultDetailSection';
import { PostConsultHelpModal } from './components/PostConsultHelpModal';
import type { PostConsultDetailResponse, PostConsultFollowupSaveResult, PostConsultOptions } from './components/types';

type SessionUserShape = {
  role?: string | null;
  permissions?: unknown;
};

const EMPTY_DETAIL_DATA: PostConsultDetailResponse = {
  summary: {
    totalEvents: 0,
    totalProposals: 0,
    totalClosedEvents: 0,
    conversionRate: 0,
    pendingPatients: 0,
    afterSecondNoClosePatients: 0,
    executedProposalValue: 0,
  },
  viewerPerformance: {
    hasOperationalMatch: false,
    attendantResponsible: null,
    totalEvents: 0,
    totalClosedEvents: 0,
    conversionRate: 0,
    pendingPatients: 0,
    afterSecondNoClosePatients: 0,
    totalProposals: 0,
    executedProposalValue: 0,
  },
  rows: [],
  page: 1,
  pageSize: 25,
  totalRows: 0,
  totalPages: 1,
};

const EMPTY_OPTIONS: PostConsultOptions = {
  canEdit: false,
  canRefresh: false,
  availableUnits: [],
  availableStatuses: [],
  availableResponsibles: [],
  nonClosureReasons: [],
  heartbeat: null,
};

const getSaoPauloToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getSaoPauloWeekStart = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const now = new Date();
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 1);
  const localMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = localMidday.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  localMidday.setUTCDate(localMidday.getUTCDate() + diffToMonday);
  return formatter.format(localMidday);
};

const getDefaultDateRange = () => {
  return {
    start: getSaoPauloWeekStart(),
    end: getSaoPauloToday(),
  };
};

const normalizeSelectParam = (value: string | null, fallback = 'all') => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const normalizeFetchError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : String(error || fallback);
  if (!message || message === 'Failed to fetch') {
    return 'Não foi possível carregar a base de pós-consulta agora. Verifique a conexão com o servidor e o MySQL configurado no ambiente do app.';
  }
  return message;
};

const ROW_SAVE_BACKGROUND_SYNC_DELAY_MS = 6000;

function PostConsultPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const initialDateRange = useMemo(() => {
    const defaults = getDefaultDateRange();
    const start = String(searchParams.get('startDate') || defaults.start).trim();
    const end = String(searchParams.get('endDate') || defaults.end).trim();
    return {
      start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaults.start,
      end: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : defaults.end,
    };
  }, [searchParams]);
  const initialUnit = useMemo(() => normalizeSelectParam(searchParams.get('unit')), [searchParams]);
  const initialStatus = useMemo(() => normalizeSelectParam(searchParams.get('status')), [searchParams]);
  const initialResponsible = useMemo(() => normalizeSelectParam(searchParams.get('responsible')), [searchParams]);
  const initialClosed = useMemo(() => normalizeSelectParam(searchParams.get('closed')), [searchParams]);

  const sessionUser = session?.user as SessionUserShape | undefined;
  const role = String(sessionUser?.role || 'OPERADOR');
  const permissions = sessionUser?.permissions;
  const canView = hasPermission(permissions, 'propostas_pos_consulta', 'view', role);

  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [selectedUnit, setSelectedUnit] = useState(initialUnit);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [selectedResponsible, setSelectedResponsible] = useState(initialResponsible);
  const [selectedClosed, setSelectedClosed] = useState(initialClosed);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<PostConsultDetailResponse>(EMPTY_DETAIL_DATA);
  const [detailPage, setDetailPage] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [notice, setNotice] = useState('');
  const [options, setOptions] = useState<PostConsultOptions>(EMPTY_OPTIONS);
  const rowSaveSyncTimeoutRef = useRef<number | null>(null);
  const heartbeat = options.heartbeat;
  const canRefresh = options.canRefresh;
  const isUpdating = refreshing || ['PENDING', 'RUNNING'].includes(String(heartbeat?.status || '').toUpperCase());

  const effectiveUnit = useMemo(() => {
    if (selectedUnit === 'all') return 'all';
    if (options.availableUnits.length === 0) return selectedUnit;
    return options.availableUnits.includes(selectedUnit) ? selectedUnit : 'all';
  }, [options.availableUnits, selectedUnit]);
  const effectiveStatus = useMemo(() => {
    if (selectedStatus === 'all') return 'all';
    if (options.availableStatuses.length === 0) return selectedStatus;
    return options.availableStatuses.includes(selectedStatus) ? selectedStatus : 'all';
  }, [options.availableStatuses, selectedStatus]);
  const effectiveResponsible = useMemo(() => {
    if (selectedResponsible === 'all') return 'all';
    if (options.availableResponsibles.length === 0) return selectedResponsible;
    return options.availableResponsibles.includes(selectedResponsible) ? selectedResponsible : 'all';
  }, [options.availableResponsibles, selectedResponsible]);

  const globalFiltersActive =
    effectiveUnit !== 'all' ||
    effectiveStatus !== 'all' ||
    effectiveResponsible !== 'all' ||
    selectedClosed !== 'all';

  const loadOptions = useCallback(async (force = false) => {
    if (!canView) return;
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      if (force) {
        params.set('refresh', String(Date.now()));
      }
      const response = await fetch(`/api/admin/propostas/pos-consulta/options?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar filtros do pós-consulta.'));
      }

      setOptions(payload?.data || EMPTY_OPTIONS);
    } catch (fetchError) {
      console.error('Erro ao carregar filtros de pós-consulta:', fetchError);
      setError(normalizeFetchError(fetchError, 'Erro ao carregar filtros do pós-consulta.'));
    }
  }, [canView, dateRange.end, dateRange.start]);

  const fetchDetailData = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!canView) return;
    if (!options?.silent) {
      setDetailLoading(true);
      setError('');
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: effectiveUnit,
        status: effectiveStatus,
        responsible: effectiveResponsible,
        closed: selectedClosed,
        page: String(detailPage),
        pageSize: String(EMPTY_DETAIL_DATA.pageSize),
      });
      if (options?.force) {
        params.set('refresh', String(Date.now()));
      }

      const response = await fetch(`/api/admin/propostas/pos-consulta/details?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar a base de pós-consulta.'));
      }

      setDetailData(payload?.data || EMPTY_DETAIL_DATA);
      setDetailPage(Number(payload?.data?.page) || 1);
    } catch (fetchError) {
      console.error('Erro ao carregar base de pós-consulta:', fetchError);
      if (!options?.silent) {
        setError(normalizeFetchError(fetchError, 'Erro ao carregar a base de pós-consulta.'));
        setDetailData(EMPTY_DETAIL_DATA);
      }
    } finally {
      if (!options?.silent) {
        setDetailLoading(false);
      }
    }
  }, [canView, dateRange.end, dateRange.start, detailPage, effectiveResponsible, effectiveStatus, effectiveUnit, selectedClosed]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOptions();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [canView, dateRange.end, dateRange.start, loadOptions]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDetailData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [canView, dateRange.end, dateRange.start, detailPage, effectiveResponsible, effectiveStatus, effectiveUnit, fetchDetailData, selectedClosed]);

  useEffect(() => {
    const heartbeatStatus = String(heartbeat?.status || '').toUpperCase();
    if (!['PENDING', 'RUNNING'].includes(heartbeatStatus)) return;

    const timeoutId = window.setTimeout(() => {
      void loadOptions(true);
      void fetchDetailData({ silent: true, force: true });
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [fetchDetailData, heartbeat?.status, loadOptions]);

  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams({
      startDate: dateRange.start,
      endDate: dateRange.end,
      unit: effectiveUnit,
      status: effectiveStatus,
      responsible: effectiveResponsible,
      closed: selectedClosed,
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [dateRange.end, dateRange.start, effectiveResponsible, effectiveStatus, effectiveUnit, pathname, router, selectedClosed]);

  useEffect(() => {
    return () => {
      if (rowSaveSyncTimeoutRef.current) {
        window.clearTimeout(rowSaveSyncTimeoutRef.current);
      }
    };
  }, []);

  const handleRowSaved = useCallback(
    (savedResult: PostConsultFollowupSaveResult) => {
      setDetailData((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.eventKey === savedResult.eventKey
            ? {
                ...row,
                firstContactClosed: savedResult.firstContactClosed,
                firstContactAt: savedResult.firstContactAt,
                secondContactClosed: savedResult.secondContactClosed,
                secondContactAt: savedResult.secondContactAt,
                nonClosureReason: savedResult.nonClosureReason,
                nonClosureReasonLabel: savedResult.nonClosureReasonLabel,
                observation: savedResult.observation,
                updatedByUserName: savedResult.updatedByUserName,
                updatedAt: savedResult.updatedAt,
                effectiveClosed: savedResult.effectiveClosed,
                closed: savedResult.closed,
              }
            : row,
        ),
      }));

      if (rowSaveSyncTimeoutRef.current) {
        window.clearTimeout(rowSaveSyncTimeoutRef.current);
      }
      rowSaveSyncTimeoutRef.current = window.setTimeout(() => {
        void fetchDetailData({ silent: true, force: true });
      }, ROW_SAVE_BACKGROUND_SYNC_DELAY_MS);
    },
    [fetchDetailData],
  );

  const handleManualUpdate = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/propostas/pos-consulta/refresh', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao solicitar atualização do pós-consulta.'));
      }

      setNotice('Atualização solicitada. Vamos acompanhar a fila e recarregar os dados automaticamente.');
      void loadOptions(true);
      void fetchDetailData({ silent: true, force: true });
    } catch (updateError) {
      console.error('Erro ao solicitar atualização do pós-consulta:', updateError);
      setError(normalizeFetchError(updateError, 'Erro ao solicitar atualização do pós-consulta.'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    setError('');
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: effectiveUnit,
        status: effectiveStatus,
        responsible: effectiveResponsible,
        closed: selectedClosed,
        format,
      });
      const response = await fetch(`/api/admin/propostas/pos-consulta/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || `Falha ao exportar ${format.toUpperCase()}.`));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pos-consulta-${dateRange.start}_${dateRange.end}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error('Erro ao exportar base de pós-consulta:', exportError);
      setError(normalizeFetchError(exportError, 'Erro ao exportar a base de pós-consulta.'));
    } finally {
      setExporting(null);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm">Você não possui acesso à base operacional de pós-consulta.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-50">
      <ProposalsFiltersPanel
        title="Propostas / Pós-consulta"
        subtitle="Base operacional da recepção para acompanhar pacientes com proposta gerada após a consulta."
        dateRange={dateRange}
        selectedUnit={selectedUnit}
        selectedStatus={selectedStatus}
        availableUnits={options.availableUnits}
        availableStatuses={options.availableStatuses}
        filtersExpanded={filtersExpanded}
        hasActiveFilters={globalFiltersActive}
        extraFilters={
          <>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Atendente</label>
              <select
                value={selectedResponsible}
                onChange={(event) => {
                  setSelectedResponsible(event.target.value);
                  setDetailPage(1);
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos os atendentes</option>
                {options.availableResponsibles.map((responsible) => (
                  <option key={responsible} value={responsible}>
                    {responsible}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Fechou?</label>
              <select
                value={selectedClosed}
                onChange={(event) => {
                  setSelectedClosed(event.target.value);
                  setDetailPage(1);
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </select>
            </div>
          </>
        }
        onChangeDateRange={(next) => {
          setDateRange(next);
          setDetailPage(1);
        }}
        onChangeUnit={(value) => {
          setSelectedUnit(value);
          setDetailPage(1);
        }}
        onChangeStatus={(value) => {
          setSelectedStatus(value);
          setDetailPage(1);
        }}
        onToggleExpanded={() => setFiltersExpanded((prev) => !prev)}
        onResetFilters={() => {
          setSelectedUnit('all');
          setSelectedStatus('all');
          setSelectedResponsible('all');
          setSelectedClosed('all');
          setDetailPage(1);
        }}
      />

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-1">
            <JobQueueHeartbeat
              services={['faturamento', 'comercial']}
              fallbackLastSyncAt={heartbeat?.last_run || null}
              label="Sincronização do pós-consulta"
            />
            <p className="text-xs text-slate-500">
              A atualização manual solicita novo processamento do faturamento e das propostas, e a página se recarrega automaticamente enquanto houver atualização pendente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <HelpCircle size={14} />
              Ajuda
            </button>
            <button
              type="button"
              onClick={handleManualUpdate}
              disabled={!canRefresh || isUpdating}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                isUpdating
                  ? 'cursor-wait border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isUpdating ? 'Sincronizando...' : 'Atualizar dados'}
            </button>
            <button
              type="button"
              onClick={() => void handleExport('xlsx')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => void handleExport('pdf')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <PostConsultDetailSection
        detailData={detailData}
        loading={detailLoading}
        canEdit={options.canEdit}
        nonClosureReasons={options.nonClosureReasons}
        onChangePage={setDetailPage}
        onRowSaved={handleRowSaved}
      />
      <PostConsultHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default function PostConsultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
          Carregando base de pós-consulta...
        </div>
      }
    >
      <PostConsultPageContent />
    </Suspense>
  );
}
