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
  heartbeat: {
    status?: string;
    last_run?: string | null;
    details?: string | null;
  } | null;
};
