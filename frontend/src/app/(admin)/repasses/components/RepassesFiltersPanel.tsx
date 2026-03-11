'use client';

import { Search } from 'lucide-react';

type StatusFilter = 'all' | 'success' | 'no_data' | 'skipped' | 'error' | 'not_processed';
type BooleanFilter = 'all' | 'yes' | 'no';
type ConsolidacaoStatusFilter = 'all' | 'consolidado' | 'nao_consolidado' | 'nao_recebido';

type RepassesFiltersPanelProps = {
  periodRef: string;
  statusFilter: StatusFilter;
  pageSize: number;
  searchDraft: string;
  hasPaymentMinimum: BooleanFilter;
  consolidacaoStatus: ConsolidacaoStatusFilter;
  hasDivergence: BooleanFilter;
  attendanceDateStart: string;
  attendanceDateEnd: string;
  patientName: string;
  advancedOpen: boolean;
  onPeriodRefChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onPageSizeChange: (value: number) => void;
  onSearchDraftChange: (value: string) => void;
  onApplySearch: () => void;
  onHasPaymentMinimumChange: (value: BooleanFilter) => void;
  onConsolidacaoStatusChange: (value: ConsolidacaoStatusFilter) => void;
  onHasDivergenceChange: (value: BooleanFilter) => void;
  onAttendanceDateStartChange: (value: string) => void;
  onAttendanceDateEndChange: (value: string) => void;
  onPatientNameChange: (value: string) => void;
  onToggleAdvanced: () => void;
};

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'success', label: 'Com dados' },
  { value: 'no_data', label: 'Sem produção' },
  { value: 'skipped', label: 'Ignorados' },
  { value: 'error', label: 'Com erro' },
  { value: 'not_processed', label: 'Não processados' },
];

const pageSizeOptions = [100, 200, 300, 500];

export function RepassesFiltersPanel({
  periodRef,
  statusFilter,
  pageSize,
  searchDraft,
  hasPaymentMinimum,
  consolidacaoStatus,
  hasDivergence,
  attendanceDateStart,
  attendanceDateEnd,
  patientName,
  advancedOpen,
  onPeriodRefChange,
  onStatusFilterChange,
  onPageSizeChange,
  onSearchDraftChange,
  onApplySearch,
  onHasPaymentMinimumChange,
  onConsolidacaoStatusChange,
  onHasDivergenceChange,
  onAttendanceDateStartChange,
  onAttendanceDateEndChange,
  onPatientNameChange,
  onToggleAdvanced,
}: RepassesFiltersPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[180px_180px_150px_1fr]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Período
          </label>
          <input
            type="month"
            value={periodRef}
            onChange={(e) => onPeriodRefChange(e.target.value)}
            className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Status (processamento)
          </label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
            className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Linhas
          </label>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) || 100)}
            className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}/página
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Profissional
          </label>
          <div className="flex h-10 items-center gap-2 rounded-lg border bg-white px-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={searchDraft}
              onChange={(e) => onSearchDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onApplySearch();
              }}
              placeholder="Buscar por nome"
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={onApplySearch}
              className="rounded border px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              Buscar
            </button>
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="text-xs font-semibold text-[#17407E] hover:underline"
        >
          {advancedOpen ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados'}
        </button>
      </div>

      {advancedOpen ? (
        <div className="grid grid-cols-1 gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Pagamento mínimo
            </label>
            <select
              value={hasPaymentMinimum}
              onChange={(e) => onHasPaymentMinimumChange(e.target.value as BooleanFilter)}
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="yes">Com pagamento mínimo</option>
              <option value="no">Sem pagamento mínimo</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Status consolidação
            </label>
            <select
              value={consolidacaoStatus}
              onChange={(e) => onConsolidacaoStatusChange(e.target.value as ConsolidacaoStatusFilter)}
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="consolidado">Consolidado</option>
              <option value="nao_consolidado">Não consolidado</option>
              <option value="nao_recebido">Não recebido</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Divergência
            </label>
            <select
              value={hasDivergence}
              onChange={(e) => onHasDivergenceChange(e.target.value as BooleanFilter)}
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="yes">Com divergência</option>
              <option value="no">Sem divergência</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Data atendimento (de)
            </label>
            <input
              type="date"
              value={attendanceDateStart}
              onChange={(e) => onAttendanceDateStartChange(e.target.value)}
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Data atendimento (até)
            </label>
            <input
              type="date"
              value={attendanceDateEnd}
              onChange={(e) => onAttendanceDateEndChange(e.target.value)}
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="xl:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Paciente
            </label>
            <input
              value={patientName}
              onChange={(e) => onPatientNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onApplySearch();
              }}
              placeholder="Filtrar por nome do paciente"
              className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
