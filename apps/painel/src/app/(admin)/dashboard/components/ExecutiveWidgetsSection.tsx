import { LayoutGrid } from 'lucide-react';
import {
  EXECUTIVE_WIDGET_DEFINITIONS,
} from '@/lib/dashboard_executive/catalog';
import type {
  ExecutiveAreaKey,
  ExecutiveSnapshot,
  ExecutiveWidgetSnapshot,
} from '@/lib/dashboard_executive/types';
import { ExecutiveIndicatorCard } from './ExecutiveIndicatorCard';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';
import {
  areaAccentStyles,
  areaIcons,
  formatSnapshotTimestamp,
  formatAreaLabel,
  truncateText,
} from './dashboardExecutiveUtils';

type ExecutiveWidgetsSectionProps = {
  snapshot: ExecutiveSnapshot;
};

const AREA_ORDER: ExecutiveAreaKey[] = ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade'];

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function WidgetSummaryCard({ widget }: { widget: ExecutiveWidgetSnapshot }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{widget.label}</p>
          {widget.description ? <p className="mt-1 text-sm text-slate-500">{truncateText(widget.description, 88)}</p> : null}
        </div>
        <ExecutiveStatusBadge status={widget.status} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {widget.values.map((item) => (
          <MiniMetric key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400">Atualizado em {formatSnapshotTimestamp(widget.updatedAt)}</p>
    </div>
  );
}

export function ExecutiveWidgetsSection({ snapshot }: ExecutiveWidgetsSectionProps) {
  const widgets = snapshot.metrics.widgets || [];
  const plannedVisibleCount = snapshot.metrics.profile.visibleWidgetKeys.filter((widgetKey) => {
    const definition = EXECUTIVE_WIDGET_DEFINITIONS.find((item) => item.key === widgetKey);
    return definition?.status === 'planned';
  }).length;

  const widgetsByArea = AREA_ORDER.map((areaKey) => {
    const items = widgets.filter((widget) => widget.areaKey === areaKey);
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
            Widgets executivos consolidados para o seu perfil e escopo atual.
          </p>
        </div>

        {plannedVisibleCount > 0 ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-800 lg:max-w-md">
            {plannedVisibleCount} widget(s) do perfil seguem em preparação.
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
                    {definition ? formatAreaLabel(definition.areaKey) : formatAreaLabel(areaKey)}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {items.length} widget(s) consolidados para este eixo do dashboard.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {items.map((widget) =>
                widget.indicator ? (
                  <ExecutiveIndicatorCard
                    key={widget.key}
                    indicator={widget.indicator}
                  />
                ) : (
                  <WidgetSummaryCard key={widget.key} widget={widget} />
                )
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
