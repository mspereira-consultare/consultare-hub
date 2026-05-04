'use client';

import { AlertCircle, Bot, Loader2, RefreshCw } from 'lucide-react';
import type { RecruitmentCandidate, RecruitmentCandidateAnalysisDetails } from '@/lib/recrutamento/types';
import {
  aiStatusLabel,
  aiStatusToneMap,
  formatDateTimeBr,
  formatFileSize,
  StatusBadge,
} from './recruitment-ui';

type Props = {
  candidate: RecruitmentCandidate;
  analysisDetails: RecruitmentCandidateAnalysisDetails | null;
  loading: boolean;
  error: string;
  canEdit: boolean;
  saving: string;
  onReprocess: () => void;
};

const jobStatusLabel = (value: string | null | undefined) => {
  switch (value) {
    case 'PENDING':
      return 'Na fila';
    case 'RUNNING':
      return 'Em análise';
    case 'COMPLETED':
      return 'Concluído';
    case 'FAILED':
      return 'Com erro';
    case 'UNSUPPORTED':
      return 'Não suportado';
    default:
      return value || 'Sem job';
  }
};

const jobStatusTone = (value: string | null | undefined) => {
  switch (value) {
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'RUNNING':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'UNSUPPORTED':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
};

const extractionStatusLabel = (value: string | null | undefined) => {
  switch (value) {
    case 'PENDING':
      return 'Pendente';
    case 'EXTRAIDO':
      return 'Texto extraído';
    case 'ERRO':
      return 'Falhou';
    case 'NAO_SUPORTADO':
      return 'Não suportado';
    default:
      return value || 'Sem extração';
  }
};

const extractionStatusTone = (value: string | null | undefined) => {
  switch (value) {
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'EXTRAIDO':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'ERRO':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'NAO_SUPORTADO':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
};

export function RecruitmentAiAnalysisSection({
  candidate,
  analysisDetails,
  loading,
  error,
  canEdit,
  saving,
  onReprocess,
}: Props) {
  const latestJob = analysisDetails?.latestJob || null;
  const latestAnalysis = analysisDetails?.latestAnalysis || null;
  const latestExtraction = analysisDetails?.latestExtraction || null;
  const latestFile = analysisDetails?.latestFile || null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Triagem inicial com IA</h3>
          <p className="mt-1 text-xs text-slate-500">
            A análise compara o currículo com a descrição da vaga e gera nota de aderência, parecer breve e relatório de apoio ao RH.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onReprocess}
            disabled={saving === 'candidate-ai' || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving === 'candidate-ai' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reprocessar análise
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge tone={aiStatusToneMap[candidate.aiStatus]}>{aiStatusLabel(candidate.aiStatus)}</StatusBadge>
        <StatusBadge tone={jobStatusTone(latestJob?.status)}>{jobStatusLabel(latestJob?.status)}</StatusBadge>
        <StatusBadge tone={extractionStatusTone(latestExtraction?.extractionStatus)}>
          {extractionStatusLabel(latestExtraction?.extractionStatus)}
        </StatusBadge>
        {candidate.aiScore !== null ? <StatusBadge tone="border-blue-200 bg-blue-50 text-blue-700">{candidate.aiScore}/100</StatusBadge> : null}
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          Carregando detalhes da triagem...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Último job</p>
          <p className="mt-2 text-sm font-medium text-slate-800">{latestJob ? latestJob.id : 'Ainda não enfileirado'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {latestJob ? `${latestJob.attempts} tentativa(s) · ${formatDateTimeBr(latestJob.updatedAt)}` : 'O job aparece quando um currículo PDF ou DOCX entra na fila.'}
          </p>
          {latestJob?.lastError ? <p className="mt-2 text-xs leading-5 text-rose-700">{latestJob.lastError}</p> : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Currículo analisado</p>
          <p className="mt-2 text-sm font-medium text-slate-800">{latestFile ? latestFile.originalName : 'Nenhum arquivo vinculado'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {latestFile
              ? `${formatFileSize(latestFile.sizeBytes)} · enviado em ${formatDateTimeBr(latestFile.createdAt)}`
              : 'Anexe um currículo para habilitar a triagem automática.'}
          </p>
          {latestExtraction?.fallbackUsed ? (
            <p className="mt-2 text-xs text-slate-500">Fallback aplicado: {latestExtraction.fallbackUsed}</p>
          ) : null}
        </div>
      </div>

      {latestAnalysis ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-bold text-[#17407E] shadow-sm">
                {latestAnalysis.score ?? '--'}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Nota de aderência</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{latestAnalysis.shortVerdict || 'Sem parecer resumido.'}</p>
              </div>
            </div>
          </div>

          <AnalysisList title="Pontos fortes" items={latestAnalysis.strengths} />
          <AnalysisList title="Pontos de atenção" items={latestAnalysis.weaknesses} />
          <AnalysisList title="Requisitos com maior aderência" items={latestAnalysis.matchedRequirements} />
          <AnalysisList title="Lacunas ou requisitos menos aderentes" items={latestAnalysis.missingRequirements} />
          <AnalysisList title="Riscos e gaps" items={latestAnalysis.risksOrGaps} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidências</h4>
            {latestAnalysis.evidence.length ? (
              <div className="mt-3 space-y-3">
                {latestAnalysis.evidence.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.details}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Nenhuma evidência estruturada foi registrada.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatório detalhado</h4>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {latestAnalysis.detailedReport || 'Nenhum relatório detalhado disponível.'}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-start gap-3">
              <Bot size={18} className="mt-0.5 text-emerald-700" />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Próximo passo sugerido</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {latestAnalysis.recommendedNextStep || 'Sem recomendação registrada.'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Última análise em {formatDateTimeBr(latestAnalysis.createdAt)}.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : !loading ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
          A triagem ainda não gerou resultado. Quando houver um currículo suportado e o worker concluir a análise, a nota e o parecer aparecerão aqui.
        </div>
      ) : null}
    </section>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h4>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Sem itens destacados nesta seção.</p>
      )}
    </div>
  );
}
