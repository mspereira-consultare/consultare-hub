'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { RECRUITMENT_STAGES } from '@/lib/recrutamento/constants';
import type { RecruitmentCandidate } from '@/lib/recrutamento/types';
import {
  aiStatusLabel,
  aiStatusToneMap,
  formatCpf,
  managerReviewLabel,
  managerReviewToneMap,
  stageToneMap,
  StatusBadge,
} from './recruitment-ui';

type Props = {
  candidates: RecruitmentCandidate[];
  loading: boolean;
  onOpenCandidate: (candidate: RecruitmentCandidate) => void;
};

export function RecruitmentFunnelBoard({ candidates, loading, onOpenCandidate }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Funil de candidatos</h2>
          <p className="mt-1 text-xs text-slate-500">
            A mudança de etapa acontece no modal de detalhes para preservar histórico. A nova fase “Com a gerência” já está disponível no funil.
          </p>
        </div>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
      </div>
      <div className="grid gap-4 overflow-x-auto p-5 xl:grid-cols-8">
        {RECRUITMENT_STAGES.map((stage) => {
          const items = candidates.filter((candidate) => candidate.stage === stage.value);
          return (
            <div key={stage.value} className="min-w-[240px] rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stage.label}</h3>
                  <p className="mt-1 text-xs text-slate-400">{items.length} candidato(s)</p>
                </div>
                <StatusBadge tone={stageToneMap[stage.value]}>{items.length}</StatusBadge>
              </div>
              <div className="space-y-3 p-3">
                {items.length ? (
                  items.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => onOpenCandidate(candidate)}
                      className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#17407E]/40 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{candidate.fullName}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{candidate.jobTitle}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge tone={aiStatusToneMap[candidate.aiStatus]}>
                          {candidate.aiScore !== null ? `${candidate.aiScore}/100` : aiStatusLabel(candidate.aiStatus)}
                        </StatusBadge>
                        <StatusBadge tone={managerReviewToneMap[candidate.managerReviewStatus]}>
                          {candidate.stage === 'GERENCIA' ? 'Com a gerência' : managerReviewLabel(candidate.managerReviewStatus)}
                        </StatusBadge>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        <p>{formatCpf(candidate.cpf)}</p>
                        <p className="truncate">{candidate.email || candidate.phone || 'Contato não informado'}</p>
                        <p>{candidate.files.length} anexo(s) · {candidate.history.length} movimentação(ões)</p>
                      </div>
                      {candidate.convertedEmployeeId ? (
                        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                          Pré-admissão criada
                        </div>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400">Sem candidatos nesta etapa.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
