import { randomUUID } from 'crypto';
import { getDbConnection, type DbInterface } from '@/lib/db';
import {
  DEFAULT_PAGE_SIZE,
  EQUIPMENT_CALIBRATION_STATUSES,
  EQUIPMENT_EVENT_STATUSES,
  EQUIPMENT_EVENT_TYPES,
  EQUIPMENT_FILE_TYPES,
  EQUIPMENT_OPERATIONAL_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_UNIT_LABELS,
  EQUIPMENT_UNITS,
  MAX_PAGE_SIZE,
  type EquipmentCalibrationStatus,
  type EquipmentEventStatus,
  type EquipmentEventType,
  type EquipmentFileType,
  type EquipmentOperationalStatus,
  type EquipmentType,
  type EquipmentUnit,
} from '@/lib/equipamentos/constants';
import { computeCalibrationStatus, getCalibrationStatusLabel } from '@/lib/equipamentos/status';
import type {
  Equipment,
  EquipmentEvent,
  EquipmentEventInput,
  EquipmentFile,
  EquipmentFileUploadInput,
  EquipmentFilters,
  EquipmentInput,
  EquipmentListItem,
  EquipmentListResult,
} from '@/lib/equipamentos/types';

export class EquipmentValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const clean = (value: any) => String(value ?? '').trim();
const upper = (value: any) => clean(value).toUpperCase();
const bool = (value: any) =>
  value === true || value === 1 || String(value) === '1' || String(value ?? '').toLowerCase() === 'true';

const allowedUnits = new Set(EQUIPMENT_UNITS);
const allowedEquipmentTypes = new Set(EQUIPMENT_TYPES.map((item) => item.value));
const allowedOperationalStatuses = new Set(EQUIPMENT_OPERATIONAL_STATUSES.map((item) => item.value));
const allowedCalibrationStatuses = new Set(EQUIPMENT_CALIBRATION_STATUSES.map((item) => item.value));
const allowedEventTypes = new Set(EQUIPMENT_EVENT_TYPES.map((item) => item.value));
const allowedEventStatuses = new Set(EQUIPMENT_EVENT_STATUSES.map((item) => item.value));
const allowedFileTypes = new Set(EQUIPMENT_FILE_TYPES.map((item) => item.value));

const parseDate = (value: any): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = clean(value);
  if (!raw) return null;

  const isoWithTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoWithTime) return `${isoWithTime[1]}-${isoWithTime[2]}-${isoWithTime[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
};

const parsePositiveInt = (value: any): number | null => {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildIn = (values: string[]) => {
  if (values.length === 0) return { clause: '(NULL)', params: [] as string[] };
  return { clause: `(${values.map(() => '?').join(',')})`, params: values };
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_KEYNAME' ||
      /already exists/i.test(msg) ||
      /Duplicate key name/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const mapEquipment = (row: any): Equipment => ({
  id: clean(row.id),
  unitName: upper(row.unit_name) as EquipmentUnit,
  description: clean(row.description),
  identificationNumber: clean(row.identification_number),
  barcodeValue: clean(row.barcode_value) || null,
  equipmentType: upper(row.equipment_type || 'OPERACIONAL') as EquipmentType,
  category: clean(row.category) || null,
  manufacturer: clean(row.manufacturer) || null,
  model: clean(row.model) || null,
  serialNumber: clean(row.serial_number) || null,
  locationDetail: clean(row.location_detail) || null,
  operationalStatus: upper(row.operational_status || 'ATIVO') as EquipmentOperationalStatus,
  calibrationRequired: bool(row.calibration_required),
  calibrationFrequencyDays:
    row.calibration_frequency_days === null || row.calibration_frequency_days === undefined
      ? null
      : Number(row.calibration_frequency_days),
  lastCalibrationDate: parseDate(row.last_calibration_date),
  nextCalibrationDate: parseDate(row.next_calibration_date),
  calibrationResponsible: clean(row.calibration_responsible) || null,
  calibrationNotes: clean(row.calibration_notes) || null,
  notes: clean(row.notes) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapEvent = (row: any): EquipmentEvent => ({
  id: clean(row.id),
  equipmentId: clean(row.equipment_id),
  eventDate: parseDate(row.event_date),
  eventType: upper(row.event_type) as EquipmentEventType,
  description: clean(row.description),
  handledBy: clean(row.handled_by) || null,
  status: upper(row.status || 'ABERTO') as EquipmentEventStatus,
  notes: clean(row.notes) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapFile = (row: any): EquipmentFile => ({
  id: clean(row.id),
  equipmentId: clean(row.equipment_id),
  fileType: upper(row.file_type) as EquipmentFileType,
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  notes: clean(row.notes) || null,
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const normalizeUnit = (value: any): EquipmentUnit => {
  const normalized = upper(value);
  if (!allowedUnits.has(normalized as EquipmentUnit)) {
    throw new EquipmentValidationError('Unidade inválida.');
  }
  return normalized as EquipmentUnit;
};

const normalizeOperationalStatus = (value: any): EquipmentOperationalStatus => {
  const normalized = upper(value || 'ATIVO');
  if (!allowedOperationalStatuses.has(normalized as EquipmentOperationalStatus)) {
    throw new EquipmentValidationError('Status operacional inválido.');
  }
  return normalized as EquipmentOperationalStatus;
};

const normalizeEquipmentType = (value: any): EquipmentType => {
  const normalized = upper(value || 'OPERACIONAL');
  if (!allowedEquipmentTypes.has(normalized as EquipmentType)) {
    throw new EquipmentValidationError('Tipo de equipamento inválido.');
  }
  return normalized as EquipmentType;
};

const normalizeEventType = (value: any): EquipmentEventType => {
  const normalized = upper(value);
  if (!allowedEventTypes.has(normalized as EquipmentEventType)) {
    throw new EquipmentValidationError('Tipo de evento inválido.');
  }
  return normalized as EquipmentEventType;
};

const normalizeEventStatus = (value: any): EquipmentEventStatus => {
  const normalized = upper(value || 'ABERTO');
  if (!allowedEventStatuses.has(normalized as EquipmentEventStatus)) {
    throw new EquipmentValidationError('Status do evento inválido.');
  }
  return normalized as EquipmentEventStatus;
};

const normalizeFileType = (value: any): EquipmentFileType => {
  const normalized = upper(value || 'OUTRO');
  if (!allowedFileTypes.has(normalized as EquipmentFileType)) {
    throw new EquipmentValidationError('Tipo de arquivo inválido.');
  }
  return normalized as EquipmentFileType;
};

const normalizeEquipmentInput = (payload: any): EquipmentInput => {
  const unitName = normalizeUnit(payload?.unitName || payload?.unit_name);
  const description = clean(payload?.description);
  const identificationNumber = clean(payload?.identificationNumber || payload?.identification_number);
  if (!description) throw new EquipmentValidationError('Descrição do equipamento é obrigatória.');
  if (!identificationNumber) throw new EquipmentValidationError('Número de identificação é obrigatório.');

  const calibrationRequired = bool(payload?.calibrationRequired ?? payload?.calibration_required ?? true);
  const lastCalibrationDate = parseDate(payload?.lastCalibrationDate || payload?.last_calibration_date);
  const nextCalibrationDate = parseDate(payload?.nextCalibrationDate || payload?.next_calibration_date);
  if (lastCalibrationDate && nextCalibrationDate && nextCalibrationDate < lastCalibrationDate) {
    throw new EquipmentValidationError('A próxima calibração não pode ser anterior à última calibração.');
  }

  return {
    unitName,
    description,
    identificationNumber,
    barcodeValue: clean(payload?.barcodeValue || payload?.barcode_value) || null,
    equipmentType: normalizeEquipmentType(payload?.equipmentType || payload?.equipment_type || payload?.type || 'OPERACIONAL'),
    category: clean(payload?.category) || null,
    manufacturer: clean(payload?.manufacturer) || null,
    model: clean(payload?.model) || null,
    serialNumber: clean(payload?.serialNumber || payload?.serial_number) || null,
    locationDetail: clean(payload?.locationDetail || payload?.location_detail) || null,
    operationalStatus: normalizeOperationalStatus(payload?.operationalStatus || payload?.operational_status || 'ATIVO'),
    calibrationRequired,
    calibrationFrequencyDays: calibrationRequired
      ? parsePositiveInt(payload?.calibrationFrequencyDays || payload?.calibration_frequency_days)
      : null,
    lastCalibrationDate: calibrationRequired ? lastCalibrationDate : null,
    nextCalibrationDate: calibrationRequired ? nextCalibrationDate : null,
    calibrationResponsible: calibrationRequired
      ? clean(payload?.calibrationResponsible || payload?.calibration_responsible) || null
      : null,
    calibrationNotes: calibrationRequired
      ? clean(payload?.calibrationNotes || payload?.calibration_notes) || null
      : null,
    notes: clean(payload?.notes) || null,
  };
};

const normalizeEventInput = (payload: any): EquipmentEventInput => {
  const description = clean(payload?.description);
  if (!description) throw new EquipmentValidationError('Descrição do evento é obrigatória.');

  return {
    eventDate: parseDate(payload?.eventDate || payload?.event_date),
    eventType: normalizeEventType(payload?.eventType || payload?.event_type),
    description,
    handledBy: clean(payload?.handledBy || payload?.handled_by) || null,
    status: normalizeEventStatus(payload?.status || 'ABERTO'),
    notes: clean(payload?.notes) || null,
  };
};

const ensureEquipmentExists = async (db: DbInterface, equipmentId: string) => {
  const rows = await db.query(`SELECT id FROM clinic_equipment WHERE id = ? LIMIT 1`, [equipmentId]);
  if (!rows[0]) {
    throw new EquipmentValidationError('Equipamento não encontrado.', 404);
  }
};

const loadFileCountMap = async (db: DbInterface, equipmentIds: string[]) => {
  const out = new Map<string, number>();
  if (equipmentIds.length === 0) return out;
  const idsIn = buildIn(equipmentIds);
  const rows = await db.query(
    `
    SELECT equipment_id, COUNT(*) AS total
    FROM clinic_equipment_files
    WHERE equipment_id IN ${idsIn.clause}
    GROUP BY equipment_id
    `,
    idsIn.params,
  );
  for (const row of rows) out.set(clean(row.equipment_id), Number(row.total || 0));
  return out;
};

const loadOpenEventCountMap = async (db: DbInterface, equipmentIds: string[]) => {
  const out = new Map<string, number>();
  if (equipmentIds.length === 0) return out;
  const idsIn = buildIn(equipmentIds);
  const rows = await db.query(
    `
    SELECT equipment_id, COUNT(*) AS total
    FROM clinic_equipment_events
    WHERE equipment_id IN ${idsIn.clause}
      AND UPPER(COALESCE(status, '')) NOT IN ('CONCLUIDO', 'CANCELADO')
    GROUP BY equipment_id
    `,
    idsIn.params,
  );
  for (const row of rows) out.set(clean(row.equipment_id), Number(row.total || 0));
  return out;
};

const enrichEquipment = (
  item: Equipment,
  fileCountMap: Map<string, number>,
  openEventCountMap: Map<string, number>,
): EquipmentListItem => {
  const calibrationStatus = computeCalibrationStatus(item.calibrationRequired, item.nextCalibrationDate);
  return {
    ...item,
    calibrationStatus,
    calibrationStatusLabel: getCalibrationStatusLabel(calibrationStatus),
    fileCount: fileCountMap.get(item.id) || 0,
    openEventsCount: openEventCountMap.get(item.id) || 0,
  };
};

const sortEquipment = (items: EquipmentListItem[]) =>
  [...items].sort((a, b) => {
    const nextA = a.nextCalibrationDate || '9999-12-31';
    const nextB = b.nextCalibrationDate || '9999-12-31';
    const byDate = nextA.localeCompare(nextB);
    if (byDate !== 0) return byDate;
    return a.description.localeCompare(b.description, 'pt-BR');
  });

const normalizeSearch = (value: string) => upper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normalizeEquipmentFilters = (params: URLSearchParams | Record<string, unknown>): EquipmentFilters => {
  const getParam = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key);
    const raw = params[key];
    return raw == null ? null : String(raw);
  };

  const page = clamp(Number(getParam('page') || 1), 1, 999999);
  const pageSize = clamp(Number(getParam('pageSize') || DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const equipmentType = upper(getParam('equipmentType') || getParam('type') || 'ALL');
  const calibrationStatus = upper(getParam('calibrationStatus') || 'ALL');
  const operationalStatus = upper(getParam('operationalStatus') || 'ATIVO');

  return {
    search: clean(getParam('search')),
    unit: clean(getParam('unit')) || 'all',
    equipmentType:
      equipmentType === 'ALL' || !allowedEquipmentTypes.has(equipmentType as EquipmentType)
        ? 'all'
        : (equipmentType as EquipmentType),
    calibrationStatus:
      calibrationStatus === 'ALL' || !allowedCalibrationStatuses.has(calibrationStatus as EquipmentCalibrationStatus)
        ? 'all'
        : (calibrationStatus as EquipmentCalibrationStatus),
    operationalStatus:
      operationalStatus === 'ALL' || !allowedOperationalStatuses.has(operationalStatus as EquipmentOperationalStatus)
        ? 'all'
        : (operationalStatus as EquipmentOperationalStatus),
    page,
    pageSize,
  };
};

export const ensureEquipmentTables = async (db: DbInterface = getDbConnection()) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinic_equipment (
      id VARCHAR(64) PRIMARY KEY,
      unit_name VARCHAR(180) NOT NULL,
      description VARCHAR(255) NOT NULL,
      identification_number VARCHAR(120) NOT NULL,
      barcode_value VARCHAR(180) NULL,
      equipment_type VARCHAR(30) NOT NULL DEFAULT 'OPERACIONAL',
      category VARCHAR(120) NULL,
      manufacturer VARCHAR(180) NULL,
      model VARCHAR(180) NULL,
      serial_number VARCHAR(180) NULL,
      location_detail VARCHAR(180) NULL,
      operational_status VARCHAR(30) NOT NULL,
      calibration_required INTEGER NOT NULL DEFAULT 1,
      calibration_frequency_days INTEGER NULL,
      last_calibration_date DATE NULL,
      next_calibration_date DATE NULL,
      calibration_responsible VARCHAR(180) NULL,
      calibration_notes TEXT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinic_equipment_events (
      id VARCHAR(64) PRIMARY KEY,
      equipment_id VARCHAR(64) NOT NULL,
      event_date DATE NULL,
      event_type VARCHAR(40) NOT NULL,
      description TEXT NOT NULL,
      handled_by VARCHAR(180) NULL,
      status VARCHAR(30) NOT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinic_equipment_files (
      id VARCHAR(64) PRIMARY KEY,
      equipment_id VARCHAR(64) NOT NULL,
      file_type VARCHAR(30) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120) NULL,
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      notes TEXT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN barcode_value VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN equipment_type VARCHAR(30) NOT NULL DEFAULT 'OPERACIONAL'`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN category VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN manufacturer VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN model VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN serial_number VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN location_detail VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN operational_status VARCHAR(30) NOT NULL DEFAULT 'ATIVO'`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN calibration_required INTEGER NOT NULL DEFAULT 1`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN calibration_frequency_days INTEGER NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN last_calibration_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN next_calibration_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN calibration_responsible VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN calibration_notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment ADD COLUMN notes TEXT NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_unit ON clinic_equipment (unit_name)`);
  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_type ON clinic_equipment (equipment_type)`);
  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_status ON clinic_equipment (operational_status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_next_calibration ON clinic_equipment (next_calibration_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_events_equipment ON clinic_equipment_events (equipment_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_clinic_equipment_files_equipment ON clinic_equipment_files (equipment_id)`);

  tablesEnsured = true;
};

export const listEquipment = async (
  db: DbInterface,
  filters: EquipmentFilters,
): Promise<EquipmentListResult> => {
  await ensureEquipmentTables(db);

  const rows = await db.query(`SELECT * FROM clinic_equipment ORDER BY description ASC`);
  const equipments = rows.map(mapEquipment);
  const fileCountMap = await loadFileCountMap(db, equipments.map((item) => item.id));
  const openEventCountMap = await loadOpenEventCountMap(db, equipments.map((item) => item.id));

  let list = equipments.map((item) => enrichEquipment(item, fileCountMap, openEventCountMap));

  if (filters.search) {
    const query = normalizeSearch(filters.search);
    list = list.filter((item) => {
      const haystack = normalizeSearch(
        [
          item.description,
          item.identificationNumber,
          item.barcodeValue,
          item.equipmentType,
          item.category,
          item.manufacturer,
          item.model,
          item.serialNumber,
          item.locationDetail,
          item.calibrationResponsible,
        ]
          .filter(Boolean)
          .join(' '),
      );
      return haystack.includes(query);
    });
  }

  if (filters.unit && filters.unit !== 'all') {
    const targetUnit = upper(filters.unit);
    list = list.filter((item) => upper(item.unitName) === targetUnit);
  }

  if (filters.equipmentType !== 'all') {
    list = list.filter((item) => item.equipmentType === filters.equipmentType);
  }

  if (filters.operationalStatus !== 'all') {
    list = list.filter((item) => item.operationalStatus === filters.operationalStatus);
  }

  if (filters.calibrationStatus !== 'all') {
    list = list.filter((item) => item.calibrationStatus === filters.calibrationStatus);
  }

  list = sortEquipment(list);

  const summary = {
    total: list.length,
    calibrationOk: list.filter((item) => item.calibrationStatus === 'EM_DIA').length,
    calibrationDueSoon: list.filter((item) => item.calibrationStatus === 'VENCENDO').length,
    calibrationOverdue: list.filter((item) => item.calibrationStatus === 'VENCIDO').length,
    calibrationNoSchedule: list.filter((item) => item.calibrationStatus === 'SEM_PROGRAMACAO').length,
    maintenanceCount: list.filter((item) => item.operationalStatus === 'EM_MANUTENCAO').length,
  };

  const page = Math.max(1, filters.page || 1);
  const pageSize = clamp(filters.pageSize || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);

  return {
    items,
    total: list.length,
    page,
    pageSize,
    totalPages,
    summary,
  };
};

export const listEquipmentExportRows = async (db: DbInterface, filters: EquipmentFilters) => {
  const result = await listEquipment(db, { ...filters, page: 1, pageSize: MAX_PAGE_SIZE });
  return result.items;
};

export const getEquipmentById = async (db: DbInterface, equipmentId: string): Promise<EquipmentListItem | null> => {
  await ensureEquipmentTables(db);
  const rows = await db.query(`SELECT * FROM clinic_equipment WHERE id = ? LIMIT 1`, [equipmentId]);
  const row = rows[0];
  if (!row) return null;
  const equipment = mapEquipment(row);
  const fileCountMap = await loadFileCountMap(db, [equipment.id]);
  const openEventCountMap = await loadOpenEventCountMap(db, [equipment.id]);
  return enrichEquipment(equipment, fileCountMap, openEventCountMap);
};

export const createEquipment = async (db: DbInterface, payload: any): Promise<EquipmentListItem> => {
  await ensureEquipmentTables(db);
  const input = normalizeEquipmentInput(payload);
  const id = randomUUID();
  const now = NOW();

  await db.execute(
    `
    INSERT INTO clinic_equipment (
      id, unit_name, description, identification_number, barcode_value, equipment_type, category,
      manufacturer, model, serial_number, location_detail, operational_status,
      calibration_required, calibration_frequency_days, last_calibration_date,
      next_calibration_date, calibration_responsible, calibration_notes, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.unitName,
      input.description,
      input.identificationNumber,
      input.barcodeValue,
      input.equipmentType,
      input.category,
      input.manufacturer,
      input.model,
      input.serialNumber,
      input.locationDetail,
      input.operationalStatus,
      input.calibrationRequired ? 1 : 0,
      input.calibrationFrequencyDays,
      input.lastCalibrationDate,
      input.nextCalibrationDate,
      input.calibrationResponsible,
      input.calibrationNotes,
      input.notes,
      now,
      now,
    ],
  );

  const item = await getEquipmentById(db, id);
  if (!item) throw new EquipmentValidationError('Falha ao criar equipamento.', 500);
  return item;
};

export const updateEquipment = async (
  db: DbInterface,
  equipmentId: string,
  payload: any,
): Promise<EquipmentListItem> => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const input = normalizeEquipmentInput(payload);
  const now = NOW();

  await db.execute(
    `
    UPDATE clinic_equipment
    SET unit_name = ?,
        description = ?,
        identification_number = ?,
        barcode_value = ?,
        equipment_type = ?,
        category = ?,
        manufacturer = ?,
        model = ?,
        serial_number = ?,
        location_detail = ?,
        operational_status = ?,
        calibration_required = ?,
        calibration_frequency_days = ?,
        last_calibration_date = ?,
        next_calibration_date = ?,
        calibration_responsible = ?,
        calibration_notes = ?,
        notes = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [
      input.unitName,
      input.description,
      input.identificationNumber,
      input.barcodeValue,
      input.equipmentType,
      input.category,
      input.manufacturer,
      input.model,
      input.serialNumber,
      input.locationDetail,
      input.operationalStatus,
      input.calibrationRequired ? 1 : 0,
      input.calibrationFrequencyDays,
      input.lastCalibrationDate,
      input.nextCalibrationDate,
      input.calibrationResponsible,
      input.calibrationNotes,
      input.notes,
      now,
      equipmentId,
    ],
  );

  const item = await getEquipmentById(db, equipmentId);
  if (!item) throw new EquipmentValidationError('Falha ao atualizar equipamento.', 500);
  return item;
};

export const deactivateEquipment = async (db: DbInterface, equipmentId: string): Promise<EquipmentListItem> => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);

  await db.execute(
    `
    UPDATE clinic_equipment
    SET operational_status = 'INATIVO',
        updated_at = ?
    WHERE id = ?
    `,
    [NOW(), equipmentId],
  );

  const item = await getEquipmentById(db, equipmentId);
  if (!item) throw new EquipmentValidationError('Falha ao carregar equipamento inativado.', 500);
  return item;
};

export const listEquipmentEvents = async (db: DbInterface, equipmentId: string) => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const rows = await db.query(
    `
    SELECT *
    FROM clinic_equipment_events
    WHERE equipment_id = ?
    ORDER BY COALESCE(event_date, '9999-12-31') DESC, created_at DESC
    `,
    [equipmentId],
  );
  return rows.map(mapEvent);
};

export const createEquipmentEvent = async (
  db: DbInterface,
  equipmentId: string,
  payload: any,
): Promise<EquipmentEvent> => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const input = normalizeEventInput(payload);
  const id = randomUUID();
  const now = NOW();

  await db.execute(
    `
    INSERT INTO clinic_equipment_events (
      id, equipment_id, event_date, event_type, description, handled_by, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      equipmentId,
      input.eventDate,
      input.eventType,
      input.description,
      input.handledBy,
      input.status,
      input.notes,
      now,
      now,
    ],
  );

  const rows = await db.query(`SELECT * FROM clinic_equipment_events WHERE id = ? LIMIT 1`, [id]);
  return mapEvent(rows[0]);
};

export const updateEquipmentEvent = async (
  db: DbInterface,
  equipmentId: string,
  eventId: string,
  payload: any,
): Promise<EquipmentEvent> => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const input = normalizeEventInput(payload);
  const rows = await db.query(
    `SELECT id FROM clinic_equipment_events WHERE id = ? AND equipment_id = ? LIMIT 1`,
    [eventId, equipmentId],
  );
  if (!rows[0]) throw new EquipmentValidationError('Evento não encontrado.', 404);

  await db.execute(
    `
    UPDATE clinic_equipment_events
    SET event_date = ?, event_type = ?, description = ?, handled_by = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ? AND equipment_id = ?
    `,
    [
      input.eventDate,
      input.eventType,
      input.description,
      input.handledBy,
      input.status,
      input.notes,
      NOW(),
      eventId,
      equipmentId,
    ],
  );

  const updated = await db.query(`SELECT * FROM clinic_equipment_events WHERE id = ? LIMIT 1`, [eventId]);
  return mapEvent(updated[0]);
};

export const deleteEquipmentEvent = async (db: DbInterface, equipmentId: string, eventId: string) => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  await db.execute(`DELETE FROM clinic_equipment_events WHERE id = ? AND equipment_id = ?`, [eventId, equipmentId]);
};

export const listEquipmentFiles = async (db: DbInterface, equipmentId: string) => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const rows = await db.query(
    `
    SELECT *
    FROM clinic_equipment_files
    WHERE equipment_id = ?
    ORDER BY created_at DESC
    `,
    [equipmentId],
  );
  return rows.map(mapFile);
};

export const createEquipmentFileRecord = async (
  db: DbInterface,
  equipmentId: string,
  payload: EquipmentFileUploadInput,
): Promise<EquipmentFile> => {
  await ensureEquipmentTables(db);
  await ensureEquipmentExists(db, equipmentId);

  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO clinic_equipment_files (
      id, equipment_id, file_type, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, notes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      equipmentId,
      normalizeFileType(payload.fileType),
      clean(payload.storageProvider),
      clean(payload.storageBucket) || null,
      clean(payload.storageKey),
      clean(payload.originalName),
      clean(payload.mimeType),
      Number(payload.sizeBytes || 0),
      clean(payload.notes) || null,
      clean(payload.uploadedBy),
      NOW(),
    ],
  );

  const rows = await db.query(`SELECT * FROM clinic_equipment_files WHERE id = ? LIMIT 1`, [id]);
  return mapFile(rows[0]);
};

export const getEquipmentFileById = async (db: DbInterface, fileId: string): Promise<EquipmentFile | null> => {
  await ensureEquipmentTables(db);
  const rows = await db.query(`SELECT * FROM clinic_equipment_files WHERE id = ? LIMIT 1`, [fileId]);
  return rows[0] ? mapFile(rows[0]) : null;
};

export const listEquipmentOptions = async (db: DbInterface) => {
  await ensureEquipmentTables(db);
  const rows = await db.query(`SELECT category, calibration_responsible, manufacturer, location_detail FROM clinic_equipment`);
  const distinct = (mapper: (row: any) => string) =>
    Array.from(new Set(rows.map(mapper).map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );

  return {
    units: EQUIPMENT_UNITS.map((value) => ({ value, label: EQUIPMENT_UNIT_LABELS[value] })),
    equipmentTypes: EQUIPMENT_TYPES,
    operationalStatuses: EQUIPMENT_OPERATIONAL_STATUSES,
    calibrationStatuses: EQUIPMENT_CALIBRATION_STATUSES,
    eventTypes: EQUIPMENT_EVENT_TYPES,
    eventStatuses: EQUIPMENT_EVENT_STATUSES,
    fileTypes: EQUIPMENT_FILE_TYPES,
    categories: distinct((row) => clean(row.category)),
    responsibles: distinct((row) => clean(row.calibration_responsible)),
    manufacturers: distinct((row) => clean(row.manufacturer)),
    locations: distinct((row) => clean(row.location_detail)),
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  };
};
