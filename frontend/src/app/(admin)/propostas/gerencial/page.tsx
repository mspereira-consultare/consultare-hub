'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@/lib/permissions';
import { AWAITING_CLIENT_APPROVAL_STATUS } from '@/lib/proposals/constants';
import { ProposalsFiltersPanel } from '../components/ProposalsFiltersPanel';
import { ProposalsOverviewSection } from '../components/ProposalsOverviewSection';
import { toNumber } from '../components/formatters';
import type { GroupedUnit, SellerRow, SortKey, Summary, UnitRow } from '../components/types';

const EMPTY_SUMMARY: Summary = {
  qtd: 0,
  valor: 0,
  wonValue: 0,
  wonQtd: 0,
  lostValue: 0,
  conversionRate: 0,
  awaitingClientApprovalQtd: 0,
  awaitingClientApprovalValue: 0,
  approvedByClientQtd: 0,
  approvedByClientValue: 0,
  rejectedByClientQtd: 0,
  rejectedByClientValue: 0,
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
    return 'Não foi possível carregar a visão gerencial de propostas agora. Verifique a conexão com o servidor e o MySQL configurado no ambiente do app.';
  }
  return message;
};

function PropostasGerencialPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
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

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'propostas_gerencial', 'view', role);
  const canRefresh = hasPermission(permissions, 'propostas_gerencial', 'refresh', role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [selectedUnit, setSelectedUnit] = useState(initialUnit);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'valor',
    direction: 'desc',
  });
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [unitData, setUnitData] = useState<GroupedUnit[]>([]);
  const [sellerData, setSellerData] = useState<SellerRow[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const processUnitData = (rows: UnitRow[]) => {
    const grouped = new Map<string, GroupedUnit>();

    rows.forEach((row) => {
      const key = String(row.unit_name || 'Sem unidade').trim() || 'Sem unidade';
      const current = grouped.get(key) || { name: key, total: 0, qtd: 0 };
      current.total += toNumber(row.valor);
      current.qtd += toNumber(row.qtd);
      grouped.set(key, current);
    });

    setUnitData(Array.from(grouped.values()).sort((a, b) => b.total - a.total));
  };

  const fetchData = useCallback(
    async (forceFresh = false) => {
      if (!canView) return;
      if (!heartbeat) setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end,
          unit: selectedUnit,
          status: selectedStatus,
        });
        if (forceFresh) params.set('refresh', Date.now().toString());

        const response = await fetch(`/api/admin/propostas?${params.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'Falha ao carregar propostas gerenciais.'));
        }

        processUnitData((payload.byUnit || []) as UnitRow[]);
        setSellerData((payload.byProposer || []) as SellerRow[]);

        const rawSummary = payload.summary || {};
        setSummary({
          qtd: toNumber(rawSummary.qtd),
          valor: toNumber(rawSummary.valor),
          wonValue: toNumber(rawSummary.wonValue),
          wonQtd: toNumber(rawSummary.wonQtd),
          lostValue: toNumber(rawSummary.lostValue),
          conversionRate: toNumber(rawSummary.conversionRate),
          awaitingClientApprovalQtd: toNumber(rawSummary.awaitingClientApprovalQtd),
          awaitingClientApprovalValue: toNumber(rawSummary.awaitingClientApprovalValue),
          approvedByClientQtd: toNumber(rawSummary.approvedByClientQtd),
          approvedByClientValue: toNumber(rawSummary.approvedByClientValue),
          rejectedByClientQtd: toNumber(rawSummary.rejectedByClientQtd),
          rejectedByClientValue: toNumber(rawSummary.rejectedByClientValue),
        });

        if (payload.heartbeat) {
          setHeartbeat(payload.heartbeat);
          if (payload.heartbeat.status === 'RUNNING' || payload.heartbeat.status === 'PENDING') {
            window.setTimeout(() => fetchData(true), 3000);
            setIsUpdating(true);
          } else {
            setIsUpdating(false);
          }
        }
      } catch (fetchError) {
        console.error('Erro ao buscar dados gerenciais de propostas:', fetchError);
        setError(normalizeFetchError(fetchError, 'Erro ao carregar propostas gerenciais.'));
        setIsUpdating(false);
      } finally {
        setLoading(false);
      }
    },
    [canView, dateRange.end, dateRange.start, heartbeat, selectedStatus, selectedUnit],
  );

  const fetchOptions = useCallback(async () => {
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

      setAvailableUnits(
        Array.isArray(payload?.data?.availableUnits)
          ? payload.data.availableUnits.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : [],
      );
      setAvailableStatuses(
        Array.isArray(payload?.data?.availableStatuses)
          ? payload.data.availableStatuses.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : [],
      );
    } catch (fetchError) {
      console.error('Erro ao carregar filtros gerenciais de propostas:', fetchError);
      setError((current) => current || normalizeFetchError(fetchError, 'Erro ao carregar filtros de propostas.'));
    }
  }, [canView, dateRange.end, dateRange.start, selectedStatus, selectedUnit]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

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

  const filteredSellers = useMemo(
    () =>
      sellerData.filter((seller) =>
        String(seller.professional_name || 'Sistema').toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, sellerData],
  );

  const getSortValue = (seller: SellerRow, key: SortKey) => {
    if (key === 'professional_name') return String(seller.professional_name || 'Sistema').toLowerCase();
    if (key === 'conversion_rate') {
      const total = toNumber(seller.valor);
      const executed = toNumber(seller.valor_executado);
      return total > 0 ? (executed / total) * 100 : 0;
    }
    if (key === 'ticket_medio') {
      return toNumber(seller.valor) / Math.max(toNumber(seller.qtd), 1);
    }
    if (key === 'ticket_exec') {
      return toNumber(seller.valor_executado) / Math.max(toNumber(seller.qtd_executado), 1);
    }
    return toNumber((seller as any)[key]);
  };

  const sortedSellers = useMemo(() => {
    return [...filteredSellers].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, 'pt-BR');
      } else {
        comparison = Number(aVal) - Number(bVal);
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredSellers, sortConfig]);

  const toggleSort = (key: SortKey) => {
    setSortConfig((previous) => {
      if (previous.key === key) {
        return { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'professional_name' ? 'asc' : 'desc' };
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const percentageOfTotal = (value: number) => (summary.valor > 0 ? (value / summary.valor) * 100 : 0);

  const handleManualUpdate = async () => {
    if (!canRefresh) return;
    setIsUpdating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/propostas', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Erro ao solicitar atualização.'));
      }
      window.setTimeout(() => fetchData(true), 1000);
    } catch (updateError) {
      console.error('Erro ao solicitar atualização de propostas:', updateError);
      setError(normalizeFetchError(updateError, 'Erro ao solicitar atualização.'));
      setIsUpdating(false);
    }
  };

  const handleOpenAwaitingBase = () => {
    const params = new URLSearchParams({
      startDate: dateRange.start,
      endDate: dateRange.end,
      unit: selectedUnit,
      status: 'all',
      detailStatus: AWAITING_CLIENT_APPROVAL_STATUS,
    });
    router.push(`/propostas?${params.toString()}`);
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm">Você não possui acesso à visão gerencial de propostas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      <ProposalsFiltersPanel
        title="Propostas / Visão gerencial"
        subtitle="Indicadores, status do funil e rankings consolidados do período para acompanhamento da liderança."
        dateRange={dateRange}
        selectedUnit={selectedUnit}
        selectedStatus={selectedStatus}
        availableUnits={availableUnits}
        availableStatuses={availableStatuses}
        filtersExpanded={filtersExpanded}
        heartbeat={heartbeat}
        isUpdating={isUpdating}
        canRefresh={canRefresh}
        onChangeDateRange={setDateRange}
        onChangeUnit={setSelectedUnit}
        onChangeStatus={setSelectedStatus}
        onToggleExpanded={() => setFiltersExpanded((prev) => !prev)}
        onManualUpdate={handleManualUpdate}
        onResetFilters={() => {
          setSelectedUnit('all');
          setSelectedStatus('all');
        }}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <ProposalsOverviewSection
        loading={loading}
        summary={summary}
        unitData={unitData}
        sellerData={sortedSellers}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        sortIndicator={sortIndicator}
        onToggleSort={toggleSort}
        percentageOfTotal={percentageOfTotal}
        onOpenAwaitingBase={handleOpenAwaitingBase}
      />
    </div>
  );
}

export default function PropostasGerencialPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
          Carregando visão gerencial de propostas...
        </div>
      }
    >
      <PropostasGerencialPageContent />
    </Suspense>
  );
}
