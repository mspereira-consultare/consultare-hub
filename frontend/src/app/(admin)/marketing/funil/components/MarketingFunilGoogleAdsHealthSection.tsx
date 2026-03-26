import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MarketingFunilCampaign, MarketingFunilGoogleAdsHealthList, MarketingFunilSummary } from './types';
import { formatCurrency, formatDate, formatNumber, formatPercent } from './formatters';
import {
  formatGoogleAdsBiddingStrategy,
  formatGoogleAdsBudgetPeriod,
  formatGoogleAdsCampaignStatus,
  formatGoogleAdsChannelType,
  formatGoogleAdsPrimaryStatus,
  formatGoogleAdsReason,
  hasBudgetLimitation,
} from './googleAdsFormatters';

type MarketingFunilGoogleAdsHealthSectionProps = {
  summary: MarketingFunilSummary | null;
  data: MarketingFunilGoogleAdsHealthList | null;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenDetails: (campaign: MarketingFunilCampaign) => void;
};

export function MarketingFunilGoogleAdsHealthSection({
  summary,
  data,
  loading = false,
  onPageChange,
  onPageSizeChange,
  onOpenDetails,
}: MarketingFunilGoogleAdsHealthSectionProps) {
  const health = summary?.googleAdsHealth;
  const page = data?.page || 1;
  const pageSize = data?.pageSize || 10;
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Saúde Google Ads</h2>
            <p className="text-sm text-slate-500">
              Snapshot mais recente das campanhas até a data final selecionada, com orçamento, status e estratégia de lances.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Diagnóstico atual das campanhas
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[
            {
              label: 'Limitadas por orçamento',
              value: formatNumber(health?.limitedByBudgetCount || 0),
              helper: 'Motivo retornado pelo Google Ads',
            },
            {
              label: 'Campanhas ativas',
              value: formatNumber(health?.enabledCount || 0),
              helper: 'Status ENABLED',
            },
            {
              label: 'Campanhas pausadas',
              value: formatNumber(health?.pausedCount || 0),
              helper: 'Status PAUSED',
            },
            {
              label: 'Score médio',
              value: health?.avgOptimizationScore ? formatPercent((health.avgOptimizationScore || 0) * 100) : 'Sem score',
              helper: 'Pontuação de otimização',
            },
            {
              label: 'Taxa média de conversão',
              value: formatPercent(health?.avgConversionRate || 0),
              helper: 'Conversões / interações do período',
            },
            {
              label: 'ROAS Ads médio',
              value: health?.avgConversionsValuePerCost ? `${formatNumber(health.avgConversionsValuePerCost, 2)}x` : '-',
              helper: 'Valor de conversão / custo',
            },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{item.value}</div>
              <div className="mt-2 text-xs text-slate-500">{item.helper}</div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Campanhas por diagnóstico</h3>
            <p className="text-sm text-slate-500">Priorize campanhas limitadas por orçamento e campanhas com score de otimização baixo.</p>
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

        <div className="mt-4 max-h-[36rem] overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th className="px-3 py-3 font-semibold">Campanha</th>
                <th className="px-3 py-3 font-semibold">Status atual</th>
                <th className="px-3 py-3 font-semibold">Motivos</th>
                <th className="px-3 py-3 text-right font-semibold">Orçamento</th>
                <th className="px-3 py-3 font-semibold">Estratégia</th>
                <th className="px-3 py-3 text-right font-semibold">Score</th>
                <th className="px-3 py-3 font-semibold">Tipo</th>
                <th className="px-3 py-3 font-semibold">Período</th>
                <th className="px-3 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    Carregando diagnóstico do Google Ads...
                  </td>
                </tr>
              ) : !(data?.items || []).length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    Nenhum snapshot de campanha encontrado para o período atual.
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((item) => {
                  const budgetLimited = hasBudgetLimitation(item.campaignPrimaryStatusReasons);
                  return (
                    <tr key={item.campaignKey} className="border-b border-slate-100 align-top last:border-b-0">
                      <td className="px-3 py-3">
                        <div className="min-w-[220px] font-semibold text-slate-900">{item.campaignName}</div>
                        <div className="mt-1 text-xs text-slate-500">Snapshot: {formatDate(item.googleAdsSnapshotDate)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-[180px] space-y-1">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                            {formatGoogleAdsCampaignStatus(item.campaignStatus)}
                          </span>
                          <div className="text-xs text-slate-500">{formatGoogleAdsPrimaryStatus(item.campaignPrimaryStatus)}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-[220px] space-y-2">
                          {item.campaignPrimaryStatusReasons.length === 0 ? (
                            <span className="text-xs text-slate-500">Sem motivo adicional</span>
                          ) : (
                            item.campaignPrimaryStatusReasons.slice(0, 2).map((reason) => (
                              <span
                                key={reason}
                                className={`inline-flex mr-2 rounded-full border px-2 py-1 text-xs ${
                                  reason.toUpperCase().includes('BUDGET')
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {formatGoogleAdsReason(reason)}
                              </span>
                            ))
                          )}
                          {budgetLimited ? (
                            <div className="text-xs font-semibold text-amber-700">Limitada por orçamento</div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-slate-900">{item.budgetAmount > 0 ? formatCurrency(item.budgetAmount) : '-'}</div>
                        <div className="text-xs text-slate-500">{formatGoogleAdsBudgetPeriod(item.budgetPeriod)}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatGoogleAdsBiddingStrategy(item.biddingStrategyType)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {item.optimizationScore > 0 ? formatPercent(item.optimizationScore * 100) : '-'}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatGoogleAdsChannelType(item.advertisingChannelType)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{formatDate(item.campaignStartDate)}</div>
                        <div className="text-xs text-slate-500">até {formatDate(item.campaignEndDate)}</div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenDetails(item)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Abrir campanha
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
            Mostrando {(data?.items || []).length === 0 ? 0 : (page - 1) * pageSize + 1}-
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
      </div>
    </section>
  );
}
