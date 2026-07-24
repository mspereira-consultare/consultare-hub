'use client';

import { ChevronRight } from 'lucide-react';
import type { PayrollLine } from '@/lib/payroll/types';
import { formatMoney, statusLabelMap } from './formatters';
import { PayrollColumnTooltip } from './PayrollColumnTooltip';
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
        <table className="min-w-[2000px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    aria-label="Selecionar todas as linhas visíveis"
                    onChange={(event) => onToggleAll(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                  />
                  <PayrollColumnTooltip
                    label="Colaborador"
                    description="Linha individual do fechamento mensal. Clique para abrir o detalhe, revisar o cálculo e salvar ajustes."
                    source="Painel + cálculo da folha"
                  />
                </div>
              </th>
              <th className="px-3 py-3 text-left whitespace-nowrap"><PayrollColumnTooltip label="Centro de custo" description="Centro de custo atual do colaborador usado para agrupamento e conferência gerencial." source="Painel" /></th>
              <th className="px-3 py-3 text-left whitespace-nowrap"><PayrollColumnTooltip label="Regime" description="Regime contratual do colaborador. Apenas não-PJ e ativos entram no fechamento." source="Painel" /></th>
              <th className="px-3 py-3 text-right whitespace-nowrap"><PayrollColumnTooltip label="Salário" description="Salário base considerado na linha da folha." source="Painel" /></th>
              <th className="px-3 py-3 text-right whitespace-nowrap"><PayrollColumnTooltip label="Insal." description="Valor de insalubridade aplicado na competência." source="Painel + cálculo da folha" formula="Percentual cadastrado x salário mínimo da regra da competência" align="right" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Dias trabalhados" description="Dias em que o colaborador realmente trabalhou e teve minutos trabalhados registrados no ponto. Este número não inclui folgas abonadas, férias nem outras justificativas sem trabalho efetivo." source="Sólides + cálculo da folha" formula="Conta somente dias com trabalho efetivo registrado" align="center" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Dias abon./just." description="Dias sem trabalho efetivo que foram aceitos pela folha como justificados ou abonados. Eles continuam contando para o salário, mas não entram automaticamente no cálculo de VT e VR." source="Sólides + cálculo da folha" formula="Conta apenas dias justificados/abonados que não viram falta" align="center" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Dias considerados" description="Total de dias que a folha usou para pagar a linha salarial desta competência. Aqui entram os dias realmente trabalhados e também os dias abonados ou justificados aceitos no fechamento." source="Sólides + cálculo da folha" formula="Dias trabalhados + dias abonados/justificados" align="center" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Faltas" description="Quantidade de faltas consideradas no recorte da competência." source="Sólides + cálculo da folha" align="center" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Atrasos (min)" description="Minutos de atraso considerados após aplicar a tolerância da regra da competência. Quando houver abatimento com banco, o atraso continua aparecendo aqui para auditoria." source="Sólides + cálculo da folha" formula="O abatimento com banco reduz apenas o desconto por atraso, sem apagar o atraso registrado" align="center" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT" description="Valor total de vale-transporte provisionado na competência. Dias apenas abonados ou justificados não entram nesse total por padrão." source="Painel + cálculo da folha" formula="Mensal fixo do cadastro ou valor por dia x dias elegíveis de benefício" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="D.V.T." description="Desconto efetivo de vale-transporte aplicado em folha. Ele é calculado sobre o VT provisionado, que por padrão considera somente dias elegíveis de benefício." source="Cálculo da folha" formula="Menor valor entre VT provisionado e teto percentual da competência" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Totalpass" description="Desconto fixo de Totalpass aplicado na linha." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Outros" description="Outros descontos fixos cadastrados para o colaborador." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Ajuste manual" description="Valor lançado manualmente no detalhe da linha. Valor positivo soma aos proventos; valor negativo entra como desconto adicional." source="Painel + cálculo da folha" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Proventos" description="Total positivo da linha antes dos descontos." source="Cálculo da folha" formula="Salário base + insalubridade + ajustes positivos" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Descontos" description="Total de descontos aplicados na linha." source="Cálculo da folha" formula="Faltas + atrasos cobrados após abatimento com banco, D.V.T., Totalpass, outros descontos e ajustes negativos" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Líquido" description="Resultado operacional da linha após somar proventos e subtrair descontos." source="Cálculo da folha" align="right" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Status" description="Situação atual da linha no fluxo de revisão e aprovação." source="Painel" /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={19} className="px-4 py-16 text-center text-slate-500">
                  Carregando linhas da folha...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={19} className="px-4 py-16 text-center text-slate-500">
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
                        {line.requiresRecalculation ? (
                          <div className="mt-1 text-[11px] font-medium text-amber-700">Base operacional alterada. Recalcule a linha.</div>
                        ) : null}
                      </div>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </td>
                  <td className="px-3 py-3">{line.centerCost || '-'}</td>
                  <td className="px-3 py-3">{line.contractType || '-'}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.salaryBase, { blankWhenMissingSalary: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.insalubrityAmount, { blankWhenMissingSalary: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.actualWorkedDays ?? line.daysWorked, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.justifiedDays ?? 0, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.daysWorked, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">{renderCountCell(line, line.absencesCount, { blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-center">
                    {hasPendingCode(line, 'MISSING_SOLIDES_LINK') ? (
                      '-'
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{line.lateMinutesOriginal} min</span>
                        {line.lateMinutesCompensated > 0 ? (
                          <span className="text-[11px] font-medium text-emerald-700">-{line.lateMinutesCompensated} min com banco</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.vtProvisioned, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.vtDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.totalpassDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.otherFixedDiscount, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right">{renderMoneyCell(line, line.adjustmentsAmount)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{renderMoneyCell(line, line.totalProvents, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{renderMoneyCell(line, line.totalDiscounts, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3 text-right font-bold text-[#17407E]">{renderMoneyCell(line, line.netOperational, { blankWhenMissingSalary: true, blankWhenMissingSolidesLink: true })}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          line.lineStatus === 'PENDENTE_CADASTRO' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusLabelMap[line.lineStatus] || line.lineStatus}
                      </span>
                      {line.requiresRecalculation ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                          Recalcular
                        </span>
                      ) : null}
                    </div>
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
