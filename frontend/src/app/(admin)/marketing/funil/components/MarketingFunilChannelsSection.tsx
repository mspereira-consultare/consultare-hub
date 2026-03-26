import type { MarketingFunilChannelList } from './types';
import { formatNumber } from './formatters';

type MarketingFunilChannelsSectionProps = {
  channels: MarketingFunilChannelList | null;
  loading?: boolean;
};

export function MarketingFunilChannelsSection({ channels, loading = false }: MarketingFunilChannelsSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Canais</h2>
          <p className="text-sm text-slate-500">
            Leitura por grupo de canal com sessões, usuários, leads via WhatsApp e eventos.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Período selecionado
        </span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
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
  );
}
