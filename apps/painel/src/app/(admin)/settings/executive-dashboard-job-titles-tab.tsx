'use client';

import { Search } from 'lucide-react';
import type { ExecutiveConfigurationSnapshot } from '@/lib/dashboard_executive/types';
import { ExecutiveDashboardHelpCallout } from './executive-dashboard-help-callout';
import { normalizeText } from './executive-dashboard-settings-utils';

type Props = {
  config: ExecutiveConfigurationSnapshot;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onChangeJobTitleGroup: (catalogId: string, groupId: string | null) => void;
  onSave: () => void;
  saving: boolean;
};

export function ExecutiveDashboardJobTitlesTab({
  config,
  searchTerm,
  onSearchTermChange,
  onChangeJobTitleGroup,
  onSave,
  saving,
}: Props) {
  const visibleJobTitles = config.jobTitles.filter((jobTitle) => {
    const haystack = normalizeText(
      `${jobTitle.name} ${jobTitle.executiveGroupLabel || ''} ${jobTitle.linkedEmployeesCount} ${jobTitle.linkedUsersCount}`
    );
    return !searchTerm || haystack.includes(normalizeText(searchTerm));
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-900">Cargos e grupos</h3>
        <p className="text-sm text-slate-500">
          Faça a atribuição em massa do grupo executivo no cargo mestre. Essa será a origem automática do dashboard.
        </p>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar cargo por nome ou grupo atual"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <div className="mt-4">
          <ExecutiveDashboardHelpCallout title="Origem automática do enquadramento" variant="warning">
            Se um cargo mestre ficar sem grupo, o usuário pode ter acesso ao dashboard e ainda assim aparecer sem perfil.
            Sempre corrija primeiro o cargo aqui antes de partir para exceções individuais.
          </ExecutiveDashboardHelpCallout>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto px-5 py-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-3 pr-4 font-medium">Cargo mestre</th>
              <th className="pb-3 pr-4 font-medium">Grupo executivo</th>
              <th className="pb-3 pr-4 font-medium">Colaboradores</th>
              <th className="pb-3 font-medium">Usuários</th>
            </tr>
          </thead>
          <tbody>
            {visibleJobTitles.map((jobTitle) => (
              <tr key={jobTitle.catalogId} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-900">{jobTitle.name}</div>
                  {!jobTitle.executiveGroupId ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Sem grupo atribuído</p>
                  ) : null}
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={jobTitle.executiveGroupId || ''}
                    onChange={(event) => onChangeJobTitleGroup(jobTitle.catalogId, event.target.value || null)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Sem grupo</option>
                    {config.groups
                      .filter((group) => group.isActive)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label}
                        </option>
                      ))}
                  </select>
                  <p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-500">
                    Escolha a família executiva que melhor representa a visão desse cargo no dashboard.
                  </p>
                </td>
                <td className="py-3 pr-4 text-slate-600">{jobTitle.linkedEmployeesCount}</td>
                <td className="py-3 text-slate-600">{jobTitle.linkedUsersCount}</td>
              </tr>
            ))}
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
          {saving ? 'Salvando...' : 'Salvar cargos'}
        </button>
      </div>
    </div>
  );
}
