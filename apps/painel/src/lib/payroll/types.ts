import type {
  PayrollImportFileType,
  PayrollImportStatus,
  PayrollLineStatus,
  PayrollOccurrenceType,
  PayrollPeriodStatus,
  PayrollSignatureStatus,
  PayrollSyncJobStatus,
  PayrollTransportVoucherMode,
} from '@/lib/payroll/constants';

export type PayrollDataSource = 'SOLIDES' | 'PAINEL' | 'LEGADO';

export type PayrollRule = {
  id: string;
  monthRef: string;
  minWageAmount: number;
  lateToleranceMinutes: number;
  vtDiscountCapPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type PayrollPeriod = {
  id: string;
  monthRef: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  ruleId: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rules: PayrollRule | null;
};

export type PayrollImportFile = {
  id: string;
  periodId: string;
  fileType: PayrollImportFileType | 'REFERENCE_XLSX';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  processingStatus: PayrollImportStatus;
  processingLog: string | null;
  uploadedBy: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type PayrollPointSyncJob = {
  id: string;
  periodId: string;
  status: PayrollSyncJobStatus;
  requestedBy: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PayrollPointSyncRun = {
  id: string;
  periodId: string;
  jobId: string | null;
  status: PayrollSyncJobStatus;
  sourceLabel: string;
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

export type PayrollServiceHeartbeat = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
};

export type PayrollPointDateRange = {
  startDate: string;
  endDate: string;
};

export type PayrollPointCoverageStatus = 'FULL' | 'PARTIAL' | 'NONE';

export type PayrollPointCoverage = {
  status: PayrollPointCoverageStatus;
  totalPeriods: number;
  coveredPeriods: number;
  expectedMonthRefs: string[];
  coveredMonthRefs: string[];
  missingMonthRefs: string[];
  message: string;
};

export type PayrollPointOverview = {
  dateRange: PayrollPointDateRange;
  heartbeat: PayrollServiceHeartbeat;
  referenceMonthRef: string;
  syncTargetPeriod: PayrollPeriod | null;
  coverage: PayrollPointCoverage;
  alerts: string[];
};

export type PayrollPointDaily = {
  id: string;
  periodId: string;
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
  sourceFileId: string | null;
  sourcePayloadJson: string | null;
  syncRunId: string | null;
  source: PayrollDataSource;
  createdAt: string;
  updatedAt: string;
};

export type PayrollOccurrence = {
  id: string;
  periodId: string;
  employeeId: string;
  occurrenceType: PayrollOccurrenceType;
  dateStart: string;
  dateEnd: string;
  effectCode: string | null;
  notes: string | null;
  storageProvider: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  source: PayrollDataSource;
  createdAt: string;
  updatedAt: string;
};

export type PayrollLine = {
  id: string;
  periodId: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  unitName: string | null;
  contractType: string | null;
  salaryBase: number;
  insalubrityPercent: number;
  insalubrityAmount: number;
  daysWorked: number;
  absencesCount: number;
  absenceDiscount: number;
  lateMinutes: number;
  lateDiscount: number;
  vtProvisioned: number;
  vtDiscount: number;
  totalpassDiscount: number;
  otherFixedDiscount: number;
  otherFixedDiscountDescription: string | null;
  adjustmentsAmount: number;
  adjustmentsNotes: string | null;
  totalProvents: number;
  totalDiscounts: number;
  netOperational: number;
  lineStatus: PayrollLineStatus;
  payrollNotes: string | null;
  pendingDataCodes: PayrollPendingDataCode[];
  payrollEligible: boolean;
  exclusionReason: 'REGIME_PJ' | null;
  employeeSnapshotJson: string | null;
  calculationMemoryJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollPreviewRow = {
  key: string;
  lineId: string;
  employeeName: string;
  email: string | null;
  employeeCpf: string | null;
  centerCost: string | null;
  roleName: string | null;
  contractType: string | null;
  salaryBase: number | null;
  insalubrityValue: number | null;
  vtPerDay: number | null;
  vtMonth: number | null;
  vtDiscount: number | null;
  otherDiscounts: number | null;
  totalpassDiscount: number | null;
  observation: string | null;
  pendingDataCodes: PayrollPendingDataCode[];
  approvalBlocked: boolean;
};

export type PayrollDailyControlStatus = 'OK' | 'ATENCAO' | 'PENDENTE';

export type PayrollDailyControlRow = {
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
  pointSource: PayrollDataSource | null;
  employeeSource: Extract<PayrollDataSource, 'PAINEL'>;
  status: PayrollDailyControlStatus;
};

export type PayrollHoursBalanceMonthly = {
  id: string;
  periodId: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  balanceMinutes: number;
  referenceStart: string | null;
  referenceEnd: string | null;
  sourcePayloadJson: string | null;
  source: Extract<PayrollDataSource, 'SOLIDES'>;
  createdAt: string;
  updatedAt: string;
};

export type PayrollSignatureMonthly = {
  id: string;
  periodId: string;
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
  source: Extract<PayrollDataSource, 'SOLIDES'>;
  createdAt: string;
  updatedAt: string;
};

export type PayrollVacationRow = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  dateStart: string;
  dateEnd: string;
  notes: string | null;
  source: 'SOLIDES' | 'LEGADO';
};

export type PayrollBenefitStatus = 'OK' | 'ATENCAO' | 'PENDENTE_CADASTRO';

export type PayrollBenefitIssueDetail = {
  date: string | null;
  reason: string;
  rawText: string | null;
  marks: string[];
};

export type PayrollBenefitIssue = {
  code: string;
  severity: 'CADASTRO' | 'OPERACIONAL';
  message: string;
  details?: PayrollBenefitIssueDetail[];
};

export type PayrollBenefitRow = {
  key: string;
  lineId: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  unitName: string | null;
  contractType: string | null;
  daysEligible: number;
  mealVoucherPerDay: number | null;
  mealVoucherAmount: number;
  mealVoucherPurchaseAmount: number;
  transportVoucherMode: PayrollTransportVoucherMode;
  transportVoucherPerDay: number | null;
  transportVoucherMonthlyFixed: number | null;
  transportVoucherAmount: number;
  cashTransportBenefitAmount: number;
  transportVoucherDiscount: number;
  transportVoucherPayrollDiscount: number;
  totalpassDiscount: number;
  totalpassPayrollDiscount: number;
  otherFixedDiscount: number;
  otherPayrollDiscount: number;
  payrollDiscountsTotal: number;
  companyProvisionAmount: number;
  transportNetPayrollImpact: number;
  status: PayrollBenefitStatus;
  issues: PayrollBenefitIssue[];
};

export type PayrollBenefitsCostCenterSummary = {
  centerCost: string;
  totalEmployees: number;
  mealVoucherPurchaseTotal: number;
  cashTransportBenefitTotal: number;
  payrollDiscountsTotal: number;
  pendingEmployees: number;
};

export type PayrollBenefitsSummary = {
  totalEmployees: number;
  totalMealVoucher: number;
  totalTransportVoucher: number;
  totalBenefitDiscounts: number;
  mealVoucherPurchaseTotal: number;
  cashTransportBenefitTotal: number;
  transportVoucherPayrollDiscountTotal: number;
  totalpassPayrollDiscountTotal: number;
  otherPayrollDiscountTotal: number;
  payrollDiscountsTotal: number;
  companyProvisionTotal: number;
  transportNetPayrollImpact: number;
  pendingEmployees: number;
  attentionEmployees: number;
  costCenters: PayrollBenefitsCostCenterSummary[];
};

export type PayrollOptions = {
  periods: PayrollPeriod[];
  centersCost: string[];
  units: string[];
  contractTypes: string[];
  periodStatuses: Array<{ value: PayrollPeriodStatus; label: string }>;
  lineStatuses: Array<{ value: PayrollLineStatus; label: string }>;
  transportVoucherModes: Array<{ value: PayrollTransportVoucherMode; label: string }>;
  occurrenceTypes: Array<{ value: PayrollOccurrenceType; label: string }>;
};

export type PayrollPeriodSummary = {
  totalLines: number;
  totalNet: number;
  totalDiscounts: number;
  totalProvents: number;
  importsCompleted: number;
  syncCompleted: number;
};

export type PayrollEligibilitySummary = {
  totalOperationalEmployees: number;
  totalEligibleEmployees: number;
  totalExcludedEmployees: number;
  excludedByContract: number;
  excludedPjEmployees: number;
};

export type PayrollPendingDataCode = 'MISSING_SALARY' | 'MISSING_SOLIDES_LINK';

export type PayrollReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED';
export type PayrollReadinessSeverity = 'BLOCKING' | 'WARNING';
export type PayrollReadinessIssueCode =
  | 'NO_COMPLETED_POINT_SYNC'
  | 'EMPLOYEE_MISSING_SOLIDES_LINK'
  | 'SOLIDES_EMPLOYEE_UNMATCHED'
  | 'EMPLOYEE_MISSING_SALARY'
  | 'EMPLOYEE_WITHOUT_POINT_ROWS'
  | 'PENDING_POINT_ADJUSTMENTS'
  | 'PENDING_SIGNATURES'
  | 'BREAK_OVERRUN'
  | 'HOURS_BALANCE_ALERT'
  | 'POINT_INCONSISTENCY'
  | 'MISSING_COST_CENTER'
  | 'FALLBACK_SCHEDULE_DIVISOR'
  | 'MISSING_MEAL_VOUCHER_RULE'
  | 'MISSING_TRANSPORT_VOUCHER_RULE'
  | 'NO_GENERATED_LINES'
  | 'LINES_PENDING_REVIEW'
  | 'BENEFIT_PENDING_REGISTRATION'
  | 'BENEFIT_OPERATIONAL_ATTENTION';

export type PayrollReadinessEmployeeSample = {
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
};

export type PayrollReadinessIssue = {
  code: PayrollReadinessIssueCode;
  severity: PayrollReadinessSeverity;
  title: string;
  description: string;
  count: number;
  sampleEmployees: PayrollReadinessEmployeeSample[];
  details?: PayrollBenefitIssueDetail[];
};

export type PayrollPeriodReadiness = {
  status: PayrollReadinessStatus;
  blockingCount: number;
  warningCount: number;
  issues: PayrollReadinessIssue[];
  guidance: string;
};

export type PayrollLineFilters = {
  search: string;
  centerCost: string;
  unit: string;
  contractTypes: string[];
  lineStatus: string;
};

export type PayrollLineDetailSources = {
  adjustments: PayrollDataSource[];
  preview: PayrollDataSource[];
  hoursBalance: PayrollDataSource[];
  signature: PayrollDataSource[];
  pointDays: PayrollDataSource[];
  occurrences: PayrollDataSource[];
  calculationMemory: PayrollDataSource[];
};

export type PayrollLineDetail = {
  line: PayrollLine;
  pointDays: PayrollPointDaily[];
  occurrences: PayrollOccurrence[];
  previewRow: PayrollPreviewRow | null;
  hoursBalance: PayrollHoursBalanceMonthly | null;
  signature: PayrollSignatureMonthly | null;
  sources: PayrollLineDetailSources;
};

export type PayrollPeriodDetail = {
  period: PayrollPeriod;
  summary: PayrollPeriodSummary;
  eligibilitySummary: PayrollEligibilitySummary;
  imports: PayrollImportFile[];
  syncRuns: PayrollPointSyncRun[];
  readiness: PayrollPeriodReadiness;
  approvalReadiness: PayrollPeriodReadiness;
};

export type PayrollCreatePeriodInput = {
  monthRef: string;
  minWageAmount?: number | null;
  lateToleranceMinutes?: number | null;
  vtDiscountCapPercent?: number | null;
};

export type PayrollUpdatePeriodInput = {
  minWageAmount?: number | null;
  lateToleranceMinutes?: number | null;
  vtDiscountCapPercent?: number | null;
  status?: PayrollPeriodStatus;
};

export type PayrollLinePatchInput = {
  adjustmentsAmount?: number | null;
  adjustmentsNotes?: string | null;
  payrollNotes?: string | null;
  lineStatus?: PayrollLineStatus;
};

export type PayrollOccurrenceInput = {
  periodId: string;
  employeeId: string;
  occurrenceType: PayrollOccurrenceType;
  dateStart: string;
  dateEnd?: string | null;
  effectCode?: string | null;
  notes?: string | null;
};

export type ParsedPointDay = {
  pointDate: string;
  marks: string[];
  rawDayText: string | null;
  workedMinutes: number;
  lateMinutes: number;
  absenceFlag: boolean;
  inconsistencyFlag: boolean;
  justificationText: string | null;
};

export type ParsedPointEmployee = {
  employeeCode: string | null;
  employeeName: string;
  employeeCpf: string | null;
  department: string | null;
  scheduleLabel: string | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  days: ParsedPointDay[];
};
