'use client';

import { Search } from 'lucide-react';
import type { ExecutiveProfilePreviewRow } from '@/lib/dashboard_executive/types';
import {
  cn,
  normalizeText,
  resolutionSourceClass,
  resolutionSourceLabel,
} from './executive-dashboard-settings-utils';

type Props = {
  previewRows: ExecutiveProfilePreviewRow[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
};

export function ExecutiveDashboardPreviewTab({ previewRows, searchTerm, onSearchTermChange }: Props) {
  const filteredRows = previewRows.filter((row) => {
    const haystack = normalizeText(
      `${row.userName} ${row.department || ''} ${row.jobTitle || ''} ${row.profileLabel || ''} ${row.role}`
    );
    return !searchTerm || haystack.includes(normalizeText(searchTerm));
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-900">Preview de enquadramento</h3>
        <p className="text-sm text-slate-500">
          Confira como cada usuário do painel está sendo classificado pelas regras atuais.
        </p>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar por nome, cargo, departamento ou perfil"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="overflow-x-auto px-5 py-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-3 pr-4 font-medium">Usuário</th>
              <th className="pb-3 pr-4 font-medium">Função</th>
              <th className="pb-3 pr-4 font-medium">Departamento / cargo</th>
              <th className="pb-3 pr-4 font-medium">Perfil</th>
              <th className="pb-3 pr-4 font-medium">Origem</th>
              <th className="pb-3 font-medium">Acesso ao dashboard</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.userId} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-900">{row.userName}</div>
                  <p className="mt-1 text-xs text-slate-500">{row.status}</p>
                </td>
                <td className="py-3 pr-4 text-slate-600">{row.role}</td>
                <td className="py-3 pr-4 text-slate-600">
                  <div>{row.department || 'Sem departamento'}</div>
                  <p className="mt-1 text-xs text-slate-500">{row.jobTitle || 'Sem cargo'}</p>
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-900">{row.profileLabel || 'Sem perfil'}</div>
                  {row.units.length ? <p className="mt-1 text-xs text-slate-500">{row.units.join(', ')}</p> : null}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                      resolutionSourceClass[row.resolutionSource]
                    )}
                  >
                    {resolutionSourceLabel[row.resolutionSource]}
                  </span>
                </td>
                <td className="py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                      row.hasDashboardAccess
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    )}
                  >
                    {row.hasDashboardAccess ? 'Permitido' : 'Sem acesso'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!filteredRows.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nenhum usuário encontrado com esse filtro.
          </div>
        ) : null}
      </div>
    </div>
  );
}
