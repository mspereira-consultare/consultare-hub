import type {
  RecruitmentCandidateStage,
  RecruitmentManagerReviewStatus,
} from '@/lib/recrutamento/types';

export type CandidateDraftState = {
  jobId: string;
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  source: string;
  stage: RecruitmentCandidateStage;
  notes: string;
  historyNotes: string;
  managerReviewStatus: RecruitmentManagerReviewStatus;
  managerReviewNotes: string;
};
