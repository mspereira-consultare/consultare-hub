import type {
  EquipmentCalibrationStatus,
  EquipmentEventStatus,
  EquipmentEventType,
  EquipmentFileType,
  EquipmentOperationalStatus,
  EquipmentType,
  EquipmentUnit,
} from '@/lib/equipamentos/constants';

export type Equipment = {
  id: string;
  unitName: EquipmentUnit;
  description: string;
  identificationNumber: string;
  barcodeValue: string | null;
  equipmentType: EquipmentType;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  locationDetail: string | null;
  operationalStatus: EquipmentOperationalStatus;
  calibrationRequired: boolean;
  calibrationFrequencyDays: number | null;
  lastCalibrationDate: string | null;
  nextCalibrationDate: string | null;
  calibrationResponsible: string | null;
  calibrationNotes: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentFile = {
  id: string;
  equipmentId: string;
  fileType: EquipmentFileType;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  uploadedBy: string;
  createdAt: string;
};

export type EquipmentEvent = {
  id: string;
  equipmentId: string;
  eventDate: string | null;
  eventType: EquipmentEventType;
  description: string;
  handledBy: string | null;
  status: EquipmentEventStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentListItem = Equipment & {
  calibrationStatus: EquipmentCalibrationStatus;
  calibrationStatusLabel: string;
  fileCount: number;
  openEventsCount: number;
};

export type EquipmentInput = {
  unitName: EquipmentUnit;
  description: string;
  identificationNumber: string;
  barcodeValue?: string | null;
  equipmentType: EquipmentType;
  category?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  locationDetail?: string | null;
  operationalStatus?: EquipmentOperationalStatus;
  calibrationRequired?: boolean;
  calibrationFrequencyDays?: number | null;
  lastCalibrationDate?: string | null;
  nextCalibrationDate?: string | null;
  calibrationResponsible?: string | null;
  calibrationNotes?: string | null;
  notes?: string | null;
};

export type EquipmentEventInput = {
  eventDate?: string | null;
  eventType: EquipmentEventType;
  description: string;
  handledBy?: string | null;
  status?: EquipmentEventStatus;
  notes?: string | null;
};

export type EquipmentFileUploadInput = {
  fileType: EquipmentFileType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  uploadedBy: string;
};

export type EquipmentFilters = {
  search: string;
  unit: string;
  equipmentType: 'all' | EquipmentType;
  calibrationStatus: 'all' | EquipmentCalibrationStatus;
  operationalStatus: 'all' | EquipmentOperationalStatus;
  page: number;
  pageSize: number;
};

export type EquipmentListSummary = {
  total: number;
  calibrationOk: number;
  calibrationDueSoon: number;
  calibrationOverdue: number;
  calibrationNoSchedule: number;
  maintenanceCount: number;
};

export type EquipmentListResult = {
  items: EquipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: EquipmentListSummary;
};
