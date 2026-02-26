import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { ensureQmsTables, QmsValidationError } from '@/lib/qms/repository';
import type {
  QmsTraining,
  QmsTrainingExecutionStatus,
  QmsTrainingFile,
  QmsTrainingFileInput,
  QmsTrainingFileType,
  QmsTrainingInput,
  QmsTrainingPlan,
  QmsTrainingPlanInput,
  QmsTrainingPlanStatus,
  QmsTrainingType,
} from '@/lib/qms/types';

let trainingTablesEnsured = false;

export { QmsValidationError };

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const bool = (value: unknown) => value === true || value === 1 || String(value || '') === '1';

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || clean(value) === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const toIntOrNull = (value: unknown): number | null => {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Math.trunc(n);
};

const parseDate = (value: unknown): string | null => {
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

const ALLOWED_TYPES = new Set<QmsTrainingType>(['inicial', 'reciclagem']);
const ALLOWED_PLAN_STATUS = new Set<QmsTrainingPlanStatus>([
  'planejado',
  'em_andamento',
  'concluido',
  'cancelado',
]);
const ALLOWED_EXEC_STATUS = new Set<QmsTrainingExecutionStatus>([
  'planejado',
  'em_andamento',
  'concluido',
  'cancelado',
]);
const ALLOWED_FILE_TYPES = new Set<QmsTrainingFileType>([
  'attendance_list',
  'evaluation',
  'evidence',
  'other',
]);

const normalizeType = (value: unknown, fallback: QmsTrainingType = 'inicial'): QmsTrainingType => {
  const normalized = clean(value).toLowerCase() as QmsTrainingType;
  return ALLOWED_TYPES.has(normalized) ? normalized : fallback;
};

const normalizePlanStatus = (
  value: unknown,
  fallback: QmsTrainingPlanStatus = 'planejado'
): QmsTrainingPlanStatus => {
  const normalized = clean(value).toLowerCase() as QmsTrainingPlanStatus;
  return ALLOWED_PLAN_STATUS.has(normalized) ? normalized : fallback;
};

const normalizeExecStatus = (
  value: unknown,
  fallback: QmsTrainingExecutionStatus = 'planejado'
): QmsTrainingExecutionStatus => {
  const normalized = clean(value).toLowerCase() as QmsTrainingExecutionStatus;
  return ALLOWED_EXEC_STATUS.has(normalized) ? normalized : fallback;
};

const normalizeFileType = (
  value: unknown,
  fallback: QmsTrainingFileType = 'other'
): QmsTrainingFileType => {
  const normalized = clean(value).toLowerCase() as QmsTrainingFileType;
  return ALLOWED_FILE_TYPES.has(normalized) ? normalized : fallback;
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      /duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const nextCode = async (db: DbInterface, prefix: 'CRN' | 'TRN', table: string) => {
  const year = new Date().getFullYear();
  const rows = await db.query(
    `SELECT code FROM ${table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1`,
    [`${prefix}-${year}-%`]
  );
  const last = clean(rows?.[0]?.code);
  const match = last.match(/^\w+-\d{4}-(\d{4})$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
};

const insertAuditLog = async (
  db: DbInterface,
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  before: unknown,
  after: unknown
) => {
  await db.execute(
    `
    INSERT INTO qms_audit_log (
      id, entity_type, entity_id, action, before_json, after_json, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      actorUserId,
      nowIso(),
    ]
  );
};

const mapPlan = (row: any): QmsTrainingPlan => ({
  id: clean(row.id),
  code: clean(row.code),
  theme: clean(row.theme),
  sector: clean(row.sector),
  trainingType: normalizeType(row.training_type, 'inicial'),
  objective: clean(row.objective) || null,
  instructor: clean(row.instructor) || null,
  targetAudience: clean(row.target_audience) || null,
  workloadHours: toNumberOrNull(row.workload_hours),
  plannedDate: parseDate(row.planned_date),
  expirationDate: parseDate(row.expiration_date),
  evaluationApplied: bool(row.evaluation_applied),
  evaluationType: clean(row.evaluation_type) || null,
  targetIndicator: clean(row.target_indicator) || null,
  expectedGoal: clean(row.expected_goal) || null,
  status: normalizePlanStatus(row.status, 'planejado'),
  notes: clean(row.notes) || null,
  linkedDocumentIds: [],
  linkedDocumentCodes: [],
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by),
  updatedAt: clean(row.updated_at),
});

const mapTraining = (row: any): QmsTraining => ({
  id: clean(row.id),
  code: clean(row.code),
  planId: clean(row.plan_id) || null,
  planCode: clean(row.plan_code) || null,
  name: clean(row.name),
  sector: clean(row.sector),
  trainingType: normalizeType(row.training_type, 'inicial'),
  instructor: clean(row.instructor) || null,
  targetAudience: clean(row.target_audience) || null,
  performedAt: parseDate(row.performed_at),
  workloadHours: toNumberOrNull(row.workload_hours),
  evaluationApplied: bool(row.evaluation_applied),
  averageScore: toNumberOrNull(row.average_score),
  nextTrainingDate: parseDate(row.next_training_date),
  status: normalizeExecStatus(row.status, 'planejado'),
  participantsPlanned: toIntOrNull(row.participants_planned),
  participantsActual: toIntOrNull(row.participants_actual),
  resultPostTraining: clean(row.result_post_training) || null,
  notes: clean(row.notes) || null,
  filesCount: Number(row.files_count || 0),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by),
  updatedAt: clean(row.updated_at),
});

const mapTrainingFile = (row: any): QmsTrainingFile => ({
  id: clean(row.id),
  trainingId: clean(row.training_id),
  fileType: normalizeFileType(row.file_type, 'other'),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  filename: clean(row.filename),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  uploadedBy: clean(row.uploaded_by),
  uploadedAt: clean(row.uploaded_at),
  isActive: bool(row.is_active),
});

const loadPlanLinks = async (db: DbInterface, planId: string) => {
  const rows = await db.query(
    `
    SELECT l.document_id, d.code
    FROM qms_document_training_links l
    INNER JOIN qms_documents d ON d.id = l.document_id
    WHERE l.training_plan_id = ?
    ORDER BY d.code ASC
    `,
    [planId]
  );
  return {
    ids: rows.map((row) => clean(row.document_id)).filter(Boolean),
    codes: rows.map((row) => clean(row.code)).filter(Boolean),
  };
};

const upsertPlanLinks = async (
  db: DbInterface,
  planId: string,
  documentIds: string[] | undefined
) => {
  if (!Array.isArray(documentIds)) return;
  const normalized = Array.from(new Set(documentIds.map((id) => clean(id)).filter(Boolean)));

  await db.execute(`DELETE FROM qms_document_training_links WHERE training_plan_id = ?`, [planId]);
  for (const documentId of normalized) {
    await db.execute(
      `
      INSERT INTO qms_document_training_links (
        id, document_id, training_plan_id, created_at
      ) VALUES (?, ?, ?, ?)
      `,
      [randomUUID(), documentId, planId, nowIso()]
    );
  }
};

const requirePlanName = (name: string) => {
  if (!clean(name)) {
    throw new QmsValidationError('Tema do treinamento e obrigatorio.');
  }
};

const requireTrainingName = (name: string) => {
  if (!clean(name)) {
    throw new QmsValidationError('Nome do treinamento e obrigatorio.');
  }
};

export const ensureQmsTrainingTables = async (db: DbInterface) => {
  if (trainingTablesEnsured) return;
  await ensureQmsTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_training_plans (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      theme VARCHAR(220) NOT NULL,
      sector VARCHAR(120) NOT NULL,
      training_type VARCHAR(30) NOT NULL,
      objective TEXT,
      instructor VARCHAR(140),
      target_audience VARCHAR(220),
      workload_hours DECIMAL(10,2),
      planned_date TEXT,
      expiration_date TEXT,
      evaluation_applied INTEGER NOT NULL DEFAULT 0,
      evaluation_type VARCHAR(140),
      target_indicator VARCHAR(180),
      expected_goal TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'planejado',
      notes TEXT,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_trainings (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      plan_id VARCHAR(64),
      name VARCHAR(220) NOT NULL,
      sector VARCHAR(120) NOT NULL,
      training_type VARCHAR(30) NOT NULL,
      instructor VARCHAR(140),
      target_audience VARCHAR(220),
      performed_at TEXT,
      workload_hours DECIMAL(10,2),
      evaluation_applied INTEGER NOT NULL DEFAULT 0,
      average_score DECIMAL(10,2),
      next_training_date TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'planejado',
      participants_planned INTEGER,
      participants_actual INTEGER,
      result_post_training TEXT,
      notes TEXT,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_training_files (
      id VARCHAR(64) PRIMARY KEY,
      training_id VARCHAR(64) NOT NULL,
      file_type VARCHAR(40) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      uploaded_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_document_training_links (
      id VARCHAR(64) PRIMARY KEY,
      document_id VARCHAR(64) NOT NULL,
      training_plan_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE qms_training_plans ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_trainings ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE qms_training_files ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);

  trainingTablesEnsured = true;
};

export const listQmsTrainingPlans = async (
  db: DbInterface,
  filters?: { search?: string; sector?: string; status?: string }
): Promise<QmsTrainingPlan[]> => {
  await ensureQmsTrainingTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];

  const search = clean(filters?.search);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    where.push('(LOWER(code) LIKE ? OR LOWER(theme) LIKE ? OR LOWER(sector) LIKE ?)');
    params.push(like, like, like);
  }

  const sector = clean(filters?.sector);
  if (sector) {
    where.push('LOWER(sector) = ?');
    params.push(sector.toLowerCase());
  }

  const status = clean(filters?.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(status) = ?');
    params.push(status);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM qms_training_plans
    WHERE ${where.join(' AND ')}
    ORDER BY planned_date DESC, updated_at DESC
    `,
    params
  );

  const plans: QmsTrainingPlan[] = [];
  for (const row of rows) {
    const item = mapPlan(row);
    const links = await loadPlanLinks(db, item.id);
    item.linkedDocumentIds = links.ids;
    item.linkedDocumentCodes = links.codes;
    plans.push(item);
  }
  return plans;
};

export const getQmsTrainingPlanById = async (
  db: DbInterface,
  planId: string
): Promise<QmsTrainingPlan | null> => {
  await ensureQmsTrainingTables(db);
  const rows = await db.query(`SELECT * FROM qms_training_plans WHERE id = ? LIMIT 1`, [planId]);
  if (!rows?.[0]) return null;
  const item = mapPlan(rows[0]);
  const links = await loadPlanLinks(db, item.id);
  item.linkedDocumentIds = links.ids;
  item.linkedDocumentCodes = links.codes;
  return item;
};

export const createQmsTrainingPlan = async (
  db: DbInterface,
  input: QmsTrainingPlanInput,
  actorUserId: string
): Promise<QmsTrainingPlan> => {
  await ensureQmsTrainingTables(db);
  requirePlanName(input.theme);

  const id = randomUUID();
  const createdAt = nowIso();
  const code = clean(input.code) || (await nextCode(db, 'CRN', 'qms_training_plans'));

  const item: QmsTrainingPlan = {
    id,
    code,
    theme: clean(input.theme),
    sector: clean(input.sector) || 'Geral',
    trainingType: normalizeType(input.trainingType, 'inicial'),
    objective: clean(input.objective) || null,
    instructor: clean(input.instructor) || null,
    targetAudience: clean(input.targetAudience) || null,
    workloadHours: toNumberOrNull(input.workloadHours),
    plannedDate: parseDate(input.plannedDate),
    expirationDate: parseDate(input.expirationDate),
    evaluationApplied: Boolean(input.evaluationApplied),
    evaluationType: clean(input.evaluationType) || null,
    targetIndicator: clean(input.targetIndicator) || null,
    expectedGoal: clean(input.expectedGoal) || null,
    status: normalizePlanStatus(input.status, 'planejado'),
    notes: clean(input.notes) || null,
    linkedDocumentIds: [],
    linkedDocumentCodes: [],
    createdBy: actorUserId,
    createdAt,
    updatedBy: actorUserId,
    updatedAt: createdAt,
  };

  await db.execute(
    `
    INSERT INTO qms_training_plans (
      id, code, theme, sector, training_type, objective, instructor, target_audience,
      workload_hours, planned_date, expiration_date, evaluation_applied, evaluation_type,
      target_indicator, expected_goal, status, notes, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.code,
      item.theme,
      item.sector,
      item.trainingType,
      item.objective,
      item.instructor,
      item.targetAudience,
      item.workloadHours,
      item.plannedDate,
      item.expirationDate,
      item.evaluationApplied ? 1 : 0,
      item.evaluationType,
      item.targetIndicator,
      item.expectedGoal,
      item.status,
      item.notes,
      item.createdBy,
      item.createdAt,
      item.updatedBy,
      item.updatedAt,
    ]
  );

  await upsertPlanLinks(db, item.id, input.linkedDocumentIds);
  const created = await getQmsTrainingPlanById(db, item.id);
  if (!created) throw new Error('Falha ao carregar cronograma criado.');
  await insertAuditLog(db, 'training_plan', item.id, 'create', actorUserId, null, created);
  return created;
};

export const updateQmsTrainingPlan = async (
  db: DbInterface,
  planId: string,
  input: Partial<QmsTrainingPlanInput>,
  actorUserId: string
): Promise<QmsTrainingPlan> => {
  await ensureQmsTrainingTables(db);
  const current = await getQmsTrainingPlanById(db, planId);
  if (!current) throw new QmsValidationError('Cronograma nao encontrado.', 404);

  const merged: QmsTrainingPlan = {
    ...current,
    code: input.code !== undefined ? clean(input.code) || current.code : current.code,
    theme: input.theme !== undefined ? clean(input.theme) : current.theme,
    sector: input.sector !== undefined ? clean(input.sector) || 'Geral' : current.sector,
    trainingType:
      input.trainingType !== undefined
        ? normalizeType(input.trainingType, current.trainingType)
        : current.trainingType,
    objective: input.objective !== undefined ? clean(input.objective) || null : current.objective,
    instructor: input.instructor !== undefined ? clean(input.instructor) || null : current.instructor,
    targetAudience:
      input.targetAudience !== undefined ? clean(input.targetAudience) || null : current.targetAudience,
    workloadHours:
      input.workloadHours !== undefined ? toNumberOrNull(input.workloadHours) : current.workloadHours,
    plannedDate: input.plannedDate !== undefined ? parseDate(input.plannedDate) : current.plannedDate,
    expirationDate:
      input.expirationDate !== undefined ? parseDate(input.expirationDate) : current.expirationDate,
    evaluationApplied:
      input.evaluationApplied !== undefined
        ? Boolean(input.evaluationApplied)
        : current.evaluationApplied,
    evaluationType:
      input.evaluationType !== undefined ? clean(input.evaluationType) || null : current.evaluationType,
    targetIndicator:
      input.targetIndicator !== undefined ? clean(input.targetIndicator) || null : current.targetIndicator,
    expectedGoal:
      input.expectedGoal !== undefined ? clean(input.expectedGoal) || null : current.expectedGoal,
    status:
      input.status !== undefined
        ? normalizePlanStatus(input.status, current.status)
        : current.status,
    notes: input.notes !== undefined ? clean(input.notes) || null : current.notes,
    updatedBy: actorUserId,
    updatedAt: nowIso(),
  };

  requirePlanName(merged.theme);

  await db.execute(
    `
    UPDATE qms_training_plans
    SET code = ?, theme = ?, sector = ?, training_type = ?, objective = ?, instructor = ?,
        target_audience = ?, workload_hours = ?, planned_date = ?, expiration_date = ?,
        evaluation_applied = ?, evaluation_type = ?, target_indicator = ?, expected_goal = ?,
        status = ?, notes = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      merged.code,
      merged.theme,
      merged.sector,
      merged.trainingType,
      merged.objective,
      merged.instructor,
      merged.targetAudience,
      merged.workloadHours,
      merged.plannedDate,
      merged.expirationDate,
      merged.evaluationApplied ? 1 : 0,
      merged.evaluationType,
      merged.targetIndicator,
      merged.expectedGoal,
      merged.status,
      merged.notes,
      merged.updatedBy,
      merged.updatedAt,
      planId,
    ]
  );

  await upsertPlanLinks(db, planId, input.linkedDocumentIds);
  const updated = await getQmsTrainingPlanById(db, planId);
  if (!updated) throw new Error('Falha ao carregar cronograma atualizado.');
  await insertAuditLog(db, 'training_plan', planId, 'update', actorUserId, current, updated);
  return updated;
};

export const deleteQmsTrainingPlan = async (
  db: DbInterface,
  planId: string,
  actorUserId: string
) => {
  await ensureQmsTrainingTables(db);
  const current = await getQmsTrainingPlanById(db, planId);
  if (!current) throw new QmsValidationError('Cronograma nao encontrado.', 404);

  await db.execute(`DELETE FROM qms_document_training_links WHERE training_plan_id = ?`, [planId]);
  await db.execute(`UPDATE qms_trainings SET plan_id = NULL WHERE plan_id = ?`, [planId]);
  await db.execute(`DELETE FROM qms_training_plans WHERE id = ?`, [planId]);
  await insertAuditLog(db, 'training_plan', planId, 'delete', actorUserId, current, null);
};

export const listQmsTrainings = async (
  db: DbInterface,
  filters?: { search?: string; sector?: string; status?: string }
): Promise<QmsTraining[]> => {
  await ensureQmsTrainingTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];

  const search = clean(filters?.search);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    where.push('(LOWER(t.code) LIKE ? OR LOWER(t.name) LIKE ? OR LOWER(t.sector) LIKE ?)');
    params.push(like, like, like);
  }

  const sector = clean(filters?.sector);
  if (sector) {
    where.push('LOWER(t.sector) = ?');
    params.push(sector.toLowerCase());
  }

  const status = clean(filters?.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(t.status) = ?');
    params.push(status);
  }

  const rows = await db.query(
    `
    SELECT
      t.*,
      p.code AS plan_code,
      (
        SELECT COUNT(1)
        FROM qms_training_files f
        WHERE f.training_id = t.id AND COALESCE(f.is_active, 1) = 1
      ) AS files_count
    FROM qms_trainings t
    LEFT JOIN qms_training_plans p ON p.id = t.plan_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.performed_at DESC, t.updated_at DESC
    `,
    params
  );

  return rows.map(mapTraining);
};

export const getQmsTrainingById = async (
  db: DbInterface,
  trainingId: string
): Promise<QmsTraining | null> => {
  await ensureQmsTrainingTables(db);
  const rows = await db.query(
    `
    SELECT
      t.*,
      p.code AS plan_code,
      (
        SELECT COUNT(1)
        FROM qms_training_files f
        WHERE f.training_id = t.id AND COALESCE(f.is_active, 1) = 1
      ) AS files_count
    FROM qms_trainings t
    LEFT JOIN qms_training_plans p ON p.id = t.plan_id
    WHERE t.id = ?
    LIMIT 1
    `,
    [trainingId]
  );
  if (!rows?.[0]) return null;
  return mapTraining(rows[0]);
};

export const createQmsTraining = async (
  db: DbInterface,
  input: QmsTrainingInput,
  actorUserId: string
): Promise<QmsTraining> => {
  await ensureQmsTrainingTables(db);
  requireTrainingName(input.name);

  const id = randomUUID();
  const createdAt = nowIso();
  const code = clean(input.code) || (await nextCode(db, 'TRN', 'qms_trainings'));

  await db.execute(
    `
    INSERT INTO qms_trainings (
      id, code, plan_id, name, sector, training_type, instructor, target_audience, performed_at,
      workload_hours, evaluation_applied, average_score, next_training_date, status,
      participants_planned, participants_actual, result_post_training, notes,
      created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      code,
      clean(input.planId) || null,
      clean(input.name),
      clean(input.sector) || 'Geral',
      normalizeType(input.trainingType, 'inicial'),
      clean(input.instructor) || null,
      clean(input.targetAudience) || null,
      parseDate(input.performedAt),
      toNumberOrNull(input.workloadHours),
      input.evaluationApplied ? 1 : 0,
      toNumberOrNull(input.averageScore),
      parseDate(input.nextTrainingDate),
      normalizeExecStatus(input.status, 'planejado'),
      toIntOrNull(input.participantsPlanned),
      toIntOrNull(input.participantsActual),
      clean(input.resultPostTraining) || null,
      clean(input.notes) || null,
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );

  const created = await getQmsTrainingById(db, id);
  if (!created) throw new Error('Falha ao carregar treinamento criado.');
  await insertAuditLog(db, 'training', id, 'create', actorUserId, null, created);
  return created;
};

export const updateQmsTraining = async (
  db: DbInterface,
  trainingId: string,
  input: Partial<QmsTrainingInput>,
  actorUserId: string
): Promise<QmsTraining> => {
  await ensureQmsTrainingTables(db);
  const current = await getQmsTrainingById(db, trainingId);
  if (!current) throw new QmsValidationError('Treinamento nao encontrado.', 404);

  const merged: QmsTraining = {
    ...current,
    code: input.code !== undefined ? clean(input.code) || current.code : current.code,
    planId: input.planId !== undefined ? clean(input.planId) || null : current.planId,
    name: input.name !== undefined ? clean(input.name) : current.name,
    sector: input.sector !== undefined ? clean(input.sector) || 'Geral' : current.sector,
    trainingType:
      input.trainingType !== undefined
        ? normalizeType(input.trainingType, current.trainingType)
        : current.trainingType,
    instructor: input.instructor !== undefined ? clean(input.instructor) || null : current.instructor,
    targetAudience:
      input.targetAudience !== undefined ? clean(input.targetAudience) || null : current.targetAudience,
    performedAt:
      input.performedAt !== undefined ? parseDate(input.performedAt) : current.performedAt,
    workloadHours:
      input.workloadHours !== undefined ? toNumberOrNull(input.workloadHours) : current.workloadHours,
    evaluationApplied:
      input.evaluationApplied !== undefined
        ? Boolean(input.evaluationApplied)
        : current.evaluationApplied,
    averageScore:
      input.averageScore !== undefined ? toNumberOrNull(input.averageScore) : current.averageScore,
    nextTrainingDate:
      input.nextTrainingDate !== undefined
        ? parseDate(input.nextTrainingDate)
        : current.nextTrainingDate,
    status:
      input.status !== undefined
        ? normalizeExecStatus(input.status, current.status)
        : current.status,
    participantsPlanned:
      input.participantsPlanned !== undefined
        ? toIntOrNull(input.participantsPlanned)
        : current.participantsPlanned,
    participantsActual:
      input.participantsActual !== undefined
        ? toIntOrNull(input.participantsActual)
        : current.participantsActual,
    resultPostTraining:
      input.resultPostTraining !== undefined
        ? clean(input.resultPostTraining) || null
        : current.resultPostTraining,
    notes: input.notes !== undefined ? clean(input.notes) || null : current.notes,
    updatedBy: actorUserId,
    updatedAt: nowIso(),
  };

  requireTrainingName(merged.name);

  await db.execute(
    `
    UPDATE qms_trainings
    SET code = ?, plan_id = ?, name = ?, sector = ?, training_type = ?, instructor = ?,
        target_audience = ?, performed_at = ?, workload_hours = ?, evaluation_applied = ?,
        average_score = ?, next_training_date = ?, status = ?, participants_planned = ?,
        participants_actual = ?, result_post_training = ?, notes = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      merged.code,
      merged.planId,
      merged.name,
      merged.sector,
      merged.trainingType,
      merged.instructor,
      merged.targetAudience,
      merged.performedAt,
      merged.workloadHours,
      merged.evaluationApplied ? 1 : 0,
      merged.averageScore,
      merged.nextTrainingDate,
      merged.status,
      merged.participantsPlanned,
      merged.participantsActual,
      merged.resultPostTraining,
      merged.notes,
      merged.updatedBy,
      merged.updatedAt,
      trainingId,
    ]
  );

  const updated = await getQmsTrainingById(db, trainingId);
  if (!updated) throw new Error('Falha ao carregar treinamento atualizado.');
  await insertAuditLog(db, 'training', trainingId, 'update', actorUserId, current, updated);
  return updated;
};

export const deleteQmsTraining = async (
  db: DbInterface,
  trainingId: string,
  actorUserId: string
) => {
  await ensureQmsTrainingTables(db);
  const current = await getQmsTrainingById(db, trainingId);
  if (!current) throw new QmsValidationError('Treinamento nao encontrado.', 404);

  await db.execute(`DELETE FROM qms_training_files WHERE training_id = ?`, [trainingId]);
  await db.execute(`DELETE FROM qms_trainings WHERE id = ?`, [trainingId]);
  await insertAuditLog(db, 'training', trainingId, 'delete', actorUserId, current, null);
};

export const listQmsTrainingFiles = async (
  db: DbInterface,
  trainingId: string
): Promise<QmsTrainingFile[]> => {
  await ensureQmsTrainingTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM qms_training_files
    WHERE training_id = ? AND COALESCE(is_active, 1) = 1
    ORDER BY uploaded_at DESC
    `,
    [trainingId]
  );
  return rows.map(mapTrainingFile);
};

export const getQmsTrainingFileById = async (
  db: DbInterface,
  trainingId: string,
  fileId: string
): Promise<QmsTrainingFile | null> => {
  await ensureQmsTrainingTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM qms_training_files
    WHERE training_id = ? AND id = ? AND COALESCE(is_active, 1) = 1
    LIMIT 1
    `,
    [trainingId, fileId]
  );
  if (!rows?.[0]) return null;
  return mapTrainingFile(rows[0]);
};

export const createQmsTrainingFileRecord = async (
  db: DbInterface,
  trainingId: string,
  input: QmsTrainingFileInput,
  actorUserId: string
): Promise<QmsTrainingFile> => {
  await ensureQmsTrainingTables(db);
  const training = await getQmsTrainingById(db, trainingId);
  if (!training) throw new QmsValidationError('Treinamento nao encontrado.', 404);

  const fileType = normalizeFileType(input.fileType, 'other');
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO qms_training_files (
      id, training_id, file_type, storage_provider, storage_bucket, storage_key,
      filename, mime_type, size_bytes, uploaded_by, uploaded_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      id,
      trainingId,
      fileType,
      clean(input.storageProvider),
      clean(input.storageBucket) || null,
      clean(input.storageKey),
      clean(input.filename),
      clean(input.mimeType),
      Number(input.sizeBytes || 0),
      actorUserId,
      createdAt,
    ]
  );

  await db.execute(
    `
    UPDATE qms_trainings
    SET updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, createdAt, trainingId]
  );

  const file = await getQmsTrainingFileById(db, trainingId, id);
  if (!file) throw new Error('Falha ao carregar arquivo de treinamento.');
  await insertAuditLog(db, 'training_file', id, 'create', actorUserId, null, file);
  return file;
};

export const listQmsDocumentOptions = async (
  db: DbInterface
): Promise<Array<{ id: string; code: string; name: string; sector: string }>> => {
  await ensureQmsTrainingTables(db);
  const rows = await db.query(
    `
    SELECT id, code, name, sector
    FROM qms_documents
    WHERE LOWER(status) <> 'arquivado'
    ORDER BY code ASC
    `,
    []
  );
  return rows.map((row) => ({
    id: clean(row.id),
    code: clean(row.code),
    name: clean(row.name),
    sector: clean(row.sector),
  }));
};

export const refreshQmsTrainingStatuses = async (
  db: DbInterface
): Promise<{
  plans: number;
  executions: number;
}> => {
  await ensureQmsTrainingTables(db);
  const plansRows = await db.query(`SELECT COUNT(1) AS total FROM qms_training_plans`);
  const execRows = await db.query(`SELECT COUNT(1) AS total FROM qms_trainings`);
  const plans = Number(plansRows?.[0]?.total || 0);
  const executions = Number(execRows?.[0]?.total || 0);

  const details = `refresh plans=${plans} exec=${executions}`;
  await db.execute(
    `
    INSERT INTO system_status (service_name, status, last_run, details)
    VALUES ('qms_treinamentos', 'COMPLETED', datetime('now'), ?)
    ON CONFLICT(service_name) DO UPDATE SET
      status = excluded.status,
      last_run = excluded.last_run,
      details = excluded.details
    `,
    [details]
  );

  return { plans, executions };
};
