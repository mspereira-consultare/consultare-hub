import type { EmploymentRegime } from '@/lib/colaboradores/constants';

export type RecruitmentJobStatus = 'OPEN' | 'PAUSED' | 'CLOSED';
export type RecruitmentCandidateStage =
  | 'RECEBIDO'
  | 'TRIAGEM'
  | 'ENTREVISTA'
  | 'GERENCIA'
  | 'BANCO'
  | 'APROVADO'
  | 'RECUSADO'
  | 'CONTRATADO';
export type RecruitmentSourceSystem = 'INTERNO' | 'INDEED';
export type RecruitmentSyncStatus = 'NAO_CONFIGURADO' | 'PENDENTE' | 'SINCRONIZADO' | 'ERRO';
export type RecruitmentAiStatus = 'NAO_ANALISADO' | 'PENDENTE' | 'ANALISANDO' | 'CONCLUIDO' | 'ERRO' | 'NAO_SUPORTADO';
export type RecruitmentManagerReviewStatus = 'NAO_ENVIADO' | 'PENDENTE' | 'APROVADO' | 'DEVOLVIDO';

export type RecruitmentJob = {
  id: string;
  title: string;
  department: string | null;
  unitName: string | null;
  employmentRegime: EmploymentRegime;
  status: RecruitmentJobStatus;
  ownerName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
  sourceSystem: RecruitmentSourceSystem;
  sourceExternalId: string | null;
  syncStatus: RecruitmentSyncStatus;
  lastSyncedAt: string | null;
  externalPayloadJson: string | null;
  notes: string | null;
  totalCandidates: number;
  activeCandidates: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentCandidateFile = {
  id: string;
  candidateId: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};

export type RecruitmentCandidateHistory = {
  id: string;
  candidateId: string;
  action: string;
  fromStage: RecruitmentCandidateStage | null;
  toStage: RecruitmentCandidateStage | null;
  notes: string | null;
  actorUserId: string;
  createdAt: string;
};

export type RecruitmentCandidate = {
  id: string;
  jobId: string;
  jobTitle: string;
  fullName: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  stage: RecruitmentCandidateStage;
  source: string | null;
  sourceSystem: RecruitmentSourceSystem;
  sourceExternalId: string | null;
  applicationExternalId: string | null;
  aiStatus: RecruitmentAiStatus;
  aiScore: number | null;
  aiLastAnalyzedAt: string | null;
  managerReviewStatus: RecruitmentManagerReviewStatus;
  managerReviewRequestedAt: string | null;
  managerReviewRequestedBy: string | null;
  managerReviewDecidedAt: string | null;
  managerReviewDecidedBy: string | null;
  managerReviewNotes: string | null;
  notes: string | null;
  convertedEmployeeId: string | null;
  files: RecruitmentCandidateFile[];
  history: RecruitmentCandidateHistory[];
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentDashboard = {
  jobs: RecruitmentJob[];
  candidates: RecruitmentCandidate[];
  summary: {
    openJobs: number;
    totalCandidates: number;
    activeCandidates: number;
    approvedCandidates: number;
    managerPendingCandidates: number;
    convertedCandidates: number;
  };
};

export type RecruitmentJobInput = {
  title: string;
  department?: string | null;
  unitName?: string | null;
  employmentRegime?: EmploymentRegime | null;
  status?: RecruitmentJobStatus | null;
  ownerName?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  requirementsText?: string | null;
  benefitsText?: string | null;
  sourceSystem?: RecruitmentSourceSystem | null;
  sourceExternalId?: string | null;
  syncStatus?: RecruitmentSyncStatus | null;
  lastSyncedAt?: string | null;
  externalPayloadJson?: string | null;
  notes?: string | null;
};

export type RecruitmentCandidateInput = {
  jobId: string;
  fullName: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  stage?: RecruitmentCandidateStage | null;
  source?: string | null;
  sourceSystem?: RecruitmentSourceSystem | null;
  sourceExternalId?: string | null;
  applicationExternalId?: string | null;
  aiStatus?: RecruitmentAiStatus | null;
  aiScore?: number | null;
  aiLastAnalyzedAt?: string | null;
  managerReviewStatus?: RecruitmentManagerReviewStatus | null;
  managerReviewRequestedAt?: string | null;
  managerReviewRequestedBy?: string | null;
  managerReviewDecidedAt?: string | null;
  managerReviewDecidedBy?: string | null;
  managerReviewNotes?: string | null;
  notes?: string | null;
};
