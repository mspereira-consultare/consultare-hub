'use client';

import { Layers3 } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfileWidgetConfig,
} from '@/lib/dashboard_executive/types';
import { cn, compareProfileWidgets } from './executive-dashboard-settings-utils';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  selectedProfileKey: ExecutiveProfileKey;
  onSelectProfile: (profileKey: ExecutiveProfileKey) => void;
  onChangeProfileWidget: (
    profileKey: ExecutiveProfileKey,
    widgetKey: ExecutiveProfileWidgetConfig['widgetKey'],
    patch: Partial<ExecutiveProfileWidgetConfig>
  ) => void;
  onSave: () => void;
  saving: boolean;
};

const areaLabels: Record<string, string> = {
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  operacao: 'Operação',
  pessoas: 'Pessoas',
  qualidade: 'Qualidade',
};

export function ExecutiveDashboardProfileVisibilityTab({
  config,
  selectedProfileKey,
  onSelectProfile,
  onChangeProfileWidget,
  onSave,
  saving,
}: Props) {
  const selectedProfile = config.profiles.find((profile) => profile.key === selectedProfileKey) || config.profiles[0];
  const widgetsByKey = new Map(config.widgets.map((widget) => [widget.key, widget]));
  const rows = config.profileWidgets
    .filter((item) => item.profileKey === selectedProfile.key)
    .sort(compareProfileWidgets);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Perfis e widgets</h3>
              <p className="text-sm text-slate-500">
                Defina quais indicadores cada perfil pode visualizar e a ordem de exibição.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
          {config.profiles.map((profile) => (
            <button
              key={profile.key}
              type="button"
              onClick={() => onSelectProfile(profile.key)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition',
                selectedProfile.key === profile.key
                  ? 'border-blue-200 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="text-sm font-semibold text-slate-900">{profile.label}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{profile.description}</p>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto px-5 py-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">Widget</th>
                <th className="pb-3 pr-4 font-medium">Área</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Origem</th>
                <th className="pb-3 pr-4 font-medium">Visível</th>
                <th className="pb-3 font-medium">Ordem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const widget = widgetsByKey.get(row.widgetKey);
                if (!widget) return null;

                return (
                  <tr key={`${row.profileKey}-${row.widgetKey}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 align-top">
                      <div className="font-medium text-slate-900">{widget.label}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{widget.description || 'Sem descrição.'}</p>
                    </td>
                    <td className="py-3 pr-4 align-top text-slate-600">{areaLabels[widget.areaKey] || widget.areaKey}</td>
                    <td className="py-3 pr-4 align-top">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                          widget.status === 'available'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        )}
                      >
                        {widget.status === 'available' ? 'Disponível' : 'Planejado'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-slate-500">{widget.sourceKey || 'A definir'}</td>
                    <td className="py-3 pr-4 align-top">
                      <input
                        type="checkbox"
                        checked={row.isVisible}
                        onChange={(event) =>
                          onChangeProfileWidget(selectedProfile.key, row.widgetKey, { isVisible: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-3 align-top">
                      <input
                        type="number"
                        min={1}
                        value={row.sortOrder}
                        onChange={(event) =>
                          onChangeProfileWidget(selectedProfile.key, row.widgetKey, {
                            sortOrder: Number(event.target.value || 0),
                          })
                        }
                        className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando...' : `Salvar visibilidade de ${selectedProfile.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
