export type RepasseJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
export type RepasseJobItemStatus = 'SUCCESS' | 'NO_DATA' | 'ERROR';
export type RepassePdfScope = 'single' | 'multi' | 'all_with_data';

export type RepasseSyncJob = {
  id: string;
  periodRef: string;
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
