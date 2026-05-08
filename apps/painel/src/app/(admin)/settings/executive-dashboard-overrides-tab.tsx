'use client';

import { Plus, Trash2 } from 'lucide-react';
import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveUserOverride,
} from '@/lib/dashboard_executive/types';
import { formatCsv, parseCsv } from './executive-dashboard-settings-utils';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  previewRows: ExecutiveProfilePreviewRow[];
  onAddOverride: () => void;
  onChangeOverride: (userId: string, patch: Partial<ExecutiveUserOverride>) => void;
  onRemoveOverride: (userId: string) => void;
  onSave: () => void;
  saving: boolean;
};

export function ExecutiveDashboardOverridesTab({
  config,
  previewRows,
  onAddOverride,
  onChangeOverride,
  onRemoveOverride,
  onSave,
  saving,
}: Props) {
  const userMap = new Map(previewRows.map((row) => [row.userId, row]));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Overrides por usuário</h3>
          <p className="text-sm text-slate-500">
            Use overrides apenas quando um usuário precisar enxergar algo diferente da regra padrão do cargo ou setor.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddOverride}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-4 w-4" />
          Novo override
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {config.overrides.length ? (
          config.overrides.map((override) => {
            const user = userMap.get(override.userId);

            return (
              <div key={override.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 xl:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário</label>
                    <select
                      value={override.userId}
                      onChange={(event) => onChangeOverride(override.userId, { userId: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {previewRows.map((row) => (
                        <option key={row.userId} value={row.userId}>
                          {row.userName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      {user?.department || 'Sem departamento'} {user?.jobTitle ? `• ${user.jobTitle}` : ''}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil</label>
                    <select
                      value={override.profileKey || ''}
                      onChange={(event) =>
                        onChangeOverride(override.userId, { profileKey: (event.target.value || null) as ExecutiveProfileKey | null })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Sem override</option>
                      {config.profiles.map((profile) => (
                        <option key={profile.key} value={profile.key}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Departamentos</label>
                    <input
                      value={formatCsv(override.departments)}
                      onChange={(event) => onChangeOverride(override.userId, { departments: parseCsv(event.target.value) })}
                      placeholder="Separar por vírgula"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Equipes</label>
                    <input
                      value={formatCsv(override.teams)}
                      onChange={(event) => onChangeOverride(override.userId, { teams: parseCsv(event.target.value) })}
                      placeholder="Separar por vírgula"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidades</label>
                    <div className="flex gap-3">
                      <input
                        value={formatCsv(override.units)}
                        onChange={(event) => onChangeOverride(override.userId, { units: parseCsv(event.target.value) })}
                        placeholder="Separar por vírgula"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveOverride(override.userId)}
                        className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nenhum override individual cadastrado.
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
          {saving ? 'Salvando...' : 'Salvar overrides'}
        </button>
      </div>
    </div>
  );
}
