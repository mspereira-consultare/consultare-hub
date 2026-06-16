import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';
import { runInTransaction } from '../db';
import { createIntranetNotifications, type IntranetNotificationCreateInput, type IntranetNotificationEventType } from '../intranet/notifications';
import type {
  TaskActivityLog,
  TaskApprovalDecisionInput,
  TaskApprovalRequest,
  TaskApprovalRequestInput,
  TaskAssignee,
  TaskAttachment,
  TaskAttachmentInput,
  TaskChecklistItem,
  TaskChecklistItemCreateInput,
  TaskChecklistItemUpdateInput,
  TaskComment,
  TaskCommentAttachment,
  TaskCommentInput,
  TaskCreateInput,
  TaskDependency,
  TaskDependencyCreateInput,
  TaskDashboardSummary,
  TaskDetail,
  TaskListFilters,
  TaskPriority,
  TaskProjectCreateInput,
  TaskProjectDetail,
  TaskProjectMember,
  TaskProjectMemberAddInput,
  TaskProjectStatus,
  TaskProjectSummary,
  TaskProjectTaskReorderInput,
  TaskProjectUpdateInput,
  TaskPortfolioGantt,
  TaskPortfolioGanttRow,
  TaskPortfolioGanttSection,
  TaskStatus,
  TaskSummary,
  TaskUpdateInput,
  TaskViewerContext,
} from './types';

type Row = Record<string, unknown>;

const PROJECT_STATUS_VALUES: TaskProjectStatus[] = ['ATIVO', 'CONCLUIDO', 'ARQUIVADO'];

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

const normalizeProjectStatus = (value: unknown, archivedAt?: unknown): TaskProjectStatus => {
  const normalized = clean(value).toUpperCase();
  if (PROJECT_STATUS_VALUES.includes(normalized as TaskProjectStatus)) {
    return normalized as TaskProjectStatus;
  }
  return nullable(archivedAt) ? 'ARQUIVADO' : 'ATIVO';
};

const PRIORITIES: TaskPriority[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const STATUSES: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'ARQUIVADA', 'CANCELADA'];
const APPROVAL_DECISIONS = ['PENDENTE', 'APROVADA', 'REPROVADA', 'DEVOLVIDA', 'CANCELADA'] as const;
const RETIRED_STATUSES: TaskStatus[] = ['ARQUIVADA', 'CANCELADA'];
const OPERATIONAL_STATUSES: Array<Exclude<TaskStatus, 'ARQUIVADA' | 'CANCELADA'>> = [
  'BACKLOG',
  'A_FAZER',
  'EM_ANDAMENTO',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDA',
];

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

const safeModifyColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (/near "MODIFY"/i.test(msg) || /syntax error/i.test(msg)) return;
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

const isRetiredStatus = (status: TaskStatus) => RETIRED_STATUSES.includes(status);
const taskHref = (taskId: string) => `/tarefas?task=${encodeURIComponent(taskId)}`;
const taskStatusLabel = (status: TaskStatus) =>
  ({
    BACKLOG: 'Backlog',
    A_FAZER: 'A fazer',
    EM_ANDAMENTO: 'Em andamento',
    AGUARDANDO_APROVACAO: 'Aguardando aprovação',
    CONCLUIDA: 'Concluída',
    ARQUIVADA: 'Arquivada',
    CANCELADA: 'Cancelada',
  })[status];

const parseDateObject = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const diffDaysInclusive = (startDate: string | null, dueDate: string | null) => {
  const start = parseDateObject(startDate);
  const end = parseDateObject(dueDate);
  if (!start || !end) return 0;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
};

const isTaskOverdueForGantt = (task: Pick<TaskSummary, 'dueDate' | 'status'>) => {
  if (!task.dueDate || task.status === 'CONCLUIDA' || isRetiredStatus(task.status)) return false;
  const due = parseDateObject(task.dueDate);
  if (!due) return false;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < start;
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

const ensureProjectExists = async (db: DbInterface, projectId: string) => {
  const rows = await db.query(`SELECT * FROM task_projects WHERE id = ? LIMIT 1`, [projectId]);
  const row = rows[0] as Row | undefined;
  if (!row) throw new TaskValidationError('Projeto não encontrado.', 404);
  return row;
};

const canViewerAccessProject = async (db: DbInterface, projectId: string, viewer: TaskViewerContext) => {
  if (viewer.canViewAll) return true;
  const rows = await db.query(
    `
    SELECT 1
    FROM task_project_members
    WHERE project_id = ? AND ${userIdEqualsSql('user_id')}
    LIMIT 1
    `,
    [projectId, viewer.userId]
  );
  return Boolean(rows[0]);
};

const ensureViewerCanAccessProject = async (db: DbInterface, projectId: string, viewer: TaskViewerContext) => {
  if (!(await canViewerAccessProject(db, projectId, viewer))) {
    throw new TaskValidationError('Você não possui acesso a este projeto.', 403);
  }
};

const canManageProject = async (db: DbInterface, projectId: string, actorUserId: string, viewer: TaskViewerContext) => {
  if (viewer.canViewAll) return true;
  const project = await ensureProjectExists(db, projectId);
  return clean(project.created_by) === actorUserId;
};

const ensureCanManageProject = async (db: DbInterface, projectId: string, actorUserId: string, viewer: TaskViewerContext) => {
  if (!(await canManageProject(db, projectId, actorUserId, viewer))) {
    throw new TaskValidationError('Apenas o criador do projeto ou a gerência podem editar este cronograma.', 403);
  }
};

type TaskProjectLinkPermissionScope = 'ADMIN' | 'OWNER' | 'MEMBER_SELF';

const resolveTaskProjectLinkPermissionScope = async (
  db: DbInterface,
  projectId: string,
  taskCreatedBy: string,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectLinkPermissionScope | null> => {
  if (viewer.canViewAll) return 'ADMIN';
  if (!(await canViewerAccessProject(db, projectId, viewer))) {
    return null;
  }
  if (await canManageProject(db, projectId, actorUserId, viewer)) {
    return 'OWNER';
  }
  if (clean(taskCreatedBy) === actorUserId) {
    return 'MEMBER_SELF';
  }
  return null;
};

const ensureCanMutateTaskProjectLink = async (
  db: DbInterface,
  {
    projectId,
    taskCreatedBy,
    actorUserId,
    viewer,
    action,
  }: {
    projectId: string;
    taskCreatedBy: string;
    actorUserId: string;
    viewer: TaskViewerContext;
    action: 'link' | 'unlink' | 'schedule';
  }
): Promise<TaskProjectLinkPermissionScope> => {
  const scope = await resolveTaskProjectLinkPermissionScope(db, projectId, taskCreatedBy, actorUserId, viewer);
  if (scope) return scope;
  if (!(await canViewerAccessProject(db, projectId, viewer))) {
    throw new TaskValidationError('Você não participa deste projeto.', 403);
  }
  if (action === 'link') {
    throw new TaskValidationError('Você só pode vincular ao projeto tarefas criadas por você.', 403);
  }
  if (action === 'unlink') {
    throw new TaskValidationError('Você só pode remover do projeto tarefas criadas por você.', 403);
  }
  throw new TaskValidationError(
    'Você só pode ajustar o cronograma de projeto em tarefas criadas por você.',
    403
  );
};

const validateProjectTaskDates = (startDate: string | null, dueDate: string | null) => {
  if (!startDate || !dueDate) {
    throw new TaskValidationError('Tarefas de projeto precisam de data de início e prazo definidos.');
  }
  if (dueDate < startDate) {
    throw new TaskValidationError('O prazo da tarefa não pode ser menor que a data de início.');
  }
};

const nextProjectSortOrder = async (db: DbInterface, projectId: string) => {
  const rows = await db.query(`SELECT COALESCE(MAX(project_sort_order), -1) AS max_sort FROM tasks WHERE project_id = ?`, [projectId]);
  return parseIntSafe((rows[0] as Row | undefined)?.max_sort, -1) + 1;
};

const removeTaskDependencies = async (db: DbInterface, taskId: string) => {
  await db.execute(`DELETE FROM task_dependencies WHERE predecessor_task_id = ? OR successor_task_id = ?`, [taskId, taskId]);
};

const ensureDependencyGraphHasNoCycle = async (
  db: DbInterface,
  projectId: string,
  predecessorTaskId: string,
  successorTaskId: string
) => {
  const rows = await db.query(`SELECT predecessor_task_id, successor_task_id FROM task_dependencies WHERE project_id = ?`, [projectId]);
  const graph = new Map<string, string[]>();
  for (const row of rows as Row[]) {
    const predecessor = clean(row.predecessor_task_id);
    const successor = clean(row.successor_task_id);
    graph.set(predecessor, [...(graph.get(predecessor) || []), successor]);
  }
  graph.set(predecessorTaskId, [...(graph.get(predecessorTaskId) || []), successorTaskId]);

  const visited = new Set<string>();
  const stack = new Set<string>();
  const visit = (node: string): boolean => {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const next of graph.get(node) || []) {
      if (visit(next)) return true;
    }
    stack.delete(node);
    return false;
  };

  if (visit(predecessorTaskId)) {
    throw new TaskValidationError('A dependência cria um ciclo inválido no cronograma.', 409);
  }
};

const ensureTaskExists = async (db: DbInterface, taskId: string) => {
  const rows = await db.query(`SELECT * FROM tasks WHERE id = ? LIMIT 1`, [taskId]);
  const row = rows[0] as Row | undefined;
  if (!row) throw new TaskValidationError('Tarefa não encontrada.', 404);
  return row;
};

const ensureTaskIsActiveForMutation = (taskRow: Row) => {
  const status = normalizeStatus(taskRow.status);
  if (isRetiredStatus(status)) {
    throw new TaskValidationError('Esta tarefa está encerrada. Restaure a tarefa antes de continuar.', 409);
  }
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
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM task_project_members pm
            WHERE pm.project_id = t.project_id AND ${userIdEqualsSql('pm.user_id')}
          )
        )
      )
    LIMIT 1
    `,
    [taskId, viewer.userId, viewer.userId, viewer.userId, viewer.userId, viewer.userId]
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

const mapProjectMember = (row: Row): TaskProjectMember => ({
  id: clean(row.id),
  projectId: clean(row.project_id),
  userId: clean(row.user_id),
  roleType: upper(row.role_type || 'MEMBER') as TaskProjectMember['roleType'],
  createdAt: clean(row.created_at),
});

const mapDependency = (row: Row): TaskDependency => ({
  id: clean(row.id),
  projectId: clean(row.project_id),
  predecessorTaskId: clean(row.predecessor_task_id),
  successorTaskId: clean(row.successor_task_id),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
});

const mapActivity = (row: Row): TaskActivityLog => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  action: clean(row.action),
  actorUserId: clean(row.actor_user_id),
  payloadJson: nullable(row.payload_json),
  createdAt: clean(row.created_at),
});

const mapChecklistItem = (row: Row): TaskChecklistItem => ({
  id: clean(row.id),
  taskId: clean(row.task_id),
  title: clean(row.title),
  isCompleted: parseBool(row.is_completed),
  sortOrder: parseIntSafe(row.sort_order),
  createdBy: clean(row.created_by),
  completedBy: nullable(row.completed_by),
  completedAt: nullable(row.completed_at),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const collectTaskParticipantIds = (task: TaskDetail) => {
  const ids = new Set<string>();
  ids.add(task.createdBy);
  if (task.primaryAssigneeUserId) ids.add(task.primaryAssigneeUserId);
  if (task.approverUserId) ids.add(task.approverUserId);
  for (const assignee of task.assignees) {
    if (assignee.userId) ids.add(assignee.userId);
  }
  return Array.from(ids).filter(Boolean);
};

const notifyTaskUsers = async (
  db: DbInterface,
  task: TaskDetail,
  actorUserId: string,
  recipientUserIds: string[],
  build: (userId: string) => Omit<IntranetNotificationCreateInput, 'userId'>
) => {
  const ids = Array.from(new Set(recipientUserIds.map(clean).filter((userId) => userId && userId !== actorUserId)));
  if (!ids.length) return [];
  try {
    return await createIntranetNotifications(
      db,
      ids.map((userId) => ({
        userId,
        ...build(userId),
      }))
    );
  } catch (error) {
    console.error(`Erro ao criar notificações da tarefa ${task.id}:`, error);
    return [];
  }
};

const mapSummaryRow = (
  row: Row,
  assignees: TaskAssignee[],
  latestApproval: TaskApprovalRequest | null,
  commentCount: number,
  attachmentCount: number,
  checklistSummary: { totalItems: number; completedItems: number; progressPercent: number },
  predecessorTaskIds: string[] = []
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
  projectId: nullable(row.project_id),
  projectName: nullable(row.project_name),
  projectSortOrder: row.project_sort_order == null ? null : parseIntSafe(row.project_sort_order),
  predecessorTaskIds,
  completedAt: nullable(row.completed_at),
  canceledAt: nullable(row.canceled_at),
  cancellationReason: nullable(row.cancellation_reason),
  previousOperationalStatus: nullable(row.previous_operational_status) as TaskSummary['previousOperationalStatus'],
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
  assignees,
  latestApproval,
  commentCount,
  attachmentCount,
  checklistTotalItems: checklistSummary.totalItems,
  checklistCompletedItems: checklistSummary.completedItems,
  checklistProgressPercent: checklistSummary.progressPercent,
});

const loadTaskCollections = async (db: DbInterface, taskIds: string[]) => {
  if (!taskIds.length) {
    return {
      assigneesByTask: new Map<string, TaskAssignee[]>(),
      attachmentsByTask: new Map<string, TaskAttachment[]>(),
      commentsByTask: new Map<string, TaskComment[]>(),
      checklistByTask: new Map<string, TaskChecklistItem[]>(),
      approvalsByTask: new Map<string, TaskApprovalRequest[]>(),
      activityByTask: new Map<string, TaskActivityLog[]>(),
      latestApprovalByTask: new Map<string, TaskApprovalRequest | null>(),
      commentCountByTask: new Map<string, number>(),
      attachmentCountByTask: new Map<string, number>(),
      checklistSummaryByTask: new Map<string, { totalItems: number; completedItems: number; progressPercent: number }>(),
      predecessorIdsByTask: new Map<string, string[]>(),
      dependenciesByProject: new Map<string, TaskDependency[]>(),
    };
  }

  const placeholders = taskIds.map(() => '?').join(', ');
  const [assigneeRows, attachmentRows, commentRows, commentAttachmentRows, checklistRows, approvalRows, activityRows, dependencyRows] = await Promise.all([
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
    db.query(`SELECT * FROM task_checklist_items WHERE task_id IN (${placeholders}) ORDER BY sort_order ASC, created_at ASC`, taskIds),
    db.query(`SELECT * FROM task_approval_requests WHERE task_id IN (${placeholders}) ORDER BY cycle_number DESC, requested_at DESC`, taskIds),
    db.query(`SELECT * FROM task_activity_log WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`, taskIds),
    db.query(
      `SELECT * FROM task_dependencies WHERE predecessor_task_id IN (${placeholders}) OR successor_task_id IN (${placeholders}) ORDER BY created_at ASC`,
      [...taskIds, ...taskIds]
    ),
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

  const checklistByTask = new Map<string, TaskChecklistItem[]>();
  for (const raw of checklistRows as Row[]) {
    const item = mapChecklistItem(raw);
    checklistByTask.set(item.taskId, [...(checklistByTask.get(item.taskId) || []), item]);
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

  const predecessorIdsByTask = new Map<string, string[]>();
  const dependenciesByProject = new Map<string, TaskDependency[]>();
  for (const raw of dependencyRows as Row[]) {
    const item = mapDependency(raw);
    predecessorIdsByTask.set(item.successorTaskId, [...(predecessorIdsByTask.get(item.successorTaskId) || []), item.predecessorTaskId]);
    dependenciesByProject.set(item.projectId, [...(dependenciesByProject.get(item.projectId) || []), item]);
  }

  const commentCountByTask = new Map<string, number>();
  for (const taskId of taskIds) {
    commentCountByTask.set(taskId, (commentsByTask.get(taskId) || []).length);
  }

  const attachmentCountByTask = new Map<string, number>();
  for (const taskId of taskIds) {
    attachmentCountByTask.set(taskId, (attachmentsByTask.get(taskId) || []).length);
  }

  const checklistSummaryByTask = new Map<string, { totalItems: number; completedItems: number; progressPercent: number }>();
  for (const taskId of taskIds) {
    const items = checklistByTask.get(taskId) || [];
    const totalItems = items.length;
    const completedItems = items.filter((item) => item.isCompleted).length;
    checklistSummaryByTask.set(taskId, {
      totalItems,
      completedItems,
      progressPercent: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    });
  }

  return {
    assigneesByTask,
    attachmentsByTask,
    commentsByTask,
    checklistByTask,
    approvalsByTask,
    activityByTask,
    latestApprovalByTask,
    commentCountByTask,
    attachmentCountByTask,
    checklistSummaryByTask,
    predecessorIdsByTask,
    dependenciesByProject,
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
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM task_project_members pm
            WHERE pm.project_id = t.project_id AND ${userIdEqualsSql('pm.user_id')}
          )
        )
      )
    `,
    params: [viewer.userId, viewer.userId, viewer.userId, viewer.userId, viewer.userId],
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
    where.push(`t.status NOT IN (?, ?)`);
    params.push('CANCELADA', 'ARQUIVADA');
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

  if (filters.projectId) {
    where.push(`t.project_id = ?`);
    params.push(clean(filters.projectId));
  } else if (filters.includeStandalone === false) {
    where.push(`t.project_id IS NOT NULL`);
  }

  if (filters.scheduledOnly) {
    where.push(`t.start_date IS NOT NULL AND t.due_date IS NOT NULL`);
  }

  if (filters.dueBucket === 'OVERDUE') {
    where.push(
      isMysqlProvider()
        ? `t.due_date IS NOT NULL AND DATE(t.due_date) < CURDATE() AND t.status NOT IN ('CONCLUIDA', 'CANCELADA', 'ARQUIVADA')`
        : `t.due_date IS NOT NULL AND DATE(t.due_date) < date('now') AND t.status NOT IN ('CONCLUIDA', 'CANCELADA', 'ARQUIVADA')`
    );
  } else if (filters.dueBucket === 'DUE_SOON') {
    where.push(
      isMysqlProvider()
        ? `t.due_date IS NOT NULL AND DATE(t.due_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY) AND t.status NOT IN ('CONCLUIDA', 'CANCELADA', 'ARQUIVADA')`
        : `t.due_date IS NOT NULL AND DATE(t.due_date) BETWEEN date('now') AND date('now', '+2 day') AND t.status NOT IN ('CONCLUIDA', 'CANCELADA', 'ARQUIVADA')`
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
      previous_operational_status VARCHAR(30) NULL,
      project_id VARCHAR(64) NULL,
      project_sort_order INTEGER NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_projects (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(220) NOT NULL,
      description LONGTEXT NOT NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
      archived_at VARCHAR(32) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_project_members (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role_type VARCHAR(20) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      predecessor_task_id VARCHAR(64) NOT NULL,
      successor_task_id VARCHAR(64) NOT NULL,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id VARCHAR(64) PRIMARY KEY,
      task_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR(64) NOT NULL,
      completed_by VARCHAR(64) NULL,
      completed_at TEXT NULL,
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
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN previous_operational_status VARCHAR(30) NULL`);
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN project_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE tasks ADD COLUMN project_sort_order INTEGER NULL`);
  await safeAddColumn(db, `ALTER TABLE task_projects ADD COLUMN status VARCHAR(20) NULL`);
  await db.execute(`
    UPDATE task_projects
    SET status = CASE
      WHEN archived_at IS NOT NULL THEN 'ARQUIVADO'
      WHEN status IS NULL OR status = '' THEN 'ATIVO'
      ELSE status
    END
  `);
  if (isMysqlProvider()) {
    await safeModifyColumn(db, `ALTER TABLE task_projects MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ATIVO'`);
    await safeModifyColumn(db, `ALTER TABLE task_projects MODIFY COLUMN archived_at VARCHAR(32) NULL`);
  }

  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_tasks_protocol_number ON tasks (protocol_number)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_tasks_protocol_id ON tasks (protocol_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_status ON tasks (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_priority ON tasks (priority)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_due_date ON tasks (due_date)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_created_by ON tasks (created_by)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_primary_assignee ON tasks (primary_assignee_user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_approver ON tasks (approver_user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_department ON tasks (department)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_project ON tasks (project_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_tasks_project_sort ON tasks (project_id, project_sort_order)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_projects_created_by ON task_projects (created_by)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_projects_status ON task_projects (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_projects_archived ON task_projects (archived_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_project_members_project ON task_project_members (project_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_project_members_user ON task_project_members (user_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_project_members_project_user ON task_project_members (project_id, user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_dependencies_project ON task_dependencies (project_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_dependencies_successor ON task_dependencies (successor_task_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_dependencies_pair ON task_dependencies (project_id, predecessor_task_id, successor_task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_assignees_task ON task_assignees (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_assignees_user ON task_assignees (user_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_assignees_task_user ON task_assignees (task_id, user_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_attachments_task ON task_attachments (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_comments_task ON task_comments (task_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_checklist_task ON task_checklist_items (task_id, sort_order)`);
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
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN task_projects p ON p.id = t.project_id
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
      collections.attachmentCountByTask.get(taskId) || 0,
      collections.checklistSummaryByTask.get(taskId) || { totalItems: 0, completedItems: 0, progressPercent: 0 },
      collections.predecessorIdsByTask.get(taskId) || []
    );
  });
};

export const getTaskById = async (db: DbInterface, taskId: string, viewer: TaskViewerContext): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  if (!cleanTaskId) throw new TaskValidationError('taskId obrigatório.');
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const rows = await db.query(
    `
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN task_projects p ON p.id = t.project_id
    WHERE t.id = ?
    LIMIT 1
    `,
    [cleanTaskId]
  );
  const row = rows[0] as Row | undefined;
  if (!row) throw new TaskValidationError('Tarefa não encontrada.', 404);
  const collections = await loadTaskCollections(db, [cleanTaskId]);
  const summary = mapSummaryRow(
    row,
    collections.assigneesByTask.get(cleanTaskId) || [],
    collections.latestApprovalByTask.get(cleanTaskId) || null,
    collections.commentCountByTask.get(cleanTaskId) || 0,
    collections.attachmentCountByTask.get(cleanTaskId) || 0,
    collections.checklistSummaryByTask.get(cleanTaskId) || { totalItems: 0, completedItems: 0, progressPercent: 0 },
    collections.predecessorIdsByTask.get(cleanTaskId) || []
  );

  return {
    ...summary,
    attachments: collections.attachmentsByTask.get(cleanTaskId) || [],
    comments: collections.commentsByTask.get(cleanTaskId) || [],
    checklist: collections.checklistByTask.get(cleanTaskId) || [],
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
  if (isRetiredStatus(status)) {
    throw new TaskValidationError('Não é permitido criar tarefas já encerradas.');
  }
  const dueDate = parseDate(input.dueDate);
  const startDate = parseDate(input.startDate);
  const projectId = nullable(input.projectId);
  const approverUserId = nullable(input.approverUserId);
  const primaryAssigneeUserId = nullable(input.primaryAssigneeUserId) || actorUserId;
  const assigneeIds = computeAssigneeIds(primaryAssigneeUserId, input.assigneeUserIds || []);

  await ensureUserIsActive(db, actorUserId);
  for (const userId of assigneeIds) await ensureUserIsActive(db, userId);
  if (approverUserId) await ensureUserIsActive(db, approverUserId);
  let projectLinkPermissionScope: TaskProjectLinkPermissionScope | null = null;
  if (projectId) {
    validateProjectTaskDates(startDate, dueDate);
    projectLinkPermissionScope = await ensureCanMutateTaskProjectLink(db, {
      projectId,
      taskCreatedBy: actorUserId,
      actorUserId,
      viewer: { userId: actorUserId, canViewAll: false },
      action: 'link',
    });
  }
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
        completed_at, canceled_at, cancellation_reason, previous_operational_status, project_id, project_sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        null,
        projectId,
        projectId ? await nextProjectSortOrder(txDb, projectId) : null,
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
    if (projectId) {
      await insertActivity(txDb, taskId, 'TASK_PROJECT_LINKED', actorUserId, {
        previousProjectId: null,
        nextProjectId: projectId,
        actorUserId,
        actorPermissionScope: projectLinkPermissionScope,
      });
    }
    const task = await getTaskById(txDb, taskId, { userId: actorUserId, canViewAll: true });
    const collaboratorRecipients = task.assignees
      .filter((assignee) => assignee.roleType === 'COLLABORATOR')
      .map((assignee) => assignee.userId);

    await notifyTaskUsers(txDb, task, actorUserId, primaryAssigneeUserId ? [primaryAssigneeUserId] : [], () => ({
      channel: 'task',
      eventType: 'task_assigned_primary',
      title: `Você foi definido como responsável em ${task.protocolId}`,
      body: task.title,
      href: taskHref(task.id),
      entityType: 'task',
      entityId: task.id,
      sourceUserId: actorUserId,
      dedupeKey: `task-created-primary:${task.id}:${primaryAssigneeUserId}`,
    }));

    await notifyTaskUsers(txDb, task, actorUserId, collaboratorRecipients, (userId) => ({
      channel: 'task',
      eventType: 'task_assigned_collaborator',
      title: `Você foi incluído na tarefa ${task.protocolId}`,
      body: task.title,
      href: taskHref(task.id),
      entityType: 'task',
      entityId: task.id,
      sourceUserId: actorUserId,
      dedupeKey: `task-created-collaborator:${task.id}:${userId}`,
    }));

    return task;
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
    const previousAssigneeRows = await txDb.query(
      `SELECT user_id, role_type FROM task_assignees WHERE task_id = ?`,
      [cleanTaskId]
    );
    const currentStatus = normalizeStatus(current.status);
    const currentIsRetired = isRetiredStatus(currentStatus);
    if (currentIsRetired && !viewer.canViewAll && clean(current.created_by) !== actorUserId) {
      throw new TaskValidationError('Apenas o criador da tarefa pode editar uma tarefa encerrada.', 403);
    }
    const nextStatus = input.status ? normalizeStatus(input.status, currentStatus) : currentStatus;
    const nextIsRetired = isRetiredStatus(nextStatus);
    const isClosureTransition = !currentIsRetired && nextIsRetired && currentStatus !== nextStatus;
    const isRestoreTransition = currentIsRetired && !nextIsRetired && currentStatus !== nextStatus;
    const isRetiredToRetiredTransition = currentIsRetired && nextIsRetired && currentStatus !== nextStatus;

    if (isClosureTransition || isRestoreTransition) {
      if (!viewer.canViewAll && clean(current.created_by) !== actorUserId) {
        throw new TaskValidationError('Apenas o criador da tarefa pode cancelar, arquivar ou restaurar esta tarefa.', 403);
      }
    }

    if (isRetiredToRetiredTransition) {
      throw new TaskValidationError('Restaure a tarefa antes de alterar o tipo de encerramento.', 409);
    }

    const nextApprover = Object.prototype.hasOwnProperty.call(input, 'approverUserId')
      ? nullable(input.approverUserId)
      : nullable(current.approver_user_id);
    if (nextStatus === 'AGUARDANDO_APROVACAO' && !nextApprover) {
      throw new TaskValidationError('Defina um aprovador antes de mover a tarefa para aguardando aprovação.');
    }

    if (nextStatus === 'CANCELADA' && !nullable(input.cancellationReason)) {
      throw new TaskValidationError('Informe um motivo para cancelar a tarefa.');
    }

    const nextPrimaryAssigneeUserId = Object.prototype.hasOwnProperty.call(input, 'primaryAssigneeUserId')
      ? nullable(input.primaryAssigneeUserId)
      : nullable(current.primary_assignee_user_id);
    const currentProjectId = nullable(current.project_id);
    const nextProjectId = Object.prototype.hasOwnProperty.call(input, 'projectId')
      ? nullable(input.projectId)
      : currentProjectId;
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

    const projectLinkChanged = currentProjectId !== nextProjectId;
    const projectScheduleChanged =
      parseDate(current.start_date) !== nextStartDate ||
      parseDate(current.due_date) !== nextDueDate;
    let projectLinkPermissionScope: TaskProjectLinkPermissionScope | null = null;

    if (projectLinkChanged && currentProjectId && nextProjectId) {
      await ensureViewerCanAccessProject(txDb, currentProjectId, viewer);
      await ensureViewerCanAccessProject(txDb, nextProjectId, viewer);
      await ensureCanManageProject(txDb, currentProjectId, actorUserId, viewer);
      await ensureCanManageProject(txDb, nextProjectId, actorUserId, viewer);
      projectLinkPermissionScope = viewer.canViewAll ? 'ADMIN' : 'OWNER';
    } else if (projectLinkChanged && nextProjectId) {
      projectLinkPermissionScope = await ensureCanMutateTaskProjectLink(txDb, {
        projectId: nextProjectId,
        taskCreatedBy: clean(current.created_by),
        actorUserId,
        viewer,
        action: 'link',
      });
    } else if (projectLinkChanged && currentProjectId) {
      projectLinkPermissionScope = await ensureCanMutateTaskProjectLink(txDb, {
        projectId: currentProjectId,
        taskCreatedBy: clean(current.created_by),
        actorUserId,
        viewer,
        action: 'unlink',
      });
    } else if (projectScheduleChanged && currentProjectId) {
      projectLinkPermissionScope = await ensureCanMutateTaskProjectLink(txDb, {
        projectId: currentProjectId,
        taskCreatedBy: clean(current.created_by),
        actorUserId,
        viewer,
        action: 'schedule',
      });
    }

    if (nextProjectId) {
      await ensureViewerCanAccessProject(txDb, nextProjectId, viewer);
      validateProjectTaskDates(nextStartDate, nextDueDate);
    }

    const currentPreviousOperationalStatus = nullable(current.previous_operational_status) as TaskSummary['previousOperationalStatus'];
    const nextPreviousOperationalStatus = isClosureTransition
      ? (currentIsRetired ? currentPreviousOperationalStatus : currentStatus as TaskSummary['previousOperationalStatus'])
      : isRestoreTransition
        ? null
        : currentPreviousOperationalStatus;

    const nextCompletedAt =
      nextStatus === 'CONCLUIDA'
        ? nullable(current.completed_at) || updatedAt
        : nextStatus === 'ARQUIVADA' && currentStatus === 'CONCLUIDA'
          ? nullable(current.completed_at) || updatedAt
          : null;
    const nextCanceledAt = nextStatus === 'CANCELADA' ? nullable(current.canceled_at) || updatedAt : null;
    const finalCancellationReason =
      nextStatus === 'CANCELADA' || nextStatus === 'ARQUIVADA'
        ? nextCancellationReason
        : null;

    await txDb.execute(
      `
      UPDATE tasks
      SET title = ?, description = ?, department = ?, priority = ?, status = ?, due_date = ?, start_date = ?,
          primary_assignee_user_id = ?, approver_user_id = ?, completed_at = ?, canceled_at = ?,
          cancellation_reason = ?, previous_operational_status = ?, project_id = ?, project_sort_order = ?, updated_at = ?
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
        finalCancellationReason,
        nextPreviousOperationalStatus,
        nextProjectId,
        nextProjectId
          ? currentProjectId === nextProjectId
            ? (current.project_sort_order == null ? await nextProjectSortOrder(txDb, nextProjectId) : parseIntSafe(current.project_sort_order))
            : await nextProjectSortOrder(txDb, nextProjectId)
          : null,
        updatedAt,
        cleanTaskId,
      ]
    );

    if (currentProjectId && currentProjectId !== nextProjectId) {
      await removeTaskDependencies(txDb, cleanTaskId);
    }

    if (!nextProjectId) {
      await removeTaskDependencies(txDb, cleanTaskId);
    }

    if (shouldReplaceAssignees) {
      await replaceAssignees(txDb, cleanTaskId, nextPrimaryAssigneeUserId, requestedAssigneeIds);
    }

    const activityAction = isRestoreTransition
      ? 'TASK_RESTORED'
      : nextStatus === 'ARQUIVADA' && isClosureTransition
        ? 'TASK_ARCHIVED'
        : nextStatus === 'CANCELADA' && isClosureTransition
          ? 'TASK_CANCELED'
          : 'TASK_UPDATED';

    await insertActivity(txDb, cleanTaskId, activityAction, actorUserId, {
      previousStatus: currentStatus,
      nextStatus,
      previousPriority: normalizePriority(current.priority),
      nextPriority,
      approverUserId: nextApprover,
      primaryAssigneeUserId: nextPrimaryAssigneeUserId,
      cancellationReason: finalCancellationReason,
      previousOperationalStatus: nextPreviousOperationalStatus,
      projectId: nextProjectId,
    });
    if (projectLinkChanged) {
      const projectLinkAction =
        currentProjectId && nextProjectId
          ? 'TASK_PROJECT_TRANSFERRED'
          : nextProjectId
            ? 'TASK_PROJECT_LINKED'
            : 'TASK_PROJECT_UNLINKED';
      await insertActivity(txDb, cleanTaskId, projectLinkAction, actorUserId, {
        previousProjectId: currentProjectId,
        nextProjectId,
        actorUserId,
        actorPermissionScope: projectLinkPermissionScope,
      });
    }
    const task = await getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
    const previousAssigneeIds = new Set((previousAssigneeRows as Row[]).map((row) => clean(row.user_id)).filter(Boolean));
    const previousPrimaryAssigneeUserId = nullable(current.primary_assignee_user_id);
    const nextAssigneeIds = new Set(task.assignees.map((assignee) => assignee.userId).filter(Boolean));
    const addedCollaboratorIds = [...nextAssigneeIds].filter(
      (userId) => userId !== task.primaryAssigneeUserId && !previousAssigneeIds.has(userId)
    );

    if (task.primaryAssigneeUserId && task.primaryAssigneeUserId !== previousPrimaryAssigneeUserId) {
      await notifyTaskUsers(txDb, task, actorUserId, [task.primaryAssigneeUserId], () => ({
        channel: 'task',
        eventType: 'task_assigned_primary',
        title: `Você foi definido como responsável em ${task.protocolId}`,
        body: task.title,
        href: taskHref(task.id),
        entityType: 'task',
        entityId: task.id,
        sourceUserId: actorUserId,
        dedupeKey: `task-update-primary:${task.id}:${task.primaryAssigneeUserId}:${task.updatedAt}`,
      }));
    }

    if (addedCollaboratorIds.length) {
      await notifyTaskUsers(txDb, task, actorUserId, addedCollaboratorIds, (userId) => ({
        channel: 'task',
        eventType: 'task_assigned_collaborator',
        title: `Você foi incluído na tarefa ${task.protocolId}`,
        body: task.title,
        href: taskHref(task.id),
        entityType: 'task',
        entityId: task.id,
        sourceUserId: actorUserId,
        dedupeKey: `task-update-collaborator:${task.id}:${userId}:${task.updatedAt}`,
      }));
    }

    if (currentStatus !== nextStatus) {
      const eventType: IntranetNotificationEventType =
        activityAction === 'TASK_ARCHIVED'
          ? 'task_archived'
          : activityAction === 'TASK_CANCELED'
            ? 'task_canceled'
            : activityAction === 'TASK_RESTORED'
              ? 'task_restored'
              : 'task_status_changed';
      const title =
        activityAction === 'TASK_ARCHIVED'
          ? `Tarefa ${task.protocolId} arquivada`
          : activityAction === 'TASK_CANCELED'
            ? `Tarefa ${task.protocolId} cancelada`
            : activityAction === 'TASK_RESTORED'
              ? `Tarefa ${task.protocolId} restaurada`
              : `Status atualizado em ${task.protocolId}`;
      const body =
        activityAction === 'TASK_RESTORED'
          ? `${task.title} voltou para ${taskStatusLabel(nextStatus)}.`
          : `${task.title} agora está em ${taskStatusLabel(nextStatus)}.`;
      await notifyTaskUsers(txDb, task, actorUserId, collectTaskParticipantIds(task), () => ({
        channel: 'task',
        eventType,
        title,
        body,
        href: taskHref(task.id),
        entityType: 'task',
        entityId: task.id,
        sourceUserId: actorUserId,
        dedupeKey: `task-status:${task.id}:${nextStatus}:${task.updatedAt}`,
      }));
    }

    if (parseDate(current.due_date) !== nextDueDate) {
      await notifyTaskUsers(txDb, task, actorUserId, collectTaskParticipantIds(task), () => ({
        channel: 'task',
        eventType: 'task_due_date_changed',
        title: `Prazo atualizado em ${task.protocolId}`,
        body: nextDueDate ? `${task.title} agora vence em ${nextDueDate}.` : `${task.title} ficou sem prazo definido.`,
        href: taskHref(task.id),
        entityType: 'task',
        entityId: task.id,
        sourceUserId: actorUserId,
        dedupeKey: `task-due-date:${task.id}:${nextDueDate || 'none'}:${task.updatedAt}`,
      }));
    }

    return task;
  });
};

export const addTaskChecklistItem = async (
  db: DbInterface,
  taskId: string,
  input: TaskChecklistItemCreateInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const taskRow = await ensureTaskExists(db, cleanTaskId);
  ensureTaskIsActiveForMutation(taskRow);
  const title = clean(input.title);
  if (!title) throw new TaskValidationError('Título do item do checklist obrigatório.');

  return runInTransaction(db, async (txDb) => {
    const sortRows = await txDb.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM task_checklist_items WHERE task_id = ?`,
      [cleanTaskId]
    );
    const sortOrder = parseIntSafe((sortRows[0] as Row | undefined)?.max_sort, -1) + 1;
    const now = NOW();
    const itemId = randomUUID();

    await txDb.execute(
      `
      INSERT INTO task_checklist_items (
        id, task_id, title, is_completed, sort_order, created_by, completed_by, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [itemId, cleanTaskId, title, 0, sortOrder, actorUserId, null, null, now, now]
    );

    await insertActivity(txDb, cleanTaskId, 'TASK_CHECKLIST_ITEM_ADDED', actorUserId, {
      checklistItemId: itemId,
      title,
      sortOrder,
    });

    return getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
  });
};

export const updateTaskChecklistItem = async (
  db: DbInterface,
  taskId: string,
  itemId: string,
  input: TaskChecklistItemUpdateInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  const cleanItemId = clean(itemId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const taskRow = await ensureTaskExists(db, cleanTaskId);
  ensureTaskIsActiveForMutation(taskRow);

  return runInTransaction(db, async (txDb) => {
    const rows = await txDb.query(
      `SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ? LIMIT 1`,
      [cleanItemId, cleanTaskId]
    );
    const current = rows[0] as Row | undefined;
    if (!current) throw new TaskValidationError('Item do checklist não encontrado.', 404);

    const nextTitle = Object.prototype.hasOwnProperty.call(input, 'title') ? clean(input.title) : clean(current.title);
    if (!nextTitle) throw new TaskValidationError('Título do item do checklist obrigatório.');

    const currentCompleted = parseBool(current.is_completed);
    const nextCompleted = Object.prototype.hasOwnProperty.call(input, 'isCompleted')
      ? Boolean(input.isCompleted)
      : currentCompleted;
    const nextSortOrder = Object.prototype.hasOwnProperty.call(input, 'sortOrder')
      ? parseIntSafe(input.sortOrder, parseIntSafe(current.sort_order))
      : parseIntSafe(current.sort_order);
    const now = NOW();
    const completedChanged = currentCompleted !== nextCompleted;
    const titleChanged = nextTitle !== clean(current.title);
    const sortChanged = nextSortOrder !== parseIntSafe(current.sort_order);

    await txDb.execute(
      `
      UPDATE task_checklist_items
      SET title = ?, is_completed = ?, sort_order = ?, completed_by = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND task_id = ?
      `,
      [
        nextTitle,
        nextCompleted ? 1 : 0,
        nextSortOrder,
        nextCompleted ? actorUserId : null,
        nextCompleted ? now : null,
        now,
        cleanItemId,
        cleanTaskId,
      ]
    );

    await insertActivity(
      txDb,
      cleanTaskId,
      completedChanged ? 'TASK_CHECKLIST_ITEM_TOGGLED' : 'TASK_CHECKLIST_ITEM_UPDATED',
      actorUserId,
      {
        checklistItemId: cleanItemId,
        title: nextTitle,
        isCompleted: nextCompleted,
        sortOrder: nextSortOrder,
        titleChanged,
        sortChanged,
      }
    );

    return getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
  });
};

export const deleteTaskChecklistItem = async (
  db: DbInterface,
  taskId: string,
  itemId: string,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskDetail> => {
  await ensureTaskTables(db);
  const cleanTaskId = clean(taskId);
  const cleanItemId = clean(itemId);
  await ensureViewerCanAccessTask(db, cleanTaskId, viewer);
  const taskRow = await ensureTaskExists(db, cleanTaskId);
  ensureTaskIsActiveForMutation(taskRow);

  return runInTransaction(db, async (txDb) => {
    const rows = await txDb.query(
      `SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ? LIMIT 1`,
      [cleanItemId, cleanTaskId]
    );
    const current = rows[0] as Row | undefined;
    if (!current) throw new TaskValidationError('Item do checklist não encontrado.', 404);

    await txDb.execute(`DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?`, [cleanItemId, cleanTaskId]);

    await insertActivity(txDb, cleanTaskId, 'TASK_CHECKLIST_ITEM_DELETED', actorUserId, {
      checklistItemId: cleanItemId,
      title: clean(current.title),
      isCompleted: parseBool(current.is_completed),
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
  const taskRow = await ensureTaskExists(db, cleanTaskId);
  ensureTaskIsActiveForMutation(taskRow);

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
  const taskRow = await ensureTaskExists(db, cleanTaskId);
  ensureTaskIsActiveForMutation(taskRow);
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

  const task = await getTaskById(db, cleanTaskId, { userId: actorUserId, canViewAll: true });
  await notifyTaskUsers(db, task, actorUserId, collectTaskParticipantIds(task), () => ({
    channel: 'task',
    eventType: 'task_comment_added',
    title: `Novo comentário em ${task.protocolId}`,
    body: task.title,
    href: taskHref(task.id),
    entityType: 'task',
    entityId: task.id,
    sourceUserId: actorUserId,
    dedupeKey: `task-comment:${comment.id}`,
  }));

  return comment;
};

export const addTaskCommentAttachment = async (
  db: DbInterface,
  commentId: string,
  input: TaskAttachmentInput,
  actorUserId: string
): Promise<TaskCommentAttachment> => {
  await ensureTaskTables(db);
  const rows = await db.query(
    `
    SELECT c.id, c.task_id, t.status
    FROM task_comments c
    INNER JOIN tasks t ON t.id = c.task_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [clean(commentId)]
  );
  const commentRow = rows[0] as Row | undefined;
  if (!commentRow) throw new TaskValidationError('Comentário não encontrado.', 404);
  ensureTaskIsActiveForMutation(commentRow);

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
  ensureTaskIsActiveForMutation(current);
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
    const task = await getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
    await notifyTaskUsers(txDb, task, actorUserId, [approverUserId], () => ({
      channel: 'task',
      eventType: 'task_approval_requested',
      title: `Aprovação solicitada em ${task.protocolId}`,
      body: task.title,
      href: taskHref(task.id),
      entityType: 'task',
      entityId: task.id,
      sourceUserId: actorUserId,
      dedupeKey: `task-approval-request:${task.id}:${cycleNumber}:${approverUserId}`,
    }));

    return task;
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
  ensureTaskIsActiveForMutation(await ensureTaskExists(db, cleanTaskId));
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
    const nextPreviousOperationalStatus =
      nextStatus === 'CANCELADA'
        ? normalizeStatus((await ensureTaskExists(txDb, cleanTaskId)).status) as TaskSummary['previousOperationalStatus']
        : null;

    await txDb.execute(
      `
      UPDATE tasks
      SET status = ?, completed_at = ?, canceled_at = ?, cancellation_reason = ?, previous_operational_status = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        nextStatus,
        decisionStatus === 'APROVADA' ? now : null,
        decisionStatus === 'CANCELADA' ? now : null,
        decisionStatus === 'CANCELADA' ? nullable(input.notes) : null,
        nextPreviousOperationalStatus,
        now,
        cleanTaskId,
      ]
    );

    await insertActivity(txDb, cleanTaskId, 'TASK_APPROVAL_DECIDED', actorUserId, {
      decisionStatus,
      nextStatus,
      previousOperationalStatus: nextPreviousOperationalStatus,
    });
    const task = await getTaskById(txDb, cleanTaskId, { userId: actorUserId, canViewAll: true });
    await notifyTaskUsers(txDb, task, actorUserId, collectTaskParticipantIds(task), () => ({
      channel: 'task',
      eventType: 'task_approval_decided',
      title: `Aprovação atualizada em ${task.protocolId}`,
      body: `${task.title} foi ${decisionStatus.toLowerCase()}.`,
      href: taskHref(task.id),
      entityType: 'task',
      entityId: task.id,
      sourceUserId: actorUserId,
      dedupeKey: `task-approval-decision:${task.id}:${decisionStatus}:${task.updatedAt}`,
    }));

    return task;
  });
};

const mapProjectSummaryRow = (
  row: Row,
  memberCount: number,
  taskCount: number,
  scheduledTaskCount: number,
  isOwner: boolean
): TaskProjectSummary => ({
  id: clean(row.id),
  name: clean(row.name),
  description: clean(row.description),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
  status: normalizeProjectStatus(row.status, row.archived_at),
  archivedAt: nullable(row.archived_at),
  memberCount,
  taskCount,
  scheduledTaskCount,
  isOwner,
});

const getProjectMembersMap = async (db: DbInterface, projectIds: string[]) => {
  if (!projectIds.length) return new Map<string, TaskProjectMember[]>();
  const placeholders = projectIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT * FROM task_project_members WHERE project_id IN (${placeholders}) ORDER BY created_at ASC`,
    projectIds
  );
  const byProject = new Map<string, TaskProjectMember[]>();
  for (const row of rows as Row[]) {
    const item = mapProjectMember(row);
    byProject.set(item.projectId, [...(byProject.get(item.projectId) || []), item]);
  }
  return byProject;
};

const listProjectTasksInternal = async (db: DbInterface, viewer: TaskViewerContext, projectId: string) => {
  return listTasks(db, viewer, {
    includeCanceled: true,
    projectId,
  });
};

export const listTaskProjects = async (db: DbInterface, viewer: TaskViewerContext): Promise<TaskProjectSummary[]> => {
  await ensureTaskTables(db);
  const visibleProjectsWhereSql = `COALESCE(status, CASE WHEN archived_at IS NULL THEN 'ATIVO' ELSE 'ARQUIVADO' END) <> 'ARQUIVADO'`;
  const rows = await db.query(
    viewer.canViewAll
      ? `SELECT * FROM task_projects WHERE ${visibleProjectsWhereSql} ORDER BY updated_at DESC, name ASC`
      : `
        SELECT p.*
        FROM task_projects p
        INNER JOIN task_project_members pm ON pm.project_id = p.id
        WHERE ${visibleProjectsWhereSql.replaceAll('status', 'p.status').replaceAll('archived_at', 'p.archived_at')} AND ${userIdEqualsSql('pm.user_id')}
        ORDER BY p.updated_at DESC, p.name ASC
      `,
    viewer.canViewAll ? [] : [viewer.userId]
  );

  const projectIds = (rows as Row[]).map((row) => clean(row.id)).filter(Boolean);
  const membersByProject = await getProjectMembersMap(db, projectIds);
  const tasks = await listTasks(db, viewer, { includeCanceled: true, includeStandalone: false });
  const tasksByProject = new Map<string, TaskSummary[]>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    tasksByProject.set(task.projectId, [...(tasksByProject.get(task.projectId) || []), task]);
  }

  return (rows as Row[]).map((row) => {
    const projectId = clean(row.id);
    const projectTasks = tasksByProject.get(projectId) || [];
    const members = membersByProject.get(projectId) || [];
    return mapProjectSummaryRow(
      row,
      members.length,
      projectTasks.length,
      projectTasks.filter((task) => task.startDate && task.dueDate).length,
      clean(row.created_by) === viewer.userId
    );
  });
};

export const createTaskProject = async (
  db: DbInterface,
  input: TaskProjectCreateInput,
  actorUserId: string
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const name = clean(input.name);
  if (!name) throw new TaskValidationError('Nome do projeto obrigatório.');
  await ensureUserIsActive(db, actorUserId);
  const memberUserIds = Array.from(new Set((input.memberUserIds || []).map(clean).filter(Boolean).concat(actorUserId)));
  for (const userId of memberUserIds) await ensureUserIsActive(db, userId);

  return runInTransaction(db, async (txDb) => {
    const projectId = randomUUID();
    const now = NOW();
    await txDb.execute(
      `
      INSERT INTO task_projects (id, name, description, created_by, created_at, updated_at, status, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [projectId, name, clean(input.description), actorUserId, now, now, 'ATIVO', null]
    );

    for (const userId of memberUserIds) {
      await txDb.execute(
        `
        INSERT INTO task_project_members (id, project_id, user_id, role_type, created_at)
        VALUES (?, ?, ?, ?, ?)
        `,
        [randomUUID(), projectId, userId, userId === actorUserId ? 'OWNER' : 'MEMBER', now]
      );
    }

    return getTaskProjectById(txDb, projectId, { userId: actorUserId, canViewAll: true });
  });
};

export const getTaskProjectById = async (
  db: DbInterface,
  projectId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureViewerCanAccessProject(db, cleanProjectId, viewer);
  const project = await ensureProjectExists(db, cleanProjectId);
  const [membersByProject, tasks] = await Promise.all([
    getProjectMembersMap(db, [cleanProjectId]),
    listProjectTasksInternal(db, { ...viewer, canViewAll: true }, cleanProjectId),
  ]);
  const dependenciesRows = await db.query(`SELECT * FROM task_dependencies WHERE project_id = ? ORDER BY created_at ASC`, [cleanProjectId]);
  const members = membersByProject.get(cleanProjectId) || [];
  const dependencies = (dependenciesRows as Row[]).map(mapDependency);

  return {
    ...mapProjectSummaryRow(
      project,
      members.length,
      tasks.length,
      tasks.filter((task) => task.startDate && task.dueDate).length,
      clean(project.created_by) === viewer.userId
    ),
    members,
    tasks,
    dependencies,
  };
};

export const updateTaskProject = async (
  db: DbInterface,
  projectId: string,
  input: TaskProjectUpdateInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  const current = await ensureProjectExists(db, cleanProjectId);
  const nextName = Object.prototype.hasOwnProperty.call(input, 'name') ? clean(input.name) : clean(current.name);
  const nextDescription = Object.prototype.hasOwnProperty.call(input, 'description') ? clean(input.description) : clean(current.description);
  const currentStatus = normalizeProjectStatus(current.status, current.archived_at);
  const nextStatusCandidate = Object.prototype.hasOwnProperty.call(input, 'status')
    ? clean(input.status).toUpperCase()
    : Object.prototype.hasOwnProperty.call(input, 'archivedAt')
      ? nullable(input.archivedAt)
        ? 'ARQUIVADO'
        : 'ATIVO'
      : currentStatus;
  if (!PROJECT_STATUS_VALUES.includes(nextStatusCandidate as TaskProjectStatus)) {
    throw new TaskValidationError('Status do projeto inválido.');
  }
  const nextStatus = nextStatusCandidate as TaskProjectStatus;
  const nextArchivedAt =
    nextStatus === 'ARQUIVADO'
      ? Object.prototype.hasOwnProperty.call(input, 'archivedAt')
        ? nullable(input.archivedAt) || NOW()
        : nullable(current.archived_at) || NOW()
      : null;
  if (!nextName) throw new TaskValidationError('Nome do projeto obrigatório.');
  await db.execute(
    `UPDATE task_projects SET name = ?, description = ?, status = ?, archived_at = ?, updated_at = ? WHERE id = ?`,
    [nextName, nextDescription, nextStatus, nextArchivedAt, NOW(), cleanProjectId]
  );
  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

export const addTaskProjectMember = async (
  db: DbInterface,
  projectId: string,
  input: TaskProjectMemberAddInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  const userId = clean(input.userId);
  await ensureUserIsActive(db, userId);
  await db.execute(
    `
    INSERT ${isMysqlProvider() ? 'IGNORE' : 'OR IGNORE'} INTO task_project_members (id, project_id, user_id, role_type, created_at)
    VALUES (?, ?, ?, ?, ?)
    `,
    [randomUUID(), cleanProjectId, userId, 'MEMBER', NOW()]
  );
  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

export const removeTaskProjectMember = async (
  db: DbInterface,
  projectId: string,
  memberId: string,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  const rows = await db.query(`SELECT * FROM task_project_members WHERE id = ? AND project_id = ? LIMIT 1`, [clean(memberId), cleanProjectId]);
  const member = rows[0] as Row | undefined;
  if (!member) throw new TaskValidationError('Membro do projeto não encontrado.', 404);
  if (upper(member.role_type) === 'OWNER') {
    throw new TaskValidationError('O criador do projeto não pode ser removido.', 409);
  }
  await db.execute(`DELETE FROM task_project_members WHERE id = ? AND project_id = ?`, [clean(memberId), cleanProjectId]);
  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

export const createTaskDependency = async (
  db: DbInterface,
  projectId: string,
  input: TaskDependencyCreateInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  const predecessorTaskId = clean(input.predecessorTaskId);
  const successorTaskId = clean(input.successorTaskId);
  if (!predecessorTaskId || !successorTaskId) throw new TaskValidationError('Defina predecessora e sucessora.');
  if (predecessorTaskId === successorTaskId) throw new TaskValidationError('Uma tarefa não pode depender dela mesma.');
  const taskRows = await db.query(
    `SELECT id, project_id FROM tasks WHERE id IN (?, ?)`,
    [predecessorTaskId, successorTaskId]
  );
  const taskMap = new Map((taskRows as Row[]).map((row) => [clean(row.id), clean(row.project_id)]));
  if (taskMap.get(predecessorTaskId) !== cleanProjectId || taskMap.get(successorTaskId) !== cleanProjectId) {
    throw new TaskValidationError('As duas tarefas precisam pertencer ao mesmo projeto.', 409);
  }
  await ensureDependencyGraphHasNoCycle(db, cleanProjectId, predecessorTaskId, successorTaskId);
  await db.execute(
    `
    INSERT ${isMysqlProvider() ? 'IGNORE' : 'OR IGNORE'} INTO task_dependencies (
      id, project_id, predecessor_task_id, successor_task_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), cleanProjectId, predecessorTaskId, successorTaskId, actorUserId, NOW()]
  );
  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

export const deleteTaskDependency = async (
  db: DbInterface,
  projectId: string,
  dependencyId: string,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  await db.execute(`DELETE FROM task_dependencies WHERE id = ? AND project_id = ?`, [clean(dependencyId), cleanProjectId]);
  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

export const reorderTaskProjectTasks = async (
  db: DbInterface,
  projectId: string,
  input: TaskProjectTaskReorderInput,
  actorUserId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  await ensureTaskTables(db);
  const cleanProjectId = clean(projectId);
  await ensureCanManageProject(db, cleanProjectId, actorUserId, viewer);
  const orderedTaskIds = Array.from(new Set((input.orderedTaskIds || []).map(clean).filter(Boolean)));
  if (!orderedTaskIds.length) {
    throw new TaskValidationError('Informe a nova ordem das tarefas do projeto.');
  }

  const taskRows = await db.query(`SELECT id FROM tasks WHERE project_id = ?`, [cleanProjectId]);
  const projectTaskIds = (taskRows as Row[]).map((row) => clean(row.id)).filter(Boolean);
  const missing = orderedTaskIds.filter((taskId) => !projectTaskIds.includes(taskId));
  if (missing.length) {
    throw new TaskValidationError('A ordenação contém tarefas que não pertencem a este projeto.', 409);
  }

  const remainingTaskIds = projectTaskIds.filter((taskId) => !orderedTaskIds.includes(taskId));
  const finalOrder = [...orderedTaskIds, ...remainingTaskIds];

  await runInTransaction(db, async (txDb) => {
    for (let index = 0; index < finalOrder.length; index += 1) {
      await txDb.execute(`UPDATE tasks SET project_sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?`, [
        index,
        NOW(),
        finalOrder[index],
        cleanProjectId,
      ]);
    }
  });

  return getTaskProjectById(db, cleanProjectId, { userId: actorUserId, canViewAll: true });
};

const sortGanttTasks = (tasks: TaskSummary[]) =>
  [...tasks].sort((left, right) => {
    const leftSort = left.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightSort = right.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftSort !== rightSort) return leftSort - rightSort;
    if (left.startDate && right.startDate) {
      const gap = left.startDate.localeCompare(right.startDate);
      if (gap !== 0) return gap;
    }
    return left.title.localeCompare(right.title, 'pt-BR');
  });

const mapGanttRow = (task: TaskSummary): TaskPortfolioGanttRow => ({
  projectId: task.projectId,
  projectName: task.projectName || 'Tarefas avulsas',
  taskId: task.id,
  protocolId: task.protocolId,
  title: task.title,
  department: task.department,
  priority: task.priority,
  status: task.status,
  startDate: task.startDate,
  dueDate: task.dueDate,
  durationDays: diffDaysInclusive(task.startDate, task.dueDate),
  primaryAssigneeUserId: task.primaryAssigneeUserId,
  checklistProgressPercent: task.checklistProgressPercent,
  predecessorTaskIds: task.predecessorTaskIds,
  projectSortOrder: task.projectSortOrder,
  isStandalone: !task.projectId,
  isOverdue: isTaskOverdueForGantt(task),
});

export const getTaskProjectGantt = async (
  db: DbInterface,
  projectId: string,
  viewer: TaskViewerContext
): Promise<TaskProjectDetail> => {
  const project = await getTaskProjectById(db, projectId, viewer);
  return {
    ...project,
    tasks: sortGanttTasks(
      project.tasks.filter((task) => !isRetiredStatus(task.status) && Boolean(task.startDate && task.dueDate))
    ),
  };
};

export const getTaskPortfolioGantt = async (
  db: DbInterface,
  viewer: TaskViewerContext
): Promise<TaskPortfolioGantt> => {
  await ensureTaskTables(db);
  const [projects, tasks] = await Promise.all([
    listTaskProjects(db, viewer),
    listTasks(db, viewer, { includeCanceled: true, scheduledOnly: true }),
  ]);

  const projectIds = projects.map((project) => project.id);
  const projectDetails = await Promise.all(projectIds.map((projectId) => getTaskProjectById(db, projectId, viewer)));
  const sections: TaskPortfolioGanttSection[] = projectDetails
    .map((project) => ({
      project,
      tasks: sortGanttTasks(project.tasks.filter((task) => !isRetiredStatus(task.status) && Boolean(task.startDate && task.dueDate))),
      dependencies: project.dependencies,
    }))
    .filter((section) => section.tasks.length > 0);

  const standaloneTasks = sortGanttTasks(
    tasks.filter((task) => !task.projectId && !isRetiredStatus(task.status) && Boolean(task.startDate && task.dueDate))
  );
  if (standaloneTasks.length) {
    sections.push({
      project: null,
      tasks: standaloneTasks,
      dependencies: [],
    });
  }

  return {
    sections,
    rows: sections.flatMap((section) => section.tasks.map(mapGanttRow)),
  };
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
    if (task.status === 'CONCLUIDA' || task.status === 'CANCELADA' || task.status === 'ARQUIVADA') return false;
    const due = new Date(`${task.dueDate}T00:00:00`);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    return due >= start && due <= end;
  }).length;

  const overdueTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    if (task.status === 'CONCLUIDA' || task.status === 'CANCELADA' || task.status === 'ARQUIVADA') return false;
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
