import { Download, Plus, RefreshCw, Search } from 'lucide-react';

type SelectOption = { value: string; label: string };

type FiltersState = {
  search: string;
  unit: string;
  calibrationStatus: string;
  operationalStatus: string;
};

type EquipmentFiltersBarProps = {
  filters: FiltersState;
  units: SelectOption[];
  calibrationStatuses: SelectOption[];
  operationalStatuses: SelectOption[];
  canEdit: boolean;
  canRefresh: boolean;
  loading?: boolean;
  refreshing?: boolean;
  onChange: (next: FiltersState) => void;
  onRefresh: () => void;
  onExport: () => void;
  onCreate: () => void;
};

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';

export function EquipmentFiltersBar({
  filters,
  units,
  calibrationStatuses,
  operationalStatuses,
  canEdit,
  canRefresh,
  loading,
  refreshing,
  onChange,
  onRefresh,
  onExport,
  onCreate,
}: EquipmentFiltersBarProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr_auto_auto_auto] xl:items-end">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Busca</span>
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
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Unidade</span>
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
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status de calibração</span>
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
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Status operacional</span>
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

        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Recarregando' : 'Recarregar'}
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download size={16} />
          Exportar XLSX
        </button>

        <button
          type="button"
          onClick={onCreate}
          disabled={!canEdit}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17407E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#143768] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={16} />
          Novo equipamento
        </button>
      </div>
    </div>
  );
}
