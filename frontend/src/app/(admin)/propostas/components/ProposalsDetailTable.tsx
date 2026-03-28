'use client';

import { ProposalsDetailRow } from './ProposalsDetailRow';
import type { ProposalDetailRow, ProposalFollowupOptions } from './types';

type Props = {
  rows: ProposalDetailRow[];
  canEdit: boolean;
  followupOptions: ProposalFollowupOptions;
  onSaved: (row: ProposalDetailRow) => void;
};

export function ProposalsDetailTable({ rows, canEdit, followupOptions, onSaved }: Props) {
  return (
    <div className="overflow-auto max-h-[72vh] rounded-xl border border-slate-200">
      <table className="w-full min-w-[1840px] text-left bg-white">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          <tr>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Paciente</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="px-4 py-3">Procedimento(s)</th>
            <th className="px-4 py-3">Unidade</th>
            <th className="px-4 py-3">Profissional</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Status da proposta</th>
            <th className="px-4 py-3">Conversão</th>
            <th className="px-4 py-3">Motivo</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3">Última edição</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <ProposalsDetailRow
              key={row.proposalId}
              row={row}
              canEdit={canEdit}
              followupOptions={followupOptions}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
