import { SURVEILLANCE_UNIT_LABELS } from '@/lib/vigilancia_sanitaria/constants';
import type { SurveillanceSummary } from '@/lib/vigilancia_sanitaria/types';
import { SurveillanceStatusBadge } from './SurveillanceStatusBadge';

const number = (value: number) => Number(value || 0).toLocaleString('pt-BR');
const formatDate = (value?: string | null) => value ? value.split('-').reverse().join('/') : 'Sem validade';

const cardTones = {
  neutral: 'border-slate-200 bg-white text-slate-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
};

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
    { label: 'Total de licenças', value: cards.totalLicenses, tone: 'neutral' as const },
    { label: 'Licenças vencidas', value: cards.expiredLicenses, tone: 'rose' as const },
    { label: 'Licenças vencendo', value: cards.dueSoonLicenses, tone: 'amber' as const },
    { label: 'Documentos vencidos', value: cards.expiredDocuments, tone: 'rose' as const },
    { label: 'Documentos vencendo', value: cards.dueSoonDocuments, tone: 'amber' as const },
    { label: 'Sem validade', value: cards.noValidity, tone: 'slate' as const },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cardItems.map((item) => (
          <div key={item.label} className={`rounded-xl border p-4 shadow-sm ${cardTones[item.tone]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-bold">{number(item.value)}</p>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Resumo por unidade</h2>
              <p className="mt-1 text-xs text-slate-500">Distribuição visual de riscos e itens em dia por unidade.</p>
            </div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#17407E]">
              {number(summary?.byUnit?.length || 0)} unidade(s)
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {(summary?.byUnit || []).length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum item cadastrado nos filtros atuais.</p>
            ) : summary!.byUnit.map((item) => {
              const riskCount = item.expired + item.dueSoon;
              const riskPercent = item.total > 0 ? Math.min(100, Math.round((riskCount / item.total) * 100)) : 0;
              const riskLabel = item.expired > 0 ? 'Atenção crítica' : item.dueSoon > 0 ? 'Acompanhar vencimentos' : 'Em dia';
              const riskClass = item.expired > 0 ? 'bg-rose-500' : item.dueSoon > 0 ? 'bg-amber-500' : 'bg-emerald-500';
              const shellClass = item.expired > 0 ? 'border-rose-100 bg-rose-50/50' : item.dueSoon > 0 ? 'border-amber-100 bg-amber-50/50' : 'border-emerald-100 bg-emerald-50/40';

              return (
                <div key={item.unitName} className={`rounded-xl border p-3 ${shellClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{riskLabel}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      {number(item.total)} item(ns)
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white shadow-inner">
                    <div className={`h-full rounded-full ${riskClass}`} style={{ width: `${riskPercent}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{riskPercent}% com atenção ou vencido</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <MetricPill label="Vencidos" value={item.expired} className="border-rose-200 bg-white text-rose-700" />
                    <MetricPill label="Vencendo" value={item.dueSoon} className="border-amber-200 bg-white text-amber-700" />
                    <MetricPill label="Em dia" value={item.ok} className="border-emerald-200 bg-white text-emerald-700" />
                    <MetricPill label="Sem validade" value={item.noValidity} className="border-slate-200 bg-white text-slate-600" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricPill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${className}`}>
      <p className="font-semibold">{number(value)}</p>
      <p className="mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
