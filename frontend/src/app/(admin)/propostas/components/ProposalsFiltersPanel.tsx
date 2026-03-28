import type { ReactNode } from 'react';
import { Building2, ChevronDown, ChevronRight, Clock, FilterX, FileText, Loader2, RefreshCw, Calendar } from 'lucide-react';
import { formatLastUpdate } from './formatters';

type Props = {
  title: string;
  subtitle: string;
  dateRange: { start: string; end: string };
  selectedUnit: string;
  selectedStatus: string;
  availableUnits: string[];
  availableStatuses: string[];
  filtersExpanded: boolean;
  hasActiveFilters?: boolean;
  extraFilters?: ReactNode;
  heartbeat?: { status?: string; last_run?: string | null } | null;
  isUpdating?: boolean;
  canRefresh?: boolean;
  onChangeDateRange: (next: { start: string; end: string }) => void;
  onChangeUnit: (value: string) => void;
  onChangeStatus: (value: string) => void;
  onToggleExpanded: () => void;
  onManualUpdate?: () => void;
  onResetFilters: () => void;
};

export function ProposalsFiltersPanel({
  title,
  subtitle,
  dateRange,
  selectedUnit,
  selectedStatus,
  availableUnits,
  availableStatuses,
  filtersExpanded,
  hasActiveFilters = selectedUnit !== 'all' || selectedStatus !== 'all',
  extraFilters,
  heartbeat,
  isUpdating = false,
  canRefresh = false,
  onChangeDateRange,
  onChangeUnit,
  onChangeStatus,
  onToggleExpanded,
  onManualUpdate,
  onResetFilters,
}: Props) {
  return (
    <div className="relative z-20 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {heartbeat && (
            <div className="hidden flex-col items-end border-r border-slate-200 pr-4 sm:flex">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Última sincronização</span>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Clock size={12} />
                {formatLastUpdate(heartbeat.last_run)}
                {heartbeat.status === 'ERROR' && <span className="ml-1 font-bold text-rose-500">Erro</span>}
              </div>
            </div>
          )}

          {canRefresh && onManualUpdate ? (
            <button
              onClick={onManualUpdate}
              disabled={isUpdating}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                isUpdating
                  ? 'cursor-wait border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              {isUpdating ? 'Sincronizando...' : 'Atualizar'}
            </button>
          ) : null}

          <button
            onClick={onToggleExpanded}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-50"
            title={filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
          >
            {filtersExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
      </div>

      {filtersExpanded && (
        <div className="border-t border-slate-100 p-6">
          <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Calendar size={14} />
                Período
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => onChangeDateRange({ ...dateRange, start: e.target.value })}
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                />
                <span className="text-slate-300">→</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => onChangeDateRange({ ...dateRange, end: e.target.value })}
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Building2 size={14} />
                Unidade
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => onChangeUnit(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todas as unidades</option>
                {availableUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Status da proposta</label>
              <select
                value={selectedStatus}
                onChange={(e) => onChangeStatus(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos os status</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              {hasActiveFilters && (
                <button
                  onClick={onResetFilters}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-100"
                  title="Limpar filtros"
                >
                  <FilterX size={16} />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {extraFilters ? <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">{extraFilters}</div> : null}
        </div>
      )}
    </div>
  );
}
