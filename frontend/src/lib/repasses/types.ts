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
