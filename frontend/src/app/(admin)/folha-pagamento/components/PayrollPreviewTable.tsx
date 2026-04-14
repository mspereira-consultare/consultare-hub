'use client';

import { ChevronRight } from 'lucide-react';
import type { PayrollPreviewRow } from '@/lib/payroll/types';
import { formatMoney, formatSheetInsalubrity } from './formatters';

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
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Prévia da planilha operacional</h3>
        <p className="mt-1 text-xs text-slate-500">Visualização da mesma estrutura que será exportada no XLSX mensal do RH.</p>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-[1520px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left">Nome funcionário</th>
              <th className="px-3 py-3 text-left">E-mail</th>
              <th className="px-3 py-3 text-left">CPF</th>
              <th className="px-3 py-3 text-left">Centro de custo</th>
              <th className="px-3 py-3 text-left">Função</th>
              <th className="px-3 py-3 text-left">Contrato</th>
              <th className="px-3 py-3 text-right">Salário Base</th>
              <th className="px-3 py-3 text-center">Insalubridade</th>
              <th className="px-3 py-3 text-right">VT a.d</th>
              <th className="px-3 py-3 text-right">VT a.m</th>
              <th className="px-3 py-3 text-right">D.V.T.</th>
              <th className="px-3 py-3 text-right">Outros Descontos</th>
              <th className="px-3 py-3 text-right">Desconto Totalpass</th>
              <th className="px-3 py-3 text-left">Observação</th>
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
                  <td className="px-3 py-3 text-right">{formatMoney(row.salaryBase)}</td>
                  <td className="px-3 py-3 text-center">{formatSheetInsalubrity(row.insalubrityValue)}</td>
                  <td className="px-3 py-3 text-right">{row.vtPerDay === null ? '-' : formatMoney(row.vtPerDay)}</td>
                  <td className="px-3 py-3 text-right">{row.vtMonth === null ? '-' : formatMoney(row.vtMonth)}</td>
                  <td className="px-3 py-3 text-right">{row.vtDiscount === null ? '-' : formatMoney(row.vtDiscount)}</td>
                  <td className="px-3 py-3 text-right">{row.otherDiscounts === null ? '-' : formatMoney(row.otherDiscounts)}</td>
                  <td className="px-3 py-3 text-right">{row.totalpassDiscount === null ? '-' : formatMoney(row.totalpassDiscount)}</td>
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
