'use client';

import type { PayrollVacationRow } from '@/lib/payroll/types';
import { formatDateBr } from './formatters';

export function PayrollVacationsPanel({ rows, loading }: { rows: PayrollVacationRow[]; loading: boolean }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Férias</h2>
        <p className="mt-1 text-xs text-slate-500">Ausências justificadas por férias sincronizadas da Sólides e, quando necessário, legado preservado para auditoria.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Observações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Carregando férias...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Nenhuma férias encontrada para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{row.employeeName}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.employeeCpf || '-'}</div>
                </td>
                <td className="px-4 py-3">{formatDateBr(row.dateStart)} a {formatDateBr(row.dateEnd)}</td>
                <td className="px-4 py-3">{row.source}</td>
                <td className="px-4 py-3">{row.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
