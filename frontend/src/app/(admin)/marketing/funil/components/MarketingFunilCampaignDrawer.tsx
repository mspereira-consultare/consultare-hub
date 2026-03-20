import { ExternalLink, Loader2, X } from 'lucide-react';
import type {
  MarketingFunilCampaign,
  MarketingFunilDeviceRow,
  MarketingFunilLandingRow,
} from './types';
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from './formatters';

type TabKey = 'devices' | 'landing';

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

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Investimento', value: formatCurrency(campaign.spend) },
              { label: 'Sessões', value: formatNumber(campaign.sessions) },
              { label: 'Leads', value: formatNumber(campaign.leads) },
              { label: 'Conversões', value: formatNumber(campaign.conversions) },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTabChange('devices')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'devices'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Dispositivos
            </button>
            <button
              type="button"
              onClick={() => onTabChange('landing')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'landing'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Landing pages
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" />
              Carregando detalhamento da campanha...
            </div>
          ) : activeTab === 'devices' ? (
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
          ) : (
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
                    <th className="px-4 py-3 text-right font-semibold">Leads</th>
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
          )}

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
