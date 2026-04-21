import type { ContractTypeCode } from '@/lib/profissionais/constants';

export type ContractTemplateStatus = 'draft' | 'active' | 'archived';

export type ContractTemplateMappingItem = {
  placeholder: string;
  source: string | null;
  required: boolean;
  confirmed: boolean;
};

export type ContractTemplate = {
  id: string;
  name: string;
  contractType: ContractTypeCode;
  version: number;
  status: ContractTemplateStatus;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  placeholders: string[];
  mapping: ContractTemplateMappingItem[];
  mappingDone: number;
  mappingTotal: number;
  mappingComplete: boolean;
  notes: string | null;
  uploadedBy: string;
  uploadedAt: string;
  activatedBy: string | null;
  activatedAt: string | null;
  archivedAt: string | null;
};

export type ContractTemplateUploadInput = {
  name: string;
  contractType: ContractTypeCode;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  placeholders: string[];
  notes?: string | null;
};

