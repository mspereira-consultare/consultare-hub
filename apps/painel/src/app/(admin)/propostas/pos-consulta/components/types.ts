export type PostConsultProposalItem = {
  proposalId: number;
  proposalDate: string;
  status: string;
  unitName: string;
  professionalName: string;
  totalValue: number;
};

export type PostConsultRow = {
  eventKey: string;
  patientKey: string;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  consultDate: string;
  consultUnit: string;
  consultProcedure: string;
  attendantResponsible: string;
  billingSourceRowCount: number;
  proposalCount: number;
  proposalStatusSummary: string;
  proposalStatuses: string[];
  proposals: PostConsultProposalItem[];
  nonClosureReason: string | null;
  nonClosureReasonLabel: string | null;
  autoClosedByExecution: boolean;
  effectiveClosed: boolean;
  executedProposalCount: number;
  executedProposalValue: number;
  totalProposalValue: number;
  firstContactClosed: boolean | null;
  firstContactAt: string | null;
  secondContactClosed: boolean | null;
  secondContactAt: string | null;
  observation: string | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
  closed: boolean;
};

export type PostConsultSummary = {
  totalEvents: number;
  totalProposals: number;
  totalClosedEvents: number;
  conversionRate: number;
  pendingPatients: number;
  afterSecondNoClosePatients: number;
  executedProposalValue: number;
};

export type PostConsultDetailResponse = {
  summary: PostConsultSummary;
  rows: PostConsultRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};

export type PostConsultOptions = {
  canEdit: boolean;
  canRefresh: boolean;
  availableUnits: string[];
  availableStatuses: string[];
  availableResponsibles: string[];
  nonClosureReasons: Array<{ value: string; label: string }>;
  heartbeat: {
    status?: string;
    last_run?: string | null;
    details?: string | null;
  } | null;
};

export type PostConsultFollowupSaveResult = {
  eventKey: string;
  firstContactClosed: boolean | null;
  firstContactAt: string | null;
  secondContactClosed: boolean | null;
  secondContactAt: string | null;
  nonClosureReason: string | null;
  nonClosureReasonLabel: string | null;
  observation: string | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
  effectiveClosed: boolean;
  closed: boolean;
};

export type PostConsultRankingRow = {
  attendantResponsible: string;
  totalEvents: number;
  totalClosedEvents: number;
  conversionRate: number;
  pendingPatients: number;
  afterSecondNoClosePatients: number;
  totalProposals: number;
  executedProposalValue: number;
};

export type PostConsultRankingSummary = {
  totalAttendants: number;
  totalEvents: number;
  totalClosedEvents: number;
  conversionRate: number;
  executedProposalValue: number;
};

export type PostConsultRankingResponse = {
  summary: PostConsultRankingSummary;
  rows: PostConsultRankingRow[];
};
