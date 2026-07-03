'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Filter, Link2, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type {
  EmployeePortalOverview,
  EmployeePortalProductionDashboard,
  EmployeePortalProductionEntry,
  EmployeePortalProductionEntryType,
} from '@consultare/core/employee-portal/types';
import {
  PortalShell,
  fetchJson,
  formatDateBr,
  getErrorMessage,
  inputClassName,
  labelClassName,
  readEmployeePortalOverviewCache,
  writeEmployeePortalOverviewCache,
} from '@/components/portal/shared';

type ProductionFormState = {
  id: string | null;
  serviceDate: string;
  entryType: EmployeePortalProductionEntryType;
  patientNameRaw: string;
};

type ProductionFiltersState = {
  serviceDate: string;
  entryType: EmployeePortalProductionDashboard['filters']['entryType'];
  matchStatus: EmployeePortalProductionDashboard['filters']['matchStatus'];
};

const productionTypeLabels: Record<EmployeePortalProductionEntryType, string> = {
  RESOLVE: 'Cartao Resolve',
  CHECKUP: 'Check-up',
};

const productionMatchStatusLabels = {
  MATCHED: 'Vinculado',
  NO_MATCH: 'Sem vinculo',
  MULTIPLE_MATCHES: 'Multiplos pacientes',
  PENDING_MATCH: 'Aguardando vinculo',
} as const;

const productionMatchStatusClasses = {
  MATCHED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  NO_MATCH: 'border-amber-200 bg-amber-50 text-amber-800',
  MULTIPLE_MATCHES: 'border-rose-200 bg-rose-50 text-rose-700',
  PENDING_MATCH: 'border-blue-200 bg-blue-50 text-[#17407E]',
} as const;

const createDashboardQuery = (filters: ProductionFiltersState) => {
  const params = new URLSearchParams();
  if (filters.serviceDate) params.set('serviceDate', filters.serviceDate);
  if (filters.entryType !== 'ALL') params.set('entryType', filters.entryType);
  if (filters.matchStatus !== 'ALL') params.set('matchStatus', filters.matchStatus);
  const query = params.toString();
  return query ? `/api/production/dashboard?${query}` : '/api/production/dashboard';
};

export default function PortalColaboradorProducaoPage() {
  const [overview, setOverview] = useState<EmployeePortalOverview | null>(() => readEmployeePortalOverviewCache());
  const [dashboard, setDashboard] = useState<EmployeePortalProductionDashboard | null>(null);
  const [filters, setFilters] = useState<ProductionFiltersState>({
    serviceDate: '',
    entryType: 'ALL',
    matchStatus: 'ALL',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingOverview, setLoadingOverview] = useState(() => !readEmployeePortalOverviewCache());
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [savingProduction, setSavingProduction] = useState(false);
  const [deletingProductionId, setDeletingProductionId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [productionForm, setProductionForm] = useState<ProductionFormState>({
    id: null,
    serviceDate: '',
    entryType: 'RESOLVE',
    patientNameRaw: '',
  });

  const progress = useMemo(() => {
    if (!overview || overview.checklist.length === 0) return 0;
    const done = overview.checklist.filter((item) => ['APPROVED', 'OFFICIAL', 'DRAFT', 'PENDING_REVIEW'].includes(item.status)).length;
    return Math.round((done / overview.checklist.length) * 100);
  }, [overview]);

  const resetProductionForm = useCallback((nextDate?: string) => {
    setProductionForm({
      id: null,
      serviceDate: nextDate || dashboard?.editableDates?.[0] || '',
      entryType: 'RESOLVE',
      patientNameRaw: '',
    });
  }, [dashboard?.editableDates]);

  const syncOverview = useCallback((nextOverview: EmployeePortalOverview) => {
    setOverview(nextOverview);
    writeEmployeePortalOverviewCache(nextOverview);
  }, []);

  const applyDashboard = useCallback((nextDashboard: EmployeePortalProductionDashboard, options?: { preserveNotice?: boolean }) => {
    setDashboard(nextDashboard);
    setFilters({
      serviceDate: nextDashboard.filters.serviceDate || '',
      entryType: nextDashboard.filters.entryType,
      matchStatus: nextDashboard.filters.matchStatus,
    });
    if (!productionForm.id) {
      setProductionForm({
        id: null,
        serviceDate: nextDashboard.editableDates?.[0] || '',
        entryType: 'RESOLVE',
        patientNameRaw: '',
      });
    }
    if (!options?.preserveNotice) {
      setNotice('');
    }
  }, [productionForm.id]);

  const loadDashboard = useCallback(async (nextFilters: ProductionFiltersState, options?: { preserveNotice?: boolean }) => {
    setLoadingDashboard(true);
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalProductionDashboard }>(createDashboardQuery(nextFilters));
      applyDashboard(payload.data, options);
    } finally {
      setLoadingDashboard(false);
    }
  }, [applyDashboard]);

  const loadPage = useCallback(async () => {
    const hadOverview = Boolean(overview);
    setError('');
    setLoadingOverview(!hadOverview);
    setLoadingDashboard(true);
    try {
      const [meResult, dashboardResult] = await Promise.allSettled([
        fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/me'),
        fetchJson<{ status: string; data: EmployeePortalProductionDashboard }>('/api/production/dashboard'),
      ]);

      if (meResult.status === 'fulfilled') {
        syncOverview(meResult.value.data);
      } else if (!hadOverview) {
        writeEmployeePortalOverviewCache(null);
      }

      if (dashboardResult.status === 'fulfilled') {
        applyDashboard(dashboardResult.value.data);
      }

      if (meResult.status === 'rejected' && dashboardResult.status === 'rejected') {
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return;
      }

      if (meResult.status === 'rejected' && !hadOverview) {
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return;
      }

      if (dashboardResult.status === 'rejected') {
        setError(getErrorMessage(dashboardResult.reason, 'Não foi possível carregar a produção.'));
      }
    } finally {
      setLoadingOverview(false);
      setLoadingDashboard(false);
    }
  }, [applyDashboard, overview, syncOverview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  const logout = async () => {
    await fetchJson('/api/logout', { method: 'POST' }).catch(() => null);
    writeEmployeePortalOverviewCache(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const startEditingProduction = (entry: EmployeePortalProductionEntry) => {
    setProductionForm({
      id: entry.id,
      serviceDate: entry.serviceDate,
      entryType: entry.entryType,
      patientNameRaw: entry.patientNameRaw,
    });
    setNotice('');
    setError('');
  };

  const saveProductionEntry = async () => {
    setSavingProduction(true);
    setError('');
    setNotice('');
    try {
      const isEditing = Boolean(productionForm.id);
      const payload = await fetchJson<{ status: string; data: EmployeePortalProductionDashboard }>(
        isEditing
          ? `/api/production/entries/${encodeURIComponent(String(productionForm.id))}`
          : '/api/production/entries',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceDate: productionForm.serviceDate || dashboard?.editableDates?.[0] || '',
            entryType: productionForm.entryType,
            patientNameRaw: productionForm.patientNameRaw,
          }),
        }
      );
      applyDashboard(payload.data);
      resetProductionForm(payload.data.editableDates?.[0]);
      setNotice(
        isEditing
          ? 'Lancamento atualizado com sucesso.'
          : 'Lancamento registrado. Ele so contara para metas quando o vinculo com a Feegow for confirmado.'
      );
    } catch (productionError: unknown) {
      setError(getErrorMessage(productionError, 'Falha ao salvar lancamento.'));
    } finally {
      setSavingProduction(false);
    }
  };

  const deleteProductionEntry = async (entry: EmployeePortalProductionEntry) => {
    setDeletingProductionId(entry.id);
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalProductionDashboard }>(
        `/api/production/entries/${encodeURIComponent(entry.id)}`,
        { method: 'DELETE' }
      );
      applyDashboard(payload.data);
      if (productionForm.id === entry.id) {
        resetProductionForm(payload.data.editableDates?.[0]);
      }
      setNotice('Lancamento removido com sucesso.');
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError, 'Falha ao remover lancamento.'));
    } finally {
      setDeletingProductionId(null);
    }
  };

  if (!overview && loadingOverview) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando portal...
        </div>
      </main>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <PortalShell
      overview={overview}
      progress={progress}
      error={error}
      notice={notice}
      activeTab="producao"
      helpOpen={helpOpen}
      onHelpOpen={() => setHelpOpen(true)}
      onHelpClose={() => setHelpOpen(false)}
      onLogout={() => void logout()}
    >
      {!dashboard ? (
        <section className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Loader2 size={16} className="animate-spin text-[#17407E]" />
              Carregando sua produção...
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Estamos preparando seus lançamentos, resumo dos últimos 7 dias e filtros desta aba.
            </p>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((__, cardIndex) => (
                      <div key={cardIndex}>
                        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-slate-200" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {dashboard ? (
        <>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Produção</h2>
            <p className="text-sm text-slate-500">
              Registre Resolve e Check-up por paciente, acompanhe os vínculos da Feegow e veja o resumo da sua própria produção.
            </p>
          </div>
          {loadingDashboard ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <Loader2 size={14} className="animate-spin text-[#17407E]" />
              Atualizando dados...
            </div>
          ) : null}
          {productionForm.id ? (
            <button
              type="button"
              onClick={() => resetProductionForm(dashboard.editableDates[0])}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <X size={14} />
              Cancelar edicao
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarDays size={15} className="text-[#17407E]" />
              Hoje
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Resolve vinculados</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.today.resolveCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Check-up vinculados</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.today.checkupCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Pendentes</div>
                <div className="mt-1 text-lg font-bold text-amber-700">{dashboard.today.pendingMatchCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Total lancado</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.today.totalCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarDays size={15} className="text-[#17407E]" />
              Ontem
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Resolve vinculados</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.yesterday.resolveCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Check-up vinculados</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.yesterday.checkupCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Pendentes</div>
                <div className="mt-1 text-lg font-bold text-amber-700">{dashboard.yesterday.pendingMatchCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Total lancado</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.yesterday.totalCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-800">Ultimos 7 dias</div>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateBr(dashboard.last7Days.startDate)} a {formatDateBr(dashboard.last7Days.endDate)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Resolve contabilizados</div>
                <div className="mt-1 text-lg font-bold text-emerald-700">{dashboard.last7Days.resolveMatchedCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Check-up contabilizados</div>
                <div className="mt-1 text-lg font-bold text-emerald-700">{dashboard.last7Days.checkupMatchedCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Pendentes de vinculo</div>
                <div className="mt-1 text-lg font-bold text-amber-700">{dashboard.last7Days.pendingMatchCount}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Total geral lancado</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{dashboard.last7Days.totalCount}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[340px,1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Plus size={16} className="text-[#17407E]" />
              {productionForm.id ? 'Editar lancamento' : 'Novo lancamento'}
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={labelClassName}>Data do atendimento</span>
                <select
                  value={productionForm.serviceDate || dashboard.editableDates[0] || ''}
                  onChange={(event) => setProductionForm((current) => ({ ...current, serviceDate: event.target.value }))}
                  className={inputClassName}
                  disabled={savingProduction}
                >
                  {dashboard.editableDates.map((date) => (
                    <option key={date} value={date}>
                      {formatDateBr(date)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Tipo</span>
                <select
                  value={productionForm.entryType}
                  onChange={(event) =>
                    setProductionForm((current) => ({
                      ...current,
                      entryType: event.target.value as EmployeePortalProductionEntryType,
                    }))
                  }
                  className={inputClassName}
                  disabled={savingProduction}
                >
                  <option value="RESOLVE">Cartao Resolve</option>
                  <option value="CHECKUP">Check-up</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Nome completo do paciente</span>
                <input
                  value={productionForm.patientNameRaw}
                  onChange={(event) => setProductionForm((current) => ({ ...current, patientNameRaw: event.target.value }))}
                  className={inputClassName}
                  placeholder="Ex: Maria Aparecida Souza"
                  disabled={savingProduction}
                />
              </label>
              <button
                type="button"
                onClick={saveProductionEntry}
                disabled={savingProduction || !(productionForm.serviceDate || dashboard.editableDates[0]) || !productionForm.patientNameRaw.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingProduction ? <Loader2 size={16} className="animate-spin" /> : productionForm.id ? <Pencil size={16} /> : <Plus size={16} />}
                {productionForm.id ? 'Salvar alteracoes' : 'Registrar atendimento'}
              </button>
              <p className="text-xs text-slate-500">
                Edicao e exclusao ficam disponiveis apenas para lancamentos de hoje e ontem.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter size={16} className="text-[#17407E]" />
              Filtros
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={labelClassName}>Data</span>
                <select
                  value={filters.serviceDate}
                  onChange={async (event) => {
                    const nextFilters = { ...filters, serviceDate: event.target.value };
                    setFilters(nextFilters);
                    await loadDashboard(nextFilters, { preserveNotice: true });
                  }}
                  className={inputClassName}
                >
                  <option value="">Hoje + ultimos 7 dias</option>
                  {dashboard.availableDates.map((date) => (
                    <option key={date} value={date}>
                      {formatDateBr(date)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Tipo</span>
                <select
                  value={filters.entryType}
                  onChange={async (event) => {
                    const nextFilters = {
                      ...filters,
                      entryType: event.target.value as ProductionFiltersState['entryType'],
                    };
                    setFilters(nextFilters);
                    await loadDashboard(nextFilters, { preserveNotice: true });
                  }}
                  className={inputClassName}
                >
                  <option value="ALL">Todos</option>
                  <option value="RESOLVE">Cartao Resolve</option>
                  <option value="CHECKUP">Check-up</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Status de vinculo</span>
                <select
                  value={filters.matchStatus}
                  onChange={async (event) => {
                    const nextFilters = {
                      ...filters,
                      matchStatus: event.target.value as ProductionFiltersState['matchStatus'],
                    };
                    setFilters(nextFilters);
                    await loadDashboard(nextFilters, { preserveNotice: true });
                  }}
                  className={inputClassName}
                >
                  <option value="ALL">Todos</option>
                  <option value="MATCHED">Vinculado</option>
                  <option value="PENDING_MATCH">Aguardando vinculo</option>
                  <option value="NO_MATCH">Sem vinculo</option>
                  <option value="MULTIPLE_MATCHES">Multiplos pacientes</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Lancamentos</h3>
            <p className="mt-1 text-sm text-slate-500">
              Lançado, vinculado e contabilizado para meta não são a mesma coisa. Apenas os vinculados entram nos KPIs.
            </p>
          </div>
          <div className="max-h-[720px] overflow-y-auto divide-y divide-slate-100">
            {dashboard.entries.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500">
                Nenhum lancamento encontrado para os filtros selecionados.
              </div>
            ) : (
              dashboard.entries.map((entry) => (
                <div key={entry.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{entry.patientNameRaw}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                          {productionTypeLabels[entry.entryType]}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${productionMatchStatusClasses[entry.matchStatus]}`}>
                          {productionMatchStatusLabels[entry.matchStatus]}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${entry.matchStatus === 'MATCHED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                          {entry.matchStatus === 'MATCHED' ? 'Conta para meta' : 'Nao contabilizado'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>{formatDateBr(entry.serviceDate)}</span>
                        {entry.teamSnapshot ? <span>Equipe: {entry.teamSnapshot}</span> : null}
                        {entry.feegowPatientName ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Link2 size={13} />
                            {entry.feegowPatientName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingProduction(entry)}
                        disabled={!entry.canEdit || savingProduction || deletingProductionId === entry.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProductionEntry(entry)}
                        disabled={!entry.canEdit || deletingProductionId === entry.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-40"
                      >
                        {deletingProductionId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
        </>
      ) : null}
    </PortalShell>
  );
}
