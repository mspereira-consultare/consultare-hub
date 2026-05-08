'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ExecutiveConfigurationSnapshot, ExecutiveProfileRule } from '@/lib/dashboard_executive/types';
import { formatCsv, parseCsv } from './executive-dashboard-settings-utils';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  onChangeRule: (ruleId: string, patch: Partial<ExecutiveProfileRule>) => void;
  onAddRule: () => void;
  onRemoveRule: (ruleId: string) => void;
  onSave: () => void;
  saving: boolean;
};

export function ExecutiveDashboardRulesTab({
  config,
  onChangeRule,
  onAddRule,
  onRemoveRule,
  onSave,
  saving,
}: Props) {
  const defaultProfileKey = config.profiles[0]?.key;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Regras por cargo e setor</h3>
          <p className="text-sm text-slate-500">
            As regras definem automaticamente qual perfil cada usuário recebe com base no departamento, cargo e unidade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => defaultProfileKey && onAddRule()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nova regra
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {config.rules.length ? (
          config.rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 xl:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil</label>
                  <select
                    value={rule.profileKey}
                    onChange={(event) => onChangeRule(rule.id, { profileKey: event.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {config.profiles.map((profile) => (
                      <option key={profile.key} value={profile.key}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Departamento</label>
                  <input
                    value={rule.department || ''}
                    onChange={(event) => onChangeRule(rule.id, { department: event.target.value || null })}
                    placeholder="Ex.: Financeiro"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cargo</label>
                  <input
                    value={rule.jobTitle || ''}
                    onChange={(event) => onChangeRule(rule.id, { jobTitle: event.target.value || null })}
                    placeholder="Ex.: Líder de Unidade"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidades</label>
                  <input
                    value={formatCsv(rule.units)}
                    onChange={(event) => onChangeRule(rule.id, { units: parseCsv(event.target.value) })}
                    placeholder="Separar por vírgula"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-end gap-3">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(event) => onChangeRule(rule.id, { isActive: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Ativa
                  </label>

                  <button
                    type="button"
                    onClick={() => onRemoveRule(rule.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma regra cadastrada ainda.
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar regras'}
        </button>
      </div>
    </div>
  );
}
