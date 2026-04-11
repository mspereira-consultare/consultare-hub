import { SURVEILLANCE_UNIT_LABELS } from '@/lib/vigilancia_sanitaria/constants';
import { getExpirationAppearance } from '@/lib/vigilancia_sanitaria/status';
import type { SurveillanceSummary } from '@/lib/vigilancia_sanitaria/types';
import { SurveillanceStatusBadge } from './SurveillanceStatusBadge';

const number = (value: number) => Number(value || 0).toLocaleString('pt-BR');
const formatDate = (value?: string | null) => (value ? value.split('-').reverse().join('/') : 'Sem validade');

const neutralCardClass = 'border-slate-200 bg-white text-slate-900';

export function SurveillanceSummaryView({ summary }: { summary: SurveillanceSummary | null }) {
  const cards = summary?.cards || {
    totalLicenses: 0,
    totalDocuments: 0,
    expiringItems: 0,
    alertItems: 0,
    expiredItems: 0,
    noValidity: 0,
  };

  const cardItems = [
    { label: 'Total de licenças', value: cards.totalLicenses, className: neutralCardClass },
    { label: 'Total de documentos', value: cards.totalDocuments, className: neutralCardClass },
    { label: 'Vencendo (31-60 dias)', value: cards.expiringItems, className: getExpirationAppearance('VENCENDO').card },
    { label: 'Em alerta até 30 dias', value: cards.alertItems, className: getExpirationAppearance('ALERTA').card },
    { label: 'Vencidos', value: cards.expiredItems, className: getExpirationAppearance('VENCIDO').card },
    { label: 'Sem validade', value: cards.noValidity, className: getExpirationAppearance('SEM_VALIDADE').card },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {cardItems.map((item) => (
          <div key={item.label} className={`rounded-xl border p-4 shadow-sm ${item.className}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-bold">{number(item.value)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Prazos críticos</h2>
          <p className="mt-1 text-xs text-slate-500">Itens vencidos, em alerta até 30 dias ou vencendo entre 31 e 60 dias.</p>
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
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nenhum prazo crítico nos filtros atuais.
                    </td>
                  </tr>
                ) : (
                  summary!.criticalAlerts.map((item) => {
                    const appearance = getExpirationAppearance(item.expirationStatus);

                    return (
                      <tr key={`${item.entityType}-${item.id}`} className={appearance.row}>
                        <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                        <td className="px-3 py-2 text-slate-600">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</td>
                        <td className={`px-3 py-2 font-medium ${appearance.text}`}>{formatDate(item.validUntil)}</td>
                        <td className="px-3 py-2">
                          <SurveillanceStatusBadge status={item.expirationStatus} label={item.expirationStatusLabel} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Resumo por unidade</h2>
              <p className="mt-1 text-xs text-slate-500">Prioriza vencidos, alertas de 30 dias e vencimentos dentro da janela de 60 dias.</p>
            </div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#17407E]">
              {number(summary?.byUnit?.length || 0)} unidade(s)
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {(summary?.byUnit || []).length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum item cadastrado nos filtros atuais.</p>
            ) : (
              summary!.byUnit.map((item) => {
                const riskCount = item.expired + item.alert + item.warning;
                const riskPercent = item.total > 0 ? Math.min(100, Math.round((riskCount / item.total) * 100)) : 0;
                const dominantStatus = item.expired > 0 ? 'VENCIDO' : item.alert > 0 ? 'ALERTA' : item.warning > 0 ? 'VENCENDO' : item.ok > 0 ? 'EM_DIA' : 'SEM_VALIDADE';
                const appearance = getExpirationAppearance(dominantStatus);
                const riskLabel =
                  dominantStatus === 'VENCIDO'
                    ? 'Vencidos em aberto'
                    : dominantStatus === 'ALERTA'
                      ? 'Alerta ativo'
                      : dominantStatus === 'VENCENDO'
                        ? 'Vencimentos próximos'
                        : dominantStatus === 'EM_DIA'
                          ? 'Itens em dia'
                          : 'Somente itens sem validade';

                return (
                  <div key={item.unitName} className={`rounded-xl border p-3 ${appearance.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</p>
                        <p className="mt-0.5 text-xs opacity-80">{riskLabel}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                        {number(item.total)} item(ns)
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70 shadow-inner">
                      <div className={`h-full rounded-full ${appearance.progress}`} style={{ width: `${riskPercent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] font-medium opacity-80">{riskPercent}% com atenção operacional</p>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <MetricPill label="Vencidos" value={item.expired} className={getExpirationAppearance('VENCIDO').pill} />
                      <MetricPill label="Alerta" value={item.alert} className={getExpirationAppearance('ALERTA').pill} />
                      <MetricPill label="Vencendo" value={item.warning} className={getExpirationAppearance('VENCENDO').pill} />
                      <MetricPill label="Em dia" value={item.ok} className={getExpirationAppearance('EM_DIA').pill} />
                      <MetricPill label="Sem validade" value={item.noValidity} className={getExpirationAppearance('SEM_VALIDADE').pill} />
                    </div>
                  </div>
                );
              })
            )}
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
