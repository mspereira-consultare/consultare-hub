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
import { MarketingFunilSearchableSelect } from './components/MarketingFunilSearchableSelect';
import { MarketingFunilSyncStatus } from './components/MarketingFunilSyncStatus';
import { formatNumber, getCurrentPeriodRef, getDateRangeFromPeriod } from './components/formatters';
import type {
  MarketingFunilCampaign,
  MarketingFunilCampaignList,
  MarketingFunilChannelList,
  MarketingFunilDeviceList,
  MarketingFunilFilterOptions,
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

const filterInputClassName =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400';

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

const emptyFilterOptions: MarketingFunilFilterOptions = {
  periodRef: '',
  startDate: '',
  endDate: '',
  campaigns: [],
  sources: [],
  media: [],
  channelGroups: [],
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
  const [pageSize, setPageSize] = useState(10);

  const [summary, setSummary] = useState<MarketingFunilSummary | null>(null);
  const [filterOptions, setFilterOptions] = useState<MarketingFunilFilterOptions>(emptyFilterOptions);
  const [campaigns, setCampaigns] = useState<MarketingFunilCampaignList | null>(null);
  const [channels, setChannels] = useState<MarketingFunilChannelList | null>(null);
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
  const filterOptionsQueryString = useMemo(() => buildParams(filters), [filters]);

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
      const [summaryData, campaignsData, channelsData, jobsData] = await Promise.all([
        fetchApi<MarketingFunilSummary>(`/api/admin/marketing/funil/summary?${baseQueryString}`),
        fetchApi<MarketingFunilCampaignList>(`/api/admin/marketing/funil/campaigns?${queryString}`),
        fetchApi<MarketingFunilChannelList>(`/api/admin/marketing/funil/channels?${baseQueryString}`),
        fetchApi<{ latestJob: MarketingFunilLatestJob | null }>(
          `/api/admin/marketing/funil/jobs/latest?${baseQueryString}`
        ),
      ]);

      setSummary(summaryData);
      setCampaigns(campaignsData);
      setChannels(channelsData);
      setLatestJob(jobsData.latestJob || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar dados do marketing/funil.');
    } finally {
      setLoading(false);
    }
  }, [baseQueryString, canView, queryString]);

  const loadFilterOptions = useCallback(async () => {
    if (!canView) return;
    try {
      const data = await fetchApi<MarketingFunilFilterOptions>(
        `/api/admin/marketing/funil/filter-options?${filterOptionsQueryString}`
      );
      setFilterOptions(data);
    } catch (optionsError) {
      console.error('Erro ao carregar opções de filtro do marketing/funil:', optionsError);
    }
  }, [canView, filterOptionsQueryString]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

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

  const applyAdvancedFilter = (
    field: 'campaign' | 'source' | 'medium' | 'channelGroup',
    value: string
  ) => {
    const next = { ...filters, [field]: value };
    setFilters(next);
    setAppliedFilters(next);
    setPage(1);
    setNotice('');
  };

  const onClearFilters = () => {
    const reset = getDefaultFilters();
    setFilters(reset);
    setAppliedFilters(reset);
    setPage(1);
    setPageSize(10);
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
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_304px] xl:items-start">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
                <BarChart3 size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Marketing / Funil</h1>
                <p className="mt-1 max-w-3xl text-xs text-slate-500">
                  Cruzamento Google Ads + GA4 com leitura executiva de mídia, intenção por WhatsApp, agendamentos
                  válidos e faturamento por competência.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marca</span>
                <select
                  value={filters.brand}
                  onChange={(event) => setFilters((prev) => ({ ...prev, brand: event.target.value as FilterFormState['brand'] }))}
                  className={filterInputClassName}
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
                  className={filterInputClassName}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Data inicial</span>
                <input
                  type="date"
                  value={filters.startDate}
                  disabled={!filters.useCustomRange}
                  onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                  className={filterInputClassName}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Data final</span>
                <input
                  type="date"
                  value={filters.endDate}
                  disabled={!filters.useCustomRange}
                  onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                  className={filterInputClassName}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ChevronDown size={16} className={`transition ${filtersExpanded ? 'rotate-180' : ''}`} />
                Filtros avançados
              </button>
            </div>

            {filtersExpanded ? (
              <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-4">
                <MarketingFunilSearchableSelect
                  label="Campanha"
                  value={filters.campaign}
                  options={filterOptions.campaigns}
                  placeholder="Todas as campanhas"
                  allLabel="Todas as campanhas"
                  onChange={(value) => applyAdvancedFilter('campaign', value)}
                />
                <MarketingFunilSearchableSelect
                  label="Origem (Source)"
                  value={filters.source}
                  options={filterOptions.sources}
                  placeholder="Todas as origens"
                  allLabel="Todas as origens"
                  onChange={(value) => applyAdvancedFilter('source', value)}
                />
                <MarketingFunilSearchableSelect
                  label="Mídia (Medium)"
                  value={filters.medium}
                  options={filterOptions.media}
                  placeholder="Todas as mídias"
                  allLabel="Todas as mídias"
                  onChange={(value) => applyAdvancedFilter('medium', value)}
                />
                <MarketingFunilSearchableSelect
                  label="Grupo de canal"
                  value={filters.channelGroup}
                  options={filterOptions.channelGroups}
                  placeholder="Todos os grupos"
                  allLabel="Todos os grupos"
                  onChange={(value) => applyAdvancedFilter('channelGroup', value)}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onApplyFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-blue-600"
              >
                <Search size={16} />
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={() => loadAllData()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Recarregar painel
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={!canRefresh || refreshing}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  refreshing
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {refreshing ? 'Sincronizando...' : 'Atualizar dados Google'}
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400"
              >
                <Sparkles size={16} />
                Exportar em integração
              </button>
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FilterX size={16} />
                Limpar filtros
              </button>
            </div>
          </div>

          <div className="xl:border-l xl:border-slate-200 xl:pl-4">
            <MarketingFunilSyncStatus latestJob={latestJob} googleLastSyncAt={summary?.lastSyncAt || null} refreshing={refreshing} />
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          title="Canais"
          description="Leitura por grupo de canal com sessões, usuários, leads de WhatsApp e eventos."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-3 py-3 font-semibold">Grupo de canal</th>
                <th className="px-3 py-3 text-right font-semibold">Sessões</th>
                <th className="px-3 py-3 text-right font-semibold">Usuários</th>
                <th className="px-3 py-3 text-right font-semibold">Leads (WhatsApp)</th>
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

      <section className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 shadow-sm">
        <SectionHeader
          title="Próximas camadas"
          description="Os próximos blocos deixam o painel mais acionável, agora que agenda e faturamento já entraram no agregado."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Atribuição por campanha',
              description: 'Distribuir agendamentos e faturamento entre campanhas com uma regra transparente de atribuição.',
            },
            {
              title: 'Ocupação da agenda',
              description: 'Conectar capacidade e ocupação para leitura operacional do crescimento.',
            },
            {
              title: 'Especialidades e unidades',
              description: 'Abrir cortes por unidade e especialidade para uma leitura comercial mais fina.',
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
