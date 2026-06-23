import type { TaskLinkedEquipmentWorkOrderRef } from '../equipment_work_orders';

export type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type TaskStatus =
  | 'BACKLOG'
  | 'A_FAZER'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_APROVACAO'
  | 'CONCLUIDA'
  | 'PAUSADO'
  | 'ARQUIVADA'
  | 'CANCELADA';
export type TaskAssigneeRoleType = 'PRIMARY' | 'COLLABORATOR';
export type TaskApprovalDecisionStatus = 'PENDENTE' | 'APROVADA' | 'REPROVADA' | 'DEVOLVIDA' | 'CANCELADA';
export type TaskProjectMemberRoleType = 'OWNER' | 'MEMBER';

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

export type TaskChecklistItem = {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  createdBy: string;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskChecklistSummary = {
  totalItems: number;
  completedItems: number;
  progressPercent: number;
};

export type TaskProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  roleType: TaskProjectMemberRoleType;
  createdAt: string;
};

export type TaskDependency = {
  id: string;
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  createdBy: string;
  createdAt: string;
};

export type TaskProjectStatus = 'ATIVO' | 'CONCLUIDO' | 'ARQUIVADO';

export type TaskProjectSummary = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: TaskProjectStatus;
  archivedAt: string | null;
  memberCount: number;
  taskCount: number;
  scheduledTaskCount: number;
  isOwner: boolean;
};

export type TaskProjectDetail = TaskProjectSummary & {
  members: TaskProjectMember[];
  tasks: TaskSummary[];
  dependencies: TaskDependency[];
};

export type TaskPortfolioGanttRow = {
  projectId: string | null;
  projectName: string;
  taskId: string;
  protocolId: string;
  title: string;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  durationDays: number;
  primaryAssigneeUserId: string | null;
  checklistProgressPercent: number;
  predecessorTaskIds: string[];
  projectSortOrder: number | null;
  isStandalone: boolean;
  isOverdue: boolean;
};

export type TaskPortfolioGanttSection = {
  project: TaskProjectSummary | null;
  tasks: TaskSummary[];
  dependencies: TaskDependency[];
};

export type TaskPortfolioGantt = {
  rows: TaskPortfolioGanttRow[];
  sections: TaskPortfolioGanttSection[];
  unscheduledStandaloneTasks: TaskSummary[];
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
  projectId: string | null;
  projectName: string | null;
  projectSortOrder: number | null;
  predecessorTaskIds: string[];
  completedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  previousOperationalStatus: Exclude<TaskStatus, 'ARQUIVADA' | 'CANCELADA'> | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  latestApproval: TaskApprovalRequest | null;
  commentCount: number;
  attachmentCount: number;
  checklistTotalItems: number;
  checklistCompletedItems: number;
  checklistProgressPercent: number;
  linkedEquipmentWorkOrder?: TaskLinkedEquipmentWorkOrderRef | null;
};

export type TaskDetail = TaskSummary & {
  attachments: TaskAttachment[];
  comments: TaskComment[];
  approvalRequests: TaskApprovalRequest[];
  activity: TaskActivityLog[];
  checklist: TaskChecklistItem[];
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
  projectId?: string | null;
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
  projectId?: string | null;
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
  projectId?: string;
  includeStandalone?: boolean;
  scheduledOnly?: boolean;
  scheduleState?: 'SCHEDULED' | 'UNSCHEDULED';
  includeCanceled?: boolean;
  dueBucket?: 'OVERDUE' | 'DUE_SOON' | 'NONE';
};

export type TaskDashboardSummary = {
  totalTasks: number;
  dueSoonTasks: number;
  overdueTasks: number;
  awaitingApprovalTasks: number;
  approvedTasks: number;
  efficiency: TaskEfficiencySummary;
  byStatus: Array<{ status: TaskStatus; count: number }>;
  byPriority: Array<{ priority: TaskPriority; count: number }>;
  byDepartment: Array<{ department: string; count: number }>;
};

export type TaskEfficiencySummary = {
  completedTasks: number;
  operationalTasks: number;
  efficiencyPercent: number | null;
};

export type TaskWeeklyReportEligibilitySkipReason =
  | 'MISSING_USER_EMPLOYEE_LINK'
  | 'MISSING_CORPORATE_EMAIL'
  | 'NO_ELIGIBLE_PENDING_TASKS';

export type TaskWeeklyReportEligibilityRecipient = {
  userId: string;
  employeeId: string;
  employeeName: string;
  corporateEmail: string;
  eligiblePendingTaskCount: number;
};

export type TaskWeeklyReportEligibilitySkippedRecipient = {
  userId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  reason: TaskWeeklyReportEligibilitySkipReason;
};

export type TaskWeeklyReportEligibilitySummary = {
  generatedAt: string;
  eligibleRecipients: TaskWeeklyReportEligibilityRecipient[];
  skippedRecipients: TaskWeeklyReportEligibilitySkippedRecipient[];
};

export type TaskWeeklyReportWindow = {
  startDate: string;
  endDate: string;
  label: string;
};

export type TaskWeeklyReportTaskItem = {
  taskId: string;
  protocolId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  department: string;
  projectName: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
};

export type TaskWeeklyReportEmailPayload = {
  recipient: {
    userId: string;
    employeeId: string;
    employeeName: string;
    corporateEmail: string;
  };
  period: TaskWeeklyReportWindow;
  generatedAt: string;
  intranetTasksUrl: string;
  summary: {
    pendingTasks: number;
    overdueTasks: number;
    dueNext7DaysTasks: number;
    awaitingApprovalTasks: number;
    accumulatedEfficiency: TaskEfficiencySummary;
    weeklyEfficiencyPercent: number | null;
    weeklyCompletedTasks: number;
    weeklyEfficiencyBaseTasks: number;
  };
  highlightedTasks: TaskWeeklyReportTaskItem[];
};

export type TaskChecklistItemCreateInput = {
  title: string;
};

export type TaskChecklistItemUpdateInput = {
  title?: string | null;
  isCompleted?: boolean | null;
  sortOrder?: number | null;
};

export type TaskProjectCreateInput = {
  name: string;
  description?: string | null;
  memberUserIds?: string[];
};

export type TaskProjectUpdateInput = {
  name?: string | null;
  description?: string | null;
  status?: TaskProjectStatus | null;
  archivedAt?: string | null;
};

export type TaskProjectMemberAddInput = {
  userId: string;
};

export type TaskDependencyCreateInput = {
  predecessorTaskId: string;
  successorTaskId: string;
};

export type TaskProjectTaskReorderInput = {
  orderedTaskIds: string[];
};
