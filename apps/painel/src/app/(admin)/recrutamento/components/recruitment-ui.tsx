import type { ReactNode } from 'react';
import { RECRUITMENT_JOB_STATUSES, RECRUITMENT_STAGES } from '@/lib/recrutamento/constants';
import type {
  RecruitmentAiStatus,
  RecruitmentCandidateStage,
  RecruitmentJobStatus,
  RecruitmentManagerReviewStatus,
  RecruitmentSourceSystem,
  RecruitmentSyncStatus,
} from '@/lib/recrutamento/types';

export const fieldClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const textareaClassName =
  'min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const stageToneMap: Record<RecruitmentCandidateStage, string> = {
  RECEBIDO: 'border-slate-200 bg-slate-50 text-slate-700',
  TRIAGEM: 'border-blue-200 bg-blue-50 text-blue-700',
  ENTREVISTA: 'border-amber-200 bg-amber-50 text-amber-700',
  GERENCIA: 'border-violet-200 bg-violet-50 text-violet-700',
  BANCO: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  APROVADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  RECUSADO: 'border-rose-200 bg-rose-50 text-rose-700',
  CONTRATADO: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

export const jobStatusToneMap: Record<RecruitmentJobStatus, string> = {
  OPEN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PAUSED: 'border-amber-200 bg-amber-50 text-amber-700',
  CLOSED: 'border-slate-200 bg-slate-50 text-slate-600',
};

export const syncStatusToneMap: Record<RecruitmentSyncStatus, string> = {
  NAO_CONFIGURADO: 'border-slate-200 bg-slate-50 text-slate-700',
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  SINCRONIZADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ERRO: 'border-rose-200 bg-rose-50 text-rose-700',
};

export const aiStatusToneMap: Record<RecruitmentAiStatus, string> = {
  NAO_ANALISADO: 'border-slate-200 bg-slate-50 text-slate-700',
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  ANALISANDO: 'border-blue-200 bg-blue-50 text-blue-700',
  CONCLUIDO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ERRO: 'border-rose-200 bg-rose-50 text-rose-700',
  NAO_SUPORTADO: 'border-slate-200 bg-slate-100 text-slate-600',
};

export const managerReviewToneMap: Record<RecruitmentManagerReviewStatus, string> = {
  NAO_ENVIADO: 'border-slate-200 bg-slate-50 text-slate-700',
  PENDENTE: 'border-violet-200 bg-violet-50 text-violet-700',
  APROVADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DEVOLVIDO: 'border-amber-200 bg-amber-50 text-amber-700',
};

const syncStatusLabels: Record<RecruitmentSyncStatus, string> = {
  NAO_CONFIGURADO: 'Não configurado',
  PENDENTE: 'Pendente',
  SINCRONIZADO: 'Sincronizado',
  ERRO: 'Com erro',
};

const aiStatusLabels: Record<RecruitmentAiStatus, string> = {
  NAO_ANALISADO: 'Não analisado',
  PENDENTE: 'Pendente',
  ANALISANDO: 'Analisando',
  CONCLUIDO: 'Concluído',
  ERRO: 'Com erro',
  NAO_SUPORTADO: 'Não suportado',
};

const managerReviewLabels: Record<RecruitmentManagerReviewStatus, string> = {
  NAO_ENVIADO: 'Não enviado',
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  DEVOLVIDO: 'Devolvido ao RH',
};

const sourceSystemLabels: Record<RecruitmentSourceSystem, string> = {
  INTERNO: 'Interno',
  INDEED: 'Indeed',
};

export const stageLabel = (stage: RecruitmentCandidateStage) => RECRUITMENT_STAGES.find((item) => item.value === stage)?.label || stage;
export const jobStatusLabel = (status: RecruitmentJobStatus) => RECRUITMENT_JOB_STATUSES.find((item) => item.value === status)?.label || status;
export const syncStatusLabel = (status: RecruitmentSyncStatus) => syncStatusLabels[status] || status;
export const aiStatusLabel = (status: RecruitmentAiStatus) => aiStatusLabels[status] || status;
export const managerReviewLabel = (status: RecruitmentManagerReviewStatus) => managerReviewLabels[status] || status;
export const sourceSystemLabel = (sourceSystem: RecruitmentSourceSystem) => sourceSystemLabels[sourceSystem] || sourceSystem;

export const formatDateTimeBr = (value: string | null) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const formatCpf = (value: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || 'CPF não informado';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

export const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function StatusBadge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>;
}
