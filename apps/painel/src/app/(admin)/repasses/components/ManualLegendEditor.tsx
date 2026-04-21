'use client';

import type { RepasseConsolidacaoMarkLegend } from '@/lib/repasses/types';

type ManualLegendEditorProps = {
  legend: RepasseConsolidacaoMarkLegend;
  disabled?: boolean;
  saving?: boolean;
  onChange: (next: RepasseConsolidacaoMarkLegend) => void;
  onSave: () => void;
};

const colorLabel: Record<keyof RepasseConsolidacaoMarkLegend, string> = {
  green: 'Verde',
  yellow: 'Amarelo',
  red: 'Vermelho',
};

export function ManualLegendEditor({
  legend,
  disabled,
  saving,
  onChange,
  onSave,
}: ManualLegendEditorProps) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        Legenda das cores
      </div>
      <div className="space-y-2">
        {(Object.keys(legend) as Array<keyof RepasseConsolidacaoMarkLegend>).map((key) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                key === 'green'
                  ? 'bg-emerald-500'
                  : key === 'yellow'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
              }`}
            />
            <span className="w-16 text-slate-600">{colorLabel[key]}</span>
            <input
              value={legend[key]}
              onChange={(e) => onChange({ ...legend, [key]: e.target.value })}
              disabled={disabled}
              className="h-8 flex-1 rounded border bg-white px-2 text-sm outline-none"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          className="rounded border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar legenda'}
        </button>
      </div>
    </div>
  );
}
