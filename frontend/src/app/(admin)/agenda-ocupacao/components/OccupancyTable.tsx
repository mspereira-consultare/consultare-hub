"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type SortKey =
  | "especialidadeNome"
  | "agendamentosCount"
  | "horariosDisponiveisCount"
  | "horariosBloqueadosCount"
  | "capacidadeLiquidaCount"
  | "taxaOcupacaoComercialPct"
  | "taxaBloqueioPct";

type Row = {
  especialidadeId: number;
  especialidadeNome: string;
  agendamentosCount: number;
  horariosDisponiveisCount: number;
  horariosBloqueadosCount: number;
  capacidadeLiquidaCount: number;
  taxaOcupacaoComercialPct: number;
  taxaBloqueioPct: number;
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace(".", ",")}%`;

export function OccupancyTable({
  rows,
  loading,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: Row[];
  loading: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const iconFor = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-blue-700" />
    ) : (
      <ArrowDown size={14} className="text-blue-700" />
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[68vh]">
        <table className="min-w-[1120px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2 font-semibold">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("especialidadeNome")}
                >
                  Especialidade
                  {iconFor("especialidadeNome")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("agendamentosCount")}
                >
                  Agendamentos
                  {iconFor("agendamentosCount")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("horariosDisponiveisCount")}
                >
                  Horários Disponíveis
                  {iconFor("horariosDisponiveisCount")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("horariosBloqueadosCount")}
                >
                  Horários Bloqueados
                  {iconFor("horariosBloqueadosCount")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("capacidadeLiquidaCount")}
                >
                  Base Ofertável
                  {iconFor("capacidadeLiquidaCount")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("taxaOcupacaoComercialPct")}
                >
                  Tx. Ocupação (%)
                  {iconFor("taxaOcupacaoComercialPct")}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onSort("taxaBloqueioPct")}
                >
                  Taxa de Bloqueio (%)
                  {iconFor("taxaBloqueioPct")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Carregando dados...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.especialidadeId}-${idx}`} className="border-t border-slate-100 even:bg-slate-50/40">
                  <td className="px-3 py-2 text-slate-700">{row.especialidadeNome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.agendamentosCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.horariosDisponiveisCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.horariosBloqueadosCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.capacidadeLiquidaCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatPercent(row.taxaOcupacaoComercialPct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatPercent(row.taxaBloqueioPct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
