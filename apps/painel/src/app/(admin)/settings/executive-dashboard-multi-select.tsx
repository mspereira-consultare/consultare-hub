'use client';

type Props = {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  helper?: string;
};

export function ExecutiveDashboardMultiSelect({ label, options, value, onChange, helper }: Props) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <select
        multiple
        value={value}
        onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
        className="min-h-[116px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{helper || 'Segure Ctrl ou Command para selecionar mais de uma opção.'}</p>
    </div>
  );
}
