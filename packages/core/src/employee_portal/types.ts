import type { EmployeeDocumentTypeCode } from '../colaboradores/constants';
import type { EmployeeDocument, EmployeeListItem } from '../colaboradores/types';
import type { EMPLOYEE_PORTAL_PERSONAL_FIELDS } from './constants';

export type EmployeePortalInviteStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED' | 'LOCKED';
export type EmployeePortalSubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'PARTIALLY_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED';
export type EmployeePortalPersonalStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type EmployeePortalDocumentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REPLACED_BY_COLLABORATOR'
  | 'REMOVED_BY_COLLABORATOR';

export type EmployeePortalProductionEntryType = 'RESOLVE' | 'CHECKUP';
export type EmployeePortalProductionMatchStatus =
  | 'PENDING_MATCH'
  | 'MATCHED'
  | 'MULTIPLE_MATCHES'
  | 'NO_MATCH';

export type EmployeePortalInvite = {
  id: string;
  employeeId: string;
  status: EmployeePortalInviteStatus;
  url?: string | null;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  attemptCount: number;
  lockedUntil: string | null;
};

export type EmployeePortalSession = {
  id: string;
  employeeId: string;
  inviteId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type EmployeePortalPersonalData = Partial<
  Record<(typeof EMPLOYEE_PORTAL_PERSONAL_FIELDS)[number], string | number | boolean | null>
>;

export type EmployeePortalSubmission = {
  id: string;
  employeeId: string;
  inviteId: string | null;
  status: EmployeePortalSubmissionStatus;
  personalStatus: EmployeePortalPersonalStatus;
  personalData: EmployeePortalPersonalData;
  personalRejectionReason: string | null;
  consentLgpd: boolean;
  consentLgpdAt: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeePortalSubmissionDocument = {
  id: string;
  submissionId: string;
  employeeId: string;
  docType: EmployeeDocumentTypeCode;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  issueDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  status: EmployeePortalDocumentStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  promotedDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeePortalChecklistItem = {
  docType: EmployeeDocumentTypeCode;
  label: string;
  status:
    | 'PENDING'
    | 'DRAFT'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'OFFICIAL'
    | 'NOT_APPLICABLE';
  required: boolean;
  officialDocument: EmployeeDocument | null;
  portalDocument: EmployeePortalSubmissionDocument | null;
};

export type EmployeePortalProductionEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  serviceDate: string;
  entryType: EmployeePortalProductionEntryType;
  patientNameRaw: string;
  patientNameNormalized: string;
  matchStatus: EmployeePortalProductionMatchStatus;
  feegowPatientId: number | null;
  feegowPatientName: string | null;
  teamSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  canEdit: boolean;
};

export type EmployeePortalProductionDaySummary = {
  date: string;
  resolveCount: number;
  checkupCount: number;
  matchedCount: number;
  pendingMatchCount: number;
  totalCount: number;
};

export type EmployeePortalProductionDashboardFilters = {
  serviceDate: string | null;
  entryType: EmployeePortalProductionEntryType | 'ALL';
  matchStatus: EmployeePortalProductionMatchStatus | 'ALL';
};

export type EmployeePortalProductionLast7DaysSummary = {
  startDate: string;
  endDate: string;
  resolveMatchedCount: number;
  checkupMatchedCount: number;
  matchedCount: number;
  pendingMatchCount: number;
  totalCount: number;
};

export type EmployeePortalProductionDashboard = {
  today: EmployeePortalProductionDaySummary;
  yesterday: EmployeePortalProductionDaySummary;
  last7Days: EmployeePortalProductionLast7DaysSummary;
  filters: EmployeePortalProductionDashboardFilters;
  editableDates: string[];
  availableDates: string[];
  entries: EmployeePortalProductionEntry[];
};

export type EmployeePortalOverview = {
  employee: Pick<
    EmployeeListItem,
    | 'id'
    | 'fullName'
    | 'cpf'
    | 'birthDate'
    | 'email'
    | 'phone'
    | 'employmentRegime'
    | 'status'
    | 'rg'
    | 'street'
    | 'streetNumber'
    | 'addressComplement'
    | 'district'
    | 'city'
    | 'stateUf'
    | 'zipCode'
    | 'educationInstitution'
    | 'educationLevel'
    | 'courseName'
    | 'currentSemester'
    | 'maritalStatus'
    | 'hasChildren'
    | 'childrenCount'
    | 'bankName'
    | 'bankAgency'
    | 'bankAccount'
    | 'pixKey'
  >;
  activeInvite: EmployeePortalInvite | null;
  invites: EmployeePortalInvite[];
  submission: EmployeePortalSubmission | null;
  documents: EmployeePortalSubmissionDocument[];
  officialDocuments: EmployeeDocument[];
  checklist: EmployeePortalChecklistItem[];
  pendingCount: number;
  rejectedCount: number;
  approvedCount: number;
  production: {
    entries: EmployeePortalProductionEntry[];
    today: EmployeePortalProductionDaySummary;
    yesterday: EmployeePortalProductionDaySummary;
    pendingMatchCount: number;
    editableDates: string[];
  };
  intranetAccess: {
    credentialId: string;
    status: 'PENDING_VIEW' | 'VIEWED';
    username: string;
    temporaryPassword: string | null;
    intranetUrl: string;
    generatedAt: string;
    shownAt: string | null;
  } | null;
};

export type CreatePortalDocumentInput = {
  docType: EmployeeDocumentTypeCode;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  issueDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
};
