'use client';

import type { PayrollHoursBalanceMonthly } from '@/lib/payroll/types';

const formatBalance = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}h ${absolute % 60}min`;
};

export function PayrollHoursBalancePanel({ rows, loading }: { rows: PayrollHoursBalanceMonthly[]; loading: boolean }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Banco de horas</h2>
        <p className="mt-1 text-xs text-slate-500">Saldo mensal retornado pela Sólides/Tangerino para a competência filtrada.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">CPF</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Referência</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Carregando banco de horas...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Nenhum saldo sincronizado para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-800">{row.employeeName}</td>
                <td className="px-4 py-3">{row.employeeCpf || '-'}</td>
                <td className="px-4 py-3">{formatBalance(row.balanceMinutes)}</td>
                <td className="px-4 py-3">{row.referenceStart || '-'} a {row.referenceEnd || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
