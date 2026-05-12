'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveScopeMode,
  ExecutiveScopeOptions,
  ExecutiveUserException,
} from '@/lib/dashboard_executive/types';
import { ExecutiveDashboardHelpCallout } from './executive-dashboard-help-callout';
import { normalizeText, scopeModeLabel } from './executive-dashboard-settings-utils';
import { ExecutiveDashboardMultiSelect } from './executive-dashboard-multi-select';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  previewRows: ExecutiveProfilePreviewRow[];
  options: ExecutiveScopeOptions;
  onAddException: () => void;
  onChangeException: (userId: string, patch: Partial<ExecutiveUserException>) => void;
  onRemoveException: (userId: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
};

const SCOPE_OVERRIDE_OPTIONS: Array<{ value: ExecutiveScopeMode | ''; label: string }> = [
  { value: '', label: 'Herdar do grupo' },
  { value: 'unrestricted', label: scopeModeLabel.unrestricted },
  { value: 'employee_department', label: scopeModeLabel.employee_department },
  { value: 'employee_units', label: scopeModeLabel.employee_units },
  { value: 'employee_department_and_units', label: scopeModeLabel.employee_department_and_units },
  { value: 'custom', label: scopeModeLabel.custom },
];

export function ExecutiveDashboardOverridesTab({
  config,
  previewRows,
  options,
  onAddException,
  onChangeException,
  onRemoveException,
  searchTerm,
  onSearchTermChange,
  onSave,
  saving,
}: Props) {
  const userMap = new Map(previewRows.map((row) => [row.userId, row]));
  const visibleExceptions = config.userExceptions.filter((item) => {
    const user = userMap.get(item.userId);
    const haystack = normalizeText(`${user?.userName || ''} ${user?.executiveGroupLabel || ''} ${item.profileKeyOverride || ''}`);
    return !searchTerm || haystack.includes(normalizeText(searchTerm));
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Exceções individuais</h3>
          <p className="text-sm text-slate-500">
            Use apenas quando uma pessoa precisar ver algo diferente do grupo e do perfil padrão.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddException}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nova exceção
        </button>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar exceção por usuário, grupo ou perfil"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <div className="mt-4">
          <ExecutiveDashboardHelpCallout title="Use como exceção, não como regra" variant="warning">
            Se várias pessoas precisarem da mesma mudança, o correto é revisar o grupo ou o perfil base.
            Exceção individual serve para casos pontuais, não para corrigir um desenho estrutural do módulo.
          </ExecutiveDashboardHelpCallout>
        </div>
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto px-5 py-4">
        {visibleExceptions.length ? (
          visibleExceptions.map((item) => {
            const user = userMap.get(item.userId);
            return (
              <div key={item.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 xl:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário</label>
                    <select
                      value={item.userId}
                      onChange={(event) => onChangeException(item.userId, { userId: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {previewRows.map((row) => (
                        <option key={row.userId} value={row.userId}>
                          {row.userName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      {user?.executiveGroupLabel || 'Sem grupo'} {user?.jobTitle ? `• ${user.jobTitle}` : ''}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil específico</label>
                    <select
                      value={item.profileKeyOverride || ''}
                      onChange={(event) =>
                        onChangeException(item.userId, { profileKeyOverride: (event.target.value || null) as ExecutiveProfileKey | null })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Herdar do grupo</option>
                      {config.profiles.map((profile) => (
                        <option key={profile.key} value={profile.key}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Se deixar vazio, a pessoa continua herdando o perfil do grupo. Preencha apenas quando ela precisar fugir do padrão.
                    </p>
                    <label className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.isActive}
                        onChange={(event) => onChangeException(item.userId, { isActive: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Ativa
                    </label>
                  </div>

                  <ExecutiveDashboardMultiSelect
                    label="Widgets extras"
                    options={config.widgets.map((widget) => widget.label)}
                    value={item.addedWidgetKeys.map((key) => config.widgets.find((widget) => widget.key === key)?.label || key)}
                    onChange={(labels) =>
                      onChangeException(item.userId, {
                        addedWidgetKeys: labels
                          .map((label) => config.widgets.find((widget) => widget.label === label)?.key)
                          .filter(Boolean) as any,
                      })
                    }
                    helper="Adiciona widgets além do que já veio do perfil base."
                  />

                  <ExecutiveDashboardMultiSelect
                    label="Widgets ocultos"
                    options={config.widgets.map((widget) => widget.label)}
                    value={item.hiddenWidgetKeys.map((key) => config.widgets.find((widget) => widget.key === key)?.label || key)}
                    onChange={(labels) =>
                      onChangeException(item.userId, {
                        hiddenWidgetKeys: labels
                          .map((label) => config.widgets.find((widget) => widget.label === label)?.key)
                          .filter(Boolean) as any,
                      })
                    }
                    helper="Esconde widgets que o perfil base normalmente exibiria."
                  />

                  <div className="flex gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Escopo da exceção</label>
                        <select
                          value={item.scopeModeOverride || ''}
                          onChange={(event) => onChangeException(item.userId, { scopeModeOverride: (event.target.value || null) as ExecutiveScopeMode | null })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {SCOPE_OVERRIDE_OPTIONS.map((option) => (
                            <option key={option.value || 'inherit'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Herdar do grupo é o padrão. Só troque isso quando a pessoa realmente precisar de um recorte próprio.
                        </p>
                      </div>
                      <ExecutiveDashboardMultiSelect
                        label="Departamentos"
                        options={options.departments}
                        value={item.departments}
                        onChange={(value) => onChangeException(item.userId, { departments: value })}
                        helper="Usado quando a exceção precisar personalizar o escopo."
                      />
                      <ExecutiveDashboardMultiSelect
                        label="Equipes"
                        options={options.teams}
                        value={item.teams}
                        onChange={(value) => onChangeException(item.userId, { teams: value })}
                        helper="Opcional."
                      />
                      <ExecutiveDashboardMultiSelect
                        label="Unidades"
                        options={options.units}
                        value={item.units}
                        onChange={(value) => onChangeException(item.userId, { units: value })}
                        helper="Opcional."
                        dropdownClassName="w-[420px] max-w-[520px]"
                        optionTextClassName="whitespace-nowrap"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveException(item.userId)}
                      className="mt-7 inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma exceção individual cadastrada.
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
          {saving ? 'Salvando...' : 'Salvar exceções'}
        </button>
      </div>
    </div>
  );
}
