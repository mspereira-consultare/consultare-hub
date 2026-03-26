'use client';

import { Check, Copy, MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { compactProcedures, formatCurrency, formatLastUpdate, normalizePhoneForWhatsApp } from './formatters';
import type { ProposalDetailRow } from './types';

type Props = {
  rows: ProposalDetailRow[];
};

export function ProposalsDetailTable({ rows }: Props) {
  const [copiedProposalId, setCopiedProposalId] = useState<number | null>(null);

  const preparedRows = useMemo(
    () =>
      rows.map((row) => {
        const whatsappNumber = normalizePhoneForWhatsApp(row.patientPhone);
        const hasPhone = whatsappNumber.length > 0 && row.patientPhone !== 'Não informado';
        return {
          ...row,
          hasPhone,
          whatsappHref: hasPhone ? `https://wa.me/${whatsappNumber}` : '',
          compactProcedureSummary: compactProcedures(row.procedureSummary, row.procedureCount),
        };
      }),
    [rows],
  );

  const handleCopyPhone = async (proposalId: number, phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedProposalId(proposalId);
      window.setTimeout(() => setCopiedProposalId((current) => (current === proposalId ? null : current)), 1800);
    } catch {
      setCopiedProposalId(null);
    }
  };

  return (
    <div className="overflow-auto max-h-[620px] rounded-xl border border-slate-200">
      <table className="w-full min-w-[1120px] text-left bg-white">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          <tr>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Paciente</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="px-4 py-3">Procedimento(s)</th>
            <th className="px-4 py-3">Unidade</th>
            <th className="px-4 py-3">Profissional</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Última atualização</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {preparedRows.map((row) => (
            <tr key={row.proposalId} className="hover:bg-slate-50 align-top">
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.proposalDate || '-'}</td>
              <td className="px-4 py-3 min-w-[220px]">
                <div className="font-medium text-slate-800">{row.patientName}</div>
                <div className="text-xs text-slate-500">ID {row.patientId || '-'}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.patientPhone}</td>
              <td className="px-4 py-3 min-w-[280px]">
                <div className="font-medium text-slate-800" title={row.procedureSummary || undefined}>
                  {row.compactProcedureSummary}
                </div>
                <div className="text-xs text-slate-500">{row.procedureCount} item(ns)</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{row.unitName}</td>
              <td className="px-4 py-3 min-w-[220px] text-slate-700">{row.professionalName}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(row.totalValue)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{formatLastUpdate(row.proposalLastUpdate)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(row.proposalId, row.patientPhone)}
                    disabled={!row.hasPhone}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedProposalId === row.proposalId ? <Check size={13} /> : <Copy size={13} />}
                    {copiedProposalId === row.proposalId ? 'Copiado' : 'Copiar'}
                  </button>
                  <a
                    href={row.whatsappHref || '#'}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      if (!row.hasPhone) event.preventDefault();
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                      row.hasPhone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'
                    }`}
                  >
                    <MessageCircle size={13} />
                    WhatsApp
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
