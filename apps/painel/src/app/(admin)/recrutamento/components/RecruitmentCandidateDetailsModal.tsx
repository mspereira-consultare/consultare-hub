'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, Download, FileText, FileUp, Loader2, Users, X } from 'lucide-react';
import type { RecruitmentCandidate, RecruitmentCandidateAnalysisDetails, RecruitmentCandidateStage, RecruitmentJob } from '@/lib/recrutamento/types';
import type { CandidateDraftState } from './types';
import { RecruitmentAiAnalysisSection } from './RecruitmentAiAnalysisSection';
import {
  aiStatusLabel,
  aiStatusToneMap,
  Field,
  fieldClassName,
  formatCpf,
  formatDateTimeBr,
  formatFileSize,
  managerReviewLabel,
  managerReviewToneMap,
  stageLabel,
  stageToneMap,
  StatusBadge,
  textareaClassName,
} from './recruitment-ui';
import { RECRUITMENT_STAGES } from '@/lib/recrutamento/constants';

type Props = {
  candidate: RecruitmentCandidate;
  candidateDraft: CandidateDraftState;
  jobs: RecruitmentJob[];
  jobsById: Map<string, RecruitmentJob>;
  canEdit: boolean;
  saving: string;
  convertAdmissionDate: string;
  uploadFile: File | null;
  analysisDetails: RecruitmentCandidateAnalysisDetails | null;
  analysisLoading: boolean;
  analysisError: string;
  onClose: () => void;
  onSaveCandidate: () => void;
  onUploadCandidateFile: () => void;
  onReprocessCandidateAnalysis: () => void;
  onConvertCandidate: () => void;
  setCandidateDraft: Dispatch<SetStateAction<CandidateDraftState | null>>;
  setConvertAdmissionDate: Dispatch<SetStateAction<string>>;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
};

export function RecruitmentCandidateDetailsModal({
  candidate,
  candidateDraft,
  jobs,
  jobsById,
  canEdit,
  saving,
  convertAdmissionDate,
  uploadFile,
  analysisDetails,
  analysisLoading,
  analysisError,
  onClose,
  onSaveCandidate,
  onUploadCandidateFile,
  onReprocessCandidateAnalysis,
  onConvertCandidate,
  setCandidateDraft,
  setConvertAdmissionDate,
  setUploadFile,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={stageToneMap[candidate.stage]}>{stageLabel(candidate.stage)}</StatusBadge>
              <StatusBadge tone={managerReviewToneMap[candidate.managerReviewStatus]}>{managerReviewLabel(candidate.managerReviewStatus)}</StatusBadge>
              <StatusBadge tone={aiStatusToneMap[candidate.aiStatus]}>{aiStatusLabel(candidate.aiStatus)}</StatusBadge>
              {candidate.convertedEmployeeId ? <StatusBadge tone="border-indigo-200 bg-indigo-50 text-indigo-700">Cadastro oficial criado</StatusBadge> : null}
            </div>
            <h2 className="text-lg font-bold text-slate-800">{candidate.fullName}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {formatCpf(candidate.cpf)} · {candidate.email || 'E-mail não informado'} · {candidate.phone || 'Telefone não informado'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="space-y-5">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">Dados do candidato</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Vaga">
                    <select
                      value={candidateDraft.jobId}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, jobId: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit}
                    >
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Etapa">
                    <select
                      value={candidateDraft.stage}
                      onChange={(event) =>
                        setCandidateDraft((current) =>
                          current ? { ...current, stage: event.target.value as RecruitmentCandidateStage } : current,
                        )
                      }
                      className={fieldClassName}
                      disabled={!canEdit}
                    >
                      {RECRUITMENT_STAGES.map((stage) => (
                        <option key={stage.value} value={stage.value}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nome completo">
                    <input
                      value={candidateDraft.fullName}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, fullName: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="CPF">
                    <input
                      value={candidateDraft.cpf}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, cpf: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit || Boolean(candidate.convertedEmployeeId)}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      value={candidateDraft.email}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, email: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit || Boolean(candidate.convertedEmployeeId)}
                    />
                  </Field>
                  <Field label="Telefone">
                    <input
                      value={candidateDraft.phone}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, phone: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Origem">
                    <input
                      value={candidateDraft.source}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, source: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Motivo da movimentação">
                    <input
                      value={candidateDraft.historyNotes}
                      onChange={(event) => setCandidateDraft((current) => (current ? { ...current, historyNotes: event.target.value } : current))}
                      className={fieldClassName}
                      disabled={!canEdit}
                      placeholder="Opcional, entra no histórico"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Observações">
                      <textarea
                        value={candidateDraft.notes}
                        onChange={(event) => setCandidateDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
                        className={textareaClassName}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                </div>
                {canEdit ? (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={onSaveCandidate}
                      disabled={saving === 'candidate-detail'}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving === 'candidate-detail' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Salvar alterações
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">Anexos do candidato</h3>
                <p className="mt-1 text-xs text-slate-500">Currículo e arquivos de apoio ficam no processo seletivo. Documentos admissionais continuam no cadastro oficial.</p>
                {canEdit ? (
                  <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <input
                      type="file"
                      onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                      className="min-w-0 flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={onUploadCandidateFile}
                      disabled={!uploadFile || saving === 'candidate-file'}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving === 'candidate-file' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                      Anexar
                    </button>
                  </div>
                ) : null}
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {candidate.files.length ? (
                    candidate.files.map((file) => (
                      <div key={file.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{file.originalName}</p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.sizeBytes)} · {formatDateTimeBr(file.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => window.open(`/api/admin/recrutamento/files/${encodeURIComponent(file.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <FileText size={12} /> Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(`/api/admin/recrutamento/files/${encodeURIComponent(file.id)}/download`, '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <Download size={12} /> Baixar
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum anexo cadastrado para este candidato.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <RecruitmentAiAnalysisSection
                candidate={candidate}
                analysisDetails={analysisDetails}
                loading={analysisLoading}
                error={analysisError}
                canEdit={canEdit}
                saving={saving}
                onReprocess={onReprocessCandidateAnalysis}
              />

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">Etapa com a gerência</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Quando o RH quiser avançar para a segunda fase, mova o candidato para “Com a gerência”. A aprovação formal e a conexão com o painel executivo entram na próxima etapa do plano.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={managerReviewToneMap[candidate.managerReviewStatus]}>{managerReviewLabel(candidate.managerReviewStatus)}</StatusBadge>
                    {candidate.stage === 'GERENCIA' ? (
                      <StatusBadge tone="border-violet-200 bg-violet-50 text-violet-700">Em segunda etapa</StatusBadge>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <p>Solicitado em: <span className="font-semibold text-slate-800">{formatDateTimeBr(candidate.managerReviewRequestedAt)}</span></p>
                    <p className="mt-1">Solicitado por: <span className="font-semibold text-slate-800">{candidate.managerReviewRequestedBy || 'Ainda não registrado'}</span></p>
                    <p className="mt-1">Decisão em: <span className="font-semibold text-slate-800">{formatDateTimeBr(candidate.managerReviewDecidedAt)}</span></p>
                    <p className="mt-1">Decidido por: <span className="font-semibold text-slate-800">{candidate.managerReviewDecidedBy || 'Ainda não registrado'}</span></p>
                  </div>
                  <Field label="Contexto para a gerência">
                    <textarea
                      value={candidateDraft.managerReviewNotes}
                      onChange={(event) =>
                        setCandidateDraft((current) => (current ? { ...current, managerReviewNotes: event.target.value } : current))
                      }
                      className={textareaClassName}
                      disabled={!canEdit}
                      placeholder="Ex.: principais pontos da entrevista, riscos observados e contexto para a segunda etapa."
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Conversão para colaborador</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Ao aprovar, converta para pré-admissão. O cadastro oficial passa a ser a fonte da verdade para documentos, benefícios e folha.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    Vaga: <span className="font-semibold text-slate-800">{jobsById.get(candidate.jobId)?.title || candidate.jobTitle}</span>
                  </div>
                  {candidate.convertedEmployeeId ? (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
                      Este candidato já foi convertido em pré-admissão no cadastro oficial.
                    </div>
                  ) : candidate.stage === 'APROVADO' ? (
                    <>
                      <Field label="Data prevista de admissão">
                        <input
                          type="date"
                          value={convertAdmissionDate}
                          onChange={(event) => setConvertAdmissionDate(event.target.value)}
                          className={fieldClassName}
                          disabled={!canEdit}
                        />
                      </Field>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={onConvertCandidate}
                          disabled={saving === 'candidate-convert'}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving === 'candidate-convert' ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                          Converter em pré-admissão
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Mova o candidato para “Aprovado” antes de converter para colaborador.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">Histórico de movimentações</h3>
                <div className="mt-4 space-y-3">
                  {candidate.history.length ? (
                    candidate.history.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.action.replace(/_/g, ' ')}</span>
                          {item.toStage ? <StatusBadge tone={stageToneMap[item.toStage]}>{stageLabel(item.toStage)}</StatusBadge> : null}
                        </div>
                        {item.notes ? <p className="mt-1 text-xs text-slate-600">{item.notes}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">{formatDateTimeBr(item.createdAt)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">Sem histórico registrado.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
