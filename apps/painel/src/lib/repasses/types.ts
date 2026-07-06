export type RepasseJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
export type RepasseJobItemStatus = 'SUCCESS' | 'NO_DATA' | 'ERROR';
export type RepassePdfScope = 'single' | 'multi' | 'all_with_data';
export type RepasseSyncScope = 'all' | 'single' | 'multi';
export type RepasseConsolidacaoJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL';
export type RepasseConsolidacaoJobItemStatus =
  | 'SUCCESS'
  | 'NO_DATA'
  | 'SKIPPED_NOT_IN_FILTER'
  | 'SKIPPED_AMBIGUOUS_NAME'
  | 'ERROR';
export type RepasseConsolidacaoScope = 'all' | 'single' | 'multi';
export type RepasseConsolidacaoProfessionalStatus =
  | 'SUCCESS'
  | 'NO_DATA'
  | 'SKIPPED'
  | 'ERROR'
  | 'NOT_PROCESSED';

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
  paymentMinimumText: string | null;
  lastPdfAt: string | null;
  lastPdfArtifactId: string | null;
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

export type RepasseConsolidacaoJob = {
  id: string;
  periodRef: string;
  scope: RepasseConsolidacaoScope;
  professionalIds: string[];
  status: RepasseConsolidacaoJobStatus;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepasseConsolidacaoJobInput = {
  periodRef?: string;
  scope?: RepasseConsolidacaoScope;
  professionalIds?: string[];
};

export type RepasseConsolidacaoProfessionalStatusFilter =
  | 'all'
  | 'success'
  | 'no_data'
  | 'skipped'
  | 'error'
  | 'not_processed';

export type RepasseConsolidacaoStatusFilter =
  | 'all'
  | 'consolidado'
  | 'nao_consolidado'
  | 'nao_recebido';

export type RepasseConsolidacaoBooleanFilter = 'all' | 'yes' | 'no';

export type RepasseConsolidacaoProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: RepasseConsolidacaoProfessionalStatus;
  execucaoQty: number;
  execucaoValue: number;
  execucaoPending: boolean;
  producaoQty: number;
  producaoValue: number;
  rowsCount: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  repasseTotalConsolidadoTabela: number;
  repasseTotalConsolidadoAConferir: number;
  hasDivergencia: boolean;
  divergenciaValue: number;
  repasseFinalValue: number;
  produtividadeValue: number;
  percentualProdutividadeValue: number;
  totalFinalValue: number;
  duplicateAttendanceCaseCount: number;
  duplicateAttendanceQty: number;
  duplicateAttendanceValue: number;
  hasPossibleDuplicateAttendances: boolean;
  zeroRepasseQty: number;
  zeroRepasseValue: number;
  hasZeroRepasseAlert: boolean;
  hasRepasseFinalOverride: boolean;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  internalNote: string | null;
  paymentMinimumText: string | null;
  lastPdfAt: string | null;
  lastPdfArtifactId: string | null;
};

export type RepasseConsolidacaoProfessionalStats = {
  totalProfessionals: number;
  success: number;
  noData: number;
  skipped: number;
  error: number;
  notProcessed: number;
  totalRows: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  divergenceCount: number;
};

export type RepasseConsolidacaoProfessionalListResult = {
  items: RepasseConsolidacaoProfessionalSummary[];
  total: number;
  page: number;
  pageSize: number;
  stats: RepasseConsolidacaoProfessionalStats;
};

export type RepasseConsolidacaoProfessionalListFilters = {
  periodRef?: string;
  search?: string;
  status?: RepasseConsolidacaoProfessionalStatusFilter;
  hasPaymentMinimum?: RepasseConsolidacaoBooleanFilter;
  consolidacaoStatus?: RepasseConsolidacaoStatusFilter;
  hasDivergence?: RepasseConsolidacaoBooleanFilter;
  attendanceDateStart?: string;
  attendanceDateEnd?: string;
  patientName?: string;
  page?: number;
  pageSize?: number;
};

export type RepasseAConferirLine = {
  sourceRowHash: string;
  invoiceId: string;
  executionDate: string;
  patientName: string;
  unitName: string;
  accountDate: string;
  requesterName: string;
  specialtyName: string;
  procedureName: string;
  attendanceValue: number;
  detailStatus: string;
  detailStatusText: string;
  roleCode: string;
  roleName: string;
  detailProfessionalName: string;
  detailRepasseValue: number;
  isInConsolidado: boolean;
  convenio?: string;
  funcao?: string;
  origin?: 'consolidado' | 'a_conferir';
};

export type RepasseAConferirMatchRule = 'PATIENT_DATE_PROCEDURE' | 'PATIENT_DATE';
export type RepasseAConferirMatchConfidence = 'HIGH' | 'LOW';
export type RepasseAConferirMainStatus =
  | 'CONSOLIDADO'
  | 'NAO_CONSOLIDADO'
  | 'NAO_RECEBIDO'
  | 'SEM_CORRESPONDENCIA';

export type RepasseAConferirExpandedItem = {
  specialtyName: string;
  requesterName: string;
  convenio: string;
  invoiceId: string;
  attendanceValue: number;
  detailRepasseValue: number;
  detailStatusText: string;
};

export type RepasseAConferirMainRow = {
  rowKey: string;
  executionDate: string;
  patientName: string;
  unitName: string;
  specialtyName: string;
  accountDate: string;
  procedureName: string;
  repasseConsolidadoValue: number;
  repasseAConferirValue: number;
  detailStatus: RepasseAConferirMainStatus;
  detailStatusText: string;
  hasMatch: boolean;
  matchRule: RepasseAConferirMatchRule;
  matchConfidence: RepasseAConferirMatchConfidence;
  duplicateAttendanceCount: number;
  hasPossibleDuplicateAttendance: boolean;
  hasZeroRepasseAlert: boolean;
  expandedItems: RepasseAConferirExpandedItem[];
};

export type RepasseAConferirDetailsSummary = {
  rowsCount: number;
  producaoValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
};

export type RepasseAConferirDetailsResult = {
  mainRows: RepasseAConferirMainRow[];
  rows: RepasseAConferirLine[];
  summary: RepasseAConferirDetailsSummary;
};

export type RepasseConsolidacaoLineMarkColor = 'green' | 'yellow' | 'red';

export type RepasseConsolidacaoLineMark = {
  sourceRowHash: string;
  colorKey: RepasseConsolidacaoLineMarkColor;
  note: string | null;
  updatedAt: string;
};

export type RepasseConsolidacaoMarkLegend = {
  green: string;
  yellow: string;
  red: string;
};

export type RepasseConsolidacaoFinancialInput = {
  periodRef: string;
  professionalId: string;
  repasseFinalValue: number | null;
  produtividadeValue: number | null;
  percentualProdutividadeValue: number;
  totalFinalValue: number;
  hasRepasseFinalOverride: boolean;
  updatedAt: string;
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

export type RepassePdfFilenameMode = 'current' | 'full_name';

export type RepasseEmailBatchStatus =
  | 'DRAFT'
  | 'READY'
  | 'QUEUED'
  | 'SENDING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type RepasseEmailValidationStatus = 'VALID' | 'WARNING' | 'ERROR';

export type RepasseEmailRecipientSendStatus =
  | 'IMPORTED'
  | 'READY'
  | 'QUEUED'
  | 'SENDING'
  | 'ACCEPTED_PROVIDER'
  | 'DELIVERED'
  | 'DEFERRED'
  | 'SOFT_BOUNCE'
  | 'HARD_BOUNCE'
  | 'SPAM_COMPLAINT'
  | 'UNSUBSCRIBED'
  | 'FAILED'
  | 'SKIPPED'
  | 'MANUAL_CONFIRMED';

export type RepasseEmailJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type RepasseEmailJobScope = 'all_ready' | 'selected' | 'retry_failed';

export type RepasseEmailMessageStatus =
  | 'CREATED'
  | 'SENDING'
  | 'ACCEPTED_PROVIDER'
  | 'FAILED_REQUEST'
  | 'DELIVERED'
  | 'DEFERRED'
  | 'SOFT_BOUNCE'
  | 'HARD_BOUNCE'
  | 'SPAM_COMPLAINT'
  | 'UNSUBSCRIBED';

export type RepasseEmailEventProcessingStatus = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'FAILED';

export type RepasseEmailSuppressionReason = 'HARD_BOUNCE' | 'SPAM_COMPLAINT' | 'UNSUBSCRIBED' | 'MANUAL_BLOCK';

export type RepasseEmailBatch = {
  id: string;
  periodRef: string;
  dueDateNf: string;
  status: RepasseEmailBatchStatus;
  totalRecipients: number;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  acceptedCount: number;
  deliveredCount: number;
  failedCount: number;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type RepasseEmailRecipient = {
  id: string;
  batchId: string;
  periodRef: string;
  professionalId: string;
  professionalName: string;
  recipientEmail: string;
  amountValue: number;
  dueDateNf: string;
  pdfArtifactId: string | null;
  storageProvider: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  driveFileId: string | null;
  driveFileUrl: string | null;
  fileName: string | null;
  professionalMatchStatus: string | null;
  professionalMatchScore: number | null;
  attachmentMatchStatus: string | null;
  attachmentSource: string | null;
  attachmentCode: string | null;
  originalSheetRowJson: string | null;
  observations: string | null;
  attachmentSizeBytes: number | null;
  attachmentContentType: string | null;
  validationStatus: RepasseEmailValidationStatus;
  validationErrors: string[];
  sendStatus: RepasseEmailRecipientSendStatus;
  lastMessageId: string | null;
  lastProviderMessageId: string | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  manualConfirmedBy: string | null;
  manualConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepasseEmailBatchPrepareRow = {
  professionalId?: string;
  professionalName?: string;
  recipientEmail?: string;
  amountValue?: number | string | null;
  dueDateNf?: string;
  driveFileId?: string;
  driveFileUrl?: string;
  fileName?: string;
  attachmentCode?: string;
  arquivo?: string;
  observations?: string;
  anoReferencia?: string | number;
  mesReferencia?: string | number;
};

export type RepasseEmailBatchPrepareInput = {
  periodRef?: string;
  dueDateNf: string;
  rows?: RepasseEmailBatchPrepareRow[];
  rowsText?: string;
};

export type RepasseEmailBatchListFilters = {
  periodRef?: string;
  limit?: number;
};

export type RepasseEmailRecipientListFilters = {
  batchId: string;
  status?: string;
  limit?: number;
};

export type RepasseEmailJob = {
  id: string;
  batchId: string;
  periodRef: string;
  scope: RepasseEmailJobScope;
  recipientIds: string[];
  status: RepasseEmailJobStatus;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepasseEmailJobInput = {
  batchId: string;
  scope?: RepasseEmailJobScope;
  recipientIds?: string[];
};

export type RepasseEmailJobListFilters = {
  batchId?: string;
  periodRef?: string;
  limit?: number;
};

export type RepasseEmailEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  messageId: string | null;
  recipientId: string | null;
  batchId: string | null;
  eventType: string;
  normalizedStatus: RepasseEmailRecipientSendStatus | string;
  payloadJson: string;
  receivedAt: string;
  processedAt: string | null;
  processingStatus: RepasseEmailEventProcessingStatus;
  errorMessage: string | null;
};

export type RepasseEmailEventListFilters = {
  batchId?: string;
  recipientId?: string;
  limit?: number;
};
