import type {
  PayrollImportFileType,
  PayrollImportStatus,
  PayrollLineStatus,
  PayrollOccurrenceType,
  PayrollPeriodStatus,
  PayrollTransportVoucherMode,
} from '@/lib/payroll/constants';

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

export type PayrollPointDaily = {
  id: string;
  periodId: string;
  employeeId: string | null;
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
  workedMinutes: number;
  lateMinutes: number;
  absenceFlag: boolean;
  inconsistencyFlag: boolean;
  justificationText: string | null;
  sourceFileId: string | null;
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
  salaryBase: number;
  insalubrityValue: number | null;
  vtPerDay: number | null;
  vtMonth: number | null;
  vtDiscount: number | null;
  otherDiscounts: number | null;
  totalpassDiscount: number | null;
  observation: string | null;
};

export type PayrollBenefitStatus = 'OK' | 'ATENCAO' | 'PENDENTE_CADASTRO';

export type PayrollBenefitIssue = {
  code: string;
  severity: 'CADASTRO' | 'OPERACIONAL';
  message: string;
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
};

export type PayrollReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED';
export type PayrollReadinessSeverity = 'BLOCKING' | 'WARNING';
export type PayrollReadinessIssueCode =
  | 'NO_COMPLETED_POINT_IMPORT'
  | 'POINT_ROWS_UNMATCHED'
  | 'EMPLOYEE_MISSING_SALARY'
  | 'EMPLOYEE_WITHOUT_POINT_ROWS'
  | 'POINT_INCONSISTENCY'
  | 'MISSING_COST_CENTER'
  | 'FALLBACK_SCHEDULE_DIVISOR'
  | 'LATEST_IMPORT_FAILED_WITH_ACTIVE_BASE';

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
  contractType: string;
  lineStatus: string;
};

export type PayrollLineDetail = {
  line: PayrollLine;
  pointDays: PayrollPointDaily[];
  occurrences: PayrollOccurrence[];
  previewRow: PayrollPreviewRow | null;
};

export type PayrollPeriodDetail = {
  period: PayrollPeriod;
  summary: PayrollPeriodSummary;
  imports: PayrollImportFile[];
  readiness: PayrollPeriodReadiness;
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
