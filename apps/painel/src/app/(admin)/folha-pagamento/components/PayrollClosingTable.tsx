'use client';

import { ChevronRight } from 'lucide-react';
import type { PayrollLine } from '@/lib/payroll/types';
import { formatMoney, statusLabelMap } from './formatters';
import { PayrollSectionHeader } from './PayrollSectionHeader';

const hasPendingCode = (line: PayrollLine, code: 'MISSING_SALARY' | 'MISSING_SOLIDES_LINK') =>
  line.pendingDataCodes.includes(code);

const renderMoneyCell = (
  line: PayrollLine,
  value: number,
  options?: {
    blankWhenMissingSalary?: boolean;
    blankWhenMissingSolidesLink?: boolean;
  },
) => {
  if (options?.blankWhenMissingSalary && hasPendingCode(line, 'MISSING_SALARY')) return '-';
  if (options?.blankWhenMissingSolidesLink && hasPendingCode(line, 'MISSING_SOLIDES_LINK')) return '-';
  return formatMoney(value);
};

const renderCountCell = (
  line: PayrollLine,
  value: number,
  options?: {
    blankWhenMissingSolidesLink?: boolean;
  },
) => {
  if (options?.blankWhenMissingSolidesLink && hasPendingCode(line, 'MISSING_SOLIDES_LINK')) return '-';
  return String(value);
};

export function PayrollClosingTable({
  rows,
  loading,
  onOpenDetail,
  selectedLineIds,
  onToggleLine,
  onToggleAll,
}: {
  rows: PayrollLine[];
  loading: boolean;
  onOpenDetail: (line: PayrollLine) => void;
  selectedLineIds: string[];
  onToggleLine: (lineId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedLineIds.includes(row.id));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PayrollSectionHeader
        title="Fechamento operacional"
        description="Clique na linha para abrir a memória de cálculo, o ponto do período e a prévia do XLSX dos colaboradores elegíveis."
        countLabel={`${rows.length} linha(s)`}
        sources={['PAINEL', 'SOLIDES']}
        sourceNote="O cálculo é feito no Painel usando cadastros locais e insumos sincronizados da competência."
        className="border-b border-slate-200 px-4 py-3"
      />
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[1280px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    aria-label="Selecionar todas as linhas visíveis"
                    onChange={(event) => onToggleAll(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                  />
                  <span>Colaborador</span>
                </div>
              </th>
              <th className="px-3 py-3 text-left">Centro de custo</th>
              <th className="px-3 py-3 text-left">Regime</th>
              <th className="px-3 py-3 text-right">Salário</th>
              <th className="px-3 py-3 text-right">Insal.</th>
              <th className="px-3 py-3 text-center">Dias</th>
              <th className="px-3 py-3 text-center">Faltas</th>
              <th className="px-3 py-3 text-center">Atrasos (min)</th>
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
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(line.id)}
                          aria-label={`Selecionar ${line.employeeName}`}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onToggleLine(line.id, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{line.employeeName}</div>
                        <div className="text-xs text-slate-500">{line.employeeCpf || 'CPF não informado'}</div>
                      </div>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </td>
                  <td className="px-3 py-3">{line.centerCost || '-'}</td>
                  <td className="px-3 py-3">{line.contractType || '-'}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.salaryBase, { blankWhenMissingSalary: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.insalubrityAmount, { blankWhenMissingSalary: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.daysWorked, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.absencesCount, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.lateMinutes, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.vtProvisioned, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.vtDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.totalpassDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.otherFixedDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{renderMoneyCell(line, line.totalProvents, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{renderMoneyCell(line, line.totalDiscounts, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#17407E]">{renderMoneyCell(line, line.netOperational, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        line.lineStatus === 'PENDENTE_CADASTRO' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
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
