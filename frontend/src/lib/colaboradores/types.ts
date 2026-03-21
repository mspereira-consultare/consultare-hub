import type {
  AsoStatus,
  EducationLevel,
  EmployeeDocumentTypeCode,
  EmployeeStatus,
  EmploymentRegime,
  LifeInsuranceStatus,
  MaritalStatus,
  RecessSituation,
  UniformDeliveryType,
  UniformItemStatus,
} from '@/lib/colaboradores/constants';

export type Employee = {
  id: string;
  fullName: string;
  employmentRegime: EmploymentRegime;
  status: EmployeeStatus;
  rg: string | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  street: string | null;
  streetNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  stateUf: string | null;
  zipCode: string | null;
  educationInstitution: string | null;
  educationLevel: EducationLevel | null;
  courseName: string | null;
  currentSemester: string | null;
  workSchedule: string | null;
  salaryAmount: number | null;
  contractDurationText: string | null;
  admissionDate: string | null;
  contractEndDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  terminationNotes: string | null;
  units: string[];
  jobTitle: string | null;
  department: string | null;
  supervisorName: string | null;
  costCenter: string | null;
  insalubrityPercent: number | null;
  transportVoucherPerDay: number | null;
  mealVoucherPerDay: number | null;
  lifeInsuranceStatus: LifeInsuranceStatus;
  maritalStatus: MaritalStatus | null;
  hasChildren: boolean;
  childrenCount: number;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  pixKey: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDocument = {
  id: string;
  employeeId: string;
  docType: EmployeeDocumentTypeCode;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  isActive: boolean;
  uploadedBy: string;
  createdAt: string;
};

export type EmployeeUniformItem = {
  id: string;
  employeeId: string;
  withdrawalDate: string | null;
  itemDescription: string;
  quantity: number;
  signedReceipt: boolean;
  deliveryType: UniformDeliveryType;
  deliveredBy: string | null;
  status: UniformItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeRecessPeriod = {
  id: string;
  employeeId: string;
  acquisitionStartDate: string | null;
  acquisitionEndDate: string | null;
  daysDue: number;
  daysPaid: number;
  balance: number;
  situation: RecessSituation;
  leaveDeadlineDate: string | null;
  vacationStartDate: string | null;
  vacationDurationDays: number;
  vacationEndDate: string | null;
  sellTenDays: boolean;
  thirteenthOnVacation: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeListItem = Employee & {
  documents: EmployeeDocument[];
  missingDocs: EmployeeDocumentTypeCode[];
  requiredDocsTotal: number;
  requiredDocsDone: number;
  pendingDocuments: boolean;
  asoStatus: AsoStatus;
  asoExpiresAt: string | null;
};

export type EmployeeInput = {
  fullName: string;
  employmentRegime: EmploymentRegime;
  status: EmployeeStatus;
  rg?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  stateUf?: string | null;
  zipCode?: string | null;
  educationInstitution?: string | null;
  educationLevel?: EducationLevel | null;
  courseName?: string | null;
  currentSemester?: string | null;
  workSchedule?: string | null;
  salaryAmount?: number | null;
  contractDurationText?: string | null;
  admissionDate?: string | null;
  contractEndDate?: string | null;
  terminationDate?: string | null;
  terminationReason?: string | null;
  terminationNotes?: string | null;
  units?: string[];
  jobTitle?: string | null;
  department?: string | null;
  supervisorName?: string | null;
  costCenter?: string | null;
  insalubrityPercent?: number | null;
  transportVoucherPerDay?: number | null;
  mealVoucherPerDay?: number | null;
  lifeInsuranceStatus?: LifeInsuranceStatus;
  maritalStatus?: MaritalStatus | null;
  hasChildren?: boolean;
  childrenCount?: number;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  pixKey?: string | null;
  notes?: string | null;
};

export type EmployeeDocumentUploadInput = {
  docType: EmployeeDocumentTypeCode;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  uploadedBy: string;
};

export type EmployeeFilters = {
  search: string;
  status: 'all' | EmployeeStatus;
  regime: 'all' | EmploymentRegime;
  unit: string;
  asoStatus: 'all' | AsoStatus;
  pendencyStatus: 'all' | 'pending' | 'complete';
  page: number;
  pageSize: number;
};

export type EmployeeUniformItemInput = {
  withdrawalDate?: string | null;
  itemDescription: string;
  quantity?: number | null;
  signedReceipt?: boolean;
  deliveryType?: UniformDeliveryType;
  deliveredBy?: string | null;
  status?: UniformItemStatus;
};

export type EmployeeRecessPeriodInput = {
  acquisitionStartDate?: string | null;
  acquisitionEndDate?: string | null;
  daysDue?: number | null;
  daysPaid?: number | null;
  leaveDeadlineDate?: string | null;
  vacationStartDate?: string | null;
  vacationDurationDays?: number | null;
  sellTenDays?: boolean;
  thirteenthOnVacation?: boolean;
};
