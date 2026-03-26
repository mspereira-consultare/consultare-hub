import { ExternalLink, Loader2, X } from 'lucide-react';
import type { MarketingFunilCampaign, MarketingFunilDeviceRow, MarketingFunilLandingRow } from './types';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from './formatters';
import {
  formatGoogleAdsBiddingStrategy,
  formatGoogleAdsBudgetPeriod,
  formatGoogleAdsCampaignStatus,
  formatGoogleAdsChannelType,
  formatGoogleAdsPrimaryStatus,
  formatGoogleAdsReason,
  hasBudgetLimitation,
} from './googleAdsFormatters';

type TabKey = 'devices' | 'landing' | 'diagnostics';

type MarketingFunilCampaignDrawerProps = {
  campaign: MarketingFunilCampaign | null;
  open: boolean;
  activeTab: TabKey;
  loading: boolean;
  devices: MarketingFunilDeviceRow[];
  landingPages: MarketingFunilLandingRow[];
  onClose: () => void;
  onTabChange: (tab: TabKey) => void;
};

const TabButton = ({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

export function MarketingFunilCampaignDrawer({
  campaign,
  open,
  activeTab,
  loading,
  devices,
  landingPages,
  onClose,
  onTabChange,
}: MarketingFunilCampaignDrawerProps) {
  if (!open || !campaign) return null;

  const budgetLimited = hasBudgetLimitation(campaign.campaignPrimaryStatusReasons);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-sm">
      <button type="button" aria-label="Fechar" className="flex-1 cursor-default" onClick={onClose} />
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Detalhes da campanha</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{campaign.campaignName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">{campaign.source || '-'}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{campaign.medium || '-'}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {campaign.sessionDefaultChannelGroup || 'Sem grupo'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-5">
            {[
              { label: 'Investimento', value: formatCurrency(campaign.spend) },
              { label: 'Cliques WhatsApp', value: formatNumber(campaign.leads) },
              { label: 'Contatos Clinia', value: formatNumber(campaign.cliniaContacts) },
              { label: 'Agend. Clinia', value: formatNumber(campaign.cliniaAppointments) },
              { label: 'ROAS Ads', value: campaign.conversionsValuePerCost > 0 ? `${formatNumber(campaign.conversionsValuePerCost, 2)}x` : '-' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <TabButton active={activeTab === 'devices'} onClick={() => onTabChange('devices')}>
              Dispositivos
            </TabButton>
            <TabButton active={activeTab === 'landing'} onClick={() => onTabChange('landing')}>
              Landing pages
            </TabButton>
            <TabButton active={activeTab === 'diagnostics'} onClick={() => onTabChange('diagnostics')}>
              Diagnóstico Ads
            </TabButton>
          </div>
        </div>

        <div className="px-6 py-5">
          {loading && activeTab !== 'diagnostics' ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" />
              Carregando detalhamento da campanha...
            </div>
          ) : null}

          {!loading && activeTab === 'devices' ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3 font-semibold">Dispositivo</th>
                    <th className="px-4 py-3 text-right font-semibold">Investimento</th>
                    <th className="px-4 py-3 text-right font-semibold">Impressões</th>
                    <th className="px-4 py-3 text-right font-semibold">Cliques</th>
                    <th className="px-4 py-3 text-right font-semibold">CTR</th>
                    <th className="px-4 py-3 text-right font-semibold">CPC</th>
                    <th className="px-4 py-3 text-right font-semibold">Conversões</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Nenhum detalhamento por dispositivo encontrado.
                      </td>
                    </tr>
                  ) : (
                    devices.map((item) => (
                      <tr key={item.device} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.device}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(item.spend)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.impressions)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.clicks)}</td>
                        <td className="px-4 py-3 text-right">{formatPercent(item.ctr)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(item.cpc)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.conversions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && activeTab === 'landing' ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3 font-semibold">Landing page</th>
                    <th className="px-4 py-3 font-semibold">Origem / Mídia</th>
                    <th className="px-4 py-3 text-right font-semibold">Sessões</th>
                    <th className="px-4 py-3 text-right font-semibold">Usuários</th>
                    <th className="px-4 py-3 text-right font-semibold">Novos usuários</th>
                    <th className="px-4 py-3 text-right font-semibold">Engajamento</th>
                    <th className="px-4 py-3 text-right font-semibold">Cliques WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {landingPages.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Nenhuma landing page encontrada para esta campanha.
                      </td>
                    </tr>
                  ) : (
                    landingPages.map((item, index) => (
                      <tr key={`${item.landingPage}-${index}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="max-w-[280px] break-all font-medium text-slate-900">{item.landingPage}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{item.source || '-'}</div>
                          <div className="text-xs text-slate-500">{item.medium || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.sessions)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.totalUsers)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.newUsers)}</td>
                        <td className="px-4 py-3 text-right">{formatPercent(item.engagementRate * 100)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatNumber(item.leads)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab === 'diagnostics' ? (
            <div className="space-y-4">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status atual</div>
                  <div className="mt-2 text-base font-bold text-slate-900">{formatGoogleAdsCampaignStatus(campaign.campaignStatus)}</div>
                  <div className="mt-1 text-sm text-slate-500">{formatGoogleAdsPrimaryStatus(campaign.campaignPrimaryStatus)}</div>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Orçamento</div>
                  <div className="mt-2 text-base font-bold text-slate-900">
                    {campaign.budgetAmount > 0 ? formatCurrency(campaign.budgetAmount) : '-'}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {campaign.budgetName || 'Sem orçamento nomeado'} · {formatGoogleAdsBudgetPeriod(campaign.budgetPeriod)}
                  </div>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pontuação de otimização</div>
                  <div className="mt-2 text-base font-bold text-slate-900">
                    {campaign.optimizationScore > 0 ? formatPercent(campaign.optimizationScore * 100) : 'Sem score'}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{formatGoogleAdsBiddingStrategy(campaign.biddingStrategyType)}</div>
                </article>
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">Motivos do status</h3>
                  <div className="mt-3 space-y-2">
                    {campaign.campaignPrimaryStatusReasons.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                        Nenhum motivo adicional retornado pelo Google Ads para a data mais recente.
                      </div>
                    ) : (
                      campaign.campaignPrimaryStatusReasons.map((reason) => (
                        <div
                          key={reason}
                          className={`rounded-xl border px-3 py-3 text-sm ${
                            reason.toUpperCase().includes('BUDGET')
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          {formatGoogleAdsReason(reason)}
                        </div>
                      ))
                    )}
                  </div>
                  {budgetLimited ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      O Google Ads sinalizou limitação ligada a orçamento nesta campanha.
                    </div>
                  ) : null}
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">Snapshot atual</h3>
                  <dl className="mt-3 space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <dt>Tipo de campanha</dt>
                      <dd className="font-medium text-slate-900">{formatGoogleAdsChannelType(campaign.advertisingChannelType)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Início</dt>
                      <dd className="font-medium text-slate-900">{formatDate(campaign.campaignStartDate)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Fim</dt>
                      <dd className="font-medium text-slate-900">{formatDate(campaign.campaignEndDate)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Snapshot</dt>
                      <dd className="font-medium text-slate-900">{formatDate(campaign.googleAdsSnapshotDate)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt>Atualizado em</dt>
                      <dd className="font-medium text-slate-900">{formatDateTime(campaign.googleAdsSnapshotUpdatedAt)}</dd>
                    </div>
                  </dl>
                </article>
              </section>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Última sincronização desta campanha:{' '}
            <span className="font-semibold text-slate-800">{formatDateTime(campaign.lastSyncAt)}</span>
            <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
              <ExternalLink size={12} />
              dados consolidados das APIs internas de marketing
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
