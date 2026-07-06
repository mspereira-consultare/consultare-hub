'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Calendar, CircleHelp, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { DEFAULT_PAYROLL_LINE_FILTERS } from '@/lib/payroll/filters';
import type {
  PayrollDailyControlRow,
  PayrollHoursBalanceMonthly,
  PayrollLineFilters,
  PayrollOptions,
  PayrollPeriodDetail,
  PayrollServiceHeartbeat,
  PayrollSignatureMonthly,
  PayrollVacationRow,
} from '@/lib/payroll/types';
import { PayrollDailyPanel } from '../folha-pagamento/components/PayrollDailyPanel';
import { formatDateBr, formatMoney, statusLabelMap } from '../folha-pagamento/components/formatters';
import { PayrollHelpModal } from '../folha-pagamento/components/PayrollHelpModal';
import { PayrollHoursBalancePanel } from '../folha-pagamento/components/PayrollHoursBalancePanel';
import { PayrollReadinessPanel } from '../folha-pagamento/components/PayrollReadinessPanel';
import { PayrollSignaturesPanel } from '../folha-pagamento/components/PayrollSignaturesPanel';
import { PAYROLL_POINT_TABS, PayrollTabNav, type PayrollTabKey } from '../folha-pagamento/components/PayrollTabNav';
import { PayrollVacationsPanel } from '../folha-pagamento/components/PayrollVacationsPanel';

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

const filterInputClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

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

const emptyHeartbeat: PayrollServiceHeartbeat = {
  serviceName: 'payroll_point_sync',
  status: 'UNKNOWN',
  lastRun: null,
  details: null,
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

export default function PontoPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'ponto', 'view', role);
  const canEdit = hasPermission(permissions, 'ponto', 'edit', role);
  const canRefresh = hasPermission(permissions, 'ponto', 'refresh', role);

  const [options, setOptions] = useState<PayrollOptions>(emptyOptions);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [detail, setDetail] = useState<PayrollPeriodDetail | null>(null);
  const [dailyRows, setDailyRows] = useState<PayrollDailyControlRow[]>([]);
  const [hoursBalanceRows, setHoursBalanceRows] = useState<PayrollHoursBalanceMonthly[]>([]);
  const [vacationRows, setVacationRows] = useState<PayrollVacationRow[]>([]);
  const [signatureRows, setSignatureRows] = useState<PayrollSignatureMonthly[]>([]);
  const [heartbeat, setHeartbeat] = useState<PayrollServiceHeartbeat>(emptyHeartbeat);
  const [filters, setFilters] = useState<PayrollLineFilters>(DEFAULT_PAYROLL_LINE_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ centersCost: [] as string[], units: [] as string[], contracts: [] as string[] });
  const [activeTab, setActiveTab] = useState<PayrollTabKey>('controle_diario');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [syncingPoint, setSyncingPoint] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);

  const currentPeriod = useMemo(
    () => options.periods.find((item) => item.id === selectedPeriodId) || detail?.period || null,
    [detail?.period, options.periods, selectedPeriodId],
  );
  const hasPointSyncInProgress = useMemo(
    () => (detail?.syncRuns || []).some((item) => ['PENDING', 'RUNNING'].includes(item.status)) || isWorkerUpdating(heartbeat.status),
    [detail?.syncRuns, heartbeat.status],
  );

  const buildFilterQuery = useCallback(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (String(value || '').trim()) query.set(key, String(value));
    });
    return query.toString();
  }, [filters]);

  const loadOptions = useCallback(async () => {
    if (!canView) return;
    const payload = await fetchJson<{ status: string; data: PayrollOptions }>('/api/admin/ponto/options');
    setOptions(payload.data || emptyOptions);
    if (!selectedPeriodId && payload.data?.periods?.[0]?.id) {
      setSelectedPeriodId(payload.data.periods[0].id);
    }
  }, [canView, selectedPeriodId]);

  const loadPeriod = useCallback(async () => {
    if (!canView || !selectedPeriodId) return;
    setLoading(true);
    setError('');
    try {
      const [detailPayload, dailyPayload, hoursBalancePayload, vacationsPayload, signaturesPayload] = await Promise.all([
        fetchJson<{ status: string; data: { detail: PayrollPeriodDetail; heartbeat: PayrollServiceHeartbeat } }>(
          `/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollDailyControlRow[] } }>(
          `/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}/daily?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollHoursBalanceMonthly[] } }>(
          `/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}/hours-balance?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollVacationRow[] } }>(
          `/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}/vacations?${buildFilterQuery()}`,
        ),
        fetchJson<{ status: string; data: { items: PayrollSignatureMonthly[] } }>(
          `/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}/signatures?${buildFilterQuery()}`,
        ),
      ]);

      setDetail(detailPayload.data?.detail || null);
      setHeartbeat(detailPayload.data?.heartbeat || emptyHeartbeat);
      setDailyRows(dailyPayload.data?.items || []);
      setHoursBalanceRows(hoursBalancePayload.data?.items || []);
      setVacationRows(vacationsPayload.data?.items || []);
      setSignatureRows(signaturesPayload.data?.items || []);
      setFilterOptions({
        centersCost: detailPayload.data?.detail?.summary ? options.centersCost : options.centersCost,
        units: options.units,
        contracts: options.contractTypes,
      });
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setLoading(false);
    }
  }, [buildFilterQuery, canView, options.centersCost, options.contractTypes, options.units, selectedPeriodId]);

  useEffect(() => {
    loadOptions().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [loadOptions]);

  useEffect(() => {
    loadPeriod().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
  }, [loadPeriod]);

  const reloadAll = async () => {
    await loadOptions();
    await loadPeriod();
  };

  const handlePointSync = async () => {
    if (!selectedPeriodId) return;
    setSyncingPoint(true);
    setError('');
    setSuccessMessage('');
    try {
      await fetchJson(`/api/admin/ponto/periods/${encodeURIComponent(selectedPeriodId)}/sync`, {
        method: 'POST',
      });
      await reloadAll();
      setSuccessMessage('Sincronização enfileirada com sucesso.');
    } catch (fetchError: any) {
      setError(String(fetchError?.message || fetchError));
    } finally {
      setSyncingPoint(false);
    }
  };

  const heartbeatLabel = hasPointSyncInProgress ? 'Sincronização em andamento' : 'Última sincronização';
  const heartbeatTone = getHeartbeatTone(heartbeat.status);

  useEffect(() => {
    if (!selectedPeriodId || !hasPointSyncInProgress) return;
    const intervalId = window.setInterval(() => {
      loadPeriod().catch((fetchError) => setError(String((fetchError as Error)?.message || fetchError)));
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [hasPointSyncInProgress, loadPeriod, selectedPeriodId]);

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
                Acompanhamento operacional da competência com base sincronizada da Sólides para ponto, banco de horas, férias e assinaturas.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto lg:max-w-[520px] lg:justify-end">
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
                  disabled={syncingPoint || !selectedPeriodId}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123462] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncingPoint ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {syncingPoint ? 'Solicitando...' : 'Atualizar dados'}
                </button>

                {refreshHovered ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[320px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {heartbeatLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${heartbeatTone} ${hasPointSyncInProgress ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-medium text-slate-700">{formatDateTimeBr(heartbeat.lastRun)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {hasPointSyncInProgress ? 'Sincronizando a competência em segundo plano.' : heartbeat.details || 'Acompanhe aqui a última execução do worker da Sólides.'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Filtros da competência</h2>
              <p className="mt-1 text-xs text-slate-500">Use o mesmo recorte mensal para analisar atrasos, faltas, banco de horas, férias e assinaturas por colaborador.</p>
            </div>
            <button type="button" onClick={() => setFiltersExpanded((value) => !value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            </button>
          </div>
          {filtersExpanded ? (
            <>
              <div className="grid gap-3 px-6 pb-4 lg:grid-cols-4">
                <label className="block lg:col-span-2">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Competência</span>
                  <select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100">
                    <option value="">Selecione uma competência</option>
                    {options.periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {formatMonthRef(period.monthRef)} | {formatDateBr(period.periodStart)} a {formatDateBr(period.periodEnd)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{currentPeriod ? statusLabelMap[currentPeriod.status] || currentPeriod.status : 'Sem competência selecionada'}</div>
                  {currentPeriod ? <div className="mt-1 text-xs text-slate-500">Período operacional: {formatDateBr(currentPeriod.periodStart)} a {formatDateBr(currentPeriod.periodEnd)}</div> : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Regras da competência</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{detail?.period.rules ? `${formatMoney(detail.period.rules.minWageAmount)} | atraso ${detail.period.rules.lateToleranceMinutes} min` : 'Carregue uma competência'}</div>
                  {detail?.period.rules ? <div className="mt-1 text-xs text-slate-500">Teto de VT: {detail.period.rules.vtDiscountCapPercent}% do salário básico</div> : null}
                </div>
              </div>

              <div className="grid gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-5">
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

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
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

      {detail?.readiness ? <PayrollReadinessPanel readiness={detail.readiness} /> : null}

      <PayrollTabNav activeTab={activeTab} onChange={setActiveTab} tabs={PAYROLL_POINT_TABS} />

      {activeTab === 'controle_diario' ? <PayrollDailyPanel rows={dailyRows} loading={loading} /> : null}
      {activeTab === 'banco_horas' ? <PayrollHoursBalancePanel rows={hoursBalanceRows} loading={loading} /> : null}
      {activeTab === 'ferias' ? <PayrollVacationsPanel rows={vacationRows} loading={loading} /> : null}
      {activeTab === 'assinaturas' ? <PayrollSignaturesPanel rows={signatureRows} loading={loading} /> : null}

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
