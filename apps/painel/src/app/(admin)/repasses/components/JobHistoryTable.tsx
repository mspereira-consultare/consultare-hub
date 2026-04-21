'use client';

import { Loader2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

type RepasseJobRow = {
  id: string;
  periodRef: string;
  status: string;
  createdAt: string;
  requestedBy: string;
  scope?: string;
};

type JobHistoryTableProps = {
  title: string;
  jobs: RepasseJobRow[];
  loading: boolean;
  mode: 'sync' | 'pdf';
};

const toBrDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR');
};

export function JobHistoryTable({ title, jobs, loading, mode }: JobHistoryTableProps) {
  return (
    <section className="rounded-xl border bg-white">
      <header className="border-b bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      </header>
      <div className="max-h-[280px] overflow-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Status</th>
              {mode === 'pdf' && <th className="px-2 py-2 text-left">Escopo</th>}
              <th className="px-2 py-2 text-left">Período</th>
              <th className="px-2 py-2 text-left">Solicitado por</th>
              <th className="px-2 py-2 text-left">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={mode === 'pdf' ? 5 : 4}
                  className="px-2 py-4 text-center text-slate-500"
                >
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando...
                  </span>
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={mode === 'pdf' ? 5 : 4}
                  className="px-2 py-4 text-center text-slate-500"
                >
                  Nenhum job encontrado.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-t text-slate-700">
                  <td className="px-2 py-1.5">
                    <StatusBadge status={job.status} />
                  </td>
                  {mode === 'pdf' && <td className="px-2 py-1.5">{job.scope || '-'}</td>}
                  <td className="px-2 py-1.5">{job.periodRef}</td>
                  <td className="max-w-[180px] truncate px-2 py-1.5" title={job.requestedBy}>
                    {job.requestedBy || '-'}
                  </td>
                  <td className="px-2 py-1.5">{toBrDateTime(job.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
