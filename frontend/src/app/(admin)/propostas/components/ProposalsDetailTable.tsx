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
    <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1960px] bg-white text-left">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-20 min-w-[120px] bg-slate-50 px-4 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]">Data</th>
            <th className="sticky left-[120px] z-20 min-w-[240px] bg-slate-50 px-4 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]">Paciente</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="min-w-[380px] px-4 py-3">Procedimento(s)</th>
            <th className="px-4 py-3">Unidade</th>
            <th className="px-4 py-3">Profissional</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="min-w-[250px] px-4 py-3">Status da proposta</th>
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
