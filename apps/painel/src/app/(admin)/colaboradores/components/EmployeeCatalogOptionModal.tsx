'use client';

import { Loader2, Plus, X } from 'lucide-react';

type CatalogType = 'department' | 'jobTitle';

type Props = {
  open: boolean;
  type: CatalogType | null;
  value: string;
  saving: boolean;
  error: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const typeLabelMap: Record<CatalogType, { title: string; field: string; helper: string }> = {
  department: {
    title: 'Cadastrar novo departamento',
    field: 'Departamento',
    helper: 'Cadastre apenas nomes oficiais que deverão ser reutilizados em colaboradores e regras do dashboard.',
  },
  jobTitle: {
    title: 'Cadastrar novo cargo',
    field: 'Cargo',
    helper: 'Cadastre apenas cargos oficiais que deverão ser reutilizados em colaboradores e regras do dashboard.',
  },
};

export function EmployeeCatalogOptionModal({
  open,
  type,
  value,
  saving,
  error,
  onChangeValue,
  onClose,
  onSubmit,
}: Props) {
  if (!open || !type) return null;

  const labels = typeLabelMap[type];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{labels.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{labels.helper}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar cadastro de opção"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {labels.field}
            </label>
            <input
              autoFocus
              value={value}
              onChange={(event) => onChangeValue(event.target.value)}
              placeholder={`Ex.: ${type === 'department' ? 'Financeiro' : 'Supervisor de unidade'}`}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#053F74] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar opção
          </button>
        </div>
      </div>
    </div>
  );
}
