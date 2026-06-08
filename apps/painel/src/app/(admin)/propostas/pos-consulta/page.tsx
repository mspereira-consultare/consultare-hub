'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@/lib/permissions';
import { ProposalsFiltersPanel } from '../components/ProposalsFiltersPanel';
import { PostConsultDetailSection } from './components/PostConsultDetailSection';
import type { PostConsultDetailResponse, PostConsultOptions } from './components/types';

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
  },
  rows: [],
  page: 1,
  pageSize: 25,
  totalRows: 0,
  totalPages: 1,
};

const EMPTY_OPTIONS: PostConsultOptions = {
  canEdit: false,
  availableUnits: [],
  availableStatuses: [],
  availableResponsibles: [],
};

const getDefaultDateRange = () => {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
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
  const [options, setOptions] = useState<PostConsultOptions>(EMPTY_OPTIONS);

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

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
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

  const fetchDetailData = useCallback(async () => {
    if (!canView) return;
    setDetailLoading(true);
    setError('');

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

      const response = await fetch(`/api/admin/propostas/pos-consulta/details?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar a base de pós-consulta.'));
      }

      setDetailData(payload?.data || EMPTY_DETAIL_DATA);
      setDetailPage(Number(payload?.data?.page) || 1);
    } catch (fetchError) {
      console.error('Erro ao carregar base de pós-consulta:', fetchError);
      setError(normalizeFetchError(fetchError, 'Erro ao carregar a base de pós-consulta.'));
      setDetailData(EMPTY_DETAIL_DATA);
    } finally {
      setDetailLoading(false);
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

  const handleRowSaved = () => {
    void fetchDetailData();
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

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <PostConsultDetailSection
        detailData={detailData}
        loading={detailLoading}
        canEdit={options.canEdit}
        onChangePage={setDetailPage}
        onRowSaved={handleRowSaved}
      />
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
