'use client';

import { PostConsultDetailRow } from './PostConsultDetailRow';
import type { PostConsultRow } from './types';

type Props = {
  rows: PostConsultRow[];
  canEdit: boolean;
  nonClosureReasons: Array<{ value: string; label: string }>;
  onSaved: () => void;
};

export function PostConsultDetailTable({ rows, canEdit, nonClosureReasons, onSaved }: Props) {
  return (
    <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[2500px] border-separate border-spacing-0 bg-white text-left">
        <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[120px] bg-slate-50 px-4 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]">Data</th>
            <th className="sticky left-[120px] top-0 z-30 min-w-[240px] bg-slate-50 px-4 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]">Paciente</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Unidade</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Atendente responsável</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Consulta</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Proposta</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Status da proposta</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Pós-consulta fechou?</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Data/hora do contato</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">2º contato fechou?</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Data/hora da ligação</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Motivo do não fechamento</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Observações</th>
            <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3">Última edição</th>
            <th className="sticky top-0 z-20 min-w-[90px] bg-slate-50 px-3 py-3 text-center">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <PostConsultDetailRow
              key={[
                row.eventKey,
                row.firstContactClosed ?? '',
                row.firstContactAt ?? '',
                row.secondContactClosed ?? '',
                row.secondContactAt ?? '',
                row.nonClosureReason ?? '',
                row.observation ?? '',
                row.updatedAt ?? '',
              ].join(':')}
              row={row}
              canEdit={canEdit}
              nonClosureReasons={nonClosureReasons}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
