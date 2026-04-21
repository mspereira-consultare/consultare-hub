import type { RecruitmentCandidateStage, RecruitmentJobStatus } from '@/lib/recrutamento/types';

export const RECRUITMENT_STAGES: Array<{ value: RecruitmentCandidateStage; label: string }> = [
  { value: 'RECEBIDO', label: 'Recebido' },
  { value: 'TRIAGEM', label: 'Triagem' },
  { value: 'ENTREVISTA', label: 'Entrevista' },
  { value: 'BANCO', label: 'Banco' },
  { value: 'APROVADO', label: 'Aprovado' },
  { value: 'RECUSADO', label: 'Recusado' },
  { value: 'CONTRATADO', label: 'Contratado' },
];

export const RECRUITMENT_JOB_STATUSES: Array<{ value: RecruitmentJobStatus; label: string }> = [
  { value: 'OPEN', label: 'Aberta' },
  { value: 'PAUSED', label: 'Pausada' },
  { value: 'CLOSED', label: 'Encerrada' },
];
