import type {
  PayrollComparisonStatus,
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
  fileType: PayrollImportFileType;
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
  comparisonStatus: PayrollComparisonStatus;
  createdAt: string;
  updatedAt: string;
};

export type PayrollReferenceRow = {
  id: string;
  periodId: string;
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  roleName: string | null;
  contractType: string | null;
  salaryBase: number | null;
  insalubrityPercent: number | null;
  vtDay: number | null;
  vtMonth: number | null;
  vtDiscount: number | null;
  otherDiscounts: number | null;
  totalpassDiscount: number | null;
  notes: string | null;
  rawJson: string | null;
  comparisonKey: string;
  createdAt: string;
};

export type PayrollOptions = {
  periods: PayrollPeriod[];
  centersCost: string[];
  units: string[];
  contractTypes: string[];
  periodStatuses: Array<{ value: PayrollPeriodStatus; label: string }>;
  lineStatuses: Array<{ value: PayrollLineStatus; label: string }>;
  comparisonStatuses: Array<{ value: PayrollComparisonStatus; label: string }>;
  transportVoucherModes: Array<{ value: PayrollTransportVoucherMode; label: string }>;
  occurrenceTypes: Array<{ value: PayrollOccurrenceType; label: string }>;
};

export type PayrollPeriodSummary = {
  totalLines: number;
  totalNet: number;
  totalDiscounts: number;
  totalProvents: number;
  divergentLines: number;
  linesWithoutReference: number;
  importsCompleted: number;
};

export type PayrollLineFilters = {
  search: string;
  centerCost: string;
  unit: string;
  contractType: string;
  lineStatus: string;
  comparisonStatus: string;
};

export type PayrollComparisonRow = {
  key: string;
  employeeName: string;
  employeeCpf: string | null;
  status: PayrollComparisonStatus;
  systemLine: PayrollLine | null;
  referenceRow: PayrollReferenceRow | null;
  differences: Array<{ field: string; systemValue: string; referenceValue: string }>;
};

export type PayrollLineDetail = {
  line: PayrollLine;
  pointDays: PayrollPointDaily[];
  occurrences: PayrollOccurrence[];
  referenceRow: PayrollReferenceRow | null;
  differences: Array<{ field: string; systemValue: string; referenceValue: string }>;
};

export type PayrollPeriodDetail = {
  period: PayrollPeriod;
  summary: PayrollPeriodSummary;
  imports: PayrollImportFile[];
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

export type ParsedReferenceRow = {
  employeeName: string;
  employeeCpf: string | null;
  centerCost: string | null;
  roleName: string | null;
  contractType: string | null;
  salaryBase: number | null;
  insalubrityPercent: number | null;
  vtDay: number | null;
  vtMonth: number | null;
  vtDiscount: number | null;
  otherDiscounts: number | null;
  totalpassDiscount: number | null;
  notes: string | null;
  rawJson: string;
  comparisonKey: string;
};
