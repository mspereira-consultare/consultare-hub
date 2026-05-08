import { Building2 } from 'lucide-react';
import type { ExecutiveAreaBlock } from '@/lib/dashboard_executive/types';
import { ExecutiveIndicatorCard } from './ExecutiveIndicatorCard';
import { areaAccentStyles, areaIcons, formatSnapshotTimestamp } from './dashboardExecutiveUtils';
import { ExecutiveStatusBadge } from './ExecutiveStatusBadge';

export function ExecutiveAreasSection({ areas }: { areas: ExecutiveAreaBlock[] }) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Building2 size={18} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Blocos executivos</h2>
      </div>

      <div className="grid gap-5">
        {areas.map((area) => {
          const Icon = areaIcons[area.areaKey];

          return (
            <article key={area.areaKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${areaAccentStyles[area.areaKey]}`}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{area.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">{area.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <ExecutiveStatusBadge status={area.status} />
                    <span className="text-sm text-slate-500">
                      Atualizado em {formatSnapshotTimestamp(area.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 xl:grid-cols-2">
                {area.indicators.map((indicator) => (
                  <ExecutiveIndicatorCard key={`${area.areaKey}-${indicator.indicatorKey}`} indicator={indicator} />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
