'use client';

import { ChevronRight } from 'lucide-react';
import type { PayrollPreviewRow } from '@/lib/payroll/types';
import { formatMoney, formatSheetInsalubrity } from './formatters';
import { PayrollColumnTooltip } from './PayrollColumnTooltip';
import { PayrollSectionHeader } from './PayrollSectionHeader';

export function PayrollPreviewTable({
  rows,
  loading,
  onOpenLine,
}: {
  rows: PayrollPreviewRow[];
  loading: boolean;
  onOpenLine: (lineId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PayrollSectionHeader
        title="Prévia da planilha contábil"
        description="Visualização da mesma estrutura que será exportada no XLSX usado pela contabilidade."
        countLabel={`${rows.length} linha(s)`}
        sources={['PAINEL']}
        className="border-b border-slate-200 px-4 py-3"
      />
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[1650px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left whitespace-nowrap"><PayrollColumnTooltip label="Nome funcionário" description="Nome que será exportado na planilha da contabilidade." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="E-mail" description="E-mail atual do colaborador para conferência na planilha." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="CPF" description="CPF do colaborador usado para identificação na planilha." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Centro de custo" description="Centro de custo atual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Função" description="Cargo ou função atual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Contrato" description="Regime contratual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Salário Base" description="Salário base levado para a linha exportada." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Insalubridade (%)" description="Percentual de insalubridade que será enviado na planilha contábil." source="Painel + cálculo da folha" align="center" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT a.d (R$)" description="Valor diário atual de vale-transporte no cadastro do colaborador." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT a.m (R$)" description="Total de VT calculado para a competência. Usa o valor mensal fixo do cadastro ou o valor diário multiplicado pelos dias elegíveis." source="Painel + cálculo da folha" formula="VT mensal fixo ou VT por dia x dias elegíveis" align="right" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Faltas (dias)" description="Quantidade de faltas consideradas no fechamento. A observação detalha as datas quando houver." source="Sólides + cálculo da folha" align="center" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Outros Descontos (R$)" description="Soma dos descontos que não têm coluna própria no modelo contábil." source="Painel + cálculo da folha" formula="Outros descontos fixos + D.V.T. + atraso + ajuste manual negativo" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Desc. Totalpass (R$)" description="Desconto de Totalpass exportado separadamente para a contabilidade." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Observação" description="Descrição contábil dos descontos aplicados, das faltas consideradas e de observações relevantes da linha." source="Painel + cálculo da folha" /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="px-4 py-16 text-center text-slate-500">
                  Carregando prévia da planilha...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-16 text-center text-slate-500">
                  Nenhuma linha disponível para a competência atual.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"
                  onClick={() => onOpenLine(row.lineId)}
                >
                  <td className="sticky left-0 z-[1] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">{row.employeeName}</div>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.email || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{row.employeeCpf || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{row.centerCost || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{row.roleName || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{row.contractType || '-'}</td>
                  <td className="px-3 py-3 text-right">{row.salaryBase === null ? '-' : formatMoney(row.salaryBase)}</td>
                  <td className="px-3 py-3 text-center">{formatSheetInsalubrity(row.insalubrityValue)}</td>
                  <td className="px-3 py-3 text-right">{row.vtPerDay === null ? '-' : formatMoney(row.vtPerDay)}</td>
                  <td className="px-3 py-3 text-right">{row.vtMonth === null ? '-' : formatMoney(row.vtMonth)}</td>
                  <td className="px-3 py-3 text-center">{row.absenceDays === null ? '-' : row.absenceDays}</td>
                  <td className="px-3 py-3 text-right">{row.otherDiscountsExport === null ? '-' : formatMoney(row.otherDiscountsExport)}</td>
                  <td className="px-3 py-3 text-right">{row.totalpassDiscountExport === null ? '-' : formatMoney(row.totalpassDiscountExport)}</td>
                  <td className="px-3 py-3 text-slate-600">{row.exportObservation || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
