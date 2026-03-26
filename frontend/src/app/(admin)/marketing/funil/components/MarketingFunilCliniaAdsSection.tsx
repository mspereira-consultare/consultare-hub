import { ExternalLink } from 'lucide-react';
import type {
  MarketingFunilCliniaAdsList,
  MarketingFunilCliniaAdsOriginList,
  MarketingFunilSummary,
} from './types';
import { formatNumber, formatPercent } from './formatters';

type MarketingFunilCliniaAdsSectionProps = {
  summary: MarketingFunilSummary | null;
  ads: MarketingFunilCliniaAdsList | null;
  origins: MarketingFunilCliniaAdsOriginList | null;
  loading?: boolean;
};

const deltaLabel = (current: number, previous: number) => {
  const diff = current - previous;
  const prefix = diff > 0 ? '+' : '';
  return `${prefix}${formatNumber(diff)}`;
};

export function MarketingFunilCliniaAdsSection({
  summary,
  ads,
  origins,
  loading = false,
}: MarketingFunilCliniaAdsSectionProps) {
  const clinia = summary?.cliniaAds;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Anúncios Clinia</h2>
          <p className="text-sm text-slate-500">
            Visão complementar do Clinia Ads por origem e anúncio, incluindo Google, Meta e outras origens capturadas.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Clinia Ads
        </span>
      </div>

      {!clinia?.historyAvailable ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Histórico do Clinia Ads disponível a partir de{' '}
          <span className="font-semibold">{clinia?.historyStartMonth || 'data ainda não capturada'}</span>.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Contatos recebidos',
            value: formatNumber(clinia?.contactsReceived || 0),
            helper: `Período anterior: ${formatNumber(clinia?.prevContactsReceived || 0)} (${deltaLabel(
              clinia?.contactsReceived || 0,
              clinia?.prevContactsReceived || 0
            )}) · Todas as origens`,
          },
          {
            label: 'Novos contatos',
            value: formatNumber(clinia?.newContactsReceived || 0),
            helper: `Período anterior: ${formatNumber(clinia?.prevNewContactsReceived || 0)} (${deltaLabel(
              clinia?.newContactsReceived || 0,
              clinia?.prevNewContactsReceived || 0
            )}) · Todas as origens`,
          },
          {
            label: 'Agendamentos Clinia',
            value: formatNumber(clinia?.appointmentsConverted || 0),
            helper: `Período anterior: ${formatNumber(clinia?.prevAppointmentsConverted || 0)} (${deltaLabel(
              clinia?.appointmentsConverted || 0,
              clinia?.prevAppointmentsConverted || 0
            )}) · Todas as origens`,
          },
          {
            label: 'Taxa de conversão',
            value: formatPercent(clinia?.conversionRate || 0),
            helper: `Período anterior: ${formatPercent(clinia?.prevConversionRate || 0)}`,
          },
        ].map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{item.value}</div>
            <div className="mt-2 text-xs text-slate-500">{item.helper}</div>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Top anúncios por contato</h3>
          </div>
          <div className="max-h-[24rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Origem</th>
                  <th className="px-4 py-3 font-semibold">Anúncio</th>
                  <th className="px-4 py-3 text-right font-semibold">Contatos</th>
                  <th className="px-4 py-3 text-right font-semibold">Agend.</th>
                  <th className="px-4 py-3 text-right font-semibold">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      Carregando anúncios Clinia...
                    </td>
                  </tr>
                ) : !ads?.items.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      Nenhum anúncio encontrado para o período selecionado.
                    </td>
                  </tr>
                ) : (
                  ads.items.slice(0, 15).map((item, index) => (
                    <tr key={`${item.origin}-${item.sourceId}-${index}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium capitalize text-slate-700">{item.origin}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-[360px] truncate font-medium text-slate-900">{item.title}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <ExternalLink size={12} />
                          <span className="truncate">{item.sourceUrl || item.sourceId || 'Sem identificador'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNumber(item.contactsReceived)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{formatNumber(item.appointmentsConverted)}</td>
                      <td className="px-4 py-3 text-right">{formatPercent(item.conversionRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Origem dos contatos</h3>
            <div className="mt-4 space-y-3">
              {(origins?.items || []).length === 0 ? (
                <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Sem dados de origem para o período.
                </div>
              ) : (
                (origins?.items || []).map((item) => (
                  <div key={item.origin} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold capitalize text-slate-900">{item.origin}</span>
                      <span className="text-xs font-semibold text-slate-500">{formatPercent(item.conversionRate)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span>Contatos: {formatNumber(item.contactsReceived)}</span>
                      <span>Novos: {formatNumber(item.newContactsReceived)}</span>
                      <span>Agend.: {formatNumber(item.appointmentsConverted)}</span>
                      <span>Conversão: {formatPercent(item.conversionRate)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
