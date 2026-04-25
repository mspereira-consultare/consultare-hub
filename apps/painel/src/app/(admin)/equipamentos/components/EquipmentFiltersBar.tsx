import { Search } from 'lucide-react';

type SelectOption = { value: string; label: string };

type FiltersState = {
  search: string;
  unit: string;
  equipmentType: string;
  calibrationStatus: string;
  operationalStatus: string;
};

type EquipmentFiltersBarProps = {
  filters: FiltersState;
  units: SelectOption[];
  equipmentTypes: SelectOption[];
  calibrationStatuses: SelectOption[];
  operationalStatuses: SelectOption[];
  onChange: (next: FiltersState) => void;
};

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';

export function EquipmentFiltersBar({
  filters,
  units,
  equipmentTypes,
  calibrationStatuses,
  operationalStatuses,
  onChange,
}: EquipmentFiltersBarProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(340px,1.6fr)_minmax(170px,0.8fr)_minmax(240px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)] xl:items-end">
      <label className="block md:col-span-2 xl:col-span-1">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Busca</span>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputClassName} pl-9`}
            placeholder="Descrição, identificação, série ou responsável"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tipo</span>
        <select
          className={inputClassName}
          value={filters.equipmentType}
          onChange={(event) => onChange({ ...filters, equipmentType: event.target.value })}
        >
          <option value="all">Todos os tipos</option>
          {equipmentTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Unidade</span>
        <select
          className={inputClassName}
          value={filters.unit}
          onChange={(event) => onChange({ ...filters, unit: event.target.value })}
        >
          <option value="all">Todas as unidades</option>
          {units.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status de calibração</span>
        <select
          className={inputClassName}
          value={filters.calibrationStatus}
          onChange={(event) => onChange({ ...filters, calibrationStatus: event.target.value })}
        >
          <option value="all">Todos</option>
          {calibrationStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status operacional</span>
        <select
          className={inputClassName}
          value={filters.operationalStatus}
          onChange={(event) => onChange({ ...filters, operationalStatus: event.target.value })}
        >
          <option value="all">Todos</option>
          {operationalStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
