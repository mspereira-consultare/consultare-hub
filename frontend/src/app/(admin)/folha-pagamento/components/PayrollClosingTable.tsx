'use client';

import { ChevronRight } from 'lucide-react';
import type { PayrollLine } from '@/lib/payroll/types';
import { formatMoney, statusLabelMap } from './formatters';

export function PayrollClosingTable({
  rows,
  loading,
  onOpenDetail,
}: {
  rows: PayrollLine[];
  loading: boolean;
  onOpenDetail: (line: PayrollLine) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Fechamento operacional</h3>
        <p className="mt-1 text-xs text-slate-500">Clique na linha para abrir a memória de cálculo, o ponto do período e a prévia do XLSX.</p>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[1280px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left">Colaborador</th>
              <th className="px-3 py-3 text-left">Centro de custo</th>
              <th className="px-3 py-3 text-left">Contrato</th>
              <th className="px-3 py-3 text-right">Salário</th>
              <th className="px-3 py-3 text-right">Insal.</th>
              <th className="px-3 py-3 text-center">Dias</th>
              <th className="px-3 py-3 text-center">Faltas</th>
              <th className="px-3 py-3 text-center">Atrasos</th>
              <th className="px-3 py-3 text-right">VT</th>
              <th className="px-3 py-3 text-right">D.V.T.</th>
              <th className="px-3 py-3 text-right">Totalpass</th>
              <th className="px-3 py-3 text-right">Outros</th>
              <th className="px-3 py-3 text-right">Proventos</th>
              <th className="px-3 py-3 text-right">Descontos</th>
              <th className="px-3 py-3 text-right">Líquido</th>
              <th className="px-3 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={16} className="px-4 py-16 text-center text-slate-500">
                  Carregando linhas da folha...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-16 text-center text-slate-500">
                  Nenhuma linha gerada para a competência atual.
                </td>
              </tr>
            ) : (
              rows.map((line) => (
                <tr
                  key={line.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"
                  onClick={() => onOpenDetail(line)}
                >
                  <td className="sticky left-0 z-[1] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{line.employeeName}</div>
                        <div className="text-xs text-slate-500">{line.employeeCpf || 'CPF não informado'}</div>
                      </div>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </td>
                  <td className="px-3 py-3">{line.centerCost || '-'}</td>
                  <td className="px-3 py-3">{line.contractType || '-'}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.salaryBase)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.insalubrityAmount)}</td>
                  <td className="px-3 py-3 text-center">{line.daysWorked}</td>
                  <td className="px-3 py-3 text-center">{line.absencesCount}</td>
                  <td className="px-3 py-3 text-center">{line.lateMinutes}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.vtProvisioned)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.vtDiscount)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.totalpassDiscount)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(line.otherFixedDiscount)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(line.totalProvents)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(line.totalDiscounts)}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#17407E]">{formatMoney(line.netOperational)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {statusLabelMap[line.lineStatus] || line.lineStatus}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
