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

export type QmsTrainingType = 'inicial' | 'reciclagem';
export type QmsTrainingPlanStatus = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
export type QmsTrainingExecutionStatus = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
export type QmsTrainingFileType = 'attendance_list' | 'evaluation' | 'evidence' | 'other';

export type QmsTrainingPlan = {
  id: string;
  code: string;
  theme: string;
  sector: string;
  trainingType: QmsTrainingType;
  objective: string | null;
  instructor: string | null;
  targetAudience: string | null;
  workloadHours: number | null;
  plannedDate: string | null;
  expirationDate: string | null;
  evaluationApplied: boolean;
  evaluationType: string | null;
  targetIndicator: string | null;
  expectedGoal: string | null;
  status: QmsTrainingPlanStatus;
  notes: string | null;
  linkedDocumentIds: string[];
  linkedDocumentCodes: string[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type QmsTrainingPlanInput = {
  code?: string | null;
  theme: string;
  sector?: string | null;
  trainingType?: QmsTrainingType | null;
  objective?: string | null;
  instructor?: string | null;
  targetAudience?: string | null;
  workloadHours?: number | null;
  plannedDate?: string | null;
  expirationDate?: string | null;
  evaluationApplied?: boolean;
  evaluationType?: string | null;
  targetIndicator?: string | null;
  expectedGoal?: string | null;
  status?: QmsTrainingPlanStatus | null;
  notes?: string | null;
  linkedDocumentIds?: string[];
};

export type QmsTraining = {
  id: string;
  code: string;
  planId: string | null;
  planCode: string | null;
  name: string;
  sector: string;
  trainingType: QmsTrainingType;
  instructor: string | null;
  targetAudience: string | null;
  performedAt: string | null;
  workloadHours: number | null;
  evaluationApplied: boolean;
  averageScore: number | null;
  nextTrainingDate: string | null;
  status: QmsTrainingExecutionStatus;
  participantsPlanned: number | null;
  participantsActual: number | null;
  resultPostTraining: string | null;
  notes: string | null;
  filesCount: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type QmsTrainingInput = {
  code?: string | null;
  planId?: string | null;
  name: string;
  sector?: string | null;
  trainingType?: QmsTrainingType | null;
  instructor?: string | null;
  targetAudience?: string | null;
  performedAt?: string | null;
  workloadHours?: number | null;
  evaluationApplied?: boolean;
  averageScore?: number | null;
  nextTrainingDate?: string | null;
  status?: QmsTrainingExecutionStatus | null;
  participantsPlanned?: number | null;
  participantsActual?: number | null;
  resultPostTraining?: string | null;
  notes?: string | null;
};

export type QmsTrainingFile = {
  id: string;
  trainingId: string;
  fileType: QmsTrainingFileType;
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

export type QmsTrainingFileInput = {
  fileType: QmsTrainingFileType;
  storageProvider: string;
  storageBucket?: string | null;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type QmsAuditCriticality = 'baixa' | 'media' | 'alta';
export type QmsAuditStatus = 'aberta' | 'em_tratativa' | 'encerrada';
export type QmsAuditActionStatus = 'aberta' | 'em_andamento' | 'concluida' | 'atrasada';

export type QmsAudit = {
  id: string;
  code: string;
  documentId: string;
  documentVersionId: string;
  documentCode: string;
  documentName: string;
  documentVersionLabel: string;
  responsible: string | null;
  auditDate: string | null;
  compliancePercent: number | null;
  nonConformity: string | null;
  actionPlan: string | null;
  correctionDeadline: string | null;
  reassessed: boolean;
  effectivenessCheckDate: string | null;
  criticality: QmsAuditCriticality;
  status: QmsAuditStatus;
  actionsTotal: number;
  actionsOpen: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type QmsAuditAction = {
  id: string;
  auditId: string;
  description: string;
  owner: string | null;
  deadline: string | null;
  status: QmsAuditActionStatus;
  completionNote: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type QmsAuditDetail = {
  audit: QmsAudit;
  actions: QmsAuditAction[];
};

export type QmsAuditInput = {
  code?: string | null;
  documentId: string;
  documentVersionId: string;
  responsible?: string | null;
  auditDate?: string | null;
  compliancePercent?: number | null;
  nonConformity?: string | null;
  actionPlan?: string | null;
  correctionDeadline?: string | null;
  reassessed?: boolean;
  effectivenessCheckDate?: string | null;
  criticality?: QmsAuditCriticality | null;
  status?: QmsAuditStatus | null;
};

export type QmsAuditActionInput = {
  description: string;
  owner?: string | null;
  deadline?: string | null;
  status?: QmsAuditActionStatus | null;
  completionNote?: string | null;
};

export type QmsServiceHeartbeat = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
};

export type QmsOverviewMetrics = {
  generatedAt: string;
  documents: {
    total: number;
    vigente: number;
    aVencer: number;
    vencido: number;
    rascunho: number;
    arquivado: number;
  };
  trainings: {
    plansTotal: number;
    plansConcluidos: number;
    plansEmAberto: number;
    executionsTotal: number;
    executionsConcluidas: number;
    executionRate: number | null;
  };
  audits: {
    total: number;
    abertas: number;
    emTratativa: number;
    encerradas: number;
    overdueActions: number;
    avgCompliance: number | null;
  };
  heartbeats: QmsServiceHeartbeat[];
};
