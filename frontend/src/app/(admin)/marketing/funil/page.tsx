'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { MarketingFunilChannelsSection } from './components/MarketingFunilChannelsSection';
import { MarketingFunilCliniaAdsSection } from './components/MarketingFunilCliniaAdsSection';
import { MarketingFunilFunnelVisual } from './components/MarketingFunilFunnelVisual';
import { MarketingFunilGoogleAdsHealthSection } from './components/MarketingFunilGoogleAdsHealthSection';
import { MarketingFunilKpis } from './components/MarketingFunilKpis';
import { MarketingFunilSearchableSelect } from './components/MarketingFunilSearchableSelect';
import { MarketingFunilSyncStatus } from './components/MarketingFunilSyncStatus';
import { MarketingFunilTabNav } from './components/MarketingFunilTabNav';
import { getCurrentPeriodRef, getDateRangeFromPeriod } from './components/formatters';
import type {
  MarketingFunilCampaign,
  MarketingFunilCampaignList,
  MarketingFunilChannelList,
  MarketingFunilCliniaAdsList,
  MarketingFunilCliniaAdsOriginList,
  MarketingFunilDeviceList,
  MarketingFunilFilterOptions,
  MarketingFunilGoogleAdsHealthList,
  MarketingFunilLandingList,
  MarketingFunilLatestJob,
  MarketingFunilSourceStatus,
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

type TabKey = 'overview' | 'campaigns' | 'google-ads-health';
type DrawerTabKey = 'devices' | 'landing' | 'diagnostics';

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

const buildParams = (
  filters: FilterFormState,
  options?: { page?: number; pageSize?: number }
) => {
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

const isJobRunning = (job: MarketingFunilLatestJob | null) =>
  ['PENDING', 'RUNNING'].includes(String(job?.status || '').toUpperCase());

const readTab = (value: string | null): TabKey => {
  if (value === 'campaigns' || value === 'google-ads-health') return value;
  return 'overview';
};

async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return (payload as { data: T }).data;
}

function MarketingFunilPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => readTab(searchParams.get('tab')), [searchParams]);

  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || 'OPERADOR');
  const canView = hasPermission(sessionUser.permissions, 'marketing_funil', 'view', role);
  const canRefresh = hasPermission(sessionUser.permissions, 'marketing_funil', 'refresh', role);

  const defaults = useMemo(() => getDefaultFilters(), []);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterFormState>(defaults);
  const [appliedFilters, setAppliedFilters] = useState<FilterFormState>(defaults);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(10);
  const [healthPage, setHealthPage] = useState(1);
  const [healthPageSize, setHealthPageSize] = useState(10);

  const [summary, setSummary] = useState<MarketingFunilSummary | null>(null);
  const [filterOptions, setFilterOptions] = useState<MarketingFunilFilterOptions>(emptyFilterOptions);
  const [campaigns, setCampaigns] = useState<MarketingFunilCampaignList | null>(null);
  const [channels, setChannels] = useState<MarketingFunilChannelList | null>(null);
  const [cliniaAds, setCliniaAds] = useState<MarketingFunilCliniaAdsList | null>(null);
  const [cliniaAdsOrigins, setCliniaAdsOrigins] = useState<MarketingFunilCliniaAdsOriginList | null>(null);
  const [googleAdsHealth, setGoogleAdsHealth] = useState<MarketingFunilGoogleAdsHealthList | null>(null);
  const [sourceStatus, setSourceStatus] = useState<MarketingFunilSourceStatus | null>(null);
  const [latestJob, setLatestJob] = useState<MarketingFunilLatestJob | null>(null);

  const [selectedCampaign, setSelectedCampaign] = useState<MarketingFunilCampaign | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTabKey>('devices');
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerDevices, setDrawerDevices] = useState<MarketingFunilDeviceList['items']>([]);
  const [drawerLandingPages, setDrawerLandingPages] = useState<MarketingFunilLandingList['items']>([]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const baseQueryString = useMemo(() => buildParams(appliedFilters), [appliedFilters]);
  const campaignsQueryString = useMemo(
    () => buildParams(appliedFilters, { page: campaignPage, pageSize: campaignPageSize }),
    [appliedFilters, campaignPage, campaignPageSize]
  );
  const googleAdsHealthQueryString = useMemo(
    () => buildParams(appliedFilters, { page: healthPage, pageSize: healthPageSize }),
    [appliedFilters, healthPage, healthPageSize]
  );
  const filterOptionsQueryString = useMemo(() => buildParams(filters), [filters]);

  const setActiveTab = useCallback(
    (tab: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const applyAdvancedFilter = useCallback(
    (field: 'campaign' | 'source' | 'medium' | 'channelGroup', value: string) => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

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

  const openCampaignDrawer = useCallback(
    (campaign: MarketingFunilCampaign, preferredTab: DrawerTabKey = 'devices') => {
      setSelectedCampaign(campaign);
      setDrawerTab(preferredTab);
      void loadDrawerDetails(campaign);
    },
    [loadDrawerDetails]
  );

  const loadAllData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');

    try {
      const [
        summaryData,
        campaignsData,
        channelsData,
        jobsData,
        cliniaAdsData,
        cliniaOriginsData,
        sourceStatusData,
        googleAdsHealthData,
      ] = await Promise.all([
        fetchApi<MarketingFunilSummary>(`/api/admin/marketing/funil/summary?${baseQueryString}`),
        fetchApi<MarketingFunilCampaignList>(`/api/admin/marketing/funil/campaigns?${campaignsQueryString}`),
        fetchApi<MarketingFunilChannelList>(`/api/admin/marketing/funil/channels?${baseQueryString}`),
        fetchApi<{ latestJob: MarketingFunilLatestJob | null }>(
          `/api/admin/marketing/funil/jobs/latest?${baseQueryString}`
        ),
        fetchApi<MarketingFunilCliniaAdsList>(`/api/admin/marketing/funil/clinia-ads/ads?${baseQueryString}`),
        fetchApi<MarketingFunilCliniaAdsOriginList>(`/api/admin/marketing/funil/clinia-ads/origins?${baseQueryString}`),
        fetchApi<MarketingFunilSourceStatus>('/api/admin/marketing/funil/source-status'),
        fetchApi<MarketingFunilGoogleAdsHealthList>(
          `/api/admin/marketing/funil/google-ads/health?${googleAdsHealthQueryString}`
        ),
      ]);

      setSummary(summaryData);
      setCampaigns(campaignsData);
      setChannels(channelsData);
      setCliniaAds(cliniaAdsData);
      setCliniaAdsOrigins(cliniaOriginsData);
      setSourceStatus(sourceStatusData);
      setGoogleAdsHealth(googleAdsHealthData);
      setLatestJob(jobsData.latestJob || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar dados do marketing/funil.');
    } finally {
      setLoading(false);
    }
  }, [baseQueryString, canView, campaignsQueryString, googleAdsHealthQueryString]);

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
    void loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    if (!canView || !isJobRunning(latestJob)) return;
    const timeout = window.setTimeout(() => {
      void loadAllData();
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [canView, latestJob, loadAllData]);

  const onApplyFilters = useCallback(() => {
    setCampaignPage(1);
    setHealthPage(1);
    setAppliedFilters(filters);
  }, [filters]);

  const onClearFilters = useCallback(() => {
    const next = getDefaultFilters();
    setFilters(next);
    setAppliedFilters(next);
    setCampaignPage(1);
    setCampaignPageSize(10);
    setHealthPage(1);
    setHealthPageSize(10);
    setFiltersExpanded(false);
    setNotice('Filtros redefinidos para o período padrão do módulo.');
    setError('');
  }, []);

  const onRefresh = useCallback(async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setNotice('');
    setError('');
    try {
      const res = await fetch('/api/admin/marketing/funil/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(appliedFilters.useCustomRange
            ? { startDate: appliedFilters.startDate, endDate: appliedFilters.endDate }
            : { periodRef: appliedFilters.periodRef }),
          brand: appliedFilters.brand === 'all' ? undefined : appliedFilters.brand,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { error?: unknown }).error || 'Falha ao atualizar dados do Google.'));
      }
      setNotice('Atualização do Google solicitada com sucesso. Os blocos serão recarregados automaticamente ao concluir.');
      await loadAllData();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Erro ao solicitar atualização do Google.');
    } finally {
      setRefreshing(false);
    }
  }, [appliedFilters, canRefresh, loadAllData]);

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
        <h1 className="text-lg font-bold">Acesso restrito</h1>
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
                  Funil de performance do Google Ads até os contatos e agendamentos do Clinia, com contexto operacional
                  separado para agenda e faturamento.
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
                onClick={() => void loadAllData()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Recarregar painel
              </button>
              <button
                type="button"
                onClick={() => void onRefresh()}
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
            <MarketingFunilSyncStatus latestJob={latestJob} sourceStatus={sourceStatus} refreshing={refreshing} />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <MarketingFunilTabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <MarketingFunilKpis summary={summary} />
          <MarketingFunilFunnelVisual summary={summary} />
          <MarketingFunilCliniaAdsSection summary={summary} ads={cliniaAds} origins={cliniaAdsOrigins} loading={loading} />
          <MarketingFunilChannelsSection channels={channels} loading={loading} />
        </div>
      ) : null}

      {activeTab === 'campaigns' ? (
        <MarketingFunilCampaignTable
          items={campaigns?.items || []}
          page={campaigns?.page || campaignPage}
          pageSize={campaigns?.pageSize || campaignPageSize}
          total={campaigns?.total || 0}
          loading={loading}
          onPageChange={setCampaignPage}
          onPageSizeChange={(value) => {
            setCampaignPageSize(value);
            setCampaignPage(1);
          }}
          onOpenDetails={(campaign) => openCampaignDrawer(campaign, 'devices')}
        />
      ) : null}

      {activeTab === 'google-ads-health' ? (
        <MarketingFunilGoogleAdsHealthSection
          summary={summary}
          data={googleAdsHealth}
          loading={loading}
          onPageChange={setHealthPage}
          onPageSizeChange={(value) => {
            setHealthPageSize(value);
            setHealthPage(1);
          }}
          onOpenDetails={(campaign) => openCampaignDrawer(campaign, 'diagnostics')}
        />
      ) : null}

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

export default function MarketingFunilPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
          Carregando marketing / funil...
        </div>
      }
    >
      <MarketingFunilPageContent />
    </Suspense>
  );
}
