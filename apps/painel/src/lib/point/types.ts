import type { PayrollSignatureStatus, PayrollSyncJobStatus } from '@/lib/payroll/constants';

export type PointDataSource = 'SOLIDES' | 'PAINEL';

export type PointFilters = {
  search: string;
  centerCost: string;
  unit: string;
  contractType: string;
  lineStatus: string;
};

export type PointOptions = {
  centersCost: string[];
  units: string[];
  contractTypes: string[];
};

export type PointDateRange = {
  startDate: string;
  endDate: string;
};

export type PointServiceHeartbeat = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
};

export type PointSyncJob = {
  id: string;
  windowStart: string;
  windowEnd: string;
  status: PayrollSyncJobStatus;
  requestedBy: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PointSyncRun = {
  id: string;
  jobId: string | null;
  status: PayrollSyncJobStatus;
  sourceLabel: string;
  windowStart: string;
  windowEnd: string;
  totalEmployees: number;
  processedEmployees: number;
  processedDays: number;
  currentStage: string | null;
  progressPercent: number | null;
  lastProgressAt: string | null;
  estimatedRemainingSeconds: number | null;
  synchronizedEmployees: number;
  synchronizedDays: number;
  unmatchedEmployees: number;
  pendingAdjustments: number;
  pendingSignatures: number;
  details: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type PointArtifact = {
  id: string;
  syncRunId: string | null;
  artifactType: 'TIMESHEET_REPORT';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
};

export type PointOverview = {
  dateRange: PointDateRange;
  heartbeat: PointServiceHeartbeat;
  syncWindow: PointDateRange | null;
  latestRun: PointSyncRun | null;
  latestArtifact: PointArtifact | null;
  alerts: string[];
};

export type PointDailyRecord = {
  id: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeCode: string | null;
  employeeName: string;
  employeeCpf: string | null;
  pointDate: string;
  department: string | null;
  scheduleLabel: string | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  marks: string[];
  rawDayText: string | null;
  plannedMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  dayBalanceMinutes: number;
  breakMinutes: number;
  expectedBreakMinutes: number;
  breakOverrunMinutes: number;
  pendingAdjustmentsCount: number;
  absenceFlag: boolean;
  inconsistencyFlag: boolean;
  justificationText: string | null;
  sourcePayloadJson: string | null;
  lastSyncRunId: string | null;
  source: Extract<PointDataSource, 'SOLIDES'>;
  createdAt: string;
  updatedAt: string;
};

export type PointDailyControlStatus = 'OK' | 'ATENCAO' | 'PENDENTE';

export type PointDailyControlRow = {
  key: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  contractType: string | null;
  workedDays: number;
  absenceDays: number;
  lateMinutes: number;
  plannedMinutes: number;
  workedMinutes: number;
  dayBalanceMinutes: number;
  breakOverrunMinutes: number;
  pendingAdjustments: number;
  pointSource: Extract<PointDataSource, 'SOLIDES'> | null;
  employeeSource: Extract<PointDataSource, 'PAINEL'>;
  status: PointDailyControlStatus;
};

export type PointHoursBalanceMonthly = {
  id: string;
  periodId: string;
  referenceMonth: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  balanceMinutes: number;
  referenceStart: string | null;
  referenceEnd: string | null;
  sourcePayloadJson: string | null;
  source: Extract<PointDataSource, 'SOLIDES'>;
  createdAt: string;
  updatedAt: string;
};

export type PointSignatureMonthly = {
  id: string;
  periodId: string;
  referenceMonth: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  status: PayrollSignatureStatus;
  documentType: string | null;
  documentDate: string | null;
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  message: string | null;
  sourcePayloadJson: string | null;
  source: Extract<PointDataSource, 'SOLIDES'>;
  createdAt: string;
  updatedAt: string;
};

export type PointVacationRow = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  dateStart: string;
  dateEnd: string;
  notes: string | null;
  source: 'SOLIDES';
};
