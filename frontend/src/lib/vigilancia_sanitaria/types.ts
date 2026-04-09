import type {
  SurveillanceDocumentType,
  SurveillanceExpirationStatus,
  SurveillanceRenewalStatus,
  SurveillanceUnit,
} from '@/lib/vigilancia_sanitaria/constants';

export type SurveillanceFile = {
  id: string;
  entityType: 'license' | 'document';
  entityId: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};

export type SurveillanceLicense = {
  id: string;
  unitName: SurveillanceUnit;
  licenseName: string;
  cnae: string;
  licenseNumber: string | null;
  issuer: string | null;
  validUntil: string;
  renewalStatus: SurveillanceRenewalStatus;
  responsibleName: string | null;
  notes: string | null;
  expirationStatus: SurveillanceExpirationStatus;
  expirationStatusLabel: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  files?: SurveillanceFile[];
};

export type SurveillanceDocument = {
  id: string;
  unitName: SurveillanceUnit;
  documentName: string;
  documentType: SurveillanceDocumentType | null;
  licenseId: string | null;
  licenseName: string | null;
  licenseActive: boolean;
  validUntil: string | null;
  responsibleName: string | null;
  notes: string | null;
  expirationStatus: SurveillanceExpirationStatus;
  expirationStatusLabel: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  files?: SurveillanceFile[];
};

export type SurveillanceLicenseInput = {
  unitName: SurveillanceUnit;
  licenseName: string;
  cnae: string;
  licenseNumber?: string | null;
  issuer?: string | null;
  validUntil: string;
  renewalStatus?: SurveillanceRenewalStatus;
  responsibleName?: string | null;
  notes?: string | null;
};

export type SurveillanceDocumentInput = {
  unitName: SurveillanceUnit;
  documentName: string;
  documentType?: SurveillanceDocumentType | null;
  licenseId?: string | null;
  validUntil?: string | null;
  responsibleName?: string | null;
  notes?: string | null;
};

export type SurveillanceFilters = {
  search: string;
  unit: string;
  expirationStatus: 'all' | SurveillanceExpirationStatus;
  validFrom: string;
  validTo: string;
  page: number;
  pageSize: number;
};

export type SurveillanceLicenseFilters = SurveillanceFilters & {
  renewalStatus: 'all' | SurveillanceRenewalStatus;
};

export type SurveillanceDocumentFilters = SurveillanceFilters & {
  documentType: 'all' | SurveillanceDocumentType;
  licenseId: string;
};

export type SurveillanceSummaryFilters = Omit<SurveillanceFilters, 'page' | 'pageSize'> & {
  itemType: 'all' | 'licenses' | 'documents';
};

export type SurveillanceListResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SurveillanceSummary = {
  cards: {
    totalLicenses: number;
    expiredLicenses: number;
    dueSoonLicenses: number;
    expiredDocuments: number;
    dueSoonDocuments: number;
    noValidity: number;
  };
  criticalAlerts: Array<{
    id: string;
    entityType: 'license' | 'document';
    unitName: SurveillanceUnit;
    name: string;
    validUntil: string | null;
    expirationStatus: SurveillanceExpirationStatus;
    expirationStatusLabel: string;
    responsibleName: string | null;
  }>;
  upcoming: Array<{
    id: string;
    entityType: 'license' | 'document';
    unitName: SurveillanceUnit;
    name: string;
    validUntil: string | null;
    expirationStatus: SurveillanceExpirationStatus;
    expirationStatusLabel: string;
  }>;
  byUnit: Array<{
    unitName: SurveillanceUnit;
    total: number;
    expired: number;
    dueSoon: number;
    ok: number;
    noValidity: number;
  }>;
};
