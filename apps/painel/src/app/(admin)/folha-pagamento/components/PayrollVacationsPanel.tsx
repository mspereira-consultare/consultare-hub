'use client';

import type { PayrollVacationRow } from '@/lib/payroll/types';
import { formatDateBr } from './formatters';
import { PayrollSourceBadge } from './PayrollSourceBadge';
import { PayrollTableShell } from './PayrollTableShell';

export function PayrollVacationsPanel({ rows, loading }: { rows: PayrollVacationRow[]; loading: boolean }) {
  return (
    <PayrollTableShell
      title="Férias"
      description="Ausências justificadas por férias sincronizadas da Sólides para conferência do fechamento mensal."
      countLabel={`${rows.length} registro(s)`}
      sources={['SOLIDES']}
      sourceNote="A base ativa desta etapa vem da sincronização da Sólides."
    >
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
                <td className="px-4 py-3"><PayrollSourceBadge source={row.source} /></td>
                <td className="px-4 py-3">
                  <div>{row.notes || '-'}</div>
                  {row.hasOverride ? (
                    <div className="mt-2 text-xs text-blue-700">
                      {row.overrideSummary || 'Ajuste operacional aplicado'}
                      {row.originalOccurrenceType && row.effectiveOccurrenceType && row.originalOccurrenceType !== row.effectiveOccurrenceType
                        ? ` · ${row.originalOccurrenceType} → ${row.effectiveOccurrenceType}`
                        : ''}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PayrollTableShell>
  );
}
