import { randomUUID } from 'crypto';
import { createTask, updateTask } from '@consultare/core/tasks/repository';
import type { TaskViewerContext } from '@consultare/core/tasks/types';
import { getDbConnection, runInTransaction, type DbInterface } from '@/lib/db';
import { EXECUTIVE_PROFILE_DEFINITIONS } from '@/lib/dashboard_executive/catalog';
import { getExecutiveScope, listExecutiveProfilePreview } from '@/lib/dashboard_executive/repository';
import { getTodayInSaoPauloIso } from '@/lib/equipamentos/status';
import type {
  EquipmentOperationalStatus,
  EquipmentUnit,
} from '@/lib/equipamentos/constants';
import type {
  EquipmentWorkOrder,
  EquipmentWorkOrderCreateInput,
  EquipmentWorkOrderDetail,
  EquipmentWorkOrderFile,
  EquipmentWorkOrderFileUploadInput,
  EquipmentWorkOrderListFilters,
  EquipmentWorkOrderListItem,
  EquipmentWorkOrderListResult,
  EquipmentWorkOrderPermissionProfile,
  EquipmentWorkOrderResponsibleOption,
  EquipmentWorkOrderStatus,
} from '@/lib/equipamentos/types';

export class EquipmentWorkOrderValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const ALLOWED_EXECUTIVE_PROFILES: EquipmentWorkOrderPermissionProfile[] = [
  'diretoria_gerencia_adm',
  'gerencia_operacional',
  'lider_unidades',
  'lider_operacional',
];

const WORK_ORDER_STATUSES: EquipmentWorkOrderStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
};
const errorMessage = (error: unknown) => String((error as { message?: string } | null)?.message || '');
const errorCode = (error: unknown) => String((error as { code?: string } | null)?.code || '');

const userEmployeeJoinClause = () => {
  const isMysql =
    String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' ||
    !!process.env.MYSQL_URL ||
    !!process.env.MYSQL_PUBLIC_URL;
  return isMysql
    ? 'u.employee_id COLLATE utf8mb4_unicode_ci = e.id COLLATE utf8mb4_unicode_ci'
    : 'u.employee_id = e.id';
};

const parseDate = (value: unknown): string | null => {
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

const normalizeStatus = (value: unknown, fallback: EquipmentWorkOrderStatus = 'ABERTA'): EquipmentWorkOrderStatus => {
  const normalized = upper(value);
  if (WORK_ORDER_STATUSES.includes(normalized as EquipmentWorkOrderStatus)) {
    return normalized as EquipmentWorkOrderStatus;
  }
  return fallback;
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const msg = errorMessage(error);
    const code = errorCode(error);
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const msg = errorMessage(error);
    const code = errorCode(error);
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(msg) || /Duplicate key name/i.test(msg)) return;
    throw error;
  }
};

const mapWorkOrder = (row: Record<string, unknown>): EquipmentWorkOrder => ({
  id: clean(row.id),
  equipmentId: clean(row.equipment_id),
  linkedTaskId: clean(row.linked_task_id),
  openedAt: clean(row.opened_at),
  openedByUserId: clean(row.opened_by_user_id),
  openedByProfileKey: nullable(row.opened_by_profile_key),
  openedByGroupKey: nullable(row.opened_by_group_key),
  openedByResolutionSource: nullable(row.opened_by_resolution_source),
  responsibleUserId: clean(row.responsible_user_id),
  responsibleEmployeeId: nullable(row.responsible_employee_id),
  responsibleProfileKey: nullable(row.responsible_profile_key),
  problemDescription: clean(row.problem_description),
  lastMaintenanceSnapshotDate: parseDate(row.last_maintenance_snapshot_date),
  previousOperationalStatus: nullable(row.previous_operational_status) as EquipmentOperationalStatus | null,
  status: normalizeStatus(row.status),
  startedAt: clean(row.started_at) || null,
  resolvedAt: clean(row.resolved_at) || null,
  closedAt: clean(row.closed_at) || null,
  solutionNotes: nullable(row.solution_notes),
  closingOperationalStatus: nullable(row.closing_operational_status) as EquipmentOperationalStatus | null,
  cancellationReason: nullable(row.cancellation_reason),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapWorkOrderFile = (row: Record<string, unknown>): EquipmentWorkOrderFile => ({
  id: clean(row.id),
  workOrderId: clean(row.work_order_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: nullable(row.storage_bucket),
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  notes: nullable(row.notes),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapWorkOrderListRow = (row: Record<string, unknown>, fileCount = 0): EquipmentWorkOrderListItem => ({
  ...mapWorkOrder(row),
  equipmentDescription: clean(row.equipment_description),
  equipmentIdentificationNumber: clean(row.equipment_identification_number),
  equipmentUnitName: upper(row.equipment_unit_name) as EquipmentUnit,
  equipmentOperationalStatus: upper(row.equipment_operational_status) as EquipmentOperationalStatus,
  responsibleUserName: nullable(row.responsible_user_name),
  responsibleDepartment: nullable(row.responsible_department),
  taskProtocolId: nullable(row.task_protocol_id),
  fileCount,
});

const buildEquipmentWorkOrderDetail = async (
  db: DbInterface,
  workOrderId: string,
): Promise<EquipmentWorkOrderDetail | null> => {
  const rows = await db.query(
    `
    SELECT
      wo.*,
      e.description AS equipment_description,
      e.identification_number AS equipment_identification_number,
      e.unit_name AS equipment_unit_name,
      e.operational_status AS equipment_operational_status,
      u.name AS responsible_user_name,
      u.department AS responsible_department,
      t.protocol_id AS task_protocol_id
    FROM clinic_equipment_work_orders wo
    INNER JOIN clinic_equipment e ON e.id = wo.equipment_id
    LEFT JOIN users u ON u.id = wo.responsible_user_id
    LEFT JOIN tasks t ON t.id = wo.linked_task_id
    WHERE wo.id = ?
    LIMIT 1
    `,
    [workOrderId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const files = await listEquipmentWorkOrderFiles(db, workOrderId);
  return {
    ...mapWorkOrderListRow(row, files.length),
    files,
  };
};

const ensureEquipmentExists = async (db: DbInterface, equipmentId: string) => {
  const rows = await db.query(
    `
    SELECT id, description, identification_number, unit_name, equipment_type, operational_status, location_detail
    FROM clinic_equipment
    WHERE id = ?
    LIMIT 1
    `,
    [equipmentId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new EquipmentWorkOrderValidationError('Equipamento não encontrado.', 404);
  return {
    id: clean(row.id),
    description: clean(row.description),
    identificationNumber: clean(row.identification_number),
    unitName: clean(row.unit_name),
    equipmentType: upper(row.equipment_type || 'OPERACIONAL'),
    operationalStatus: upper(row.operational_status || 'ATIVO') as EquipmentOperationalStatus,
    locationDetail: nullable(row.location_detail),
  };
};

const ensureUserIsActive = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `
    SELECT u.id, u.name, u.email, u.department, u.status, u.employee_id, e.id AS employee_id_linked
    FROM users u
    LEFT JOIN employees e ON ${userEmployeeJoinClause()}
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || upper(row.status || 'ATIVO') !== 'ATIVO') {
    throw new EquipmentWorkOrderValidationError('Usuário responsável inválido ou inativo.', 404);
  }
  return {
    id: clean(row.id),
    name: clean(row.name),
    email: clean(row.email),
    department: nullable(row.department),
    employeeId: nullable(row.employee_id_linked) || nullable(row.employee_id),
  };
};

const ensureAllowedProfile = async (db: DbInterface, userId: string) => {
  const scope = await getExecutiveScope(db, userId);
  const profileKey = clean(scope.profileKey) as EquipmentWorkOrderPermissionProfile;
  if (!ALLOWED_EXECUTIVE_PROFILES.includes(profileKey)) {
    throw new EquipmentWorkOrderValidationError('Seu perfil executivo atual não pode criar ou gerir OS.', 403);
  }
  return scope;
};

const ensureResponsibleIsEligible = async (db: DbInterface, userId: string) => {
  const [user, scope] = await Promise.all([ensureUserIsActive(db, userId), getExecutiveScope(db, userId)]);
  const profileKey = clean(scope.profileKey) as EquipmentWorkOrderPermissionProfile;
  if (!ALLOWED_EXECUTIVE_PROFILES.includes(profileKey)) {
    throw new EquipmentWorkOrderValidationError('O responsável precisa pertencer a um dos perfis gerenciais habilitados para OS.', 400);
  }
  return {
    ...user,
    profileKey,
    groupKey: scope.matchedGroupKey,
    resolutionSource: scope.resolutionSource,
  };
};

const getLastMaintenanceSnapshotDate = async (db: DbInterface, equipmentId: string) => {
  const rows = await db.query(
    `
    SELECT event_date
    FROM clinic_equipment_events
    WHERE equipment_id = ?
      AND event_type IN ('MANUTENCAO_PREVENTIVA', 'MANUTENCAO_CORRETIVA')
      AND status = 'CONCLUIDO'
      AND event_date IS NOT NULL
    ORDER BY event_date DESC, created_at DESC
    LIMIT 1
    `,
    [equipmentId],
  );
  return parseDate((rows[0] as Record<string, unknown> | undefined)?.event_date) || null;
};

const ensureNoActiveWorkOrder = async (db: DbInterface, equipmentId: string, ignoreWorkOrderId?: string) => {
  const rows = await db.query(
    `
    SELECT id
    FROM clinic_equipment_work_orders
    WHERE equipment_id = ?
      AND status IN ('ABERTA', 'EM_ANDAMENTO')
      AND (? = '' OR id <> ?)
    LIMIT 1
    `,
    [equipmentId, clean(ignoreWorkOrderId), clean(ignoreWorkOrderId)],
  );
  if (rows[0]) {
    throw new EquipmentWorkOrderValidationError('Este equipamento já possui uma OS ativa.', 409);
  }
};

const insertEquipmentEvent = async (
  db: DbInterface,
  input: {
    equipmentId: string;
    eventType: string;
    description: string;
    handledBy?: string | null;
    status: string;
    notes?: string | null;
    eventDate?: string | null;
  },
) => {
  await db.execute(
    `
    INSERT INTO clinic_equipment_events (
      id, equipment_id, event_date, event_type, description, handled_by, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      input.equipmentId,
      input.eventDate || null,
      input.eventType,
      input.description,
      clean(input.handledBy) || null,
      input.status,
      clean(input.notes) || null,
      NOW(),
      NOW(),
    ],
  );
};

const buildTaskViewer = (userId: string): TaskViewerContext => ({
  userId,
  canViewAll: true,
});

const taskDepartmentByEquipmentType = (equipmentType: string) => {
  if (equipmentType === 'TI') return 'TI';
  if (equipmentType === 'ADMINISTRATIVO') return 'Administrativo';
  return 'Operação';
};

const profileLabels = new Map(EXECUTIVE_PROFILE_DEFINITIONS.map((item) => [item.key, item.label]));

export const getAllowedEquipmentWorkOrderProfiles = () =>
  ALLOWED_EXECUTIVE_PROFILES.map((key) => ({
    key,
    label: profileLabels.get(key) || key,
  }));

export const ensureEquipmentWorkOrderTables = async (db: DbInterface = getDbConnection()) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinic_equipment_work_orders (
      id VARCHAR(64) PRIMARY KEY,
      equipment_id VARCHAR(64) NOT NULL,
      linked_task_id VARCHAR(64) NOT NULL,
      opened_at DATE NOT NULL,
      opened_by_user_id VARCHAR(64) NOT NULL,
      opened_by_profile_key VARCHAR(80) NULL,
      opened_by_group_key VARCHAR(120) NULL,
      opened_by_resolution_source VARCHAR(40) NULL,
      responsible_user_id VARCHAR(64) NOT NULL,
      responsible_employee_id VARCHAR(64) NULL,
      responsible_profile_key VARCHAR(80) NULL,
      problem_description TEXT NOT NULL,
      last_maintenance_snapshot_date DATE NULL,
      previous_operational_status VARCHAR(30) NULL,
      status VARCHAR(30) NOT NULL,
      started_at TEXT NULL,
      resolved_at TEXT NULL,
      closed_at TEXT NULL,
      solution_notes TEXT NULL,
      closing_operational_status VARCHAR(30) NULL,
      cancellation_reason TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinic_equipment_work_order_files (
      id VARCHAR(64) PRIMARY KEY,
      work_order_id VARCHAR(64) NOT NULL,
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

  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN opened_by_profile_key VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN opened_by_group_key VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN opened_by_resolution_source VARCHAR(40) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN responsible_employee_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN responsible_profile_key VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN last_maintenance_snapshot_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN previous_operational_status VARCHAR(30) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN started_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN resolved_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN closed_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN solution_notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN closing_operational_status VARCHAR(30) NULL`);
  await safeAddColumn(db, `ALTER TABLE clinic_equipment_work_orders ADD COLUMN cancellation_reason TEXT NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_equipment_work_orders_equipment ON clinic_equipment_work_orders (equipment_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_equipment_work_orders_task ON clinic_equipment_work_orders (linked_task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_equipment_work_orders_status ON clinic_equipment_work_orders (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_equipment_work_orders_responsible ON clinic_equipment_work_orders (responsible_user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_equipment_work_order_files_work_order ON clinic_equipment_work_order_files (work_order_id)`);

  tablesEnsured = true;
};

export const listEquipmentWorkOrderResponsibleOptions = async (
  db: DbInterface,
): Promise<EquipmentWorkOrderResponsibleOption[]> => {
  await ensureEquipmentWorkOrderTables(db);
  const previewRows = await listExecutiveProfilePreview(db);
  return previewRows
    .filter(
      (item) =>
        upper(item.status || 'INATIVO') === 'ATIVO' &&
        item.hasDashboardAccess &&
        ALLOWED_EXECUTIVE_PROFILES.includes(clean(item.profileKey) as EquipmentWorkOrderPermissionProfile),
    )
    .map((item) => ({
      userId: item.userId,
      userName: item.userName,
      email: '',
      department: item.department,
      profileKey: clean(item.profileKey) as EquipmentWorkOrderPermissionProfile,
      profileLabel: item.profileLabel,
      groupKey: item.executiveGroupKey,
      groupLabel: item.executiveGroupLabel,
    }))
    .sort((left, right) => left.userName.localeCompare(right.userName, 'pt-BR'));
};

export const normalizeEquipmentWorkOrderFilters = (
  params: URLSearchParams | Record<string, unknown>,
): EquipmentWorkOrderListFilters => {
  const getParam = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key);
    const raw = params[key];
    return raw == null ? null : String(raw);
  };

  const page = Math.max(1, Number(getParam('page') || 1));
  const pageSize = Math.max(1, Math.min(100, Number(getParam('pageSize') || 20)));
  const status = upper(getParam('status') || 'ALL');

  return {
    search: clean(getParam('search')),
    status: WORK_ORDER_STATUSES.includes(status as EquipmentWorkOrderStatus)
      ? (status as EquipmentWorkOrderStatus)
      : 'all',
    unit: clean(getParam('unit')) || 'all',
    responsibleUserId: clean(getParam('responsibleUserId')),
    page,
    pageSize,
  };
};

export const listEquipmentWorkOrders = async (
  db: DbInterface,
  filters: EquipmentWorkOrderListFilters,
): Promise<EquipmentWorkOrderListResult> => {
  await ensureEquipmentWorkOrderTables(db);
  const rows = await db.query(
    `
    SELECT
      wo.*,
      e.description AS equipment_description,
      e.identification_number AS equipment_identification_number,
      e.unit_name AS equipment_unit_name,
      e.operational_status AS equipment_operational_status,
      u.name AS responsible_user_name,
      u.department AS responsible_department,
      t.protocol_id AS task_protocol_id
    FROM clinic_equipment_work_orders wo
    INNER JOIN clinic_equipment e ON e.id = wo.equipment_id
    LEFT JOIN users u ON u.id = wo.responsible_user_id
    LEFT JOIN tasks t ON t.id = wo.linked_task_id
    ORDER BY wo.created_at DESC
    `,
  );
  const fileCountRows = await db.query(
    `
    SELECT work_order_id, COUNT(*) AS total
    FROM clinic_equipment_work_order_files
    GROUP BY work_order_id
    `,
  );
  const fileCountMap = new Map<string, number>(
    (fileCountRows as Record<string, unknown>[]).map((row) => [clean(row.work_order_id), Number(row.total || 0)]),
  );

  const query = clean(filters.search)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let list = (rows as Record<string, unknown>[]).map((row) =>
    mapWorkOrderListRow(row, fileCountMap.get(clean(row.id)) || 0),
  );

  if (query) {
    list = list.filter((item) =>
      [
        item.equipmentDescription,
        item.equipmentIdentificationNumber,
        item.problemDescription,
        item.taskProtocolId,
        item.responsibleUserName,
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(query),
    );
  }

  if (filters.status !== 'all') {
    list = list.filter((item) => item.status === filters.status);
  }
  if (filters.unit !== 'all') {
    list = list.filter((item) => item.equipmentUnitName === upper(filters.unit));
  }
  if (filters.responsibleUserId) {
    list = list.filter((item) => item.responsibleUserId === filters.responsibleUserId);
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const safePage = Math.min(filters.page, totalPages);
  const start = (safePage - 1) * filters.pageSize;
  const items = list.slice(start, start + filters.pageSize);

  return {
    items,
    total,
    page: safePage,
    pageSize: filters.pageSize,
    totalPages,
  };
};

export const listEquipmentWorkOrdersByEquipmentId = async (db: DbInterface, equipmentId: string) => {
  await ensureEquipmentWorkOrderTables(db);
  await ensureEquipmentExists(db, equipmentId);
  const rows = await db.query(
    `
    SELECT
      wo.*,
      e.description AS equipment_description,
      e.identification_number AS equipment_identification_number,
      e.unit_name AS equipment_unit_name,
      e.operational_status AS equipment_operational_status,
      u.name AS responsible_user_name,
      u.department AS responsible_department,
      t.protocol_id AS task_protocol_id
    FROM clinic_equipment_work_orders wo
    INNER JOIN clinic_equipment e ON e.id = wo.equipment_id
    LEFT JOIN users u ON u.id = wo.responsible_user_id
    LEFT JOIN tasks t ON t.id = wo.linked_task_id
    WHERE wo.equipment_id = ?
    ORDER BY wo.created_at DESC
    `,
    [equipmentId],
  );
  if (!rows.length) return [];
  const files = await db
    .query(
      `
      SELECT work_order_id, COUNT(*) AS total
      FROM clinic_equipment_work_order_files
      WHERE work_order_id IN (${rows.map(() => '?').join(',')})
      GROUP BY work_order_id
      `,
      (rows as Record<string, unknown>[]).map((row) => clean(row.id)),
    )
    .catch(() => []);
  const fileCountMap = new Map<string, number>(
    (files as Record<string, unknown>[]).map((row) => [clean(row.work_order_id), Number(row.total || 0)]),
  );
  return (rows as Record<string, unknown>[]).map((row) => mapWorkOrderListRow(row, fileCountMap.get(clean(row.id)) || 0));
};

export const getEquipmentWorkOrderById = async (
  db: DbInterface,
  workOrderId: string,
): Promise<EquipmentWorkOrderDetail | null> => {
  await ensureEquipmentWorkOrderTables(db);
  return buildEquipmentWorkOrderDetail(db, clean(workOrderId));
};

export const listEquipmentWorkOrderFiles = async (db: DbInterface, workOrderId: string) => {
  await ensureEquipmentWorkOrderTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM clinic_equipment_work_order_files
    WHERE work_order_id = ?
    ORDER BY created_at DESC
    `,
    [workOrderId],
  );
  return (rows as Record<string, unknown>[]).map((row) => mapWorkOrderFile(row));
};

export const getEquipmentWorkOrderFileById = async (db: DbInterface, fileId: string) => {
  await ensureEquipmentWorkOrderTables(db);
  const rows = await db.query(`SELECT * FROM clinic_equipment_work_order_files WHERE id = ? LIMIT 1`, [fileId]);
  return rows[0] ? mapWorkOrderFile(rows[0] as Record<string, unknown>) : null;
};

export const createEquipmentWorkOrder = async (
  db: DbInterface,
  equipmentId: string,
  payload: EquipmentWorkOrderCreateInput,
  actorUserId: string,
): Promise<EquipmentWorkOrderDetail> => {
  await ensureEquipmentWorkOrderTables(db);
  const openedAt = parseDate(payload.openedAt) || getTodayInSaoPauloIso();
  const responsibleUserId = clean(payload.responsibleUserId);
  const problemDescription = clean(payload.problemDescription);
  if (!responsibleUserId) throw new EquipmentWorkOrderValidationError('Selecione o responsável pela OS.');
  if (!problemDescription) throw new EquipmentWorkOrderValidationError('Descreva o problema ou ocorrência.');

  return runInTransaction(db, async (txDb) => {
    const [equipment, actorScope, responsible, lastMaintenanceSnapshotDate] = await Promise.all([
      ensureEquipmentExists(txDb, equipmentId),
      ensureAllowedProfile(txDb, actorUserId),
      ensureResponsibleIsEligible(txDb, responsibleUserId),
      getLastMaintenanceSnapshotDate(txDb, equipmentId),
    ]);

    await ensureNoActiveWorkOrder(txDb, equipmentId);

    const task = await createTask(
      txDb,
      {
        title: `OS equipamento ${equipment.identificationNumber} - ${equipment.description}`,
        description: [
          `Ocorrência registrada para o equipamento ${equipment.description}.`,
          `Identificação: ${equipment.identificationNumber}.`,
          `Unidade: ${equipment.unitName}.`,
          equipment.locationDetail ? `Localização: ${equipment.locationDetail}.` : '',
          `Data de abertura: ${openedAt}.`,
          lastMaintenanceSnapshotDate ? `Última manutenção registrada: ${lastMaintenanceSnapshotDate}.` : 'Sem manutenção concluída anterior registrada.',
          `Problema: ${problemDescription}.`,
        ]
          .filter(Boolean)
          .join('\n'),
        department: taskDepartmentByEquipmentType(equipment.equipmentType),
        priority: 'ALTA',
        status: 'A_FAZER',
        dueDate: openedAt,
        primaryAssigneeUserId: responsibleUserId,
      },
      actorUserId,
    );

    const workOrderId = randomUUID();
    const now = NOW();

    await txDb.execute(
      `
      INSERT INTO clinic_equipment_work_orders (
        id, equipment_id, linked_task_id, opened_at, opened_by_user_id, opened_by_profile_key,
        opened_by_group_key, opened_by_resolution_source, responsible_user_id, responsible_employee_id,
        responsible_profile_key, problem_description, last_maintenance_snapshot_date, previous_operational_status,
        status, started_at, resolved_at, closed_at, solution_notes, closing_operational_status,
        cancellation_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        workOrderId,
        equipmentId,
        task.id,
        openedAt,
        actorUserId,
        nullable(actorScope.profileKey),
        nullable(actorScope.matchedGroupKey),
        nullable(actorScope.resolutionSource),
        responsibleUserId,
        responsible.employeeId,
        responsible.profileKey,
        problemDescription,
        lastMaintenanceSnapshotDate,
        equipment.operationalStatus,
        'ABERTA',
        null,
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      ],
    );

    await txDb.execute(
      `
      UPDATE clinic_equipment
      SET operational_status = ?, updated_at = ?
      WHERE id = ?
      `,
      ['ENVIAR_MANUTENCAO', now, equipmentId],
    );

    await insertEquipmentEvent(txDb, {
      equipmentId,
      eventDate: openedAt,
      eventType: 'OCORRENCIA',
      description: `OS aberta para ${equipment.description}. Problema informado: ${problemDescription}`,
      handledBy: responsible.name,
      status: 'ABERTO',
      notes: `OS ${workOrderId} vinculada à tarefa ${task.protocolId}.`,
    });

    const created = await buildEquipmentWorkOrderDetail(txDb, workOrderId);
    if (!created) throw new EquipmentWorkOrderValidationError('Falha ao carregar a OS criada.', 500);
    return created;
  });
};

const applyStatusSync = async (
  db: DbInterface,
  workOrder: EquipmentWorkOrderDetail,
  nextStatus: EquipmentWorkOrderStatus,
  actorUserId: string,
  payload: Partial<{
    solutionNotes: string | null;
    closingOperationalStatus: EquipmentOperationalStatus | null;
    cancellationReason: string | null;
  }>,
) => {
  if (nextStatus === 'EM_ANDAMENTO') {
    await db.execute(
      `UPDATE clinic_equipment SET operational_status = ?, updated_at = ? WHERE id = ?`,
      ['EM_MANUTENCAO', NOW(), workOrder.equipmentId],
    );
    await updateTask(db, workOrder.linkedTaskId, { status: 'EM_ANDAMENTO' }, actorUserId, buildTaskViewer(actorUserId));
    return;
  }

  if (nextStatus === 'CONCLUIDA') {
    const finalStatus = payload.closingOperationalStatus || 'ATIVO';
    await db.execute(
      `UPDATE clinic_equipment SET operational_status = ?, updated_at = ? WHERE id = ?`,
      [finalStatus, NOW(), workOrder.equipmentId],
    );
    await updateTask(db, workOrder.linkedTaskId, { status: 'CONCLUIDA' }, actorUserId, buildTaskViewer(actorUserId));
    await insertEquipmentEvent(db, {
      equipmentId: workOrder.equipmentId,
      eventDate: getTodayInSaoPauloIso(),
      eventType: 'MANUTENCAO_CORRETIVA',
      description: `OS ${workOrder.id} concluída para ${workOrder.equipmentDescription}.`,
      handledBy: workOrder.responsibleUserName,
      status: 'CONCLUIDO',
      notes: payload.solutionNotes ? `Solução: ${payload.solutionNotes}` : `OS ${workOrder.id} concluída.`,
    });
    return;
  }

  if (nextStatus === 'CANCELADA') {
    await db.execute(
      `UPDATE clinic_equipment SET operational_status = ?, updated_at = ? WHERE id = ?`,
      [workOrder.previousOperationalStatus || 'ATIVO', NOW(), workOrder.equipmentId],
    );
    await updateTask(
      db,
      workOrder.linkedTaskId,
      { status: 'CANCELADA', cancellationReason: payload.cancellationReason || 'OS cancelada no painel.' },
      actorUserId,
      buildTaskViewer(actorUserId),
    );
  }
};

export const updateEquipmentWorkOrder = async (
  db: DbInterface,
  workOrderId: string,
  payload: Record<string, unknown>,
  actorUserId: string,
): Promise<EquipmentWorkOrderDetail> => {
  await ensureEquipmentWorkOrderTables(db);
  const cleanWorkOrderId = clean(workOrderId);
  if (!cleanWorkOrderId) throw new EquipmentWorkOrderValidationError('OS inválida.', 400);

  return runInTransaction(db, async (txDb) => {
    await ensureAllowedProfile(txDb, actorUserId);
    const current = await buildEquipmentWorkOrderDetail(txDb, cleanWorkOrderId);
    if (!current) throw new EquipmentWorkOrderValidationError('OS não encontrada.', 404);

    const nextStatus = Object.prototype.hasOwnProperty.call(payload, 'status')
      ? normalizeStatus(payload.status, current.status)
      : current.status;

    if (current.status === 'CONCLUIDA' || current.status === 'CANCELADA') {
      throw new EquipmentWorkOrderValidationError('Esta OS já foi encerrada e não pode ser alterada.', 409);
    }

    if (nextStatus === 'ABERTA' && current.status !== 'ABERTA') {
      throw new EquipmentWorkOrderValidationError('A OS não pode voltar para aberta após iniciar o atendimento.', 409);
    }

    if (nextStatus === 'CONCLUIDA' && !clean(payload.solutionNotes)) {
      throw new EquipmentWorkOrderValidationError('Informe a solução aplicada para concluir a OS.');
    }

    if (nextStatus === 'CANCELADA' && !clean(payload.cancellationReason)) {
      throw new EquipmentWorkOrderValidationError('Informe o motivo do cancelamento da OS.');
    }

    const now = NOW();
    const startedAt =
      nextStatus === 'EM_ANDAMENTO'
        ? current.startedAt || now
        : current.startedAt;
    const resolvedAt =
      nextStatus === 'CONCLUIDA'
        ? clean(payload.resolvedAt) || now
        : current.resolvedAt;
    const closedAt =
      nextStatus === 'CONCLUIDA' || nextStatus === 'CANCELADA'
        ? clean(payload.closedAt) || now
        : current.closedAt;
    const solutionNotes =
      Object.prototype.hasOwnProperty.call(payload, 'solutionNotes')
        ? nullable(payload.solutionNotes)
        : current.solutionNotes;
    const cancellationReason =
      Object.prototype.hasOwnProperty.call(payload, 'cancellationReason')
        ? nullable(payload.cancellationReason)
        : current.cancellationReason;
    const closingOperationalStatus =
      Object.prototype.hasOwnProperty.call(payload, 'closingOperationalStatus')
        ? (nullable(payload.closingOperationalStatus) as EquipmentOperationalStatus | null)
        : current.closingOperationalStatus;

    await txDb.execute(
      `
      UPDATE clinic_equipment_work_orders
      SET status = ?, started_at = ?, resolved_at = ?, closed_at = ?, solution_notes = ?,
          closing_operational_status = ?, cancellation_reason = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        nextStatus,
        startedAt,
        resolvedAt,
        closedAt,
        solutionNotes,
        closingOperationalStatus,
        cancellationReason,
        now,
        cleanWorkOrderId,
      ],
    );

    if (nextStatus !== current.status) {
      await applyStatusSync(txDb, current, nextStatus, actorUserId, {
        solutionNotes,
        closingOperationalStatus,
        cancellationReason,
      });
    }

    const updated = await buildEquipmentWorkOrderDetail(txDb, cleanWorkOrderId);
    if (!updated) throw new EquipmentWorkOrderValidationError('Falha ao carregar a OS atualizada.', 500);
    return updated;
  });
};

export const createEquipmentWorkOrderFileRecord = async (
  db: DbInterface,
  workOrderId: string,
  payload: EquipmentWorkOrderFileUploadInput,
) => {
  await ensureEquipmentWorkOrderTables(db);
  const existing = await buildEquipmentWorkOrderDetail(db, workOrderId);
  if (!existing) throw new EquipmentWorkOrderValidationError('OS não encontrada.', 404);

  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO clinic_equipment_work_order_files (
      id, work_order_id, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, notes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      workOrderId,
      clean(payload.storageProvider),
      nullable(payload.storageBucket),
      clean(payload.storageKey),
      clean(payload.originalName),
      clean(payload.mimeType),
      Number(payload.sizeBytes || 0),
      nullable(payload.notes),
      clean(payload.uploadedBy),
      NOW(),
    ],
  );

  const rows = await db.query(`SELECT * FROM clinic_equipment_work_order_files WHERE id = ? LIMIT 1`, [id]);
  return mapWorkOrderFile(rows[0] as Record<string, unknown>);
};

export const listActiveEquipmentWorkOrdersMap = async (db: DbInterface, equipmentIds: string[]) => {
  await ensureEquipmentWorkOrderTables(db);
  if (!equipmentIds.length) return new Map<string, { id: string; status: EquipmentWorkOrderStatus }>();
  const rows = await db.query(
    `
    SELECT equipment_id, id, status
    FROM clinic_equipment_work_orders
    WHERE equipment_id IN (${equipmentIds.map(() => '?').join(',')})
      AND status IN ('ABERTA', 'EM_ANDAMENTO')
    ORDER BY created_at DESC
    `,
    equipmentIds,
  );
  const out = new Map<string, { id: string; status: EquipmentWorkOrderStatus }>();
  for (const row of rows as Record<string, unknown>[]) {
    const equipmentId = clean(row.equipment_id);
    if (out.has(equipmentId)) continue;
    out.set(equipmentId, {
      id: clean(row.id),
      status: normalizeStatus(row.status),
    });
  }
  return out;
};
