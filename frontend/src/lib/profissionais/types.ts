import type {
  CertidaoStatus,
  ContractPartyType,
  ContractTypeCode,
  DocumentTypeCode,
} from '@/lib/profissionais/constants';

export type ProfessionalRegistration = {
  id?: string;
  professionalId?: string;
  councilType: string;
  councilNumber: string;
  councilUf: string;
  isPrimary: boolean;
};

export type ProfessionalChecklistItem = {
  id?: string;
  professionalId?: string;
  docType: DocumentTypeCode;
  hasPhysicalCopy: boolean;
  hasDigitalCopy: boolean;
  expiresAt: string | null;
  notes: string;
  verifiedBy?: string;
  verifiedAt?: string;
  updatedAt?: string;
};

export type ProfessionalDocument = {
  id: string;
  professionalId: string;
  docType: DocumentTypeCode;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  isActive: boolean;
  notes: string | null;
  uploadedBy: string;
  createdAt: string;
};

export type Professional = {
  id: string;
  name: string;
  contractPartyType: ContractPartyType;
  contractType: ContractTypeCode;
  cpf: string | null;
  cnpj: string | null;
  legalName: string | null;
  specialty: string;
  specialties: string[];
  primarySpecialty: string | null;
  phone: string | null;
  email: string | null;
  ageRange: string | null;
  serviceUnits: string[];
  hasFeegowPermissions: boolean;
  personalDocType: string;
  personalDocNumber: string;
  addressText: string;
  isActive: boolean;
  hasPhysicalFolder: boolean;
  physicalFolderNote: string | null;
  contractTemplateId: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfessionalListItem = Professional & {
  registrations: ProfessionalRegistration[];
  primaryRegistration: ProfessionalRegistration | null;
  checklist: ProfessionalChecklistItem[];
  missingFields: string[];
  missingDocs: DocumentTypeCode[];
  requiredDocsTotal: number;
  requiredDocsDone: number;
  pending: boolean;
  certidaoStatus: CertidaoStatus;
  certidaoExpiresAt: string | null;
};

export type ProfessionalInput = {
  name: string;
  contractPartyType: ContractPartyType;
  contractType: ContractTypeCode;
  cpf?: string | null;
  cnpj?: string | null;
  legalName?: string | null;
  specialty: string;
  specialties?: string[];
  primarySpecialty?: string | null;
  phone?: string | null;
  email?: string | null;
  ageRange?: string | null;
  serviceUnits?: string[];
  hasFeegowPermissions?: boolean;
  personalDocType: string;
  personalDocNumber: string;
  addressText: string;
  isActive: boolean;
  hasPhysicalFolder: boolean;
  physicalFolderNote?: string | null;
  contractTemplateId?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  registrations: ProfessionalRegistration[];
  checklist: ProfessionalChecklistItem[];
};

export type ProfessionalDocumentUploadInput = {
  docType: DocumentTypeCode;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  uploadedBy: string;
};

export type ProfessionalFilters = {
  search: string;
  status: 'all' | 'active' | 'inactive' | 'pending';
  certidaoStatus: 'all' | CertidaoStatus;
  page: number;
  pageSize: number;
};
