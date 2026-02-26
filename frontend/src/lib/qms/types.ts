export type QmsDocumentStatus =
  | 'rascunho'
  | 'vigente'
  | 'a_vencer'
  | 'vencido'
  | 'arquivado';

export type QmsDocumentSummary = {
  id: string;
  code: string;
  sector: string;
  name: string;
  objective: string;
  periodicityDays: number | null;
  status: QmsDocumentStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: QmsDocumentVersion | null;
  fileCount: number;
  lastFile: QmsDocumentFile | null;
};

export type QmsDocumentVersion = {
  id: string;
  documentId: string;
  versionLabel: string;
  elaboratedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  creationDate: string | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  linkedTrainingRef: string | null;
  revisionReason: string | null;
  scope: string | null;
  notes: string | null;
  isCurrent: boolean;
  createdBy: string;
  createdAt: string;
};

export type QmsDocumentFile = {
  id: string;
  documentVersionId: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  isActive: boolean;
};

export type QmsDocumentDetail = {
  document: QmsDocumentSummary;
  versions: QmsDocumentVersion[];
  files: QmsDocumentFile[];
};

export type QmsDocumentFilters = {
  search?: string;
  sector?: string;
  status?: QmsDocumentStatus | 'all';
};

export type QmsDocumentInput = {
  code?: string | null;
  sector?: string | null;
  name: string;
  objective?: string | null;
  periodicityDays?: number | null;
  status?: QmsDocumentStatus;
  versionLabel?: string | null;
  elaboratedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  creationDate?: string | null;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  linkedTrainingRef?: string | null;
  revisionReason?: string | null;
  scope?: string | null;
  notes?: string | null;
};

export type QmsDocumentUpdateInput = Partial<QmsDocumentInput>;

export type QmsDocumentVersionInput = {
  versionLabel?: string | null;
  elaboratedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  creationDate?: string | null;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  linkedTrainingRef?: string | null;
  revisionReason?: string | null;
  scope?: string | null;
  notes?: string | null;
};

export type QmsDocumentFileInput = {
  documentVersionId?: string | null;
  storageProvider: string;
  storageBucket?: string | null;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type QmsRefreshResult = {
  total: number;
  updated: number;
  stats: {
    vigente: number;
    aVencer: number;
    vencido: number;
    rascunho: number;
    arquivado: number;
  };
};
