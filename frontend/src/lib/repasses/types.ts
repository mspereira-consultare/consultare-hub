export type RepasseJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
export type RepasseJobItemStatus = 'SUCCESS' | 'NO_DATA' | 'ERROR';
export type RepassePdfScope = 'single' | 'multi' | 'all_with_data';
export type RepasseSyncScope = 'all' | 'single' | 'multi';

export type RepasseSyncJob = {
  id: string;
  periodRef: string;
  scope: RepasseSyncScope;
  professionalIds: string[];
  status: RepasseJobStatus;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepassePdfJob = {
  id: string;
  periodRef: string;
  scope: RepassePdfScope;
  professionalIds: string[];
  status: RepasseJobStatus;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepasseSyncJobInput = {
  periodRef?: string;
  scope?: RepasseSyncScope;
  professionalIds?: string[];
};

export type RepassePdfJobInput = {
  periodRef?: string;
  scope?: RepassePdfScope;
  professionalIds?: string[];
};

export type RepasseJobListFilters = {
  periodRef?: string;
  limit?: number;
};

export type RepasseProfessionalStatusFilter =
  | 'all'
  | 'success'
  | 'no_data'
  | 'error'
  | 'not_processed';

export type RepasseProfessionalListFilters = {
  periodRef?: string;
  search?: string;
  status?: RepasseProfessionalStatusFilter;
  page?: number;
  pageSize?: number;
};

export type RepasseProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'ERROR' | 'NOT_PROCESSED';
  rowsCount: number;
  totalValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
};

export type RepasseProfessionalOption = {
  professionalId: string;
  professionalName: string;
};

export type RepasseProfessionalStats = {
  totalProfessionals: number;
  success: number;
  noData: number;
  error: number;
  notProcessed: number;
  totalRows: number;
  totalValue: number;
};

export type RepasseProfessionalListResult = {
  items: RepasseProfessionalSummary[];
  total: number;
  page: number;
  pageSize: number;
  stats: RepasseProfessionalStats;
};

export type RepassePdfArtifact = {
  id: string;
  pdfJobId: string;
  periodRef: string;
  professionalId: string;
  professionalName: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type RepassePdfArtifactListFilters = {
  periodRef?: string;
  professionalId?: string;
  limit?: number;
};
