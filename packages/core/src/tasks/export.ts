import type { TaskPortfolioGantt, TaskProjectDetail, TaskSummary } from './types';

export type TaskExportRow = {
  protocolId: string;
  project: string;
  title: string;
  status: string;
  priority: string;
  department: string;
  primaryAssigneeUserId: string | null;
  assigneeUserIds: string[];
  approverUserId: string | null;
  startDate: string | null;
  dueDate: string | null;
  durationDays: number | null;
  checklistProgressPercent: number;
  predecessors: string;
};

const priorityLabelMap = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
} as const;

const statusLabelMap = {
  BACKLOG: 'Backlog',
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDA: 'Concluída',
  ARQUIVADA: 'Arquivada',
  CANCELADA: 'Cancelada',
} as const;

const diffCalendarDays = (startDate: string | null, endDate: string | null) => {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const dayMs = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(Math.round((endUtc - startUtc) / dayMs) + 1, 1);
};

const buildPredecessorLabel = (task: TaskSummary, tasksById: Map<string, TaskSummary>) =>
  task.predecessorTaskIds
    .map((taskId) => tasksById.get(taskId)?.protocolId || taskId)
    .join(', ');

export const buildTaskExportRows = (tasks: TaskSummary[]): TaskExportRow[] => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return tasks.map((task) => ({
    protocolId: task.protocolId,
    project: task.projectName || 'Tarefa avulsa',
    title: task.title,
    status: statusLabelMap[task.status],
    priority: priorityLabelMap[task.priority],
    department: task.department,
    primaryAssigneeUserId: task.primaryAssigneeUserId,
    assigneeUserIds: task.assignees
      .filter((assignee) => assignee.roleType !== 'PRIMARY')
      .map((assignee) => assignee.userId),
    approverUserId: task.approverUserId,
    startDate: task.startDate,
    dueDate: task.dueDate,
    durationDays: diffCalendarDays(task.startDate, task.dueDate),
    checklistProgressPercent: task.checklistProgressPercent,
    predecessors: buildPredecessorLabel(task, tasksById),
  }));
};

export const buildProjectTaskExportRows = (project: TaskProjectDetail) => buildTaskExportRows(project.tasks);

export const buildPortfolioTaskExportRows = (portfolio: TaskPortfolioGantt) =>
  buildTaskExportRows(
    portfolio.sections.flatMap((section) => section.tasks)
  );
