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

export type EquipmentWorkOrderStatus = 'ABERTA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export type EquipmentWorkOrderPermissionProfile =
  | 'diretoria_gerencia_adm'
  | 'gerencia_operacional'
  | 'lider_unidades'
  | 'lider_operacional';

export type EquipmentWorkOrderResponsibleOption = {
  userId: string;
  userName: string;
  email: string;
  department: string | null;
  profileKey: EquipmentWorkOrderPermissionProfile;
  profileLabel: string | null;
  groupKey: string | null;
  groupLabel: string | null;
};

export type EquipmentWorkOrder = {
  id: string;
  equipmentId: string;
  linkedTaskId: string;
  openedAt: string;
  openedByUserId: string;
  openedByProfileKey: string | null;
  openedByGroupKey: string | null;
  openedByResolutionSource: string | null;
  responsibleUserId: string;
  responsibleEmployeeId: string | null;
  responsibleProfileKey: string | null;
  problemDescription: string;
  lastMaintenanceSnapshotDate: string | null;
  previousOperationalStatus: EquipmentOperationalStatus | null;
  status: EquipmentWorkOrderStatus;
  startedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  solutionNotes: string | null;
  closingOperationalStatus: EquipmentOperationalStatus | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentWorkOrderFile = {
  id: string;
  workOrderId: string;
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

export type EquipmentWorkOrderListItem = EquipmentWorkOrder & {
  equipmentDescription: string;
  equipmentIdentificationNumber: string;
  equipmentUnitName: EquipmentUnit;
  equipmentOperationalStatus: EquipmentOperationalStatus;
  responsibleUserName: string | null;
  responsibleDepartment: string | null;
  taskProtocolId: string | null;
  fileCount: number;
};

export type EquipmentWorkOrderDetail = EquipmentWorkOrderListItem & {
  files: EquipmentWorkOrderFile[];
};

export type EquipmentWorkOrderCreateInput = {
  openedAt?: string | null;
  responsibleUserId: string;
  problemDescription: string;
};

export type EquipmentWorkOrderUpdateInput = {
  status?: EquipmentWorkOrderStatus | null;
  startedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  solutionNotes?: string | null;
  closingOperationalStatus?: EquipmentOperationalStatus | null;
  cancellationReason?: string | null;
};

export type EquipmentListItem = Equipment & {
  calibrationStatus: EquipmentCalibrationStatus;
  calibrationStatusLabel: string;
  fileCount: number;
  openEventsCount: number;
  activeWorkOrderId: string | null;
  activeWorkOrderStatus: EquipmentWorkOrderStatus | null;
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

export type EquipmentWorkOrderFileUploadInput = {
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

export type EquipmentWorkOrderListFilters = {
  search: string;
  status: 'all' | EquipmentWorkOrderStatus;
  unit: string;
  responsibleUserId: string;
  page: number;
  pageSize: number;
};

export type EquipmentWorkOrderListResult = {
  items: EquipmentWorkOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
