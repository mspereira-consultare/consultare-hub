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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative">
      <div className="p-6 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{title}</h1>
            <p className="text-slate-500 text-xs">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {heartbeat && (
            <div className="hidden sm:flex flex-col items-end border-r border-slate-200 pr-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Última sincronização</span>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Clock size={12} />
                {formatLastUpdate(heartbeat.last_run)}
                {heartbeat.status === 'ERROR' && <span className="text-rose-500 font-bold ml-1">Erro</span>}
              </div>
            </div>
          )}

          {canRefresh && onManualUpdate ? (
            <button
              onClick={onManualUpdate}
              disabled={isUpdating}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all border whitespace-nowrap ${
                isUpdating
                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-wait'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              {isUpdating ? 'Sincronizando...' : 'Atualizar'}
            </button>
          ) : null}

          <button
            onClick={onToggleExpanded}
            className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600"
            title={filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
          >
            {filtersExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
      </div>

      {filtersExpanded && (
        <div className="p-6 border-t border-slate-100">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                <Calendar size={14} />
                Período
              </label>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => onChangeDateRange({ ...dateRange, start: e.target.value })}
                  className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                />
                <span className="text-slate-300">→</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => onChangeDateRange({ ...dateRange, end: e.target.value })}
                  className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                <Building2 size={14} />
                Unidade
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => onChangeUnit(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Status da proposta</label>
              <select
                value={selectedStatus}
                onChange={(e) => onChangeStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
              {(selectedUnit !== 'all' || selectedStatus !== 'all') && (
                <button
                  onClick={onResetFilters}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-200 hover:bg-rose-100 transition font-medium text-sm"
                  title="Limpar filtros"
                >
                  <FilterX size={16} />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
