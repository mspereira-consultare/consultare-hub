'use client';

import type { PayrollComparisonRow } from '@/lib/payroll/types';

export function PayrollComparisonTable({ rows, loading }: { rows: PayrollComparisonRow[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Comparação com a base do RH</h3>
        <p className="mt-1 text-xs text-slate-500">Mesma competência, mesmo recorte filtrado da base operacional.</p>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Colaborador</th>
              <th className="px-3 py-3 text-left">CPF</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Diferenças</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500">Carregando comparação...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500">Nenhuma divergência ou linha disponível para o recorte atual.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-medium text-slate-900">{row.employeeName}</td>
                <td className="px-3 py-3 text-slate-600">{row.employeeCpf || '-'}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === 'DIVERGENTE' ? 'bg-rose-100 text-rose-700' : row.status === 'IGUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {row.differences.length === 0 ? 'Sem diferenças no recorte comparado.' : (
                    <div className="space-y-1">
                      {row.differences.map((difference, index) => (
                        <div key={`${row.key}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                          <span className="font-semibold text-slate-800">{difference.field}:</span> sistema <strong>{difference.systemValue}</strong> | base <strong>{difference.referenceValue}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
