export type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type TaskStatus =
  | 'BACKLOG'
  | 'A_FAZER'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_APROVACAO'
  | 'CONCLUIDA'
  | 'CANCELADA';
export type TaskAssigneeRoleType = 'PRIMARY' | 'COLLABORATOR';
export type TaskApprovalDecisionStatus = 'PENDENTE' | 'APROVADA' | 'REPROVADA' | 'DEVOLVIDA' | 'CANCELADA';

export type TaskViewerContext = {
  userId: string;
  canViewAll?: boolean;
};

export type TaskAssignee = {
  id: string;
  taskId: string;
  userId: string;
  roleType: TaskAssigneeRoleType;
  createdAt: string;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};

export type TaskCommentAttachment = {
  id: string;
  commentId: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  attachments: TaskCommentAttachment[];
};

export type TaskApprovalRequest = {
  id: string;
  taskId: string;
  approverUserId: string;
  requestedBy: string;
  requestedAt: string;
  decisionStatus: TaskApprovalDecisionStatus;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  cycleNumber: number;
  isActive: boolean;
};

export type TaskActivityLog = {
  id: string;
  taskId: string;
  action: string;
  actorUserId: string;
  payloadJson: string | null;
  createdAt: string;
};

export type TaskSummary = {
  id: string;
  protocolNumber: number;
  protocolId: string;
  title: string;
  description: string;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  startDate: string | null;
  createdBy: string;
  primaryAssigneeUserId: string | null;
  approverUserId: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  latestApproval: TaskApprovalRequest | null;
  commentCount: number;
  attachmentCount: number;
};

export type TaskDetail = TaskSummary & {
  attachments: TaskAttachment[];
  comments: TaskComment[];
  approvalRequests: TaskApprovalRequest[];
  activity: TaskActivityLog[];
};

export type TaskCreateInput = {
  title: string;
  description?: string | null;
  department: string;
  priority?: TaskPriority | null;
  status?: TaskStatus | null;
  dueDate?: string | null;
  startDate?: string | null;
  primaryAssigneeUserId?: string | null;
  assigneeUserIds?: string[];
  approverUserId?: string | null;
};

export type TaskUpdateInput = {
  title?: string | null;
  description?: string | null;
  department?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | null;
  dueDate?: string | null;
  startDate?: string | null;
  primaryAssigneeUserId?: string | null;
  assigneeUserIds?: string[];
  approverUserId?: string | null;
  cancellationReason?: string | null;
};

export type TaskAttachmentInput = {
  storageProvider: string;
  storageBucket?: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type TaskCommentInput = {
  body: string;
};

export type TaskApprovalRequestInput = {
  approverUserId: string;
  notes?: string | null;
};

export type TaskApprovalDecisionInput = {
  decisionStatus: Extract<TaskApprovalDecisionStatus, 'APROVADA' | 'REPROVADA' | 'DEVOLVIDA' | 'CANCELADA'>;
  notes?: string | null;
};

export type TaskListFilters = {
  search?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  createdBy?: string;
  assigneeUserId?: string;
  approverUserId?: string;
  department?: string;
  includeCanceled?: boolean;
  dueBucket?: 'OVERDUE' | 'DUE_SOON' | 'NONE';
};

export type TaskDashboardSummary = {
  totalTasks: number;
  dueSoonTasks: number;
  overdueTasks: number;
  awaitingApprovalTasks: number;
  approvedTasks: number;
  byStatus: Array<{ status: TaskStatus; count: number }>;
  byPriority: Array<{ priority: TaskPriority; count: number }>;
  byDepartment: Array<{ department: string; count: number }>;
};
