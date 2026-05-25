import type { ReactNode } from 'react';
import { BrainCircuit, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import type { ExecutiveAiInsightItem, ExecutiveSnapshot } from '@/lib/dashboard_executive/types';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';

type InsightListCardProps = {
  title: string;
  items: ExecutiveAiInsightItem[];
  emptyText: string;
  tone: string;
  icon: ReactNode;
};

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

function areaLabel(areaKey: ExecutiveAiInsightItem['areaKey']) {
  if (areaKey === 'financeiro') return 'Financeiro';
  if (areaKey === 'comercial') return 'Comercial';
  if (areaKey === 'operacao') return 'Operação';
  if (areaKey === 'pessoas') return 'Pessoas';
  if (areaKey === 'qualidade') return 'Qualidade';
  return null;
}

function InsightListCard({ title, items, emptyText, tone, icon }: InsightListCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={`${title}-${item.title}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{item.title}</p>
                {areaLabel(item.areaKey) ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {areaLabel(item.areaKey)}
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
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              <p className="mt-2 text-xs text-slate-500">{item.rationale}</p>
            </div>
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

export function ExecutiveAiInsightsSection({ snapshot }: { snapshot: ExecutiveSnapshot }) {
  const aiStatus = snapshot.metrics.aiStatus || 'PENDING_PHASE_2';
  const aiSummary = snapshot.aiSummary;

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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Leitura executiva da IA</h2>
        </div>
        <ExecutiveStatusBadge status={aiSummary.overallStatus} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {aiSummary.areaDiagnoses.map((diagnosis) => (
          <div key={diagnosis.areaKey} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{areaLabel(diagnosis.areaKey) || diagnosis.areaKey}</p>
                <p className="mt-1 text-sm text-slate-600">{diagnosis.summary}</p>
              </div>
              <ExecutiveStatusBadge status={diagnosis.status} />
            </div>
            <p className="mt-3 text-xs text-slate-500">{diagnosis.rationale}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InsightListCard
          title="Planos de ação"
          items={aiSummary.actionPlans}
          emptyText="A IA não sugeriu planos de ação adicionais para este snapshot."
          tone="bg-blue-50 text-blue-700"
          icon={<Sparkles size={18} />}
        />
        <InsightListCard
          title="Riscos"
          items={aiSummary.risks}
          emptyText="Nenhum risco adicional apareceu além dos alertas quantitativos."
          tone="bg-rose-50 text-rose-700"
          icon={<ShieldAlert size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InsightListCard
          title="Oportunidades"
          items={aiSummary.opportunities}
          emptyText="Nenhuma oportunidade adicional foi destacada pela IA neste momento."
          tone="bg-emerald-50 text-emerald-700"
          icon={<Lightbulb size={18} />}
        />
        <InsightListCard
          title="Lacunas de dados"
          items={aiSummary.dataGaps}
          emptyText="A IA não identificou lacunas críticas de dados para este snapshot."
          tone="bg-amber-50 text-amber-700"
          icon={<BrainCircuit size={18} />}
        />
      </div>
    </section>
  );
}
