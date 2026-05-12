'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveGroupDefinition,
  ExecutiveScopeMode,
  ExecutiveScopeOptions,
} from '@/lib/dashboard_executive/types';
import { normalizeText, scopeModeLabel } from './executive-dashboard-settings-utils';
import { ExecutiveDashboardMultiSelect } from './executive-dashboard-multi-select';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  options: ExecutiveScopeOptions;
  onAddGroup: () => void;
  onChangeGroup: (groupId: string, patch: Partial<ExecutiveGroupDefinition>) => void;
  onRemoveGroup: (groupId: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
};

const SCOPE_MODE_OPTIONS: ExecutiveScopeMode[] = [
  'unrestricted',
  'employee_department',
  'employee_units',
  'employee_department_and_units',
  'custom',
];

export function ExecutiveDashboardGroupsTab({
  config,
  options,
  onAddGroup,
  onChangeGroup,
  onRemoveGroup,
  searchTerm,
  onSearchTermChange,
  onSave,
  saving,
}: Props) {
  const visibleGroups = config.groups.filter((group) => {
    const haystack = normalizeText(`${group.label} ${group.key} ${group.description || ''}`);
    return !searchTerm || haystack.includes(normalizeText(searchTerm));
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Grupos executivos</h3>
          <p className="text-sm text-slate-500">
            Os grupos padronizam cargos diferentes sob uma mesma visão executiva e um mesmo recorte de dados.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddGroup}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-4 w-4" />
          Novo grupo
        </button>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar grupo por nome, chave ou descrição"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto px-5 py-4">
        {visibleGroups.map((group) => (
          <div key={group.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 xl:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nome do grupo</label>
                <input
                  value={group.label}
                  onChange={(event) => onChangeGroup(group.id, { label: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={group.key}
                  onChange={(event) => onChangeGroup(group.id, { key: event.target.value })}
                  placeholder="chave_interna"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil padrão</label>
                <select
                  value={group.defaultProfileKey}
                  onChange={(event) => onChangeGroup(group.id, { defaultProfileKey: event.target.value as any })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {config.profiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
                <label className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={group.isActive}
                    onChange={(event) => onChangeGroup(group.id, { isActive: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Ativo
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Escopo padrão</label>
                <select
                  value={group.scopeMode}
                  onChange={(event) => onChangeGroup(group.id, { scopeMode: event.target.value as ExecutiveScopeMode })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {SCOPE_MODE_OPTIONS.map((scopeMode) => (
                    <option key={scopeMode} value={scopeMode}>
                      {scopeModeLabel[scopeMode]}
                    </option>
                  ))}
                </select>
                <textarea
                  value={group.description || ''}
                  onChange={(event) => onChangeGroup(group.id, { description: event.target.value })}
                  placeholder="Descrição do grupo"
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <ExecutiveDashboardMultiSelect
                label="Departamentos"
                options={options.departments}
                value={group.departments}
                onChange={(value) => onChangeGroup(group.id, { departments: value })}
                helper={group.scopeMode === 'custom' ? 'Usado somente quando o escopo do grupo for customizado.' : 'Opcional para grupos com escopo customizado.'}
              />

              <div className="flex gap-3">
                <div className="flex-1 space-y-3">
                  <ExecutiveDashboardMultiSelect
                    label="Equipes"
                    options={options.teams}
                    value={group.teams}
                    onChange={(value) => onChangeGroup(group.id, { teams: value })}
                    helper="Opcional para escopo customizado."
                  />
                  <ExecutiveDashboardMultiSelect
                    label="Unidades"
                    options={options.units}
                    value={group.units}
                    onChange={(value) => onChangeGroup(group.id, { units: value })}
                    helper="Opcional para escopo customizado."
                    dropdownClassName="w-[420px] max-w-[520px]"
                    optionTextClassName="whitespace-nowrap"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveGroup(group.id)}
                  className="mt-7 inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar grupos'}
        </button>
      </div>
    </div>
  );
}
