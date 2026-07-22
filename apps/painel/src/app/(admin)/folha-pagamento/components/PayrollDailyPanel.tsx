'use client';

import type { PayrollDailyControlRow } from '@/lib/payroll/types';
import { getPayrollSourceLabel } from './PayrollSourceBadge';
import { PayrollTableShell } from './PayrollTableShell';

const statusTone: Record<string, string> = {
  OK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ATENCAO: 'border-amber-200 bg-amber-50 text-amber-700',
  PENDENTE: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function PayrollDailyPanel({
  rows,
  loading,
  canAdjust = false,
  onOpenAdjustments,
}: {
  rows: PayrollDailyControlRow[];
  loading: boolean;
  canAdjust?: boolean;
  onOpenAdjustments?: (row: PayrollDailyControlRow) => void;
}) {
  return (
    <PayrollTableShell
      title="Controle diário"
      description="Atrasos, faltas, saldo do dia e alertas de pausa por colaborador na competência filtrada."
      countLabel={`${rows.length} registro(s)`}
      sources={['SOLIDES', 'PAINEL']}
      sourceNote="Métricas de ponto vêm da Sólides; vínculo, centro de custo e contrato continuam vindo do Painel."
    >
      <div className="overflow-x-auto">
        <table className="min-w-[1260px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">Centro de custo</th>
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3 text-center">Dias trabalhados</th>
              <th className="px-4 py-3 text-center">Faltas</th>
              <th className="px-4 py-3 text-center">Atraso</th>
              <th className="px-4 py-3 text-center">Planejado</th>
              <th className="px-4 py-3 text-center">Trabalhado</th>
              <th className="px-4 py-3 text-center">Saldo</th>
              <th className="px-4 py-3 text-center">Pausa excedida</th>
              <th className="px-4 py-3 text-center">Pendências</th>
              <th className="px-4 py-3 text-center">Origem do ponto</th>
              <th className="px-4 py-3">Status</th>
              {canAdjust ? <th className="px-4 py-3 text-right">Ajustes</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canAdjust ? 14 : 13} className="px-4 py-10 text-center text-slate-500">Carregando controle diário...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={canAdjust ? 14 : 13} className="px-4 py-10 text-center text-slate-500">Nenhum registro diário encontrado para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{row.employeeName}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.employeeCpf || '-'}</div>
                  {row.hasOverride ? (
                    <div className="mt-1 text-[11px] font-medium text-blue-700">{row.overrideSummary || 'Ajuste operacional aplicado'}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{row.centerCost || '-'}</td>
                <td className="px-4 py-3">{row.contractType || '-'}</td>
                <td className="px-4 py-3 text-center">{row.workedDays}</td>
                <td className="px-4 py-3 text-center">{row.absenceDays}</td>
                <td className="px-4 py-3 text-center">{row.lateMinutes} min</td>
                <td className="px-4 py-3 text-center">{row.plannedMinutes} min</td>
                <td className="px-4 py-3 text-center">{row.workedMinutes} min</td>
                <td className="px-4 py-3 text-center">{row.dayBalanceMinutes} min</td>
                <td className="px-4 py-3 text-center">{row.breakOverrunMinutes} min</td>
                <td className="px-4 py-3 text-center">{row.pendingAdjustments}</td>
                <td className="px-4 py-3 text-center text-xs text-slate-600">{row.pointSource ? getPayrollSourceLabel(row.pointSource) : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[row.status] || statusTone.OK}`}>
                    {row.status}
                  </span>
                </td>
                {canAdjust ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenAdjustments?.(row)}
                      disabled={!row.employeeId}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        row.employeeId
                          ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      }`}
                    >
                      Ajustar
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PayrollTableShell>
  );
}
