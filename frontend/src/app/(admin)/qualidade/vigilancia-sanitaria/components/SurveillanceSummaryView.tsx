import { SURVEILLANCE_UNIT_LABELS } from '@/lib/vigilancia_sanitaria/constants';
import type { SurveillanceSummary } from '@/lib/vigilancia_sanitaria/types';
import { SurveillanceStatusBadge } from './SurveillanceStatusBadge';

const number = (value: number) => Number(value || 0).toLocaleString('pt-BR');
const formatDate = (value?: string | null) => value ? value.split('-').reverse().join('/') : 'Sem validade';

export function SurveillanceSummaryView({ summary }: { summary: SurveillanceSummary | null }) {
  const cards = summary?.cards || {
    totalLicenses: 0,
    expiredLicenses: 0,
    dueSoonLicenses: 0,
    expiredDocuments: 0,
    dueSoonDocuments: 0,
    noValidity: 0,
  };

  const cardItems = [
    { label: 'Total de licenças', value: cards.totalLicenses },
    { label: 'Licenças vencidas', value: cards.expiredLicenses, tone: 'text-rose-700' },
    { label: 'Licenças vencendo', value: cards.dueSoonLicenses, tone: 'text-amber-700' },
    { label: 'Documentos vencidos', value: cards.expiredDocuments, tone: 'text-rose-700' },
    { label: 'Documentos vencendo', value: cards.dueSoonDocuments, tone: 'text-amber-700' },
    { label: 'Sem validade', value: cards.noValidity, tone: 'text-slate-700' },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cardItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-bold ${item.tone || 'text-slate-900'}`}>{number(item.value)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Alertas críticos</h2>
          <p className="mt-1 text-xs text-slate-500">Itens vencidos ou vencendo nos próximos 60 dias.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Unidade</th>
                  <th className="px-3 py-2 text-left">Validade</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(summary?.criticalAlerts || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nenhum alerta crítico nos filtros atuais.</td></tr>
                ) : summary!.criticalAlerts.map((item) => (
                  <tr key={`${item.entityType}-${item.id}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                    <td className="px-3 py-2 text-slate-600">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(item.validUntil)}</td>
                    <td className="px-3 py-2"><SurveillanceStatusBadge status={item.expirationStatus} label={item.expirationStatusLabel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Resumo por unidade</h2>
          <div className="mt-4 space-y-3">
            {(summary?.byUnit || []).length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum item cadastrado nos filtros atuais.</p>
            ) : summary!.byUnit.map((item) => (
              <div key={item.unitName} className="rounded-lg border border-slate-100 p-3">
                <p className="font-semibold text-slate-800">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Total: {item.total} | Vencidos: {item.expired} | Vencendo: {item.dueSoon} | Em dia: {item.ok} | Sem validade: {item.noValidity}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
