'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import type { ExecutiveConfigurationSnapshot, ExecutiveProfileRule, ExecutiveScopeOptions } from '@/lib/dashboard_executive/types';
import { normalizeText } from './executive-dashboard-settings-utils';
import { ExecutiveDashboardMultiSelect } from './executive-dashboard-multi-select';
import { ExecutiveDashboardSearchableSelect } from './executive-dashboard-searchable-select';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  options: ExecutiveScopeOptions;
  onChangeRule: (ruleId: string, patch: Partial<ExecutiveProfileRule>) => void;
  onAddRule: () => void;
  onRemoveRule: (ruleId: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
};

export function ExecutiveDashboardRulesTab({
  config,
  options,
  onChangeRule,
  onAddRule,
  onRemoveRule,
  searchTerm,
  onSearchTermChange,
  onSave,
  saving,
}: Props) {
  const defaultProfileKey = config.profiles[0]?.key;
  const visibleRules = config.rules.filter((rule) => {
    const profile = config.profiles.find((item) => item.key === rule.profileKey);
    const haystack = normalizeText(
      `${profile?.label || ''} ${rule.department || ''} ${rule.jobTitle || ''} ${rule.units.join(' ')}`
    );
    return !searchTerm || haystack.includes(normalizeText(searchTerm));
  });

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

      <div className="border-b border-slate-100 px-5 py-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar regra por perfil, departamento, cargo ou unidade"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          Para evitar regras duplicadas ou grafias diferentes, use apenas as opções oficiais de <strong>Departamento</strong>,
          <strong> Cargo</strong> e <strong>Unidades</strong> vindas do cadastro de colaboradores.
        </div>
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto px-5 py-4">
        {visibleRules.length ? (
          visibleRules.map((rule) => (
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

                <ExecutiveDashboardSearchableSelect
                  label="Departamento"
                  options={options.departments}
                  value={rule.department}
                  onChange={(value) => onChangeRule(rule.id, { department: value })}
                  placeholder="Sem restrição"
                  helper="Selecione um departamento oficial do cadastro de colaboradores."
                  dropdownClassName="w-[320px] max-w-[420px]"
                  optionTextClassName="whitespace-nowrap"
                />

                <ExecutiveDashboardSearchableSelect
                  label="Cargo"
                  options={options.jobTitles}
                  value={rule.jobTitle}
                  onChange={(value) => onChangeRule(rule.id, { jobTitle: value })}
                  placeholder="Sem restrição"
                  helper="Selecione um cargo oficial do cadastro de colaboradores."
                  dropdownClassName="w-[360px] max-w-[480px]"
                  optionTextClassName="whitespace-nowrap"
                />

                <ExecutiveDashboardMultiSelect
                  label="Unidades"
                  options={options.units}
                  value={rule.units}
                  onChange={(value) => onChangeRule(rule.id, { units: value })}
                  helper="Selecione as unidades que devem acionar esta regra. Se ficar vazio, a regra vale para qualquer unidade."
                  dropdownClassName="w-[560px] max-w-[90vw]"
                  optionTextClassName="whitespace-nowrap"
                  showSelectedChips={false}
                />

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
