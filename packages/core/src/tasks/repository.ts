import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';
import { runInTransaction } from '../db';
import type {
  TaskActivityLog,
  TaskApprovalDecisionInput,
  TaskApprovalRequest,
  TaskApprovalRequestInput,
  TaskAssignee,
  TaskAttachment,
  TaskAttachmentInput,
  TaskComment,
  TaskCommentAttachment,
  TaskCommentInput,
  TaskCreateInput,
  TaskDashboardSummary,
  TaskDetail,
  TaskListFilters,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TaskUpdateInput,
  TaskViewerContext,
} from './types';

type Row = Record<string, unknown>;

export class TaskValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const parseIntSafe = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const parseNumberSafe = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const parseBool = (value: unknown) =>
  value === true || value === 1 || String(value ?? '').trim() === '1' || String(value ?? '').toLowerCase() === 'true';
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
};

const PRIORITIES: TaskPriority[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const STATUSES: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'CANCELADA'];
const APPROVAL_DECISIONS = ['PENDENTE', 'APROVADA', 'REPROVADA', 'DEVOLVIDA', 'CANCELADA'] as const;

const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const userIdEqualsSql = (column: string) =>
  isMysqlProvider()
    ? `${column} COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`
    : `${column} = ?`;

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(msg) || /Duplicate key name/i.test(msg)) return;
    throw error;
  }
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

const normalizePriority = (value: unknown, fallback: TaskPriority = 'MEDIA'): TaskPriority => {
  const raw = upper(value);
  if (PRIORITIES.includes(raw as TaskPriority)) return raw as TaskPriority;
  return fallback;
};

const normalizeStatus = (value: unknown, fallback: TaskStatus = 'BACKLOG'): TaskStatus => {
  const raw = upper(value);
  if (STATUSES.includes(raw as TaskStatus)) return raw as TaskStatus;
  return fallback;
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

const serializePayload = (payload: Record<string, unknown> | null) => (payload ? JSON.stringify(payload) : null);

const ensureUserIsActive = async (db: DbInterface, userId: string) => {
  const cleanUserId = clean(userId);
  if (!cleanUserId) {
    throw new TaskValidationError('Usuário informado não está ativo ou não existe.', 404);
  }
  const rows = await db.query(
    `
    SELECT id
    FROM users
    WHERE ${userIdEqualsSql('id')} AND UPPER(TRIM(COALESCE(status, 'ATIVO'))) = 'ATIVO'
    LIMIT 1
    `,
    [cleanUserId]
  );
  if (!rows[0]) {
    throw new TaskValidationError('Usuário informado não está ativo ou não existe.', 404);
  }
};

const ensureTaskExists = async (db: DbInterface, taskId: string) => {
  const rows = await db.query(`SELECT * FROM tasks WHERE id = ? LIMIT 1`, [taskId]);
  const row = rows[0] as Row | undefined;
  if (!row) throw new TaskValidationError('Tarefa não encontrada.', 404);
  return row;
};

const ensureViewerCanAccessTask = async (db: DbInterface, taskId: string, viewer: TaskViewerContext) => {
  if (viewer.canViewAll) return;
  const rows = await db.query(
    `
    SELECT t.id
    FROM tasks t
    LEFT JOIN task_assignees a ON a.task_id = t.id
    WHERE t.id = ?
      AND (
        ${userIdEqualsSql('t.created_by')}
        OR ${userIdEqualsSql('t.primary_assignee_user_id')}
        OR ${userIdEqualsSql('t.approver_user_id')}
        OR ${userIdEqualsSql('a.user_id')}
      )
    LIMIT 1
    `,
    [taskId, viewer.userId, viewer.userId, viewer.userId, viewer.userId]
  );
  if (!rows[0]) {
    throw new TaskValidationError('Você não possui acesso a esta tarefa.', 403);
  }
};

const insertActivity = async (
  db: DbInterface,
  taskId: string,
  action: string,
  actorUserId: string,
  payload: Record<string, unknown> | null
) => {
  await db.execute(
    `
    INSERT INTO task_activity_log (
      id, task_id, action, actor_user_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), taskId, action, actorUserId, serializePayload(payload), NOW()]
  );
};

const mapAssignee = (row: Row): TaskAssignee => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  userId: clean(row.user_id),
  roleType: upper(row.role_type || 'COLLABORATOR') as TaskAssignee['roleType'],
  createdAt: clean(row.created_at),
});

const mapAttachment = (row: Row): TaskAttachment => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: nullable(row.storage_bucket),
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: parseNumberSafe(row.size_bytes),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapCommentAttachment = (row: Row): TaskCommentAttachment => ({
  id: clean(row.id),
  commentId: clean(row.comment_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: nullable(row.storage_bucket),
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: parseNumberSafe(row.size_bytes),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapApprovalRequest = (row: Row): TaskApprovalRequest => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  approverUserId: clean(row.approver_user_id),
  requestedBy: clean(row.requested_by),
  requestedAt: clean(row.requested_at),
  decisionStatus: upper(row.decision_status || 'PENDENTE') as TaskApprovalRequest['decisionStatus'],
  decisionNotes: nullable(row.decision_notes),
  decidedBy: nullable(row.decided_by),
  decidedAt: nullable(row.decided_at),
  cycleNumber: parseIntSafe(row.cycle_number, 1),
  isActive: parseBool(row.is_active),
});

const mapActivity = (row: Row): TaskActivityLog => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  action: clean(row.action),
  actorUserId: clean(row.actor_user_id),
  payloadJson: nullable(row.payload_json),
  createdAt: clean(row.created_at),
});

const mapSummaryRow = (
  row: Row,
  assignees: TaskAssignee[],
  latestApproval: TaskApprovalRequest | null,
  commentCount: number,
  attachmentCount: number
): TaskSummary => ({
  id: clean(row.id),
  protocolNumber: parseIntSafe(row.protocol_number),
  protocolId: clean(row.protocol_id),
  title: clean(row.title),
  description: clean(row.description),
  department: clean(row.department),
  priority: normalizePriority(row.priority),
  status: normalizeStatus(row.status),
  dueDate: parseDate(row.due_date),
  startDate: parseDate(row.start_date),
  createdBy: clean(row.created_by),
  primaryAssigneeUserId: nullable(row.primary_assignee_user_id),
  approverUserId: nullable(row.approver_user_id),
  completedAt: nullable(row.completed_at),
  canceledAt: nullable(row.canceled_at),
  cancellationReason: nullable(row.cancellation_reason),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
  assignees,
  latestApproval,
  commentCount,
  attachmentCount,
});

const loadTaskCollections = async (db: DbInterface, taskIds: string[]) => {
  if (!taskIds.length) {
    return {
      assigneesByTask: new Map<string, TaskAssignee[]>(),
      attachmentsByTask: new Map<string, TaskAttachment[]>(),
      commentsByTask: new Map<string, TaskComment[]>(),
      approvalsByTask: new Map<string, TaskApprovalRequest[]>(),
      activityByTask: new Map<string, TaskActivityLog[]>(),
      latestApprovalByTask: new Map<string, TaskApprovalRequest | null>(),
      commentCountByTask: new Map<string, number>(),
      attachmentCountByTask: new Map<string, number>(),
    };
  }

  const placeholders = taskIds.map(() => '?').join(', ');
  const [assigneeRows, attachmentRows, commentRows, commentAttachmentRows, approvalRows, activityRows] = await Promise.all([
    db.query(`SELECT * FROM task_assignees WHERE task_id IN (${placeholders}) ORDER BY created_at ASC`, taskIds),
    db.query(`SELECT * FROM task_attachments WHERE task_id IN (${placeholders}) ORDER BY created_at ASC`, taskIds),
    db.query(`SELECT * FROM task_comments WHERE task_id IN (${placeholders}) ORDER BY created_at ASC`, taskIds),
    db.query(
      `
      SELECT ca.*
      FROM task_comment_attachments ca
      INNER JOIN task_comments c ON c.id = ca.comment_id
      WHERE c.task_id IN (${placeholders})
      ORDER BY ca.created_at ASC
      `,
      taskIds
    ),
    db.query(`SELECT * FROM task_approval_requests WHERE task_id IN (${placeholders}) ORDER BY cycle_number DESC, requested_at DESC`, taskIds),
    db.query(`SELECT * FROM task_activity_log WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`, taskIds),
  ]);

  const assigneesByTask = new Map<string, TaskAssignee[]>();
  for (const raw of assigneeRows as Row[]) {
    const item = mapAssignee(raw);
    assigneesByTask.set(item.taskId, [...(assigneesByTask.get(item.taskId) || []), item]);
  }

  const attachmentsByTask = new Map<string, TaskAttachment[]>();
  for (const raw of attachmentRows as Row[]) {
    const item = mapAttachment(raw);
    attachmentsByTask.set(item.taskId, [...(attachmentsByTask.get(item.taskId) || []), item]);
  }

  const commentAttachmentsByComment = new Map<string, TaskCommentAttachment[]>();
  for (const raw of commentAttachmentRows as Row[]) {
    const item = mapCommentAttachment(raw);
    commentAttachmentsByComment.set(item.commentId, [...(commentAttachmentsByComment.get(item.commentId) || []), item]);
  }

  const commentsByTask = new Map<string, TaskComment[]>();
  for (const raw of commentRows as Row[]) {
    const commentId = clean(raw.id);
    const taskId = clean(raw.task_id);
    const item: TaskComment = {
      id: commentId,
      taskId,
      authorUserId: clean(raw.author_user_id),
      body: clean(raw.body),
      createdAt: clean(raw.created_at),
      updatedAt: clean(raw.updated_at),
      attachments: commentAttachmentsByComment.get(commentId) || [],
    };
    commentsByTask.set(taskId, [...(commentsByTask.get(taskId) || []), item]);
  }

  const approvalsByTask = new Map<string, TaskApprovalRequest[]>();
  const latestApprovalByTask = new Map<string, TaskApprovalRequest | null>();
  for (const raw of approvalRows as Row[]) {
    const item = mapApprovalRequest(raw);
    approvalsByTask.set(item.taskId, [...(approvalsByTask.get(item.taskId) || []), item]);
    if (!latestApprovalByTask.has(item.taskId)) latestApprovalByTask.set(item.taskId, item);
  }

  const activityByTask = new Map<string, TaskActivityLog[]>();
  for (const raw of activityRows as Row[]) {
    const item = mapActivity(raw);
    activityByTask.set(item.taskId, [...(activityByTask.get(item.taskId) || []), item]);
  }

  const commentCountByTask = new Map<string, number>();
  for (const taskId of taskIds) {
    commentCountByTask.set(taskId, (commentsByTask.get(taskId) || []).length);
  }

  const attachmentCountByTask = new Map<string, number>();
  for (const taskId of taskIds) {
    attachmentCountByTask.set(taskId, (attachmentsByTask.get(taskId) || []).length);
  }

  return {
    assigneesByTask,
    attachmentsByTask,
    commentsByTask,
    approvalsByTask,
    activityByTask,
    latestApprovalByTask,
    commentCountByTask,
    attachmentCountByTask,
  };
};

const computeAssigneeIds = (primaryAssigneeUserId: string | null, assigneeUserIds: string[] = []) => {
  const ids = new Set<string>();
  if (primaryAssigneeUserId) ids.add(primaryAssigneeUserId);
  for (const id of assigneeUserIds.map(clean).filter(Boolean)) ids.add(id);
  return Array.from(ids);
};

const replaceAssignees = async (
  db: DbInterface,
  taskId: string,
  primaryAssigneeUserId: string | null,
  assigneeUserIds: string[]
) => {
  await db.execute(`DELETE FROM task_assignees WHERE task_id = ?`, [taskId]);
  const assignees = computeAssigneeIds(primaryAssigneeUserId, assigneeUserIds);
  for (const userId of assignees) {
    await db.execute(
      `
      INSERT INTO task_assignees (
        id, task_id, user_id, role_type, created_at
      ) VALUES (?, ?, ?, ?, ?)
      `,
      [randomUUID(), taskId, userId, userId === primaryAssigneeUserId ? 'PRIMARY' : 'COLLABORATOR', NOW()]
    );
  }
};

const buildListScopeClause = (viewer: TaskViewerContext) => {
  if (viewer.canViewAll) {
    return { clause: '1 = 1', params: [] as string[] };
  }

  return {
    clause: `
      (
        ${userIdEqualsSql('t.created_by')}
        OR ${userIdEqualsSql('t.primary_assignee_user_id')}
        OR ${userIdEqualsSql('t.approver_user_id')}
        OR EXISTS (
          SELECT 1
          FROM task_assignees a
          WHERE a.task_id = t.id AND ${userIdEqualsSql('a.user_id')}
        )
      )
    `,
    params: [viewer.userId, viewer.userId, viewer.userId, viewer.userId],
  };
};

const buildFilterClause = (filters: TaskListFilters) => {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.search) {
    const q = `%${clean(filters.search)}%`;
    where.push(`(t.protocol_id LIKE ? OR t.title LIKE ? OR t.description LIKE ?)`);
    params.push(q, q, q);
  }

  if (filters.statuses?.length) {
    where.push(`t.status IN (${filters.statuses.map(() => '?').join(', ')})`);
    params.push(...filters.statuses);
  } else if (!filters.includeCanceled) {
    where.push(`t.status <> ?`);
    params.push('CANCELADA');
  }

  if (filters.priorities?.length) {
    where.push(`t.priority IN (${filters.priorities.map(() => '?').join(', ')})`);
    params.push(...filters.priorities);
  }

  if (filters.createdBy) {
    where.push(`t.created_by = ?`);
    params.push(clean(filters.createdBy));
  }

  if (filters.assigneeUserId) {
    where.push(
      `
      (
        t.primary_assignee_user_id = ?
        OR EXISTS (
          SELECT 1 FROM task_assignees fa WHERE fa.task_id = t.id AND fa.user_id = ?
        )
      )
      `
    );
    params.push(clean(filters.assigneeUserId), clean(filters.assigneeUserId));
  }

  if (filters.approverUserId) {
    where.push(`t.approver_user_id = ?`);
    params.push(clean(filters.approverUserId));
  }

  if (filters.department) {
    where.push(`UPPER(COALESCE(t.department, '')) = ?`);
    params.push(upper(filters.department));
  }

  if (filters.dueBucket === 'OVERDUE') {
    where.push(
      isMysqlProvider()
        ? `t.due_date IS NOT NULL AND DATE(t.due_date) < CURDATE() AND t.status NOT IN ('CONCLUIDA', 'CANCELADA')`
        : `t.due_date IS NOT NULL AND DATE(t.due_date) < date('now') AND t.status NOT IN ('CONCLUIDA', 'CANCELADA')`
    );
  } else if (filters.dueBucket === 'DUE_SOON') {
    where.push(
      isMysqlProvider()
        ? `t.due_date IS NOT NULL AND DATE(t.due_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY) AND t.status NOT IN ('CONCLUIDA', 'CANCELADA')`
        : `t.due_date IS NOT NULL AND DATE(t.due_date) BETWEEN date('now') AND date('now', '+2 day') AND t.status NOT IN ('CONCLUIDA', 'CANCELADA')`
    );
  }

  return { where, params };
};

const nextProtocolNumber = async (db: DbInterface) => {
  if (isMysqlProvider()) {
    await db.execute(
      `
      INSERT IGNORE INTO task_protocol_sequences (scope_key, sequence_value, updated_at)
      VALUES (?, ?, ?)
      `,
      ['global', 0, NOW()]
    );
  } else {
    await db.execute(
      `
      INSERT INTO task_protocol_sequences (scope_key, sequence_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(scope_key) DO NOTHING
      `,
      ['global', 0, NOW()]
    );
  }

  const rows = await db.query(
    isMysqlProvider()
      ? `SELECT scope_key, sequence_value FROM task_protocol_sequences WHERE scope_key = ? LIMIT 1 FOR UPDATE`
      : `SELECT scope_key, sequence_value FROM task_protocol_sequences WHERE scope_key = ? LIMIT 1`,
    ['global']
  );

  const current = parseIntSafe((rows[0] as Row | undefined)?.sequence_value, 0);
  const next = current + 1;
  await db.execute(`UPDATE task_protocol_sequences SET sequence_value = ?, updated_at = ? WHERE scope_key = ?`, [next, NOW(), 'global']);
  return next;
};

export const ensureTaskTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_protocol_sequences (
      scope_key VARCHAR(40) PRIMARY KEY,
      sequence_value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE task_protocol_sequences ADD COLUMN sequence_value INTEGER NOT NULL DEFAULT 0`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(64) PRIMARY KEY,
      protocol_number INTEGER NOT NULL,
      protocol_id VARCHAR(40) NOT NULL,
      title VARCHAR(220) NOT NULL,
      description LONGTEXT NOT NULL,
      department VARCHAR(180) NOT NULL,
      priority VARCHAR(20) NOT NULL,
      status VARCHAR(30) NOT NULL,
      due_date DATE NULL,
      start_date DATE NULL,
      primary_assignee_user_id VARCHAR(64) NULL,
      approver_user_id VARCHAR(64) NULL,
      created_by VARCHAR(64) NOT NULL,
      completed_at TEXT NULL,
      canceled_at TEXT NULL,
      cancellation_reason TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role_type VARCHAR(20) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(160) NULL,
      storage_key VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      author_user_id VARCHAR(64) NOT NULL,
      body LONGTEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_comment_attachments (
      id VARCHAR(64) PRIMARY KEY,
      comment_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(160) NULL,
      storage_key VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_approval_requests (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      approver_user_id VARCHAR(64) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      requested_at TEXT NOT NULL,
      decision_status VARCHAR(20) NOT NULL,
      decision_notes TEXT NULL,
      decided_by VARCHAR(64) NULL,
      decided_at TEXT NULL,
      cycle_number INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_activity_log (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      action VARCHAR(60) NOT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      payload_json LONGTEXT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN start_date DATE NULL`);
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN completed_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN canceled_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN cancellation_reason TEXT NULL`);

  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_tasks_protocol_number ON tasks (protocol_number)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_tasks_protocol_id ON tasks (protocol_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_status ON tasks (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_priority ON tasks (priority)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_due_date ON tasks (due_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_created_by ON tasks (created_by)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_primary_assignee ON tasks (primary_assignee_user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_approver ON tasks (approver_user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_department ON tasks (department)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_assignees_task ON task_assignees (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_assignees_user ON task_assignees (user_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_assignees_task_user ON task_assignees (task_id, user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_attachments_task ON task_attachments (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_comments_task ON task_comments (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_comment_attachments_comment ON task_comment_attachments (comment_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_approval_task ON task_approval_requests (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_approval_active ON task_approval_requests (task_id, is_active)`);
  await safeCreateIndex(
    db,
    isMysqlProvider()
      ? `CREATE INDEX idx_task_activity_task ON task_activity_log (task_id, created_at(32))`
      : `CREATE INDEX idx_task_activity_task ON task_activity_log (task_id, created_at)`
  );

  tablesEnsured = true;
};

export const listTasks = async (db: DbInterface, viewer: TaskViewerContext, filters: TaskListFilters = {}): Promise<TaskSummary[]> => {
  await ensureTaskTables(db);

  const scope = buildListScopeClause(viewer);
  const builtFilters = buildFilterClause(filters);
  const where = [scope.clause, ...builtFilters.where];
  const rows = await db.query(
    `
    SELECT t.*
    FROM tasks t
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE t.priority
        WHEN 'URGENTE' THEN 1
        WHEN 'ALTA' THEN 2
        WHEN 'MEDIA' THEN 3
        ELSE 4
      END ASC,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
      t.due_date ASC,
      t.updated_at DESC
    `,
    [...scope.params, ...builtFilters.params]
  );

  const taskIds = (rows as Row[]).map((row) => clean(row.id)).filter(Boolean);
  const collections = await loadTaskCollections(db, taskIds);

  return (rows as Row[]).map((row) => {
    const taskId = clean(row.id);
    return mapSummaryRow(
      row,
      collections.assigneesByTask.get(taskId) || [],
      collections.latestApprovalByTask.get(taskId) || null,
      collections.commentCountByTask.get(taskId) || 0,
      collections.attachmentCountByTask.get(taskId) || 0
    );
  });
};

export const getTaskById = async (db: DbInterface, taskId: string, viewer: TaskViewerContext): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  if (!cleanTaskId) throw new TaskValidationError('taskId obrigatório.');
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const row = await ensureTaskExists(db, cleanTaskId);
  const collections = await loadTaskCollections(db, [cleanTaskId]);
  const summary = mapSummaryRow(
    row,
    collections.assigneesByTask.get(cleanTaskId) || [],
    collections.latestApprovalByTask.get(cleanTaskId) || null,
    collections.commentCountByTask.get(cleanTaskId) || 0,
    collections.attachmentCountByTask.get(cleanTaskId) || 0
  );

  return {
    ...summary,
    attachments: collections.attachmentsByTask.get(cleanTaskId) || [],
    comments: collections.commentsByTask.get(cleanTaskId) || [],
    approvalRequests: collections.approvalsByTask.get(cleanTaskId) || [],
    activity: collections.activityByTask.get(cleanTaskId) || [],
  };
};

export const createTask = async (db: DbInterface, input: TaskCreateInput, actorUserId: string): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const title = clean(input.title);
  const department = clean(input.department);
  if (!title) throw new TaskValidationError('Título obrigatório.');
  if (!department) throw new TaskValidationError('Setor obrigatório.');

  const description = clean(input.description);
  const priority = normalizePriority(input.priority, 'MEDIA');
  const status = normalizeStatus(input.status, 'BACKLOG');
  const dueDate = parseDate(input.dueDate);
  const startDate = parseDate(input.startDate);
  const approverUserId = nullable(input.approverUserId);
  const primaryAssigneeUserId = nullable(input.primaryAssigneeUserId) || actorUserId;
  const assigneeIds = computeAssigneeIds(primaryAssigneeUserId, input.assigneeUserIds || []);

  await ensureUserIsActive(db, actorUserId);
  for (const userId of assigneeIds) await ensureUserIsActive(db, userId);
  if (approverUserId) await ensureUserIsActive(db, approverUserId);
  if (status === 'AGUARDANDO_APROVACAO' && !approverUserId) {
    throw new TaskValidationError('Defina um aprovador antes de enviar para aprovação.');
  }

  return runInTransaction(db, async (txDb) => {
    const taskId = randomUUID();
    const protocolNumber = await nextProtocolNumber(txDb);
    const protocolId = `TK-${String(protocolNumber).padStart(4, '0')}`;
    const now = NOW();

    await txDb.execute(
      `
      INSERT INTO tasks (
        id, protocol_number, protocol_id, title, description, department, priority, status,
        due_date, start_date, primary_assignee_user_id, approver_user_id, created_by,
        completed_at, canceled_at, cancellation_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        taskId,
        protocolNumber,
        protocolId,
        title,
        description,
        department,
        priority,
        status,
        dueDate,
        startDate,
        primaryAssigneeUserId,
        approverUserId,
        actorUserId,
        status === 'CONCLUIDA' ? now : null,
        status === 'CANCELADA' ? now : null,
        null,
        now,
        now,
      ]
    );

    await replaceAssignees(txDb, taskId, primaryAssigneeUserId, input.assigneeUserIds || []);
    await insertActivity(txDb, taskId, 'TASK_CREATED', actorUserId, {
      protocolId,
      status,
      priority,
      primaryAssigneeUserId,
      approverUserId,
    });

    return getTaskById(txDb, taskId, { userId: actorUserId, canViewAll: true });
  });
};

export const updateTask = async (
  db: DbInterface,
  taskId: string,
  input: TaskUpdateInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const current = await ensureTaskExists(db, cleanTaskId);

  return runInTransaction(db, async (txDb) => {
    const currentStatus = normalizeStatus(current.status);
    const nextStatus = input.status ? normalizeStatus(input.status, currentStatus) : currentStatus;
    const nextApprover = Object.prototype.hasOwnProperty.call(input, 'approverUserId')
      ? nullable(input.approverUserId)
      : nullable(current.approver_user_id);
    if (nextStatus === 'AGUARDANDO_APROVACAO' && !nextApprover) {
      throw new TaskValidationError('Defina um aprovador antes de mover a tarefa para aguardando aprovação.');
    }

    const nextPrimaryAssigneeUserId = Object.prototype.hasOwnProperty.call(input, 'primaryAssigneeUserId')
      ? nullable(input.primaryAssigneeUserId)
      : nullable(current.primary_assignee_user_id);
    const requestedAssigneeIds = Object.prototype.hasOwnProperty.call(input, 'assigneeUserIds')
      ? (input.assigneeUserIds || [])
      : [];
    const shouldReplaceAssignees =
      Object.prototype.hasOwnProperty.call(input, 'primaryAssigneeUserId') ||
      Object.prototype.hasOwnProperty.call(input, 'assigneeUserIds');

    const finalAssigneeIds = shouldReplaceAssignees
      ? computeAssigneeIds(nextPrimaryAssigneeUserId, requestedAssigneeIds)
      : [];

    for (const userId of finalAssigneeIds) await ensureUserIsActive(txDb, userId);
    if (nextApprover) await ensureUserIsActive(txDb, nextApprover);

    const updatedAt = NOW();
    const nextTitle = Object.prototype.hasOwnProperty.call(input, 'title') ? clean(input.title) : clean(current.title);
    const nextDescription =
      Object.prototype.hasOwnProperty.call(input, 'description') ? clean(input.description) : clean(current.description);
    const nextDepartment =
      Object.prototype.hasOwnProperty.call(input, 'department') ? clean(input.department) : clean(current.department);
    const nextPriority = Object.prototype.hasOwnProperty.call(input, 'priority')
      ? normalizePriority(input.priority, normalizePriority(current.priority))
      : normalizePriority(current.priority);
    const nextDueDate = Object.prototype.hasOwnProperty.call(input, 'dueDate') ? parseDate(input.dueDate) : parseDate(current.due_date);
    const nextStartDate =
      Object.prototype.hasOwnProperty.call(input, 'startDate') ? parseDate(input.startDate) : parseDate(current.start_date);
    const nextCancellationReason = Object.prototype.hasOwnProperty.call(input, 'cancellationReason')
      ? nullable(input.cancellationReason)
      : nullable(current.cancellation_reason);

    if (!nextTitle) throw new TaskValidationError('Título obrigatório.');
    if (!nextDepartment) throw new TaskValidationError('Setor obrigatório.');

    const nextCompletedAt =
      nextStatus === 'CONCLUIDA' ? nullable(current.completed_at) || updatedAt : null;
    const nextCanceledAt =
      nextStatus === 'CANCELADA' ? nullable(current.canceled_at) || updatedAt : null;

    await txDb.execute(
      `
      UPDATE tasks
      SET title = ?, description = ?, department = ?, priority = ?, status = ?, due_date = ?, start_date = ?,
          primary_assignee_user_id = ?, approver_user_id = ?, completed_at = ?, canceled_at = ?,
          cancellation_reason = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        nextTitle,
        nextDescription,
        nextDepartment,
        nextPriority,
        nextStatus,
        nextDueDate,
        nextStartDate,
        nextPrimaryAssigneeUserId,
        nextApprover,
        nextCompletedAt,
        nextCanceledAt,
        nextCancellationReason,
        updatedAt,
        cleanTaskId,
      ]
    );

    if (shouldReplaceAssignees) {
      await replaceAssignees(txDb, cleanTaskId, nextPrimaryAssigneeUserId, requestedAssigneeIds);
    }

    await insertActivity(txDb, cleanTaskId, 'TASK_UPDATED', actorUserId, {
      previousStatus: currentStatus,
      nextStatus,
      previousPriority: normalizePriority(current.priority),
      nextPriority,
      approverUserId: nextApprover,
      primaryAssigneeUserId: nextPrimaryAssigneeUserId,
    });

    return getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
  });
};

export const addTaskAttachment = async (
  db: DbInterface,
  taskId: string,
  input: TaskAttachmentInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskAttachment> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  await ensureTaskExists(db, cleanTaskId);

  const storageKey = clean(input.storageKey);
  const originalName = clean(input.originalName);
  const mimeType = clean(input.mimeType);
  if (!storageKey || !originalName || !mimeType) {
    throw new TaskValidationError('Metadados do anexo são obrigatórios.');
  }

  const item: TaskAttachment = {
    id: randomUUID(),
    taskId: cleanTaskId,
    storageProvider: clean(input.storageProvider),
    storageBucket: nullable(input.storageBucket),
    storageKey,
    originalName,
    mimeType,
    sizeBytes: parseNumberSafe(input.sizeBytes),
    uploadedBy: actorUserId,
    createdAt: NOW(),
  };

  await db.execute(
    `
    INSERT INTO task_attachments (
      id, task_id, storage_provider, storage_bucket, storage_key, original_name,
      mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.taskId,
      item.storageProvider,
      item.storageBucket,
      item.storageKey,
      item.originalName,
      item.mimeType,
      item.sizeBytes,
      item.uploadedBy,
      item.createdAt,
    ]
  );

  await insertActivity(db, cleanTaskId, 'TASK_ATTACHMENT_ADDED', actorUserId, {
    attachmentId: item.id,
    originalName: item.originalName,
  });

  return item;
};

export const addTaskComment = async (
  db: DbInterface,
  taskId: string,
  input: TaskCommentInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskComment> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  await ensureTaskExists(db, cleanTaskId);
  const body = clean(input.body);
  if (!body) throw new TaskValidationError('Comentário obrigatório.');

  const comment: TaskComment = {
    id: randomUUID(),
    taskId: cleanTaskId,
    authorUserId: actorUserId,
    body,
    createdAt: NOW(),
    updatedAt: NOW(),
    attachments: [],
  };

  await db.execute(
    `
    INSERT INTO task_comments (
      id, task_id, author_user_id, body, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [comment.id, comment.taskId, comment.authorUserId, comment.body, comment.createdAt, comment.updatedAt]
  );

  await insertActivity(db, cleanTaskId, 'TASK_COMMENT_ADDED', actorUserId, {
    commentId: comment.id,
  });

  return comment;
};

export const addTaskCommentAttachment = async (
  db: DbInterface,
  commentId: string,
  input: TaskAttachmentInput,
  actorUserId: string
): Promise<TaskCommentAttachment> => {
  await ensureTaskTables(db);
  const rows = await db.query(`SELECT id, task_id FROM task_comments WHERE id = ? LIMIT 1`, [clean(commentId)]);
  const commentRow = rows[0] as Row | undefined;
  if (!commentRow) throw new TaskValidationError('Comentário não encontrado.', 404);

  const item: TaskCommentAttachment = {
    id: randomUUID(),
    commentId: clean(commentId),
    storageProvider: clean(input.storageProvider),
    storageBucket: nullable(input.storageBucket),
    storageKey: clean(input.storageKey),
    originalName: clean(input.originalName),
    mimeType: clean(input.mimeType),
    sizeBytes: parseNumberSafe(input.sizeBytes),
    uploadedBy: actorUserId,
    createdAt: NOW(),
  };

  if (!item.storageKey || !item.originalName || !item.mimeType) {
    throw new TaskValidationError('Metadados do anexo do comentário são obrigatórios.');
  }

  await db.execute(
    `
    INSERT INTO task_comment_attachments (
      id, comment_id, storage_provider, storage_bucket, storage_key, original_name,
      mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.commentId,
      item.storageProvider,
      item.storageBucket,
      item.storageKey,
      item.originalName,
      item.mimeType,
      item.sizeBytes,
      item.uploadedBy,
      item.createdAt,
    ]
  );

  await insertActivity(db, clean(commentRow.task_id), 'TASK_COMMENT_ATTACHMENT_ADDED', actorUserId, {
    commentId: item.commentId,
    attachmentId: item.id,
    originalName: item.originalName,
  });

  return item;
};

export const requestTaskApproval = async (
  db: DbInterface,
  taskId: string,
  input: TaskApprovalRequestInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const current = await ensureTaskExists(db, cleanTaskId);
  const approverUserId = clean(input.approverUserId) || nullable(current.approver_user_id);
  if (!approverUserId) {
    throw new TaskValidationError('Defina um aprovador para solicitar aprovação.');
  }
  await ensureUserIsActive(db, approverUserId);

  return runInTransaction(db, async (txDb) => {
    await txDb.execute(
      `UPDATE task_approval_requests SET is_active = 0 WHERE task_id = ? AND is_active = 1`,
      [cleanTaskId]
    );

    const cycleRows = await txDb.query(
      `SELECT COALESCE(MAX(cycle_number), 0) AS max_cycle FROM task_approval_requests WHERE task_id = ?`,
      [cleanTaskId]
    );
    const cycleNumber = parseIntSafe((cycleRows[0] as Row | undefined)?.max_cycle, 0) + 1;
    const now = NOW();

    await txDb.execute(
      `
      INSERT INTO task_approval_requests (
        id, task_id, approver_user_id, requested_by, requested_at, decision_status,
        decision_notes, decided_by, decided_at, cycle_number, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [randomUUID(), cleanTaskId, approverUserId, actorUserId, now, 'PENDENTE', nullable(input.notes), null, null, cycleNumber, 1]
    );

    await txDb.execute(
      `
      UPDATE tasks
      SET approver_user_id = ?, status = ?, updated_at = ?
      WHERE id = ?
      `,
      [approverUserId, 'AGUARDANDO_APROVACAO', now, cleanTaskId]
    );

    await insertActivity(txDb, cleanTaskId, 'TASK_APPROVAL_REQUESTED', actorUserId, {
      approverUserId,
      cycleNumber,
    });

    return getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
  });
};

export const decideTaskApproval = async (
  db: DbInterface,
  taskId: string,
  input: TaskApprovalDecisionInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const decisionStatus = upper(input.decisionStatus);
  if (!APPROVAL_DECISIONS.includes(decisionStatus as any) || decisionStatus === 'PENDENTE') {
    throw new TaskValidationError('Decisão de aprovação inválida.');
  }

  return runInTransaction(db, async (txDb) => {
    const rows = await txDb.query(
      `SELECT * FROM task_approval_requests WHERE task_id = ? AND is_active = 1 ORDER BY requested_at DESC LIMIT 1`,
      [cleanTaskId]
    );
    const active = rows[0] as Row | undefined;
    if (!active) throw new TaskValidationError('Não existe solicitação de aprovação ativa para esta tarefa.', 409);
    if (clean(active.approver_user_id) !== actorUserId && !viewer.canViewAll) {
      throw new TaskValidationError('Apenas o aprovador nomeado pode decidir esta solicitação.', 403);
    }

    const now = NOW();
    await txDb.execute(
      `
      UPDATE task_approval_requests
      SET decision_status = ?, decision_notes = ?, decided_by = ?, decided_at = ?, is_active = 0
      WHERE id = ?
      `,
      [decisionStatus, nullable(input.notes), actorUserId, now, clean(active.id)]
    );

    const nextStatus =
      decisionStatus === 'APROVADA'
        ? 'CONCLUIDA'
        : decisionStatus === 'CANCELADA'
          ? 'CANCELADA'
          : 'EM_ANDAMENTO';

    await txDb.execute(
      `
      UPDATE tasks
      SET status = ?, completed_at = ?, canceled_at = ?, cancellation_reason = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        nextStatus,
        decisionStatus === 'APROVADA' ? now : null,
        decisionStatus === 'CANCELADA' ? now : null,
        decisionStatus === 'CANCELADA' ? nullable(input.notes) : null,
        now,
        cleanTaskId,
      ]
    );

    await insertActivity(txDb, cleanTaskId, 'TASK_APPROVAL_DECIDED', actorUserId, {
      decisionStatus,
      nextStatus,
    });

    return getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
  });
};

export const getTaskDashboardSummary = async (
  db: DbInterface,
  viewer: TaskViewerContext,
  filters: TaskListFilters = {}
): Promise<TaskDashboardSummary> => {
  const tasks = await listTasks(db, viewer, { ...filters, includeCanceled: true });

  const totalTasks = tasks.length;
  const dueSoonTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    if (task.status === 'CONCLUIDA' || task.status === 'CANCELADA') return false;
    const due = new Date(`${task.dueDate}T00:00:00`);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    return due >= start && due <= end;
  }).length;

  const overdueTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    if (task.status === 'CONCLUIDA' || task.status === 'CANCELADA') return false;
    const due = new Date(`${task.dueDate}T00:00:00`);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return due < start;
  }).length;

  const awaitingApprovalTasks = tasks.filter((task) => task.status === 'AGUARDANDO_APROVACAO').length;
  const approvedTasks = tasks.filter((task) => task.latestApproval?.decisionStatus === 'APROVADA').length;

  const byStatus = STATUSES.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length,
  }));

  const byPriority = PRIORITIES.map((priority) => ({
    priority,
    count: tasks.filter((task) => task.priority === priority).length,
  }));

  const departmentMap = new Map<string, number>();
  for (const task of tasks) {
    const key = task.department || 'Sem setor';
    departmentMap.set(key, (departmentMap.get(key) || 0) + 1);
  }
  const byDepartment = Array.from(departmentMap.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, 'pt-BR'));

  return {
    totalTasks,
    dueSoonTasks,
    overdueTasks,
    awaitingApprovalTasks,
    approvedTasks,
    byStatus,
    byPriority,
    byDepartment,
  };
};
