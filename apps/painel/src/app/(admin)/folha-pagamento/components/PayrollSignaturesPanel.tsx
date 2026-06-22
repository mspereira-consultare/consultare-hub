'use client';

import type { PayrollSignatureMonthly } from '@/lib/payroll/types';
import { formatDateBr, statusLabelMap } from './formatters';
import { PayrollTableShell } from './PayrollTableShell';

const toneMap: Record<string, string> = {
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  PROCESSANDO: 'border-blue-200 bg-blue-50 text-blue-700',
  ASSINADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CONTESTADO: 'border-rose-200 bg-rose-50 text-rose-700',
  VIGENCIA_INVALIDA: 'border-slate-200 bg-slate-50 text-slate-700',
  ERRO: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELADO: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function PayrollSignaturesPanel({ rows, loading }: { rows: PayrollSignatureMonthly[]; loading: boolean }) {
  return (
    <PayrollTableShell
      title="Assinaturas"
      description="Pendências e status da assinatura mensal consultados na integração, sem acionar assinaturas por API nesta fase."
      countLabel={`${rows.length} registro(s)`}
      sources={['SOLIDES']}
    >
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Vigência</th>
              <th className="px-4 py-3">Assinado em</th>
              <th className="px-4 py-3">Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Carregando assinaturas...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum registro de assinatura encontrado para os filtros atuais.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{row.employeeName}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.employeeCpf || '-'}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${toneMap[row.status] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    {statusLabelMap[row.status] || row.status}
                  </span>
                </td>
                <td className="px-4 py-3">{row.documentType || '-'}</td>
                <td className="px-4 py-3">{formatDateBr(row.startDate)} a {formatDateBr(row.endDate)}</td>
                <td className="px-4 py-3">{formatDateBr(row.signedAt)}</td>
                <td className="px-4 py-3">{row.message || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PayrollTableShell>
  );
}
