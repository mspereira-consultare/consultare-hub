'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3,
  CalendarRange,
  Download,
  FilterX,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { MarketingFunilSyncStatus } from '../funil/components/MarketingFunilSyncStatus';
import { MarketingControleGrid } from './components/MarketingControleGrid';
import { MarketingControleSummaryCards } from './components/MarketingControleSummaryCards';
import { formatMonthLabel, getCurrentMonthRef } from './components/formatters';
import type {
  MarketingControleGrid as MarketingControleGridData,
  MarketingControleSourceStatus,
  MarketingControleSummary,
} from './components/types';

type SessionUser = {
  role?: string;
  permissions?: unknown;
};

type FilterState = {
  brand: 'consultare' | 'resolve';
  monthRef: string;
};

const brandOptions = [
  { value: 'consultare', label: 'Consultare' },
  { value: 'resolve', label: 'Resolve' },
] as const;

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400';

async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return (payload as { data: T }).data;
}

const isJobRunning = (status?: string | null) => ['PENDING', 'RUNNING'].includes(String(status || '').toUpperCase());

function MarketingControlePageContent() {
  const { data: session } = useSession();
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || 'OPERADOR');
  const canView = hasPermission(sessionUser.permissions, 'marketing_controle', 'view', role);
  const canRefresh = hasPermission(sessionUser.permissions, 'marketing_controle', 'refresh', role);

  const defaults = useMemo<FilterState>(() => ({ brand: 'consultare', monthRef: getCurrentMonthRef() }), []);
  const [filters, setFilters] = useState<FilterState>(defaults);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaults);
  const [summary, setSummary] = useState<MarketingControleSummary | null>(null);
  const [grid, setGrid] = useState<MarketingControleGridData | null>(null);
  const [sourceStatus, setSourceStatus] = useState<MarketingControleSourceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('brand', appliedFilters.brand);
    params.set('monthRef', appliedFilters.monthRef);
    return params.toString();
  }, [appliedFilters]);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const [summaryData, gridData, sourceStatusData] = await Promise.all([
        fetchApi<MarketingControleSummary>(`/api/admin/marketing/controle/summary?${baseQuery}`),
        fetchApi<MarketingControleGridData>(`/api/admin/marketing/controle/grid?${baseQuery}`),
        fetchApi<MarketingControleSourceStatus>(`/api/admin/marketing/controle/source-status`),
      ]);
      setSummary(summaryData);
      setGrid(gridData);
      setSourceStatus(sourceStatusData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar marketing/controle.');
    } finally {
      setLoading(false);
    }
  }, [baseQuery, canView]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!summary?.latestJob || !isJobRunning(summary.latestJob.status)) return;
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [loadData, summary?.latestJob]);

  const onApplyFilters = () => {
    setAppliedFilters(filters);
    setNotice('');
  };

  const onResetFilters = () => {
    setFilters(defaults);
    setAppliedFilters(defaults);
    setNotice('');
  };

  const onRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/marketing/controle/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appliedFilters),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error || 'Falha ao solicitar atualização.'));
      }
      setNotice('Atualização Google solicitada com sucesso. Vamos acompanhar o heartbeat abaixo.');
      await loadData();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Falha ao solicitar atualização.');
    } finally {
      setRefreshing(false);
    }
  };

  const onExport = async () => {
    try {
      const res = await fetch(`/api/admin/marketing/controle/export?${baseQuery}`, { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(String(payload?.error || 'Falha ao exportar XLSX.'));
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      const href = URL.createObjectURL(blob);
      link.href = href;
      link.download = `marketing-controle-${appliedFilters.brand}-${appliedFilters.monthRef}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Falha ao exportar a grade.');
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Você não possui permissão para acessar o módulo de marketing/controle.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Marketing / Controle</h1>
              <p className="mt-1 max-w-4xl text-sm text-slate-500">
                Cockpit executivo mensal por marca, com consolidado semanal e mensal das fontes de marketing já integradas.
              </p>
            </div>
          </div>

          <div className="xl:border-l xl:border-slate-200 xl:pl-4">
            <MarketingFunilSyncStatus
              latestJob={summary?.latestJob || null}
              sourceStatus={sourceStatus}
              refreshing={refreshing}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_240px] xl:grid-cols-[1fr_220px_220px]">
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Marca</span>
              <select
                value={filters.brand}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, brand: event.target.value as FilterState['brand'] }))
                }
                className={inputClassName}
              >
                {brandOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Mês</span>
              <div className="relative">
                <input
                  type="month"
                  value={filters.monthRef}
                  onChange={(event) => setFilters((current) => ({ ...current, monthRef: event.target.value }))}
                  className={`${inputClassName} pr-11`}
                />
                <CalendarRange className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </label>

            <div className="flex flex-wrap items-end gap-3 xl:justify-end">
              <button
                type="button"
                onClick={onApplyFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={!canRefresh || refreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Atualizar Google
              </button>
              <button
                type="button"
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <Download size={16} />
                Exportar XLSX
              </button>
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FilterX size={16} />
                Limpar filtros
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600">
              {summary ? formatMonthLabel(summary.monthRef) : formatMonthLabel(appliedFilters.monthRef)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600">
              Marca: {brandOptions.find((option) => option.value === appliedFilters.brand)?.label}
            </span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      {loading || !summary || !grid ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Carregando marketing/controle...
          </div>
        </div>
      ) : (
        <>
          <MarketingControleSummaryCards summary={summary} />

          {!summary.hasAnyData ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
              Nenhum dado foi encontrado para {brandOptions.find((option) => option.value === summary.brand)?.label} em{' '}
              <span className="font-semibold text-slate-800">{formatMonthLabel(summary.monthRef)}</span>. Os blocos
              planejados continuam visíveis para preservar o desenho do módulo.
            </div>
          ) : null}

          <MarketingControleGrid grid={grid} />
        </>
      )}
    </div>
  );
}

export default function MarketingControlePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Carregando...</div>}>
      <MarketingControlePageContent />
    </Suspense>
  );
}
