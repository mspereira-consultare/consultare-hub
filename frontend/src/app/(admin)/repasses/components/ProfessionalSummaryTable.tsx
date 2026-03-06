'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'ERROR' | 'NOT_PROCESSED';
  rowsCount: number;
  totalValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
};

type ProfessionalSummaryTableProps = {
  items: ProfessionalSummary[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
};

const currency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toBrDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR');
};

export function ProfessionalSummaryTable({
  items,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
}: ProfessionalSummaryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <section className="rounded-xl border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Profissionais (visão consolidada)
        </h3>
        <div className="text-[11px] text-slate-500">
          {start}-{end} de {total}
        </div>
      </header>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Profissional</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-right">Linhas</th>
              <th className="px-2 py-2 text-right">Total repasse</th>
              <th className="px-2 py-2 text-left">Último processamento</th>
              <th className="px-2 py-2 text-left">Observação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando profissionais...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  Nenhum profissional encontrado para os filtros.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.professionalId} className="border-t text-slate-700">
                  <td className="max-w-[280px] truncate px-2 py-1.5" title={item.professionalName}>
                    {item.professionalName}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{item.rowsCount}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(item.totalValue)}</td>
                  <td className="px-2 py-1.5">{toBrDateTime(item.lastProcessedAt)}</td>
                  <td className="max-w-[280px] truncate px-2 py-1.5" title={item.errorMessage || ''}>
                    {item.status === 'ERROR' ? (
                      <span className="inline-flex items-center gap-1 text-rose-700">
                        <AlertCircle size={12} />
                        {item.errorMessage || 'Erro sem detalhe.'}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t px-3 py-2 text-xs text-slate-600">
        <span>Página {page} de {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </footer>
    </section>
  );
}
