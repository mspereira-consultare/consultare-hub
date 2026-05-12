import { LayoutGrid } from 'lucide-react';
import {
  EXECUTIVE_WIDGET_DEFINITIONS,
} from '@/lib/dashboard_executive/catalog';
import type {
  ExecutiveAreaKey,
  ExecutiveIndicator,
  ExecutiveSnapshot,
  ExecutiveWidgetDefinition,
  ExecutiveWidgetKey,
} from '@/lib/dashboard_executive/types';
import { ExecutiveIndicatorCard } from './ExecutiveIndicatorCard';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';
import {
  areaAccentStyles,
  areaIcons,
  formatSnapshotTimestamp,
} from './dashboardExecutiveUtils';

type ExecutiveWidgetsSectionProps = {
  snapshot: ExecutiveSnapshot;
};

type ResolvedWidget =
  | {
      kind: 'indicator';
      definition: ExecutiveWidgetDefinition;
      indicator: ExecutiveIndicator;
    }
  | {
      kind: 'monitor';
      definition: ExecutiveWidgetDefinition;
      updatedAt: string | null;
      values: Array<{ label: string; value: string }>;
      note: string;
      status: ExecutiveIndicator['status'];
    };

const AREA_ORDER: ExecutiveAreaKey[] = ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade'];

const INDICATOR_BY_WIDGET: Partial<Record<ExecutiveWidgetKey, string>> = {
  faturamento_hoje_meta: 'faturamento_hoje',
  faturamento_mes_meta: 'faturamento_mes',
  propostas_aberto: 'aguardando_cliente',
  demanda_whatsapp: 'whatsapp_digital',
  documentos_equipamentos_vencendo: 'documentos_qms',
};

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function WidgetMonitorCard({ widget }: { widget: Extract<ResolvedWidget, { kind: 'monitor' }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{widget.definition.label}</p>
          <p className="mt-1 text-sm text-slate-500">{widget.definition.description}</p>
        </div>
        <ExecutiveStatusBadge status={widget.status} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {widget.values.map((item) => (
          <MiniMetric key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <p className="mt-3 text-sm text-slate-500">{widget.note}</p>
      <p className="mt-3 text-xs text-slate-400">Atualizado em {formatSnapshotTimestamp(widget.updatedAt)}</p>
    </div>
  );
}

function buildResolvedWidgets(snapshot: ExecutiveSnapshot): ResolvedWidget[] {
  const visibleKeys = new Set(snapshot.metrics.profile.visibleWidgetKeys);
  const availableWidgets = EXECUTIVE_WIDGET_DEFINITIONS.filter(
    (widget) => widget.status === 'available' && visibleKeys.has(widget.key)
  ).sort((a, b) => a.sortOrder - b.sortOrder);

  const indicators = snapshot.metrics.areas.flatMap((area) => area.indicators);
  const indicatorsByKey = new Map(indicators.map((indicator) => [indicator.indicatorKey, indicator]));
  const operationsArea = snapshot.metrics.areas.find((area) => area.areaKey === 'operacao');

  return availableWidgets.flatMap<ResolvedWidget>((definition) => {
    if (definition.key === 'monitoramento_filas') {
      return [
        {
          kind: 'monitor' as const,
          definition,
          updatedAt: operationsArea?.updatedAt || snapshot.metrics.generatedAt,
          status: operationsArea?.status || 'NO_DATA',
          note: 'Visão consolidada das filas críticas do momento para priorização operacional.',
          values: [
            { label: 'Fila médica', value: String(snapshot.metrics.liveOperations.medicQueue) },
            { label: 'Fila recepção', value: String(snapshot.metrics.liveOperations.receptionQueue) },
            { label: 'WhatsApp', value: String(snapshot.metrics.liveOperations.whatsappQueue) },
            { label: 'Espera crítica', value: String(snapshot.metrics.liveOperations.criticalWaitCount) },
          ],
        },
      ];
    }

    const indicatorKey = INDICATOR_BY_WIDGET[definition.key];
    if (!indicatorKey) return [];

    const indicator = indicatorsByKey.get(indicatorKey);
    if (!indicator) return [];

    return [{ kind: 'indicator' as const, definition, indicator }];
  });
}

export function ExecutiveWidgetsSection({ snapshot }: ExecutiveWidgetsSectionProps) {
  const widgets = buildResolvedWidgets(snapshot);
  const plannedVisibleCount = snapshot.metrics.profile.visibleWidgetKeys.filter((widgetKey) => {
    const definition = EXECUTIVE_WIDGET_DEFINITIONS.find((item) => item.key === widgetKey);
    return definition?.status === 'planned';
  }).length;

  const widgetsByArea = AREA_ORDER.map((areaKey) => {
    const items = widgets.filter((widget) => widget.definition.areaKey === areaKey);
    return { areaKey, items };
  }).filter((group) => group.items.length > 0);

  if (!widgetsByArea.length) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Indicadores do seu perfil</h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Este perfil ainda não possui widgets consolidados nesta versão do dashboard executivo.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Indicadores do seu perfil</h2>
          </div>
          <p className="text-sm text-slate-500">
            Esta visão mostra apenas os widgets já consolidados para o perfil e o escopo do seu acesso.
          </p>
        </div>

        {plannedVisibleCount > 0 ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 lg:max-w-md">
            {plannedVisibleCount} widget(s) do seu perfil continuam em preparação e entrarão nas próximas entregas,
            sem impactar os indicadores já disponíveis.
          </div>
        ) : null}
      </div>

      {widgetsByArea.map(({ areaKey, items }) => {
        const Icon = areaIcons[areaKey];
        const definition = EXECUTIVE_WIDGET_DEFINITIONS.find((item) => item.areaKey === areaKey);

        return (
          <article key={areaKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${areaAccentStyles[areaKey]}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {definition ? definition.areaKey.charAt(0).toUpperCase() + definition.areaKey.slice(1) : areaKey}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {items.length} widget(s) consolidados para este eixo do dashboard.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {items.map((widget) =>
                widget.kind === 'indicator' ? (
                  <ExecutiveIndicatorCard
                    key={widget.definition.key}
                    indicator={{ ...widget.indicator, label: widget.definition.label }}
                  />
                ) : (
                  <WidgetMonitorCard key={widget.definition.key} widget={widget} />
                )
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
