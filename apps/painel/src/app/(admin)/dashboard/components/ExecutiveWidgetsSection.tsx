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
  formatProfileLabel,
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

function CoverageCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

export function ExecutiveWidgetsSection({ snapshot }: ExecutiveWidgetsSectionProps) {
  const widgets = snapshot.metrics.widgets || [];
  const visibleWidgetDefinitions = snapshot.metrics.profile.visibleWidgetKeys
    .map((widgetKey) => EXECUTIVE_WIDGET_DEFINITIONS.find((item) => item.key === widgetKey))
    .filter(Boolean);
  const plannedVisibleDefinitions = visibleWidgetDefinitions.filter((item) => item?.status === 'planned');
  const blockedVisibleDefinitions = visibleWidgetDefinitions.filter((item) => item?.status === 'blocked');
  const plannedVisibleCount = plannedVisibleDefinitions.length;
  const blockedVisibleCount = blockedVisibleDefinitions.length;
  const coveredAreas = new Set(widgets.map((widget) => widget.areaKey));

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
            Widgets executivos consolidados para o perfil {formatProfileLabel(snapshot.metrics.profile.profileKey)} dentro do escopo atual.
          </p>
        </div>

        {plannedVisibleCount > 0 ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-800 lg:max-w-md">
            {plannedVisibleCount} widget(s) do perfil seguem em preparação.
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CoverageCard
          label="Widgets ativos"
          value={String(widgets.length)}
          helper="Blocos realmente consolidados neste snapshot."
        />
        <CoverageCard
          label="Em preparação"
          value={String(plannedVisibleCount)}
          helper="Itens previstos para o perfil, mas ainda sem fonte executiva pronta."
        />
        <CoverageCard
          label="Bloqueados"
          value={String(blockedVisibleCount)}
          helper="Itens fora do escopo atual ou dependentes de integração externa."
        />
        <CoverageCard
          label="Áreas cobertas"
          value={String(coveredAreas.size)}
          helper="Eixos do dashboard já representados por widgets ativos."
        />
      </div>

      {plannedVisibleDefinitions.length ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50 px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-sky-900">Widgets do perfil ainda em preparação</h3>
              <p className="mt-1 text-sm text-sky-800">
                Estes itens continuam previstos para o perfil atual, mas dependem de fonte executiva ou refinamento adicional.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {plannedVisibleDefinitions.map((definition) => (
              <span
                key={definition?.key}
                className="inline-flex items-center rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900"
              >
                {definition?.label} · {formatAreaLabel(definition?.areaKey || 'operacao')}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {blockedVisibleDefinitions.length ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-rose-900">Widgets bloqueados nesta retomada</h3>
              <p className="mt-1 text-sm text-rose-800">
                Estes itens ficaram fora da V1 atual porque dependem de integração externa, regra ainda não definida ou escopo proibido nesta retomada.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {blockedVisibleDefinitions.map((definition) => (
              <span
                key={definition?.key}
                className="inline-flex items-center rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-900"
              >
                {definition?.label} · {formatAreaLabel(definition?.areaKey || 'operacao')}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {widgetsByArea.map(({ areaKey, items }) => {
        const Icon = areaIcons[areaKey];

        return (
          <article key={areaKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${areaAccentStyles[areaKey]}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {formatAreaLabel(areaKey)}
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
