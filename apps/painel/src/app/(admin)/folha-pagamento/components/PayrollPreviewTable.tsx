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
        title="Prévia da planilha operacional"
        description="Visualização da mesma estrutura que será exportada no XLSX mensal do RH."
        countLabel={`${rows.length} linha(s)`}
        sources={['PAINEL']}
        className="border-b border-slate-200 px-4 py-3"
      />
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[1900px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left whitespace-nowrap"><PayrollColumnTooltip label="Nome funcionário" description="Nome que será exportado na planilha operacional." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="E-mail" description="E-mail atual do colaborador para conferência na planilha." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="CPF" description="CPF do colaborador usado para identificação na planilha." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Centro de custo" description="Centro de custo atual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Função" description="Cargo ou função atual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Contrato" description="Regime contratual do colaborador." source="Painel" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Salário Base" description="Salário base levado para a linha exportada." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Insalubridade" description="Percentual ou valor equivalente de insalubridade exportado na linha." source="Painel + cálculo da folha" align="center" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT por dia" description="Valor diário atual do cadastro do colaborador." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT total no mês" description="Total de VT calculado para a competência. Dias só abonados ou justificados não entram automaticamente nesse cálculo." source="Painel + cálculo da folha" formula="Mensal fixo do cadastro ou VT por dia x dias elegíveis de benefício" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="D.V.T." description="Desconto efetivo de VT exportado na planilha, calculado sobre o VT provisionado da competência." source="Cálculo da folha" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Outros Descontos" description="Outros descontos fixos cadastrados para o colaborador." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Desconto Totalpass" description="Desconto fixo de Totalpass da competência." source="Painel" align="right" /></th>
              <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Ajuste manual" description="Valor lançado manualmente na linha da folha. Valor positivo soma aos proventos; valor negativo entra como desconto adicional." source="Painel + cálculo da folha" align="right" /></th>
              <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Observação" description="Observações, pendências e ocorrências que ajudam na revisão final da linha." source="Painel + cálculo da folha" /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} className="px-4 py-16 text-center text-slate-500">
                  Carregando prévia da planilha...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-16 text-center text-slate-500">
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
                  <td className="px-3 py-3 text-right">{row.vtDiscount === null ? '-' : formatMoney(row.vtDiscount)}</td>
                  <td className="px-3 py-3 text-right">{row.otherDiscounts === null ? '-' : formatMoney(row.otherDiscounts)}</td>
                  <td className="px-3 py-3 text-right">{row.totalpassDiscount === null ? '-' : formatMoney(row.totalpassDiscount)}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(row.adjustmentsAmount)}</td>
                  <td className="px-3 py-3 text-slate-600">{row.observation || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
