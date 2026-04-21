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
  rqe?: string;
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

export type ProfessionalContractStatus = 'PROCESSANDO' | 'GERADO' | 'ERRO' | 'ASSINADO';

export type ProfessionalContract = {
  id: string;
  professionalId: string;
  templateId: string | null;
  templateName: string | null;
  templateVersion: string;
  status: ProfessionalContractStatus;
  storageProvider: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  generatedBy: string;
  generatedAt: string | null;
  errorMessage: string | null;
  documentId: string | null;
  originalName: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
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
  paymentMinimumText: string | null;
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
  paymentMinimumText?: string | null;
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
  notes?: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  uploadedBy: string;
};

export type FeegowProcedureCatalogItem = {
  procedimentoId: number;
  nome: string;
  codigo: string | null;
  tipoProcedimento: number | null;
  grupoProcedimento: number | null;
  valor: number;
  updatedAt: string | null;
};

export type ProfessionalProcedureRate = {
  id: string;
  professionalId: string;
  procedimentoId: number;
  procedimentoNome: string;
  valorBase: number;
  valorProfissional: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfessionalProcedureRateInput = {
  procedimentoId: number;
  procedimentoNome?: string | null;
  valorBase?: number | null;
  valorProfissional?: number | null;
};

export type ProfessionalFilters = {
  search: string;
  status: 'all' | 'active' | 'inactive';
  pendencyStatus: 'all' | 'pending' | 'complete';
  certidaoStatus: 'all' | CertidaoStatus;
  contractType: string;
  serviceUnit: string;
  feegowPermissions: 'all' | 'yes' | 'no';
  page: number;
  pageSize: number;
};
