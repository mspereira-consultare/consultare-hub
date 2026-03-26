import { ChevronLeft, ChevronRight, PanelRightOpen } from 'lucide-react';
import type { MarketingFunilCampaign } from './types';
import { formatCurrency, formatNumber, formatPercent } from './formatters';
import { formatGoogleAdsCampaignStatus, formatGoogleAdsPrimaryStatus, hasBudgetLimitation } from './googleAdsFormatters';

type MarketingFunilCampaignTableProps = {
  items: MarketingFunilCampaign[];
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenDetails: (campaign: MarketingFunilCampaign) => void;
};

export function MarketingFunilCampaignTable({
  items,
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
  onPageSizeChange,
  onOpenDetails,
}: MarketingFunilCampaignTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Campanhas</h2>
          <p className="text-sm text-slate-500">
            Performance consolidada do período com leads via WhatsApp, contatos do Clinia Ads e conversões do Google Ads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Linhas</label>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
          >
            {[10, 25, 50].map((value) => (
              <option key={value} value={value}>
                {value}/página
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 max-h-[34rem] overflow-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-3 py-3 font-semibold">Campanha</th>
              <th className="px-3 py-3 font-semibold">Origem / Mídia</th>
              <th className="px-3 py-3 text-right font-semibold">Investimento</th>
              <th className="px-3 py-3 text-right font-semibold">Cliques</th>
              <th className="px-3 py-3 text-right font-semibold">Leads</th>
              <th className="px-3 py-3 text-right font-semibold">Contatos</th>
              <th className="px-3 py-3 text-right font-semibold">Agend. Clinia</th>
              <th className="px-3 py-3 text-right font-semibold">Conversões</th>
              <th className="px-3 py-3 text-right font-semibold">Taxa conv.</th>
              <th className="px-3 py-3 text-right font-semibold">Valor conv.</th>
              <th className="px-3 py-3 text-right font-semibold">ROAS Ads</th>
              <th className="px-3 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                  Carregando campanhas...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                  Nenhuma campanha encontrada para os filtros atuais.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const budgetLimited = hasBudgetLimitation(item.campaignPrimaryStatusReasons);
                return (
                  <tr key={item.campaignKey} className="border-b border-slate-100 align-top text-slate-700 last:border-b-0">
                    <td className="px-3 py-3">
                      <div className="min-w-[240px]">
                        <div className="font-semibold text-slate-900">{item.campaignName}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            {formatGoogleAdsCampaignStatus(item.campaignStatus)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            {formatGoogleAdsPrimaryStatus(item.campaignPrimaryStatus)}
                          </span>
                          {budgetLimited ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                              Orçamento limitado
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[170px]">
                        <div className="font-medium text-slate-800">{item.source || '-'}</div>
                        <div className="text-xs text-slate-500">{item.medium || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.sessionDefaultChannelGroup || 'Sem grupo'}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.spend)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(item.clicks)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatNumber(item.leads)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-cyan-700">{formatNumber(item.cliniaContacts)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-700">{formatNumber(item.cliniaAppointments)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(item.conversions, 2)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(item.conversionRate)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(item.conversionsValue)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {item.conversionsValuePerCost > 0 ? `${formatNumber(item.conversionsValuePerCost, 2)}x` : '-'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDetails(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <PanelRightOpen size={14} />
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div>
          Mostrando {items.length === 0 ? 0 : (page - 1) * pageSize + 1}-
          {Math.min(page * pageSize, total)} de {formatNumber(total)} campanhas
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={14} />
            Anterior
          </button>
          <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
