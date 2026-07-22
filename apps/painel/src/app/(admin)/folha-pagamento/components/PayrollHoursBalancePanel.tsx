'use client';

import type { PayrollHoursBalanceMonthly } from '@/lib/payroll/types';
import { PayrollTableShell } from './PayrollTableShell';

const formatBalance = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}h ${absolute % 60}min`;
};

export function PayrollHoursBalancePanel({ rows, loading }: { rows: PayrollHoursBalanceMonthly[]; loading: boolean }) {
  return (
    <PayrollTableShell
      title="Banco de horas"
      description="Saldo mensal retornado pela Sólides para a competência filtrada."
      countLabel={`${rows.length} registro(s)`}
      sources={['SOLIDES']}
    >
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Colaborador</th>
              <th className="px-4 py-3 whitespace-nowrap">CPF</th>
              <th className="px-4 py-3 whitespace-nowrap">Saldo</th>
              <th className="px-4 py-3 whitespace-nowrap">Referência</th>
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
    </PayrollTableShell>
  );
}
