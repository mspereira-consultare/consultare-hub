'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { MarketingFunilCampaignDrawer } from './components/MarketingFunilCampaignDrawer';
import { MarketingFunilCampaignTable } from './components/MarketingFunilCampaignTable';
import { MarketingFunilFunnelVisual } from './components/MarketingFunilFunnelVisual';
import { MarketingFunilKpis } from './components/MarketingFunilKpis';
import { MarketingFunilSyncStatus } from './components/MarketingFunilSyncStatus';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  getCurrentPeriodRef,
  getDateRangeFromPeriod,
} from './components/formatters';
import type {
  MarketingFunilCampaign,
  MarketingFunilCampaignList,
  MarketingFunilChannelList,
  MarketingFunilCrmBoardList,
  MarketingFunilCrmPipelineList,
  MarketingFunilDeviceList,
  MarketingFunilLandingList,
  MarketingFunilLatestJob,
  MarketingFunilSummary,
} from './components/types';

type SessionUser = {
  role?: string;
  permissions?: unknown;
};

type FilterFormState = {
  brand: 'all' | 'consultare' | 'resolve' | 'franquia';
  periodRef: string;
  useCustomRange: boolean;
  startDate: string;
  endDate: string;
  campaign: string;
  source: string;
  medium: string;
  channelGroup: string;
};

const BRAND_OPTIONS = [
  { value: 'all', label: 'Todas as marcas' },
  { value: 'consultare', label: 'Consultare' },
  { value: 'resolve', label: 'Resolve' },
  { value: 'franquia', label: 'Franquia' },
] as const;

const getDefaultFilters = (): FilterFormState => {
  const periodRef = getCurrentPeriodRef();
  const range = getDateRangeFromPeriod(periodRef);
  return {
    brand: 'all',
    periodRef,
    useCustomRange: false,
    startDate: range.startDate,
    endDate: range.endDate,
    campaign: '',
    source: '',
    medium: '',
    channelGroup: '',
  };
};

const buildParams = (filters: FilterFormState, options?: { page?: number; pageSize?: number }) => {
  const params = new URLSearchParams();
  if (filters.useCustomRange) {
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
  } else {
    params.set('periodRef', filters.periodRef);
  }

  if (filters.brand !== 'all') params.set('brand', filters.brand);
  if (filters.campaign.trim()) params.set('campaign', filters.campaign.trim());
  if (filters.source.trim()) params.set('source', filters.source.trim());
  if (filters.medium.trim()) params.set('medium', filters.medium.trim());
  if (filters.channelGroup.trim()) params.set('channelGroup', filters.channelGroup.trim());
  if (typeof options?.page === 'number') params.set('page', String(options.page));
  if (typeof options?.pageSize === 'number') params.set('pageSize', String(options.pageSize));

  return params.toString();
};

const isJobRunning = (job: MarketingFunilLatestJob | null) => ['PENDING', 'RUNNING'].includes(String(job?.status || '').toUpperCase());

async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return (payload as { data: T }).data;
}

function SectionHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {badge ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export default function MarketingFunilPage() {
  const { data: session } = useSession();
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || 'OPERADOR');
  const canView = hasPermission(sessionUser.permissions, 'marketing_funil', 'view', role);
  const canRefresh = hasPermission(sessionUser.permissions, 'marketing_funil', 'refresh', role);

  const defaults = useMemo(() => getDefaultFilters(), []);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterFormState>(defaults);
  const [appliedFilters, setAppliedFilters] = useState<FilterFormState>(defaults);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [summary, setSummary] = useState<MarketingFunilSummary | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingFunilCampaignList | null>(null);
  const [channels, setChannels] = useState<MarketingFunilChannelList | null>(null);
  const [crmBoards, setCrmBoards] = useState<MarketingFunilCrmBoardList | null>(null);
  const [crmPipeline, setCrmPipeline] = useState<MarketingFunilCrmPipelineList | null>(null);
  const [latestJob, setLatestJob] = useState<MarketingFunilLatestJob | null>(null);

  const [selectedCampaign, setSelectedCampaign] = useState<MarketingFunilCampaign | null>(null);
  const [drawerTab, setDrawerTab] = useState<'devices' | 'landing'>('devices');
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerDevices, setDrawerDevices] = useState<MarketingFunilDeviceList['items']>([]);
  const [drawerLandingPages, setDrawerLandingPages] = useState<MarketingFunilLandingList['items']>([]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const queryString = useMemo(
    () => buildParams(appliedFilters, { page, pageSize }),
    [appliedFilters, page, pageSize]
  );

  const baseQueryString = useMemo(() => buildParams(appliedFilters), [appliedFilters]);

  const loadDrawerDetails = useCallback(
    async (campaign: MarketingFunilCampaign) => {
      setDrawerLoading(true);
      try {
        const params = buildParams(appliedFilters);
        const [devicesData, landingData] = await Promise.all([
          fetchApi<MarketingFunilDeviceList>(
            `/api/admin/marketing/funil/campaigns/${encodeURIComponent(campaign.campaignKey)}/devices?${params}`
          ),
          fetchApi<MarketingFunilLandingList>(
            `/api/admin/marketing/funil/campaigns/${encodeURIComponent(campaign.campaignKey)}/landing-pages?${params}`
          ),
        ]);
        setDrawerDevices(devicesData.items || []);
        setDrawerLandingPages(landingData.items || []);
      } catch (drawerError) {
        console.error('Erro ao carregar drawer da campanha:', drawerError);
        setDrawerDevices([]);
        setDrawerLandingPages([]);
      } finally {
        setDrawerLoading(false);
      }
    },
    [appliedFilters]
  );

  const loadAllData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');

    try {
      const [summaryData, campaignsData, channelsData, crmBoardsData, crmPipelineData, jobsData] = await Promise.all([
        fetchApi<MarketingFunilSummary>(`/api/admin/marketing/funil/summary?${baseQueryString}`),
        fetchApi<MarketingFunilCampaignList>(`/api/admin/marketing/funil/campaigns?${queryString}`),
        fetchApi<MarketingFunilChannelList>(`/api/admin/marketing/funil/channels?${baseQueryString}`),
        fetchApi<MarketingFunilCrmBoardList>(`/api/admin/marketing/funil/crm/boards?${baseQueryString}`),
        fetchApi<MarketingFunilCrmPipelineList>(`/api/admin/marketing/funil/crm/pipeline?${baseQueryString}`),
        fetchApi<{ latestJob: MarketingFunilLatestJob | null }>(
          `/api/admin/marketing/funil/jobs/latest?${baseQueryString}`
        ),
      ]);

      setSummary(summaryData);
      setCampaigns(campaignsData);
      setChannels(channelsData);
      setCrmBoards(crmBoardsData);
      setCrmPipeline(crmPipelineData);
      setLatestJob(jobsData.latestJob || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar dados do marketing/funil.');
    } finally {
      setLoading(false);
    }
  }, [baseQueryString, canView, queryString]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (!isJobRunning(latestJob)) return;
    const timer = window.setTimeout(() => {
      loadAllData();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [latestJob, loadAllData]);

  const openCampaignDrawer = async (campaign: MarketingFunilCampaign) => {
    setSelectedCampaign(campaign);
    setDrawerTab('devices');
    setDrawerDevices([]);
    setDrawerLandingPages([]);
    await loadDrawerDetails(campaign);
  };

  const onApplyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setNotice('');
  };

  const onClearFilters = () => {
    const reset = getDefaultFilters();
    setFilters(reset);
    setAppliedFilters(reset);
    setPage(1);
    setPageSize(25);
    setNotice('');
    setError('');
  };

  const onRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = {};
      if (appliedFilters.useCustomRange) {
        body.startDate = appliedFilters.startDate;
        body.endDate = appliedFilters.endDate;
      } else {
        body.periodRef = appliedFilters.periodRef;
      }
      if (appliedFilters.brand !== 'all') body.brand = appliedFilters.brand;

      const response = await fetchApi<{ job: MarketingFunilLatestJob }>('/api/admin/marketing/funil/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setLatestJob(response.job);
      setNotice('Atualização do Google enfileirada. A página será recarregada automaticamente ao concluir.');
      await loadAllData();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Erro ao solicitar atualização.');
    } finally {
      setRefreshing(false);
    }
  };

  const crmSnapshotLabel = crmPipeline?.snapshotDate ? `Snapshot CRM: ${formatDate(crmPipeline.snapshotDate)}` : 'CRM CRC';

  if (!canView) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-900 shadow-sm">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="mt-2 text-sm">
          Você não possui acesso ao módulo <code>marketing_funil</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg">
                <BarChart3 size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Marketing / Funil</h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Cruzamento Google Ads + GA4 + CRM CRC para leitura executiva do topo e meio do funil, com
                  próximos blocos preparados para agenda, faturamento e ocupação.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marca</span>
                <select
                  value={filters.brand}
                  onChange={(event) => setFilters((prev) => ({ ...prev, brand: event.target.value as FilterFormState['brand'] }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                >
                  {BRAND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Mês</span>
                <input
                  type="month"
                  value={filters.periodRef}
                  disabled={filters.useCustomRange}
                  onChange={(event) => {
                    const periodRef = event.target.value;
                    const range = getDateRangeFromPeriod(periodRef);
                    setFilters((prev) => ({
                      ...prev,
                      periodRef,
                      startDate: range.startDate,
                      endDate: range.endDate,
                    }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition disabled:bg-slate-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Data inicial</span>
                <input
                  type="date"
                  value={filters.startDate}
                  disabled={!filters.useCustomRange}
                  onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition disabled:bg-slate-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Data final</span>
                <input
                  type="date"
                  value={filters.endDate}
                  disabled={!filters.useCustomRange}
                  onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.useCustomRange}
                  onChange={(event) =>
                    setFilters((prev) => {
                      const checked = event.target.checked;
                      if (!checked) {
                        const range = getDateRangeFromPeriod(prev.periodRef);
                        return { ...prev, useCustomRange: false, startDate: range.startDate, endDate: range.endDate };
                      }
                      return { ...prev, useCustomRange: true };
                    })
                  }
                />
                <CalendarRange size={16} className="text-slate-500" />
                Usar intervalo personalizado
              </label>

              <button
                type="button"
                onClick={() => setFiltersExpanded((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ChevronDown size={16} className={`transition ${filtersExpanded ? 'rotate-180' : ''}`} />
                Filtros avançados
              </button>
            </div>

            {filtersExpanded ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Campanha</span>
                  <input
                    type="text"
                    value={filters.campaign}
                    onChange={(event) => setFilters((prev) => ({ ...prev, campaign: event.target.value }))}
                    placeholder="Buscar por nome"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Source</span>
                  <input
                    type="text"
                    value={filters.source}
                    onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
                    placeholder="google, instagram..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Medium</span>
                  <input
                    type="text"
                    value={filters.medium}
                    onChange={(event) => setFilters((prev) => ({ ...prev, medium: event.target.value }))}
                    placeholder="cpc, paid..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Grupo de canal</span>
                  <input
                    type="text"
                    value={filters.channelGroup}
                    onChange={(event) => setFilters((prev) => ({ ...prev, channelGroup: event.target.value }))}
                    placeholder="Paid Search, Direct..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
                  />
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onApplyFilters}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <Search size={16} />
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={() => loadAllData()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Recarregar painel
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={!canRefresh || refreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Atualizar dados Google
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400"
              >
                <Sparkles size={16} />
                Exportar em integração
              </button>
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <FilterX size={16} />
                Limpar filtros
              </button>
            </div>
          </div>

          <div className="xl:pt-1">
            <MarketingFunilSyncStatus
              latestJob={latestJob}
              googleLastSyncAt={summary?.lastSyncAt || null}
              crmLastSyncAt={summary?.crm.lastSyncAt || null}
              refreshing={refreshing}
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <MarketingFunilKpis summary={summary} />

      <MarketingFunilFunnelVisual summary={summary} />

      <div className="grid gap-6 2xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader
            title="Canais"
            description="Leitura por grupo de canal com sessões, usuários, leads e eventos."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-3 font-semibold">Grupo de canal</th>
                  <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                  <th className="px-3 py-3 text-right font-semibold">Usuários</th>
                  <th className="px-3 py-3 text-right font-semibold">Leads</th>
                  <th className="px-3 py-3 text-right font-semibold">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      Carregando canais...
                    </td>
                  </tr>
                ) : !channels?.items?.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      Nenhum canal encontrado para o período selecionado.
                    </td>
                  </tr>
                ) : (
                  channels.items.map((item) => (
                    <tr key={item.channelGroup} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-3 font-medium text-slate-900">{item.channelGroup}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(item.sessions)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(item.users)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatNumber(item.leads)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(item.eventCount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader
            title="CRM CRC"
            description="Resumo do quadro CRC usado pela gestora neste módulo."
            badge={crmSnapshotLabel}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-3 font-semibold">Board</th>
                  <th className="px-3 py-3 text-right font-semibold">Leads criados</th>
                  <th className="px-3 py-3 text-right font-semibold">Valor criado</th>
                  <th className="px-3 py-3 text-right font-semibold">Pipeline atual</th>
                  <th className="px-3 py-3 text-right font-semibold">Valor pipeline</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      Carregando CRM...
                    </td>
                  </tr>
                ) : !crmBoards?.items?.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      O board CRC ainda não possui dados consolidados para o filtro atual.
                    </td>
                  </tr>
                ) : (
                  crmBoards.items.map((item) => (
                    <tr key={item.boardId} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-3 font-medium text-slate-900">{item.boardTitle}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(item.leadsCreatedCount)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(item.leadsCreatedValue)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-cyan-700">{formatNumber(item.pipelineItemsCount)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(item.pipelineItemsValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <MarketingFunilCampaignTable
        items={campaigns?.items || []}
        page={campaigns?.page || page}
        pageSize={campaigns?.pageSize || pageSize}
        total={campaigns?.total || 0}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
        onOpenDetails={openCampaignDrawer}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          title="Pipeline CRC por estágio"
          description="Snapshot atual do quadro CRC com recortes por estágio, origem CRM e serviço."
          badge={crmPipeline?.snapshotDate ? `Snapshot ${formatDate(crmPipeline.snapshotDate)}` : 'Sem snapshot'}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-3 py-3 font-semibold">Estágio</th>
                <th className="px-3 py-3 font-semibold">Origem CRM</th>
                <th className="px-3 py-3 font-semibold">Serviço</th>
                <th className="px-3 py-3 text-right font-semibold">Itens</th>
                <th className="px-3 py-3 text-right font-semibold">Valor</th>
                <th className="px-3 py-3 font-semibold">Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    Carregando pipeline CRM...
                  </td>
                </tr>
              ) : !crmPipeline?.items?.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    Nenhum snapshot do pipeline CRC foi encontrado.
                  </td>
                </tr>
              ) : (
                crmPipeline.items.slice(0, 80).map((item) => (
                  <tr key={`${item.columnId}-${item.crmSourceKey}-${item.serviceKey}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.columnTitle}</td>
                    <td className="px-3 py-3 text-slate-600">{item.crmSourceKey || 'unknown'}</td>
                    <td className="px-3 py-3 text-slate-600">{item.serviceKey || 'unknown'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-cyan-700">{formatNumber(item.pipelineItemsCount)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(item.pipelineItemsValue)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatDateTime(item.lastSyncAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 shadow-sm">
        <SectionHeader
          title="Próximas conexões"
          description="Blocos já previstos para completar o fluxo resultado real da campanha."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Agendamentos',
              description: 'Cruzar campanhas e CRM com agendamentos reais do Feegow.',
            },
            {
              title: 'Faturamento',
              description: 'Levar o resultado financeiro real para ROAS e visão executiva.',
            },
            {
              title: 'Ocupação da agenda',
              description: 'Conectar capacidade e ocupação para leitura operacional do crescimento.',
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Em integração</div>
              <h3 className="mt-2 text-base font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <MarketingFunilCampaignDrawer
        campaign={selectedCampaign}
        open={Boolean(selectedCampaign)}
        activeTab={drawerTab}
        loading={drawerLoading}
        devices={drawerDevices}
        landingPages={drawerLandingPages}
        onClose={() => setSelectedCampaign(null)}
        onTabChange={setDrawerTab}
      />
    </div>
  );
}
