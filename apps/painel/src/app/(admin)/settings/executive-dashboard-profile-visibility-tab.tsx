'use client';

import { Layers3, Search } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfileWidgetConfig,
} from '@/lib/dashboard_executive/types';
import { ExecutiveDashboardHelpCallout } from './executive-dashboard-help-callout';
import { cn, compareProfileWidgets, normalizeText } from './executive-dashboard-settings-utils';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  selectedProfileKey: ExecutiveProfileKey;
  onSelectProfile: (profileKey: ExecutiveProfileKey) => void;
  onChangeProfileWidget: (
    profileKey: ExecutiveProfileKey,
    widgetKey: ExecutiveProfileWidgetConfig['widgetKey'],
    patch: Partial<ExecutiveProfileWidgetConfig>
  ) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
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
  searchTerm,
  onSearchTermChange,
  onSave,
  saving,
}: Props) {
  const selectedProfile = config.profiles.find((profile) => profile.key === selectedProfileKey) || config.profiles[0];
  const widgetsByKey = new Map(config.widgets.map((widget) => [widget.key, widget]));
  const rows = config.profileWidgets
    .filter((item) => item.profileKey === selectedProfile.key)
    .filter((item) => {
      const widget = widgetsByKey.get(item.widgetKey);
      const haystack = normalizeText(`${widget?.label || ''} ${widget?.description || ''} ${widget?.sourceKey || ''}`);
      return !searchTerm || haystack.includes(normalizeText(searchTerm));
    })
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

        <div className="border-b border-slate-100 px-5 py-4">
          <ExecutiveDashboardHelpCallout title="Como pensar esta aba" variant="info">
            O perfil define <strong>o que pode aparecer</strong> no dashboard, mas não define sozinho quem recebe essa visão.
            O enquadramento do usuário continua vindo do cargo mestre, do grupo executivo e, só em exceções, de ajustes individuais.
          </ExecutiveDashboardHelpCallout>
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

        <div className="border-b border-slate-100 px-5 py-4">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Buscar widget por nome, descrição ou origem"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="max-h-[560px] overflow-auto px-5 py-4">
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
                      <p className="mt-2 max-w-[140px] text-xs leading-5 text-slate-500">
                        Marque apenas o que este perfil realmente deve enxergar no dashboard.
                      </p>
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
                      <p className="mt-2 max-w-[180px] text-xs leading-5 text-slate-500">
                        Quanto menor o número, mais cedo o widget aparece na leitura executiva.
                      </p>
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
