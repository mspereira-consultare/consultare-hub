import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { BrainCircuit, ChevronRight, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import type {
  ExecutiveAiAreaDiagnosis,
  ExecutiveAiInsightItem,
  ExecutiveSnapshot,
} from '@/lib/dashboard_executive/types';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';
import { formatAreaLabel, truncateText } from './dashboardExecutiveUtils';

type DetailTarget =
  | { kind: 'diagnosis'; title: string; subtitle: string | null; body: string; footer: string | null }
  | { kind: 'item'; title: string; subtitle: string | null; body: string; footer: string | null }
  | null;

function severityLabel(severity: ExecutiveAiInsightItem['severity']) {
  if (severity === 'critical') return 'Crítica';
  if (severity === 'high') return 'Alta';
  if (severity === 'medium') return 'Moderada';
  return 'Baixa';
}

function horizonLabel(horizon: ExecutiveAiInsightItem['horizon']) {
  if (horizon === 'now') return 'Agora';
  if (horizon === 'week') return 'Esta semana';
  if (horizon === 'month') return 'Este mês';
  return null;
}

function CompactInsightRow({
  item,
  onOpen,
}: {
  item: ExecutiveAiInsightItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-900">{truncateText(item.title, 68)}</p>
          {item.areaKey ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {formatAreaLabel(item.areaKey)}
            </span>
          ) : null}
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {severityLabel(item.severity)}
          </span>
          {horizonLabel(item.horizon) ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {horizonLabel(item.horizon)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">{truncateText(item.description, 100)}</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

function SectionList({
  title,
  icon,
  tone,
  items,
  emptyText,
  onOpenItem,
}: {
  title: string;
  icon: ReactNode;
  tone: string;
  items: ExecutiveAiInsightItem[];
  emptyText: string;
  onOpenItem: (item: ExecutiveAiInsightItem) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="mt-4 space-y-2">
        {items.length ? (
          items.slice(0, 3).map((item) => (
            <CompactInsightRow
              key={`${title}-${item.title}`}
              item={item}
              onOpen={() => onOpenItem(item)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosisCard({
  diagnosis,
  onOpen,
}: {
  diagnosis: ExecutiveAiAreaDiagnosis;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{formatAreaLabel(diagnosis.areaKey)}</p>
          <p className="mt-1 text-sm text-slate-600">{truncateText(diagnosis.summary, 120)}</p>
        </div>
        <ExecutiveStatusBadge status={diagnosis.status} />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 transition hover:text-blue-800"
        >
          Ver análise
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function DetailsDrawer({
  target,
  onClose,
}: {
  target: DetailTarget;
  onClose: () => void;
}) {
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <button type="button" aria-label="Fechar" className="flex-1 cursor-default" onClick={onClose} />
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                {target.kind === 'diagnosis' ? 'Análise detalhada' : 'Detalhe executivo'}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{target.title}</h3>
              {target.subtitle ? <p className="mt-1 text-sm text-slate-500">{target.subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {target.body}
          </div>
          {target.footer ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              {target.footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExecutiveAiInsightsSection({ snapshot }: { snapshot: ExecutiveSnapshot }) {
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const aiStatus = snapshot.metrics.aiStatus || 'PENDING_PHASE_2';
  const aiSummary = snapshot.aiSummary;

  const diagnosisCards = useMemo(() => aiSummary?.areaDiagnoses || [], [aiSummary]);

  if (!aiSummary || aiStatus !== 'READY') {
    const tone =
      aiStatus === 'FAILED'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    const title = aiStatus === 'FAILED' ? 'Leitura executiva da IA indisponível' : 'Leitura executiva da IA aguardando configuração';
    const message =
      snapshot.metrics.aiMessage ||
      (aiStatus === 'FAILED'
        ? 'Os indicadores quantitativos continuam disponíveis, mas a interpretação da IA falhou neste snapshot.'
        : 'A leitura executiva da IA será exibida assim que o acesso tiver perfil e dados suficientes para análise.');

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Leitura executiva da IA</h2>
        </div>

        <div className={`rounded-xl border px-5 py-4 shadow-sm ${tone}`}>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm">{message}</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Leitura executiva da IA</h2>
          </div>
          <ExecutiveStatusBadge status={aiSummary.overallStatus} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {diagnosisCards.map((diagnosis) => (
            <DiagnosisCard
              key={diagnosis.areaKey}
              diagnosis={diagnosis}
              onOpen={() =>
                setDetailTarget({
                  kind: 'diagnosis',
                  title: formatAreaLabel(diagnosis.areaKey),
                  subtitle: diagnosis.status === 'DANGER' ? 'Área crítica neste snapshot' : diagnosis.status === 'WARNING' ? 'Área em atenção neste snapshot' : 'Área estável neste snapshot',
                  body: diagnosis.summary,
                  footer: diagnosis.rationale,
                })
              }
            />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionList
            title="Planos de ação"
            items={aiSummary.actionPlans}
            emptyText="A IA não sugeriu planos de ação adicionais para este snapshot."
            tone="bg-blue-50 text-blue-700"
            icon={<Sparkles size={18} />}
            onOpenItem={(item) =>
              setDetailTarget({
                kind: 'item',
                title: item.title,
                subtitle: [item.areaKey ? formatAreaLabel(item.areaKey) : null, severityLabel(item.severity), horizonLabel(item.horizon)]
                  .filter(Boolean)
                  .join(' • '),
                body: item.description,
                footer: item.rationale,
              })
            }
          />
          <SectionList
            title="Riscos"
            items={aiSummary.risks}
            emptyText="Nenhum risco adicional apareceu além dos alertas quantitativos."
            tone="bg-rose-50 text-rose-700"
            icon={<ShieldAlert size={18} />}
            onOpenItem={(item) =>
              setDetailTarget({
                kind: 'item',
                title: item.title,
                subtitle: [item.areaKey ? formatAreaLabel(item.areaKey) : null, severityLabel(item.severity), horizonLabel(item.horizon)]
                  .filter(Boolean)
                  .join(' • '),
                body: item.description,
                footer: item.rationale,
              })
            }
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionList
            title="Oportunidades"
            items={aiSummary.opportunities}
            emptyText="Nenhuma oportunidade adicional foi destacada pela IA neste momento."
            tone="bg-emerald-50 text-emerald-700"
            icon={<Lightbulb size={18} />}
            onOpenItem={(item) =>
              setDetailTarget({
                kind: 'item',
                title: item.title,
                subtitle: [item.areaKey ? formatAreaLabel(item.areaKey) : null, severityLabel(item.severity), horizonLabel(item.horizon)]
                  .filter(Boolean)
                  .join(' • '),
                body: item.description,
                footer: item.rationale,
              })
            }
          />
          <SectionList
            title="Lacunas de dados"
            items={aiSummary.dataGaps}
            emptyText="A IA não identificou lacunas críticas de dados para este snapshot."
            tone="bg-amber-50 text-amber-700"
            icon={<BrainCircuit size={18} />}
            onOpenItem={(item) =>
              setDetailTarget({
                kind: 'item',
                title: item.title,
                subtitle: [item.areaKey ? formatAreaLabel(item.areaKey) : null, severityLabel(item.severity), horizonLabel(item.horizon)]
                  .filter(Boolean)
                  .join(' • '),
                body: item.description,
                footer: item.rationale,
              })
            }
          />
        </div>
      </section>

      <DetailsDrawer target={detailTarget} onClose={() => setDetailTarget(null)} />
    </>
  );
}
