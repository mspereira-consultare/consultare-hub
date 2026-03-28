'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@/lib/permissions';
import { ProposalsDetailSection } from './components/ProposalsDetailSection';
import { ProposalsFiltersPanel } from './components/ProposalsFiltersPanel';
import { AWAITING_CLIENT_APPROVAL_STATUS } from '@/lib/proposals/constants';
import type {
  ProposalDetailResponse,
  ProposalDetailRow,
  ProposalFollowupOptions,
} from './components/types';

const EMPTY_DETAIL_DATA: ProposalDetailResponse = {
  rows: [],
  page: 1,
  pageSize: 25,
  totalRows: 0,
  totalPages: 1,
  detailStatusApplied: AWAITING_CLIENT_APPROVAL_STATUS,
};

const EMPTY_FOLLOWUP_OPTIONS: ProposalFollowupOptions = {
  canEdit: false,
  users: [],
  conversionStatuses: [],
  conversionReasonsByStatus: {},
};

const getDefaultDateRange = () => {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  };
};

const normalizeFetchError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : String(error || fallback);
  if (!message || message === 'Failed to fetch') {
    return 'Não foi possível carregar a base de propostas agora. Verifique a conexão com o servidor e o MySQL configurado no ambiente do app.';
  }
  return message;
};

function PropostasBasePageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialDateRange = useMemo(() => {
    const defaults = getDefaultDateRange();
    const start = String(searchParams.get('startDate') || defaults.start).trim();
    const end = String(searchParams.get('endDate') || defaults.end).trim();
    return {
      start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaults.start,
      end: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : defaults.end,
    };
  }, [searchParams]);
  const initialUnit = useMemo(() => String(searchParams.get('unit') || 'all').trim() || 'all', [searchParams]);
  const initialStatus = useMemo(() => String(searchParams.get('status') || 'all').trim() || 'all', [searchParams]);
  const initialDetailStatus = useMemo(
    () => String(searchParams.get('detailStatus') || '').trim() || AWAITING_CLIENT_APPROVAL_STATUS,
    [searchParams],
  );

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'propostas', 'view', role);

  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [selectedUnit, setSelectedUnit] = useState(initialUnit);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);

  const [detailData, setDetailData] = useState<ProposalDetailResponse>(EMPTY_DETAIL_DATA);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExporting, setDetailExporting] = useState(false);
  const [detailStatus, setDetailStatus] = useState(
    initialStatus !== 'all' ? initialStatus : initialDetailStatus,
  );
  const [detailSearchInput, setDetailSearchInput] = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const [followupOptions, setFollowupOptions] = useState<ProposalFollowupOptions>(EMPTY_FOLLOWUP_OPTIONS);

  const previousGlobalStatusRef = useRef(initialStatus);

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
      });
      const response = await fetch(`/api/admin/propostas/options?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar filtros de propostas.'));
      }

      const nextUnits = Array.isArray(payload?.data?.availableUnits)
        ? payload.data.availableUnits.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [];
      const nextStatuses = Array.isArray(payload?.data?.availableStatuses)
        ? payload.data.availableStatuses.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [];

      setAvailableUnits(nextUnits);
      setAvailableStatuses(nextStatuses);
    } catch (fetchError) {
      console.error('Erro ao carregar filtros operacionais de propostas:', fetchError);
      setError(normalizeFetchError(fetchError, 'Erro ao carregar filtros de propostas.'));
    }
  }, [canView, dateRange.end, dateRange.start, selectedStatus, selectedUnit]);

  const fetchDetailData = useCallback(async () => {
    if (!canView) return;
    setDetailLoading(true);
    setDetailError('');

    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
        detailStatus,
        search: detailSearch,
        page: String(detailPage),
        pageSize: String(EMPTY_DETAIL_DATA.pageSize),
      });

      const response = await fetch(`/api/admin/propostas/details?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar a base detalhada.'));
      }

      setDetailData(payload?.data || EMPTY_DETAIL_DATA);
      setDetailPage(Number(payload?.data?.page) || 1);
    } catch (fetchError) {
      console.error('Erro ao carregar base detalhada de propostas:', fetchError);
      setDetailError(normalizeFetchError(fetchError, 'Erro ao carregar a base detalhada.'));
      setDetailData(EMPTY_DETAIL_DATA);
    } finally {
      setDetailLoading(false);
    }
  }, [canView, dateRange.end, dateRange.start, detailPage, detailSearch, detailStatus, selectedStatus, selectedUnit]);

  const fetchFollowupOptions = useCallback(async () => {
    if (!canView) return;
    try {
      const response = await fetch('/api/admin/propostas/followup/options', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao carregar opções da base de trabalho.'));
      }
      setFollowupOptions(payload?.data || EMPTY_FOLLOWUP_OPTIONS);
    } catch (fetchError) {
      console.error('Erro ao carregar opções de follow-up de propostas:', fetchError);
      setDetailError((current) => current || normalizeFetchError(fetchError, 'Erro ao carregar opções da base.'));
    }
  }, [canView]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void fetchDetailData();
  }, [fetchDetailData]);

  useEffect(() => {
    void fetchFollowupOptions();
  }, [fetchFollowupOptions]);

  useEffect(() => {
    if (selectedUnit !== 'all' && availableUnits.length > 0 && !availableUnits.includes(selectedUnit)) {
      setSelectedUnit('all');
    }
  }, [availableUnits, selectedUnit]);

  useEffect(() => {
    if (selectedStatus === 'all') return;
    if (availableStatuses.includes(selectedStatus)) return;
    setSelectedStatus('all');
  }, [availableStatuses, selectedStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDetailSearch(detailSearchInput.trim());
      setDetailPage(1);
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [detailSearchInput]);

  useEffect(() => {
    if (selectedStatus !== 'all') {
      setDetailStatus(selectedStatus);
      setDetailPage(1);
    } else if (previousGlobalStatusRef.current !== 'all') {
      setDetailStatus(initialDetailStatus || AWAITING_CLIENT_APPROVAL_STATUS);
      setDetailPage(1);
    }
    previousGlobalStatusRef.current = selectedStatus;
  }, [initialDetailStatus, selectedStatus]);

  const handleFollowupRowSaved = (nextRow: ProposalDetailRow) => {
    setDetailData((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.proposalId === nextRow.proposalId ? nextRow : row)),
    }));
  };

  const handleExportDetail = async () => {
    setDetailExporting(true);
    setDetailError('');
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
        detailStatus,
        search: detailSearch,
        page: String(detailPage),
        pageSize: String(EMPTY_DETAIL_DATA.pageSize),
      });
      const response = await fetch(`/api/admin/propostas/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || 'Falha ao exportar XLSX.'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `propostas-detalhadas-${dateRange.start}_${dateRange.end}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error('Erro ao exportar base detalhada:', exportError);
      setDetailError(normalizeFetchError(exportError, 'Erro ao exportar a base detalhada.'));
    } finally {
      setDetailExporting(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm">Você não possui acesso à base de trabalho de propostas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      <ProposalsFiltersPanel
        title="Propostas / Base de trabalho"
        subtitle="Fila operacional para follow-up da equipe, com conversão, responsável e histórico da última edição."
        dateRange={dateRange}
        selectedUnit={selectedUnit}
        selectedStatus={selectedStatus}
        availableUnits={availableUnits}
        availableStatuses={availableStatuses}
        filtersExpanded={filtersExpanded}
        onChangeDateRange={setDateRange}
        onChangeUnit={setSelectedUnit}
        onChangeStatus={setSelectedStatus}
        onToggleExpanded={() => setFiltersExpanded((prev) => !prev)}
        onResetFilters={() => {
          setSelectedUnit('all');
          setSelectedStatus('all');
        }}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {detailError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{detailError}</div> : null}

      <ProposalsDetailSection
        detailData={detailData}
        followupOptions={followupOptions}
        availableStatuses={availableStatuses.length > 0 ? availableStatuses : [AWAITING_CLIENT_APPROVAL_STATUS]}
        selectedStatus={selectedStatus}
        detailStatus={detailStatus}
        detailSearch={detailSearchInput}
        loading={detailLoading}
        exporting={detailExporting}
        canEdit={followupOptions.canEdit}
        onChangeDetailStatus={(value) => {
          setDetailStatus(value);
          setDetailPage(1);
        }}
        onChangeDetailSearch={setDetailSearchInput}
        onClearDetailFilters={() => {
          setDetailSearchInput('');
          if (selectedStatus === 'all') {
            setDetailStatus(initialDetailStatus || AWAITING_CLIENT_APPROVAL_STATUS);
          }
          setDetailPage(1);
        }}
        onExport={handleExportDetail}
        onChangePage={setDetailPage}
        onRowSaved={handleFollowupRowSaved}
      />
    </div>
  );
}

export default function PropostasBasePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
          Carregando base de trabalho de propostas...
        </div>
      }
    >
      <PropostasBasePageContent />
    </Suspense>
  );
}
