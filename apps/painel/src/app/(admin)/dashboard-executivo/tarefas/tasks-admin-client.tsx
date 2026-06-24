'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Activity,
  Check,
  Gauge,
  Calendar,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Columns3,
  ExternalLink,
  FileText,
  Filter,
  LayoutGrid,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  Play,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Users,
  X,
} from 'lucide-react';
import type {
  TaskApprovalDecisionStatus,
  TaskDashboardSummary,
  TaskDependency,
  TaskDetail,
  TaskEfficiencySummary,
  TaskGlobalWeeklyReportEmailPayload,
  TaskPortfolioGantt,
  TaskPortfolioGanttSection,
  TaskPriority,
  TaskWeeklyReportEmailPayload,
  TaskProjectDetail,
  TaskProjectStatus,
  TaskProjectSummary,
  TaskStatus,
  TaskSummary,
} from '@consultare/core/tasks/types';
import { buildTaskGanttPresentation, type TaskGanttPresentationRow } from '@consultare/core/tasks/gantt';

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

type ExecutiveTasksClientProps = {
  users: UserOption[];
  departments: string[];
  canEdit: boolean;
};

type ViewMode = 'KANBAN' | 'LIST' | 'GANTT';

type TaskFormState = {
  title: string;
  description: string;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  startDate: string;
  projectId: string;
  primaryAssigneeUserId: string;
  assigneeUserIds: string[];
  approverUserId: string;
};

type FiltersState = {
  search: string;
  department: string;
  projectId: string;
  createdBy: string;
  assigneeUserId: string;
  approverUserId: string;
  priority: string;
  status: string;
  dueBucket: string;
  scheduleState: 'all' | 'SCHEDULED' | 'UNSCHEDULED';
};

type WeeklyReportSettingsState = {
  enabled: boolean;
  globalReportEnabled: boolean;
  globalRecipientUserIds: string[];
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type WeeklyReportRunItem = {
  id: string;
  runKey: string;
  windowStartDate: string;
  windowEndDate: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  triggerSource: 'cron' | 'manual';
  triggeredBy: string;
  attemptNumber: number;
  provider: string;
  eligibleCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type WeeklyReportEligibilityState = {
  generatedAt: string;
  eligibleRecipients: Array<{
    userId: string;
    employeeId: string;
    employeeName: string;
    corporateEmail: string;
    eligiblePendingTaskCount: number;
  }>;
  skippedRecipients: Array<{
    userId: string | null;
    employeeId: string | null;
    employeeName: string | null;
    reason: 'MISSING_USER_EMPLOYEE_LINK' | 'MISSING_CORPORATE_EMAIL' | 'NO_ELIGIBLE_PENDING_TASKS';
  }>;
  globalRecipients: {
    generatedAt: string;
    selectedCount: number;
    readyRecipients: Array<{
      userId: string | null;
      userName: string | null;
      employeeId: string | null;
      employeeName: string | null;
      corporateEmail: string | null;
      status: 'READY';
      reason: null;
    }>;
    skippedRecipients: Array<{
      userId: string | null;
      userName: string | null;
      employeeId: string | null;
      employeeName: string | null;
      corporateEmail: string | null;
      status: 'SKIPPED';
      reason: 'MISSING_USER_EMPLOYEE_LINK' | 'MISSING_CORPORATE_EMAIL' | 'USER_NOT_FOUND';
    }>;
  };
};

const KANBAN_COLUMNS: Array<{ key: TaskStatus; label: string; description: string }> = [
  { key: 'BACKLOG', label: 'Backlog', description: 'Entradas ainda em triagem.' },
  { key: 'A_FAZER', label: 'A fazer', description: 'Priorizadas para execução.' },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', description: 'Execução ativa pela equipe.' },
  { key: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', description: 'Em revisão formal.' },
  { key: 'CONCLUIDA', label: 'Concluídas', description: 'Entregas encerradas.' },
  { key: 'PAUSADO', label: 'Pausadas', description: 'Demandas temporariamente interrompidas, mas ainda sob gestão operacional.' },
  { key: 'ARQUIVADA', label: 'Arquivadas', description: 'Tarefas retiradas do fluxo operacional.' },
  { key: 'CANCELADA', label: 'Canceladas', description: 'Demandas descontinuadas com histórico preservado.' },
];

const priorityStyles: Record<TaskPriority, string> = {
  BAIXA: 'border-slate-200 bg-slate-50 text-slate-700',
  MEDIA: 'border-sky-200 bg-sky-50 text-sky-700',
  ALTA: 'border-amber-200 bg-amber-50 text-amber-700',
  URGENTE: 'border-rose-200 bg-rose-50 text-rose-700',
};

const statusLabelMap: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDA: 'Concluída',
  PAUSADO: 'Pausada',
  ARQUIVADA: 'Arquivada',
  CANCELADA: 'Cancelada',
};

const approvalLabelMap: Record<TaskApprovalDecisionStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  DEVOLVIDA: 'Devolvida',
  CANCELADA: 'Cancelada',
};

const priorityLabelMap: Record<TaskPriority, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};
const projectStatusLabelMap: Record<TaskProjectStatus, string> = {
  ATIVO: 'Ativo',
  CONCLUIDO: 'Concluído',
  ARQUIVADO: 'Arquivado',
};
const projectStatusToneMap: Record<TaskProjectStatus, string> = {
  ATIVO: 'border-blue-200 bg-blue-50 text-[#17407E]',
  CONCLUIDO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ARQUIVADO: 'border-slate-200 bg-slate-100 text-slate-600',
};
const buildGanttCompactDescription = (task: TaskSummary) => {
  const description = String(task.description || '').trim().replace(/\s+/g, ' ');
  if (description) return description;
  const fallback = [task.department || '', task.startDate ? `Início ${formatDate(task.startDate)}` : '', task.dueDate ? `Prazo ${formatDate(task.dueDate)}` : '']
    .filter(Boolean)
    .join(' • ');
  return fallback || 'Sem contexto adicional informado.';
};

const buildEfficiencyValue = (summary: TaskDashboardSummary | null) =>
  summary?.efficiency?.efficiencyPercent == null ? '—' : `${summary.efficiency.efficiencyPercent}%`;

const buildEfficiencyHelper = (summary: TaskDashboardSummary | null) => {
  if (!summary?.efficiency || summary.efficiency.operationalTasks <= 0) {
    return 'Nenhuma tarefa operacional no recorte atual';
  }

  return `${summary.efficiency.completedTasks} de ${summary.efficiency.operationalTasks} tarefas operacionais concluídas`;
};

const buildEfficiencySummaryLabel = (summary: TaskEfficiencySummary | null | undefined) => {
  if (!summary || summary.efficiencyPercent == null) return '—';
  return `${summary.efficiencyPercent}%`;
};

const weeklyReportSkipReasonLabelMap: Record<
  WeeklyReportEligibilityState['skippedRecipients'][number]['reason'],
  string
> = {
  MISSING_USER_EMPLOYEE_LINK: 'Sem vínculo entre usuário e colaborador',
  MISSING_CORPORATE_EMAIL: 'Sem e-mail corporativo',
  NO_ELIGIBLE_PENDING_TASKS: 'Sem pendências elegíveis',
};

const RETIRED_TASK_STATUSES: TaskStatus[] = ['ARQUIVADA', 'CANCELADA'];

const kanbanColumnToneMap: Record<
  TaskStatus,
  {
    columnClassName: string;
    headerClassName: string;
    badgeClassName: string;
    dragOverClassName: string;
  }
> = {
  BACKLOG: {
    columnClassName: 'border-slate-200 bg-slate-50/80',
    headerClassName: 'border-slate-200 bg-slate-100/85',
    badgeClassName: 'bg-white text-slate-700 ring-slate-200',
    dragOverClassName: 'border-slate-400 ring-2 ring-slate-200',
  },
  A_FAZER: {
    columnClassName: 'border-sky-100 bg-sky-50/65',
    headerClassName: 'border-sky-100 bg-sky-100/70',
    badgeClassName: 'bg-white text-sky-700 ring-sky-200',
    dragOverClassName: 'border-sky-300 ring-2 ring-sky-100',
  },
  EM_ANDAMENTO: {
    columnClassName: 'border-amber-100 bg-amber-50/65',
    headerClassName: 'border-amber-100 bg-amber-100/70',
    badgeClassName: 'bg-white text-amber-700 ring-amber-200',
    dragOverClassName: 'border-amber-300 ring-2 ring-amber-100',
  },
  AGUARDANDO_APROVACAO: {
    columnClassName: 'border-violet-100 bg-violet-50/65',
    headerClassName: 'border-violet-100 bg-violet-100/70',
    badgeClassName: 'bg-white text-violet-700 ring-violet-200',
    dragOverClassName: 'border-violet-300 ring-2 ring-violet-100',
  },
  CONCLUIDA: {
    columnClassName: 'border-emerald-100 bg-emerald-50/65',
    headerClassName: 'border-emerald-100 bg-emerald-100/70',
    badgeClassName: 'bg-white text-emerald-700 ring-emerald-200',
    dragOverClassName: 'border-emerald-300 ring-2 ring-emerald-100',
  },
  PAUSADO: {
    columnClassName: 'border-orange-100 bg-orange-50/65',
    headerClassName: 'border-orange-100 bg-orange-100/70',
    badgeClassName: 'bg-white text-orange-700 ring-orange-200',
    dragOverClassName: 'border-orange-300 ring-2 ring-orange-100',
  },
  ARQUIVADA: {
    columnClassName: 'border-slate-200 bg-slate-100/75',
    headerClassName: 'border-slate-200 bg-slate-200/70',
    badgeClassName: 'bg-white text-slate-600 ring-slate-200',
    dragOverClassName: 'border-slate-400 ring-2 ring-slate-200',
  },
  CANCELADA: {
    columnClassName: 'border-rose-100 bg-rose-50/65',
    headerClassName: 'border-rose-100 bg-rose-100/70',
    badgeClassName: 'bg-white text-rose-700 ring-rose-200',
    dragOverClassName: 'border-rose-300 ring-2 ring-rose-100',
  },
};

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const panelClassName = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

const defaultFilters: FiltersState = {
  search: '',
  department: 'all',
  projectId: 'all',
  createdBy: 'all',
  assigneeUserId: 'all',
  approverUserId: 'all',
  priority: 'all',
  status: 'all',
  dueBucket: 'all',
  scheduleState: 'all',
};

const defaultForm = (): TaskFormState => ({
  title: '',
  description: '',
  department: '',
  priority: 'MEDIA',
  status: 'BACKLOG',
  dueDate: '',
  startDate: '',
  projectId: '',
  primaryAssigneeUserId: '',
  assigneeUserIds: [],
  approverUserId: '',
});

const taskToForm = (task: TaskDetail): TaskFormState => ({
  title: task.title,
  description: task.description,
  department: task.department,
  priority: task.priority,
  status: task.status,
  dueDate: task.dueDate || '',
  startDate: task.startDate || '',
  projectId: task.projectId || '',
  primaryAssigneeUserId: task.primaryAssigneeUserId || '',
  assigneeUserIds: task.assignees.filter((item) => item.roleType !== 'PRIMARY').map((item) => item.userId),
  approverUserId: task.approverUserId || '',
});

const normalizeError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeProjectStructureError = (message: string) => {
  const normalized = normalizeText(message);
  if (normalized.includes('ciclo invalido')) return 'Essa dependência criaria um ciclo inválido no cronograma do projeto.';
  if (normalized.includes('mesmo projeto')) return 'As duas tarefas precisam estar no mesmo projeto para criar a dependência.';
  if (normalized.includes('depender dela mesma')) return 'Uma tarefa não pode ser predecessora dela mesma.';
  if (normalized.includes('data de inicio e prazo') || normalized.includes('inicio e prazo definidos')) {
    return 'Defina início e prazo nas tarefas envolvidas antes de configurar o cronograma.';
  }
  if (normalized.includes('nao pode editar este cronograma')) {
    return 'A estrutura do cronograma só pode ser alterada pela governança autorizada.';
  }
  return message;
};

const isRetiredTaskStatus = (status: TaskStatus) => RETIRED_TASK_STATUSES.includes(status);

const formatDate = (value: string | null) => {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

const buildDepartmentOptions = (departments: string[], currentValue?: string | null) =>
  Array.from(new Set([...departments, String(currentValue || '').trim()].filter(Boolean))).sort((left, right) => left.localeCompare(right, 'pt-BR'));

const parseActivityPayload = (payloadJson: string | null) => {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const describeTaskActivity = (action: string, payloadJson: string | null) => {
  const payload = parseActivityPayload(payloadJson);
  switch (action) {
    case 'TASK_CREATED':
      return 'Tarefa criada';
    case 'TASK_UPDATED':
      return 'Dados da tarefa atualizados';
    case 'TASK_COMMENTED':
      return 'Comentário registrado';
    case 'TASK_ATTACHMENT_ADDED':
      return 'Anexo incluído na tarefa';
    case 'TASK_COMMENT_ATTACHMENT_ADDED':
      return 'Anexo incluído em comentário';
    case 'TASK_APPROVAL_REQUESTED':
      return 'Aprovação solicitada';
    case 'TASK_APPROVAL_DECIDED': {
      const decision = typeof payload?.decisionStatus === 'string' ? payload.decisionStatus : null;
      return decision && decision in approvalLabelMap
        ? `Aprovação ${approvalLabelMap[decision as TaskApprovalDecisionStatus].toLowerCase()}`
        : 'Decisão de aprovação registrada';
    }
    case 'TASK_ARCHIVED':
      return 'Tarefa arquivada';
    case 'TASK_CANCELED':
      return 'Tarefa cancelada';
    case 'TASK_RESTORED': {
      const restoredStatus = typeof payload?.restoredStatus === 'string' ? payload.restoredStatus : null;
      return restoredStatus && restoredStatus in statusLabelMap
        ? `Tarefa restaurada para ${statusLabelMap[restoredStatus as TaskStatus]}`
        : 'Tarefa restaurada';
    }
    case 'TASK_CHECKLIST_ITEM_ADDED':
      return 'Item adicionado ao checklist';
    case 'TASK_CHECKLIST_ITEM_UPDATED':
      return 'Item do checklist atualizado';
    case 'TASK_CHECKLIST_ITEM_TOGGLED':
      return 'Progresso do checklist atualizado';
    case 'TASK_CHECKLIST_ITEM_DELETED':
      return 'Item removido do checklist';
    default:
      return action.replace(/_/g, ' ').toLowerCase();
  }
};

const isDueSoon = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || isRetiredTaskStatus(status)) return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return due >= start && due <= end;
};

const isOverdue = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || isRetiredTaskStatus(status)) return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < start;
};

const priorityRank: Record<TaskPriority, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

const compareTasks = (left: TaskSummary, right: TaskSummary) => {
  const leftOverdue = isOverdue(left.dueDate, left.status);
  const rightOverdue = isOverdue(right.dueDate, right.status);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const leftDueSoon = isDueSoon(left.dueDate, left.status);
  const rightDueSoon = isDueSoon(right.dueDate, right.status);
  if (leftDueSoon !== rightDueSoon) return leftDueSoon ? -1 : 1;

  if (left.status === 'AGUARDANDO_APROVACAO' && right.status !== 'AGUARDANDO_APROVACAO') return -1;
  if (right.status === 'AGUARDANDO_APROVACAO' && left.status !== 'AGUARDANDO_APROVACAO') return 1;

  const priorityGap = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityGap !== 0) return priorityGap;

  if (left.dueDate && right.dueDate) {
    const dueGap = left.dueDate.localeCompare(right.dueDate);
    if (dueGap !== 0) return dueGap;
  } else if (left.dueDate || right.dueDate) {
    return left.dueDate ? -1 : 1;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
};

const parseLocalDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const diffCalendarDays = (start: Date, end: Date) => {
  const dayMs = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / dayMs);
};

const taskProjectLabel = (task: Pick<TaskSummary, 'projectName'>) => task.projectName || 'Tarefa avulsa';
const sortProjectTasks = (items: TaskSummary[]) =>
  [...items].sort((left, right) => {
    const sortGap = (left.projectSortOrder ?? Number.MAX_SAFE_INTEGER) - (right.projectSortOrder ?? Number.MAX_SAFE_INTEGER);
    if (sortGap !== 0) return sortGap;
    return compareTasks(left, right);
  });

const buildQueryString = (filters: FiltersState) => {
  const params = new URLSearchParams();
  params.set('includeCanceled', '1');
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.department !== 'all') params.set('department', filters.department);
  if (filters.projectId !== 'all') params.set('projectId', filters.projectId);
  if (filters.createdBy !== 'all') params.set('createdBy', filters.createdBy);
  if (filters.assigneeUserId !== 'all') params.set('assigneeUserId', filters.assigneeUserId);
  if (filters.approverUserId !== 'all') params.set('approverUserId', filters.approverUserId);
  if (filters.priority !== 'all') params.set('priorities', filters.priority);
  if (filters.status !== 'all') params.set('statuses', filters.status);
  if (filters.dueBucket !== 'all') params.set('dueBucket', filters.dueBucket);
  if (filters.scheduleState !== 'all') params.set('scheduleState', filters.scheduleState);
  return params.toString();
};

const canDropTaskToStatus = (task: TaskSummary, status: TaskStatus, canEdit: boolean) => {
  if (!canEdit) return false;
  if (task.status === status || status === 'CANCELADA' || status === 'ARQUIVADA') return false;
  if (task.status === 'CONCLUIDA' && status === 'PAUSADO') return false;
  if (status === 'AGUARDANDO_APROVACAO' && !task.approverUserId) return false;
  return true;
};

export function ExecutiveTasksClient({ users, departments, canEdit }: ExecutiveTasksClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('KANBAN');
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [projects, setProjects] = useState<TaskProjectSummary[]>([]);
  const [projectDetail, setProjectDetail] = useState<TaskProjectDetail | null>(null);
  const [portfolioGantt, setPortfolioGantt] = useState<TaskPortfolioGantt | null>(null);
  const [managedProjectDetail, setManagedProjectDetail] = useState<TaskProjectDetail | null>(null);
  const [summary, setSummary] = useState<TaskDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBoard, setRefreshingBoard] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [ganttLoading, setGanttLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [weeklyReportModalOpen, setWeeklyReportModalOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(defaultForm());
  const [projectForm, setProjectForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [projectMemberUserId, setProjectMemberUserId] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const dragClickGuardRef = useRef<string | null>(null);
  const [weeklyReportSettings, setWeeklyReportSettings] = useState<WeeklyReportSettingsState>({
    enabled: false,
    globalReportEnabled: false,
    globalRecipientUserIds: [],
    fromEmail: '',
    fromName: 'Consultare Intranet',
    replyToEmail: '',
    updatedAt: null,
    updatedBy: null,
  });
  const [weeklyReportEligibility, setWeeklyReportEligibility] = useState<WeeklyReportEligibilityState | null>(null);
  const [weeklyReportRuns, setWeeklyReportRuns] = useState<WeeklyReportRunItem[]>([]);
  const [weeklyReportPreview, setWeeklyReportPreview] = useState<TaskWeeklyReportEmailPayload | null>(null);
  const [weeklyReportGlobalPreview, setWeeklyReportGlobalPreview] = useState<TaskGlobalWeeklyReportEmailPayload | null>(null);
  const [selectedPreviewUserId, setSelectedPreviewUserId] = useState('all');
  const [selectedGlobalPreviewUserId, setSelectedGlobalPreviewUserId] = useState('all');
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportSaving, setWeeklyReportSaving] = useState(false);
  const [weeklyReportRunning, setWeeklyReportRunning] = useState(false);
  const [weeklyReportPreviewLoading, setWeeklyReportPreviewLoading] = useState(false);
  const [weeklyReportSectionsOpen, setWeeklyReportSectionsOpen] = useState({
    configuration: true,
    preview: true,
    globalPreview: true,
    history: false,
    ignored: false,
  });

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.status === 'CONCLUIDO' ? `${project.name} · Concluído` : project.name,
      })),
    [projects]
  );
  const selectedProjectSummary = useMemo(
    () => projects.find((project) => project.id === filters.projectId) || null,
    [filters.projectId, projects]
  );
  const selectedTaskProjectContext = useMemo(() => {
    if (!selectedTask?.projectId) return null;
    if (managedProjectDetail?.id === selectedTask.projectId) return managedProjectDetail;
    if (projectDetail?.id === selectedTask.projectId) return projectDetail;
    return null;
  }, [managedProjectDetail, projectDetail, selectedTask?.projectId]);
  const selectedTaskDependencies = useMemo(() => {
    if (!selectedTaskProjectContext || !selectedTask) return [];
    return selectedTaskProjectContext.dependencies.filter((dependency) => dependency.successorTaskId === selectedTask.id);
  }, [selectedTask, selectedTaskProjectContext]);
  const taskDependencyOptions = useMemo(() => {
    if (!selectedTaskProjectContext || !selectedTask) return [];
    return sortProjectTasks(selectedTaskProjectContext.tasks)
      .filter((task) => task.id !== selectedTask.id && !isRetiredTaskStatus(task.status))
      .map((task) => ({
        value: task.id,
        label: `${task.protocolId} · ${task.title}`,
        hasSchedule: Boolean(task.startDate && task.dueDate),
      }));
  }, [selectedTask, selectedTaskProjectContext]);
  const dependencyTaskMap = useMemo(
    () => new Map((selectedTaskProjectContext?.tasks || []).map((task) => [task.id, task])),
    [selectedTaskProjectContext]
  );
  const selectedTaskDependencyItems = useMemo(
    () =>
      selectedTaskDependencies.map((dependency) => {
        const predecessor = dependencyTaskMap.get(dependency.predecessorTaskId);
        return {
          id: dependency.id,
          label: predecessor ? `${predecessor.protocolId} · ${predecessor.title}` : dependency.predecessorTaskId,
        };
      }),
    [dependencyTaskMap, selectedTaskDependencies]
  );
  const deferredSearch = useDeferredValue(filters.search);
  const appliedFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters]
  );
  const queryString = useMemo(() => buildQueryString(appliedFilters), [appliedFilters]);

  const loadBoard = async (focusTaskId?: string) => {
    setError(null);
    if (hasLoadedOnce) {
      setRefreshingBoard(true);
    } else {
      setLoading(true);
    }
    try {
      const [tasksResponse, summaryResponse] = await Promise.all([
        fetch(`/api/admin/tasks${queryString ? `?${queryString}` : ''}`, { cache: 'no-store' }),
        fetch(`/api/admin/tasks/summary${queryString ? `?${queryString}` : ''}`, { cache: 'no-store' }),
      ]);
      if (!tasksResponse.ok) throw new Error(await normalizeError(tasksResponse));
      if (!summaryResponse.ok) throw new Error(await normalizeError(summaryResponse));

      const tasksPayload = await tasksResponse.json();
      const summaryPayload = await summaryResponse.json();
      const nextTasks = Array.isArray(tasksPayload.data) ? (tasksPayload.data as TaskSummary[]) : [];
      setTasks(nextTasks);
      setSummary((summaryPayload.data || null) as TaskDashboardSummary | null);

      if (focusTaskId) {
        setSelectedTaskId(focusTaskId);
      } else if (!selectedTaskId && nextTasks[0]?.id) {
        setSelectedTaskId(nextTasks[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar visão global de tarefas.');
    } finally {
      setLoading(false);
      setRefreshingBoard(false);
      setHasLoadedOnce(true);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/admin/task-projects', { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      setProjects(Array.isArray(payload.data) ? (payload.data as TaskProjectSummary[]) : []);
    } catch (err) {
      console.error('Erro ao carregar projetos da governança:', err);
      setProjects([]);
    }
  };

  const loadWeeklyReportAdmin = async () => {
    setWeeklyReportLoading(true);
    try {
      const [settingsResponse, eligibilityResponse, runsResponse] = await Promise.all([
        fetch('/api/admin/tasks/weekly-report/settings', { cache: 'no-store' }),
        fetch('/api/admin/tasks/weekly-report/eligibility', { cache: 'no-store' }),
        fetch('/api/admin/tasks/weekly-report/runs?limit=8', { cache: 'no-store' }),
      ]);

      if (!settingsResponse.ok) throw new Error(await normalizeError(settingsResponse));
      if (!eligibilityResponse.ok) throw new Error(await normalizeError(eligibilityResponse));
      if (!runsResponse.ok) throw new Error(await normalizeError(runsResponse));

      const settingsPayload = await settingsResponse.json();
      const eligibilityPayload = await eligibilityResponse.json();
      const runsPayload = await runsResponse.json();

      const nextSettings = (settingsPayload.data || null) as WeeklyReportSettingsState | null;
      const nextEligibility = (eligibilityPayload.data || null) as WeeklyReportEligibilityState | null;
      const nextRuns = Array.isArray(runsPayload.data) ? (runsPayload.data as WeeklyReportRunItem[]) : [];

      if (nextSettings) {
        setWeeklyReportSettings({
          ...nextSettings,
          replyToEmail: nextSettings.replyToEmail || '',
          globalRecipientUserIds: nextSettings.globalRecipientUserIds || [],
        });
      }
      setWeeklyReportEligibility(nextEligibility);
      setWeeklyReportRuns(nextRuns);
      setSelectedPreviewUserId((current) => {
        if (current !== 'all' && nextEligibility?.eligibleRecipients.some((recipient) => recipient.userId === current)) {
          return current;
        }
        return nextEligibility?.eligibleRecipients[0]?.userId || 'all';
      });
      setSelectedGlobalPreviewUserId((current) => {
        const readyRecipients = nextEligibility?.globalRecipients?.readyRecipients || [];
        if (current !== 'all' && readyRecipients.some((recipient) => recipient.userId === current)) {
          return current;
        }
        return readyRecipients[0]?.userId || 'all';
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a administração do report semanal.');
    } finally {
      setWeeklyReportLoading(false);
    }
  };

  const loadGantt = async () => {
    setGanttLoading(true);
    setError(null);
    try {
      if (filters.projectId !== 'all') {
        const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(filters.projectId)}/gantt`, { cache: 'no-store' });
        if (!response.ok) throw new Error(await normalizeError(response));
        const payload = await response.json();
        setProjectDetail(payload.data as TaskProjectDetail);
        setPortfolioGantt(null);
      } else {
        const response = await fetch('/api/admin/tasks/portfolio-gantt', { cache: 'no-store' });
        if (!response.ok) throw new Error(await normalizeError(response));
        const payload = await response.json();
        setPortfolioGantt(payload.data as TaskPortfolioGantt);
        setProjectDetail(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o cronograma global.');
    } finally {
      setGanttLoading(false);
    }
  };

  const fetchProjectDetail = async (projectId: string) => {
    const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await normalizeError(response));
    const payload = await response.json();
    return payload.data as TaskProjectDetail;
  };

  const syncProjectViews = async (nextProject: TaskProjectDetail, options?: { reloadSelectedTask?: boolean }) => {
    setManagedProjectDetail(nextProject);
    setProjectForm({ name: nextProject.name, description: nextProject.description });
    if (projectDetail?.id === nextProject.id || filters.projectId === nextProject.id) {
      setProjectDetail(nextProject);
    }

    await loadProjects();
    await loadBoard(selectedTaskId || undefined);

    if (viewMode === 'GANTT') {
      if (filters.projectId === nextProject.id) {
        setProjectDetail(nextProject);
      } else {
        await loadGantt();
      }
    }

    if (options?.reloadSelectedTask && selectedTaskId) {
      await loadTaskDetail(selectedTaskId, false);
    }
  };

  const loadManagedProjectDetail = async (projectId: string, openModal = false) => {
    if (!projectId) return;
    setProjectDetailLoading(true);
    setError(null);
    try {
      const data = await fetchProjectDetail(projectId);
      setManagedProjectDetail(data);
      setProjectForm({ name: data.name, description: data.description });
      setProjectMemberUserId('');
      if (openModal) {
        setProjectDetailOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o projeto.');
    } finally {
      setProjectDetailLoading(false);
    }
  };

  const loadTaskDetail = async (taskId: string, openPanel = true) => {
    if (!taskId) return;
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const task = payload.data as TaskDetail;
      setSelectedTask(task);
      setForm(taskToForm(task));
      setLifecycleReason(task.cancellationReason || '');
      if (task.projectId) {
        if (projectDetail?.id === task.projectId) {
          setManagedProjectDetail(projectDetail);
        } else {
          void loadManagedProjectDetail(task.projectId, false);
        }
      } else {
        setManagedProjectDetail(null);
      }
      if (openPanel) {
        setDetailOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da tarefa.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openTaskDetail = async (taskId: string) => {
    setSelectedTaskId(taskId);
    await loadTaskDetail(taskId, true);
  };

  useEffect(() => {
    void loadProjects();
    void loadWeeklyReportAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    if (viewMode !== 'GANTT') return;
    void loadGantt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filters.projectId]);

  useEffect(() => {
    if (!successMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const boardByColumn = useMemo(
    () =>
      KANBAN_COLUMNS.map((column) => ({
        ...column,
        tasks: tasks.filter((task) => task.status === column.key).sort(compareTasks),
      })),
    [tasks]
  );

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => {
        if (key === 'search') return String(value).trim().length > 0;
        return value !== 'all';
      }).length,
    [filters]
  );

  const latestWeeklyReportRun = weeklyReportRuns[0] || null;
  const ignoredByCorporateEmail = useMemo(
    () =>
      weeklyReportEligibility?.skippedRecipients.filter((item) => item.reason === 'MISSING_CORPORATE_EMAIL') || [],
    [weeklyReportEligibility]
  );
  const ignoredByUserLink = useMemo(
    () =>
      weeklyReportEligibility?.skippedRecipients.filter((item) => item.reason === 'MISSING_USER_EMPLOYEE_LINK') || [],
    [weeklyReportEligibility]
  );
  const ignoredByNoPending = useMemo(
    () =>
      weeklyReportEligibility?.skippedRecipients.filter((item) => item.reason === 'NO_ELIGIBLE_PENDING_TASKS') || [],
    [weeklyReportEligibility]
  );
  const previewUserOptions = useMemo(
    () =>
      (weeklyReportEligibility?.eligibleRecipients || []).map((recipient) => ({
        value: recipient.userId,
        label: `${recipient.employeeName} · ${recipient.corporateEmail}`,
      })),
    [weeklyReportEligibility]
  );
  const globalPreviewUserOptions = useMemo(
    () =>
      (weeklyReportEligibility?.globalRecipients.readyRecipients || [])
        .filter((recipient) => recipient.userId && recipient.employeeName && recipient.corporateEmail)
        .map((recipient) => ({
          value: recipient.userId || '',
          label: `${recipient.employeeName} · ${recipient.corporateEmail}`,
        })),
    [weeklyReportEligibility]
  );

  const handleSave = async () => {
    if (!selectedTask || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(selectedTask.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          department: form.department,
          priority: form.priority,
          status: form.status,
          dueDate: form.dueDate || null,
          startDate: form.startDate || null,
          projectId: form.projectId || null,
          primaryAssigneeUserId: form.primaryAssigneeUserId || null,
          assigneeUserIds: form.assigneeUserIds,
          approverUserId: form.approverUserId || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setSuccessMessage('Tarefa atualizada com sucesso.');
      await loadBoard(selectedTask.id);
      await loadTaskDetail(selectedTask.id, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWeeklyReportSettings = async () => {
    if (!canEdit || weeklyReportSaving) return;
    setWeeklyReportSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/tasks/weekly-report/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: weeklyReportSettings.enabled,
          globalReportEnabled: weeklyReportSettings.globalReportEnabled,
          globalRecipientUserIds: weeklyReportSettings.globalRecipientUserIds,
          fromEmail: weeklyReportSettings.fromEmail,
          fromName: weeklyReportSettings.fromName,
          replyToEmail: weeklyReportSettings.replyToEmail.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const data = (payload.data || null) as WeeklyReportSettingsState | null;
      if (data) {
        setWeeklyReportSettings({
          ...data,
          replyToEmail: data.replyToEmail || '',
        });
      }
      setSuccessMessage('Configurações do report semanal salvas com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar as configurações do report semanal.');
    } finally {
      setWeeklyReportSaving(false);
    }
  };

  const handleGenerateWeeklyReportPreview = async () => {
    if (selectedPreviewUserId === 'all' || weeklyReportPreviewLoading) return;
    setWeeklyReportPreviewLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/weekly-report/preview?userId=${encodeURIComponent(selectedPreviewUserId)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      setWeeklyReportPreview((payload.data || null) as TaskWeeklyReportEmailPayload | null);
      setSuccessMessage('Prévia do report semanal carregada para homologação.');
    } catch (err: unknown) {
      setWeeklyReportPreview(null);
      setError(err instanceof Error ? err.message : 'Erro ao gerar a prévia do report semanal.');
    } finally {
      setWeeklyReportPreviewLoading(false);
    }
  };

  const handleGenerateGlobalWeeklyReportPreview = async () => {
    if (selectedGlobalPreviewUserId === 'all' || weeklyReportPreviewLoading) return;
    setWeeklyReportPreviewLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/tasks/weekly-report/preview?kind=global&userId=${encodeURIComponent(selectedGlobalPreviewUserId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      setWeeklyReportGlobalPreview((payload.data || null) as TaskGlobalWeeklyReportEmailPayload | null);
      setSuccessMessage('Prévia do relatório global carregada para homologação.');
    } catch (err: unknown) {
      setWeeklyReportGlobalPreview(null);
      setError(err instanceof Error ? err.message : 'Erro ao gerar a prévia do relatório global.');
    } finally {
      setWeeklyReportPreviewLoading(false);
    }
  };

  const handleRunWeeklyReport = async () => {
    if (!canEdit || weeklyReportRunning) return;
    setWeeklyReportRunning(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/tasks/weekly-report/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadWeeklyReportAdmin();
      setSuccessMessage('Disparo manual do report semanal iniciado com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar o disparo manual do report semanal.');
    } finally {
      setWeeklyReportRunning(false);
    }
  };

  const handleOpenWeeklyReportModal = async () => {
    setWeeklyReportModalOpen(true);
    if (!weeklyReportLoading) {
      void loadWeeklyReportAdmin();
    }
  };

  const toggleWeeklyReportSection = (section: keyof typeof weeklyReportSectionsOpen) => {
    setWeeklyReportSectionsOpen((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const openUnscheduledTasksList = () => {
    setViewMode('LIST');
    setFilters((current) => ({
      ...current,
      scheduleState: 'UNSCHEDULED',
    }));
    setFiltersOpen(true);
  };

  const saveProjectDetail = async (status?: TaskProjectStatus) => {
    if (!managedProjectDetail || !canEdit || saving) return;
    if (!projectForm.name.trim()) {
      setError('Informe um nome para o projeto.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(managedProjectDetail.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectForm.name,
          description: projectForm.description || null,
          ...(typeof status !== 'undefined' ? { status } : {}),
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage(`Projeto ${nextProject.name} atualizado com sucesso.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar projeto.');
    } finally {
      setSaving(false);
    }
  };

  const addProjectMember = async () => {
    if (!managedProjectDetail || !projectMemberUserId || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(managedProjectDetail.id)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: projectMemberUserId }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      setProjectMemberUserId('');
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage('Membro adicionado ao projeto.');
    } catch (err: unknown) {
      setError(err instanceof Error ? normalizeProjectStructureError(err.message) : 'Erro ao adicionar membro.');
    } finally {
      setSaving(false);
    }
  };

  const removeProjectMember = async (memberId: string) => {
    if (!managedProjectDetail || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/task-projects/${encodeURIComponent(managedProjectDetail.id)}/members/${encodeURIComponent(memberId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage('Membro removido do projeto.');
    } catch (err: unknown) {
      setError(err instanceof Error ? normalizeProjectStructureError(err.message) : 'Erro ao remover membro.');
    } finally {
      setSaving(false);
    }
  };

  const addTaskDependency = async (predecessorTaskId: string) => {
    if (!selectedTask?.projectId || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(selectedTask.projectId)}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predecessorTaskId,
          successorTaskId: selectedTask.id,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage('Predecessora adicionada com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? normalizeProjectStructureError(err.message) : 'Erro ao adicionar predecessora.');
    } finally {
      setSaving(false);
    }
  };

  const removeTaskDependency = async (dependencyId: string, projectId?: string | null) => {
    const targetProjectId = projectId || selectedTask?.projectId || managedProjectDetail?.id || '';
    if (!targetProjectId || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/task-projects/${encodeURIComponent(targetProjectId)}/dependencies/${encodeURIComponent(dependencyId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage('Predecessora removida com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? normalizeProjectStructureError(err.message) : 'Erro ao remover predecessora.');
    } finally {
      setSaving(false);
    }
  };

  const reorderManagedProjectTasks = async (taskId: string, direction: 'up' | 'down') => {
    if (!managedProjectDetail || !canEdit || saving) return;
    const ordered = sortProjectTasks(managedProjectDetail.tasks);
    const index = ordered.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const nextOrder = [...ordered];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/task-projects/${encodeURIComponent(managedProjectDetail.id)}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedTaskIds: nextOrder.map((task) => task.id) }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const nextProject = payload.data as TaskProjectDetail;
      await syncProjectViews(nextProject, { reloadSelectedTask: true });
      setSuccessMessage('Ordem do cronograma atualizada.');
    } catch (err: unknown) {
      setError(err instanceof Error ? normalizeProjectStructureError(err.message) : 'Erro ao reordenar cronograma.');
    } finally {
      setSaving(false);
    }
  };

  const addChecklistItem = async (title: string) => {
    if (!selectedTask || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(selectedTask.id)}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadBoard(selectedTask.id);
      await loadTaskDetail(selectedTask.id, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const updateChecklistItem = async (itemId: string, input: { title?: string; isCompleted?: boolean }) => {
    if (!selectedTask || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(selectedTask.id)}/checklist/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadBoard(selectedTask.id);
      await loadTaskDetail(selectedTask.id, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    if (!selectedTask || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(selectedTask.id)}/checklist/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadBoard(selectedTask.id);
      await loadTaskDetail(selectedTask.id, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const changeTaskLifecycle = async (status: TaskStatus) => {
    if (!selectedTask || !canEdit || saving) return;
    if (status === 'CANCELADA' && !lifecycleReason.trim()) {
      setError('Informe um motivo para cancelar a tarefa.');
      return;
    }

    const restoreStatus = selectedTask.previousOperationalStatus || 'BACKLOG';

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(selectedTask.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status === 'BACKLOG' ? restoreStatus : status,
          cancellationReason: status === 'BACKLOG' ? null : lifecycleReason.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const task = payload.data as TaskDetail;
      setSuccessMessage(
        status === 'ARQUIVADA'
          ? `Tarefa ${task.protocolId} arquivada com sucesso.`
          : status === 'CANCELADA'
            ? `Tarefa ${task.protocolId} cancelada com sucesso.`
            : `Tarefa ${task.protocolId} restaurada com sucesso.`
      );
      setLifecycleReason(task.cancellationReason || '');
      await loadBoard(task.id);
      await loadTaskDetail(task.id, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar o encerramento da tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (task: TaskSummary, status: TaskStatus) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setSuccessMessage(`Tarefa ${task.protocolId} movida para ${statusLabelMap[status]}.`);
      await loadBoard(task.id);
      if (detailOpen && selectedTaskId === task.id) {
        await loadTaskDetail(task.id, false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao mover tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const handleTaskDragStart = (task: TaskSummary, event: React.DragEvent<HTMLElement>) => {
    if (!canEdit || saving) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    setDraggedTaskId(task.id);
    dragClickGuardRef.current = task.id;
  };

  const handleTaskDragEnd = (taskId: string) => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    window.setTimeout(() => {
      if (dragClickGuardRef.current === taskId) {
        dragClickGuardRef.current = null;
      }
    }, 0);
  };

  const handleColumnDragOver = (status: TaskStatus, event: React.DragEvent<HTMLDivElement>) => {
    const taskId = draggedTaskId || event.dataTransfer.getData('text/plain');
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !canDropTaskToStatus(task, status, canEdit) || saving) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleColumnDrop = async (status: TaskStatus, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const taskId = draggedTaskId || event.dataTransfer.getData('text/plain');
    const task = tasks.find((item) => item.id === taskId);
    setDragOverColumn(null);
    setDraggedTaskId(null);
    if (!task || !canDropTaskToStatus(task, status, canEdit) || saving) return;
    await moveTask(task, status);
  };

  return (
    <main className="space-y-6">
      <section className={`${panelClassName} p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#17407E] ring-1 ring-blue-100">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Governança de tarefas</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Acompanhe o ritmo da operação, identifique atrasos, monitore aprovações e acompanhe a execução das demandas criadas em toda a intranet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => void handleOpenWeeklyReportModal()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Mail size={16} />
              Report semanal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                viewMode === 'KANBAN'
                  ? 'border-blue-200 bg-blue-50 text-[#17407E]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid size={16} />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                viewMode === 'LIST'
                  ? 'border-blue-200 bg-blue-50 text-[#17407E]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Table2 size={16} />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode('GANTT')}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                viewMode === 'GANTT'
                  ? 'border-blue-200 bg-blue-50 text-[#17407E]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Calendar size={16} />
              Gantt
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <ExecutiveMetricCard label="Total de tarefas" value={summary?.totalTasks || 0} helper="Tudo sob escopo global" tone="neutral" icon={<FileText size={18} />} />
        <ExecutiveMetricCard label="A vencer" value={summary?.dueSoonTasks || 0} helper="Próximos 2 dias" tone="warning" icon={<Clock3 size={18} />} />
        <ExecutiveMetricCard label="Vencidas" value={summary?.overdueTasks || 0} helper="Prazos já expirados" tone="danger" icon={<AlertCircle size={18} />} />
        <ExecutiveMetricCard label="Aguardando aprovação" value={summary?.awaitingApprovalTasks || 0} helper="Fila de decisão" tone="info" icon={<ShieldCheck size={18} />} />
        <ExecutiveMetricCard label="Aprovadas" value={summary?.approvedTasks || 0} helper="Último ciclo aprovado" tone="success" icon={<CheckCircle2 size={18} />} />
        <ExecutiveMetricCard label="Eficiência no recorte" value={buildEfficiencyValue(summary)} helper={buildEfficiencyHelper(summary)} tone="info" icon={<Gauge size={18} />} />
      </section>

      <section className={`${panelClassName} overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Filtros globais</h2>
              <p className="mt-1 text-sm text-slate-500">Cruze setor, responsáveis, aprovadores, prioridade e prazo para encontrar gargalos com rapidez.</p>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {refreshingBoard ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#17407E]">
                  <Loader2 size={14} className="animate-spin" />
                  Atualizando visão
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <SlidersHorizontal size={16} />
                {filtersOpen ? 'Recolher filtros' : 'Expandir filtros'}
              </button>
              <button
                type="button"
                onClick={() => setFilters(defaultFilters)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X size={16} />
                Limpar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <Filter size={13} />
              {activeFilterCount} filtro(s) ativo(s)
            </span>
            <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">{tasks.length} tarefa(s) retornada(s)</span>
            {filters.scheduleState === 'UNSCHEDULED' ? (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700 ring-1 ring-amber-200">
                Fora do cronograma
              </span>
            ) : null}
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                className={inputClassName}
                placeholder="Buscar por protocolo, título ou descrição"
              />
              <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os setores</option>
                {departments.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
              <select value={filters.projectId} onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os projetos</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.status === 'CONCLUIDO' ? `${project.name} · Concluído` : project.name}
                  </option>
                ))}
              </select>
              <SearchableFilterSelect
                label="Criador"
                value={filters.createdBy}
                onChange={(value) => setFilters((current) => ({ ...current, createdBy: value }))}
                allLabel="Todos os criadores"
                options={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.department || user.email}` }))}
              />
              <SearchableFilterSelect
                label="Responsável"
                value={filters.assigneeUserId}
                onChange={(value) => setFilters((current) => ({ ...current, assigneeUserId: value }))}
                allLabel="Todos os responsáveis"
                options={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.department || user.email}` }))}
              />
              <SearchableFilterSelect
                label="Aprovador"
                value={filters.approverUserId}
                onChange={(value) => setFilters((current) => ({ ...current, approverUserId: value }))}
                allLabel="Todos os aprovadores"
                options={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.department || user.email}` }))}
              />
              <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))} className={inputClassName}>
                <option value="all">Todas as prioridades</option>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os status</option>
                {Object.entries(statusLabelMap).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select value={filters.dueBucket} onChange={(event) => setFilters((current) => ({ ...current, dueBucket: event.target.value }))} className={inputClassName}>
                <option value="all">Qualquer prazo</option>
                <option value="OVERDUE">Vencidas</option>
                <option value="DUE_SOON">A vencer</option>
                <option value="NONE">Sem prazo</option>
              </select>
            </div>
          ) : null}
        </div>

        {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</div> : null}
        {successMessage ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

        <div className="p-5">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-slate-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Carregando visão global...
            </div>
          ) : viewMode === 'KANBAN' ? (
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-max auto-cols-[360px] grid-flow-col items-start gap-4">
                {boardByColumn.map((column) => {
                  const tone = kanbanColumnToneMap[column.key];
                  return (
                  <div
                    key={column.key}
                    onDragOver={(event) => handleColumnDragOver(column.key, event)}
                    onDragLeave={() => {
                      if (dragOverColumn === column.key) {
                        setDragOverColumn(null);
                      }
                    }}
                    onDrop={(event) => {
                      void handleColumnDrop(column.key, event);
                    }}
                    className={`flex h-[72vh] min-h-[520px] min-w-0 flex-col rounded-2xl border transition ${
                      tone.columnClassName
                    } ${dragOverColumn === column.key ? tone.dragOverClassName : ''}`}
                  >
                    <div className={`border-b px-4 py-4 ${tone.headerClassName}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{column.label}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone.badgeClassName}`}>{column.tasks.length}</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-3">
                      {column.tasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma tarefa nesta coluna
                        </div>
                      ) : (
                        column.tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            draggable={canEdit && !saving}
                            onDragStart={(event) => handleTaskDragStart(task, event)}
                            onDragEnd={() => handleTaskDragEnd(task.id)}
                            onClick={() => {
                              if (dragClickGuardRef.current === task.id) {
                                dragClickGuardRef.current = null;
                                return;
                              }
                              void openTaskDetail(task.id);
                            }}
                            className={`w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-[#17407E] hover:shadow-md ${
                              selectedTaskId === task.id ? 'border-blue-200 bg-blue-50/50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'
                            } ${
                              canEdit ? (draggedTaskId === task.id ? 'cursor-grabbing opacity-60' : 'cursor-grab') : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</p>
                                <h4 className="mt-1 line-clamp-2 font-semibold text-slate-900">{task.title}</h4>
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityStyles[task.priority]}`}>
                                {task.priority}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{task.description || 'Sem descrição detalhada.'}</p>
                            {task.checklistTotalItems > 0 ? (
                              <div className="mt-3">
                                <ChecklistProgressInline
                                  completedItems={task.checklistCompletedItems}
                                  totalItems={task.checklistTotalItems}
                                  progressPercent={task.checklistProgressPercent}
                                />
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">{task.department}</span>
                              {task.status === 'AGUARDANDO_APROVACAO' ? (
                                <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-700 ring-1 ring-violet-200">Em aprovação</span>
                              ) : null}
                              {isOverdue(task.dueDate, task.status) ? (
                                <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700 ring-1 ring-rose-200">Vencida</span>
                              ) : null}
                              {!isOverdue(task.dueDate, task.status) && isDueSoon(task.dueDate, task.status) ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">A vencer</span>
                              ) : null}
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Calendar size={12} />
                                {formatDate(task.dueDate)}
                              </span>
                              <span className="inline-flex items-center gap-3">
                                <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{task.commentCount}</span>
                                <span className="inline-flex items-center gap-1"><Paperclip size={12} />{task.attachmentCount}</span>
                              </span>
                            </div>
                            <div className="mt-3 text-xs text-slate-500">
                              Responsável: {task.primaryAssigneeUserId ? usersById.get(task.primaryAssigneeUserId)?.name || 'Usuário atribuído' : 'Não definido'}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ) : viewMode === 'GANTT' ? (
            ganttLoading ? (
              <div className="flex min-h-[320px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Montando cronograma global...
              </div>
            ) : (
              <ExecutiveProjectGanttBoard
                project={projectDetail}
                portfolio={portfolioGantt}
                selectedProjectName={selectedProjectSummary?.name || null}
                onOpenTask={(taskId) => {
                  void openTaskDetail(taskId);
                }}
                canEdit={canEdit}
                onOpenProject={(projectId) => {
                  void loadManagedProjectDetail(projectId, true);
                }}
                onOpenUnscheduledList={openUnscheduledTasksList}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Protocolo</th>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Setor</th>
                    <th className="px-4 py-3">Prioridade</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Aprovador</th>
                    <th className="px-4 py-3">Prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => {
                        void openTaskDetail(task.id);
                      }}
                      className={`cursor-pointer transition hover:bg-blue-50/40 ${selectedTaskId === task.id ? 'bg-blue-50/70' : 'bg-white'}`}
                    >
                      <td className="px-4 py-4 font-semibold text-[#17407E]">{task.protocolId}</td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{task.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description || 'Sem descrição detalhada.'}</div>
                        {task.checklistTotalItems > 0 ? (
                          <div className="mt-2 max-w-[240px]">
                            <ChecklistProgressInline
                              completedItems={task.checklistCompletedItems}
                              totalItems={task.checklistTotalItems}
                              progressPercent={task.checklistProgressPercent}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{task.department}</td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{statusLabelMap[task.status]}</td>
                      <td className="px-4 py-4 text-slate-600">{task.primaryAssigneeUserId ? usersById.get(task.primaryAssigneeUserId)?.name || 'Usuário atribuído' : 'Não definido'}</td>
                      <td className="px-4 py-4 text-slate-600">{task.approverUserId ? usersById.get(task.approverUserId)?.name || 'Usuário atribuído' : 'Não definido'}</td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(task.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {detailOpen && selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          users={users}
          departments={departments}
          projectOptions={projectOptions}
          usersById={usersById}
          canEdit={canEdit}
          loading={loadingDetail}
          saving={saving}
          form={form}
          onFormChange={setForm}
          onClose={() => setDetailOpen(false)}
          onSave={() => void handleSave()}
          lifecycleReason={lifecycleReason}
          onLifecycleReasonChange={setLifecycleReason}
          projectLabel={taskProjectLabel(selectedTask)}
          projectContext={selectedTaskProjectContext}
          dependencyOptions={taskDependencyOptions}
          currentDependencies={selectedTaskDependencyItems}
          onArchive={() => void changeTaskLifecycle('ARQUIVADA')}
          onCancelTask={() => void changeTaskLifecycle('CANCELADA')}
          onRestore={() => void changeTaskLifecycle('BACKLOG')}
          onDependencyCreate={(predecessorTaskId) => void addTaskDependency(predecessorTaskId)}
          onDependencyDelete={(dependencyId) => void removeTaskDependency(dependencyId)}
          onChecklistCreate={(title) => void addChecklistItem(title)}
          onChecklistUpdate={(itemId, input) => void updateChecklistItem(itemId, input)}
          onChecklistDelete={(itemId) => void deleteChecklistItem(itemId)}
        />
      ) : null}

      {projectDetailOpen ? (
        <ExecutiveProjectDetailModal
          project={managedProjectDetail}
          saving={saving}
          loading={projectDetailLoading}
          users={users}
          usersById={usersById}
          memberUserId={projectMemberUserId}
          onMemberUserIdChange={setProjectMemberUserId}
          form={projectForm}
          onFormChange={setProjectForm}
          onClose={() => setProjectDetailOpen(false)}
          onSave={() => void saveProjectDetail()}
          onChangeStatus={(status) => void saveProjectDetail(status)}
          onAddMember={() => void addProjectMember()}
          onRemoveMember={(memberId) => void removeProjectMember(memberId)}
          onMoveTask={(taskId, direction) => void reorderManagedProjectTasks(taskId, direction)}
          onOpenTask={(taskId) => {
            setProjectDetailOpen(false);
            void openTaskDetail(taskId);
          }}
          onRemoveDependency={(dependencyId) => void removeTaskDependency(dependencyId, managedProjectDetail?.id)}
          canEdit={canEdit}
        />
      ) : null}
      <WeeklyReportAdminModal
        open={weeklyReportModalOpen}
        canEdit={canEdit}
        loading={weeklyReportLoading}
        saving={weeklyReportSaving}
        running={weeklyReportRunning}
        previewLoading={weeklyReportPreviewLoading}
        settings={weeklyReportSettings}
        eligibility={weeklyReportEligibility}
        runs={weeklyReportRuns}
        preview={weeklyReportPreview}
        globalPreview={weeklyReportGlobalPreview}
        previewUserOptions={previewUserOptions}
        globalPreviewUserOptions={globalPreviewUserOptions}
        selectedPreviewUserId={selectedPreviewUserId}
        selectedGlobalPreviewUserId={selectedGlobalPreviewUserId}
        ignoredByCorporateEmail={ignoredByCorporateEmail}
        ignoredByUserLink={ignoredByUserLink}
        ignoredByNoPending={ignoredByNoPending}
        latestRun={latestWeeklyReportRun}
        sectionsOpen={weeklyReportSectionsOpen}
        onClose={() => setWeeklyReportModalOpen(false)}
        onRefresh={() => void loadWeeklyReportAdmin()}
        onRun={() => void handleRunWeeklyReport()}
        onSave={() => void handleSaveWeeklyReportSettings()}
        onGeneratePreview={() => void handleGenerateWeeklyReportPreview()}
        onGenerateGlobalPreview={() => void handleGenerateGlobalWeeklyReportPreview()}
        onPreviewUserChange={setSelectedPreviewUserId}
        onGlobalPreviewUserChange={setSelectedGlobalPreviewUserId}
        onSettingsChange={setWeeklyReportSettings}
        onToggleSection={toggleWeeklyReportSection}
        users={users}
      />
    </main>
  );
}

function ExecutiveMetricCard({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  helper: string;
  tone: 'neutral' | 'warning' | 'danger' | 'info' | 'success';
  icon: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    neutral: 'border-slate-200 bg-white text-slate-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    info: 'border-blue-200 bg-blue-50 text-[#17407E]',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
          <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
          <p className="mt-2 text-xs opacity-80">{helper}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 ring-1 ring-black/5">{icon}</div>
      </div>
    </div>
  );
}

function WeeklyReportAdminModal({
  open,
  canEdit,
  loading,
  saving,
  running,
  previewLoading,
  settings,
  eligibility,
  runs,
  preview,
  globalPreview,
  previewUserOptions,
  globalPreviewUserOptions,
  selectedPreviewUserId,
  selectedGlobalPreviewUserId,
  ignoredByCorporateEmail,
  ignoredByUserLink,
  ignoredByNoPending,
  latestRun,
  sectionsOpen,
  onClose,
  onRefresh,
  onRun,
  onSave,
  onGeneratePreview,
  onGenerateGlobalPreview,
  onPreviewUserChange,
  onGlobalPreviewUserChange,
  onSettingsChange,
  onToggleSection,
  users,
}: {
  open: boolean;
  canEdit: boolean;
  loading: boolean;
  saving: boolean;
  running: boolean;
  previewLoading: boolean;
  settings: WeeklyReportSettingsState;
  eligibility: WeeklyReportEligibilityState | null;
  runs: WeeklyReportRunItem[];
  preview: TaskWeeklyReportEmailPayload | null;
  globalPreview: TaskGlobalWeeklyReportEmailPayload | null;
  previewUserOptions: Array<{ value: string; label: string }>;
  globalPreviewUserOptions: Array<{ value: string; label: string }>;
  selectedPreviewUserId: string;
  selectedGlobalPreviewUserId: string;
  ignoredByCorporateEmail: WeeklyReportEligibilityState['skippedRecipients'];
  ignoredByUserLink: WeeklyReportEligibilityState['skippedRecipients'];
  ignoredByNoPending: WeeklyReportEligibilityState['skippedRecipients'];
  latestRun: WeeklyReportRunItem | null;
  sectionsOpen: {
    configuration: boolean;
    preview: boolean;
    globalPreview: boolean;
    history: boolean;
    ignored: boolean;
  };
  onClose: () => void;
  onRefresh: () => void;
  onRun: () => void;
  onSave: () => void;
  onGeneratePreview: () => void;
  onGenerateGlobalPreview: () => void;
  onPreviewUserChange: (value: string) => void;
  onGlobalPreviewUserChange: (value: string) => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<WeeklyReportSettingsState>>;
  onToggleSection: (section: 'configuration' | 'preview' | 'globalPreview' | 'history' | 'ignored') => void;
  users: UserOption[];
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const statusLabel = settings.enabled ? 'Ativo' : 'Desativado';
  const ignoredCount = ignoredByCorporateEmail.length + ignoredByUserLink.length;
  const moduleStatusLabel =
    settings.enabled && settings.globalReportEnabled
      ? 'Individual + global ativos'
      : settings.enabled
        ? 'Individual ativo'
        : settings.globalReportEnabled
          ? 'Global ativo'
          : 'Desativado';
  const globalRecipientOptions = users.map((user) => ({
    value: user.id,
    label: `${user.name} · ${user.department || user.email || 'Sem setor'}`,
  }));
  const globalReadyCount = eligibility?.globalRecipients.readyRecipients.length || 0;
  const globalSkippedCount = eligibility?.globalRecipients.skippedRecipients.length || 0;
  const latestRunLabel = latestRun ? `${latestRun.status} · ${formatDateTime(latestRun.createdAt)}` : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-report-admin-title"
        className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Administração de e-mail</div>
            <h3 id="weekly-report-admin-title" className="mt-1 text-lg font-bold text-slate-900">
              Report semanal de tarefas
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Camada gerencial para configuração, homologação e auditoria do disparo automático, sem poluir a governança principal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#17407E]">
                <Loader2 size={14} className="animate-spin" />
                Atualizando
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Activity size={16} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Fechar modal do report semanal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <CompactInfoCard
              label="Status"
              value={moduleStatusLabel}
              helper={
                settings.enabled || settings.globalReportEnabled
                  ? 'Pronto para processar quando as credenciais do SendPulse estiverem válidas.'
                  : 'Fluxo pausado na camada administrativa.'
              }
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Elegíveis</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/80 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Individual</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{eligibility?.eligibleRecipients.length || 0}</div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Global</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{globalReadyCount}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Base pronta para o lote individual e para os destinatários executivos.</div>
            </div>
            <CompactInfoCard
              label="Ignorados por cadastro"
              value={ignoredCount}
              helper="Sem vínculo ou sem e-mail corporativo"
            />
            <CompactInfoCard
              label="Último envio"
              value={latestRunLabel}
              helper={latestRun ? `${latestRun.sentCount} envio(s) · ${latestRun.failedCount} falha(s)` : 'Nenhum lote registrado'}
            />
            <CompactInfoCard label="Próximo disparo" value="Seg 06h30" helper="Execução automática semanal" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit || running}
              onClick={onRun}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#17407E] disabled:opacity-60"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Disparo manual
            </button>
            <button
              type="button"
              disabled={selectedPreviewUserId === 'all' || previewLoading}
              onClick={onGeneratePreview}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              Gerar prévia
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <CollapsibleAdminSection
              title="Configuração operacional"
              description="Remetente, resposta e ativação do fluxo."
              open={sectionsOpen.configuration}
              onToggle={() => onToggleSection('configuration')}
              icon={<Send size={16} className="text-[#17407E]" />}
            >
              <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatório individual</div>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onSettingsChange((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                    />
                    Ativar envio semanal individual
                  </label>
                  <div className="text-xs text-slate-500">
                    Dispara o resumo operacional apenas para colaboradores com pendências elegíveis sob execução direta.
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relatório global</div>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.globalReportEnabled}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onSettingsChange((current) => ({
                          ...current,
                          globalReportEnabled: event.target.checked,
                        }))
                      }
                    />
                    Ativar resumo executivo global
                  </label>
                  <SearchableMultiSelect
                    label="Destinatários executivos"
                    value={settings.globalRecipientUserIds}
                    onChange={(value) =>
                      onSettingsChange((current) => ({
                        ...current,
                        globalRecipientUserIds: value,
                      }))
                    }
                    options={globalRecipientOptions}
                    placeholder="Selecione CEO, gerente e demais destinatários"
                    helper="Esses usuários recebem o relatório global no mesmo lote semanal. O vínculo final do envio continua sendo resolvido via colaborador + e-mail corporativo."
                  />
                  <div className="text-xs text-slate-500">
                    {globalReadyCount} pronto(s) para envio · {globalSkippedCount} com pendência cadastral no momento.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                <FieldInput
                  label="E-mail remetente"
                  value={settings.fromEmail}
                  disabled={!canEdit || saving}
                  onChange={(value) =>
                    onSettingsChange((current) => ({
                      ...current,
                      fromEmail: value,
                    }))
                  }
                />
                <FieldInput
                  label="Nome do remetente"
                  value={settings.fromName}
                  disabled={!canEdit || saving}
                  onChange={(value) =>
                    onSettingsChange((current) => ({
                      ...current,
                      fromName: value,
                    }))
                  }
                />
                <FieldInput
                  label="E-mail de resposta"
                  value={settings.replyToEmail}
                  disabled={!canEdit || saving}
                  onChange={(value) =>
                    onSettingsChange((current) => ({
                      ...current,
                      replyToEmail: value,
                    }))
                  }
                />
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!canEdit || saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Salvar
                  </button>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                Última atualização: {settings.updatedAt ? formatDateTime(settings.updatedAt) : 'Ainda não configurado'}
              </div>
            </CollapsibleAdminSection>

            <CollapsibleAdminSection
              title="Homologação rápida"
              description="Prévia real para um colaborador elegível."
              open={sectionsOpen.preview}
              onToggle={() => onToggleSection('preview')}
              icon={<Mail size={16} className="text-[#17407E]" />}
            >
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-3">
                  <SearchableFilterSelect
                    label="Colaborador elegível"
                    value={selectedPreviewUserId}
                    onChange={onPreviewUserChange}
                    allLabel={previewUserOptions.length ? 'Selecione um colaborador elegível' : 'Nenhum elegível no momento'}
                    options={previewUserOptions}
                  />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    O disparo manual continua controlado. A prévia serve para homologar o conteúdo antes da ativação real.
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  {preview ? (
                    <div className="space-y-3 text-sm text-slate-700">
                      <div>
                        <div className="font-semibold text-[#17407E]">{preview.recipient.employeeName}</div>
                        <div className="mt-1 text-xs text-slate-500">{preview.recipient.corporateEmail}</div>
                      </div>
                      <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                        <div>Pendências atuais: <span className="font-semibold text-slate-900">{preview.summary.pendingTasks}</span></div>
                        <div>Vencidas: <span className="font-semibold text-slate-900">{preview.summary.overdueTasks}</span></div>
                        <div>A vencer em 7 dias: <span className="font-semibold text-slate-900">{preview.summary.dueNext7DaysTasks}</span></div>
                        <div>Aguardando aprovação: <span className="font-semibold text-slate-900">{preview.summary.awaitingApprovalTasks}</span></div>
                        <div>Eficiência acumulada: <span className="font-semibold text-slate-900">{buildEfficiencySummaryLabel(preview.summary.accumulatedEfficiency)}</span></div>
                        <div>Eficiência da semana: <span className="font-semibold text-slate-900">{preview.summary.weeklyEfficiencyPercent == null ? '—' : `${preview.summary.weeklyEfficiencyPercent}%`}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tarefas destacadas</div>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {preview.highlightedTasks.slice(0, 4).map((task) => (
                            <div key={task.taskId} className="rounded-xl border border-white/80 bg-white px-3 py-2">
                              <div className="text-xs font-semibold text-[#17407E]">{task.protocolId}</div>
                              <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                      Gere uma prévia manual para validar o conteúdo do e-mail antes da ativação.
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleAdminSection>

            <CollapsibleAdminSection
              title="Prévia executiva global"
              description="Homologação do conteúdo consolidado para CEO e gerência."
              open={sectionsOpen.globalPreview}
              onToggle={() => onToggleSection('globalPreview')}
              icon={<Gauge size={16} className="text-[#17407E]" />}
            >
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-3">
                  <SearchableFilterSelect
                    label="Destinatário configurado"
                    value={selectedGlobalPreviewUserId}
                    onChange={onGlobalPreviewUserChange}
                    allLabel={globalPreviewUserOptions.length ? 'Selecione um destinatário do global' : 'Nenhum destinatário apto no momento'}
                    options={globalPreviewUserOptions}
                  />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    A prévia global usa o mesmo recorte semanal do disparo automático e mostra a leitura executiva consolidada da empresa.
                  </div>
                  <button
                    type="button"
                    disabled={selectedGlobalPreviewUserId === 'all' || previewLoading}
                    onClick={onGenerateGlobalPreview}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                    Gerar prévia global
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  {globalPreview ? (
                    <div className="space-y-3 text-sm text-slate-700">
                      <div>
                        <div className="font-semibold text-[#17407E]">{globalPreview.recipient.employeeName}</div>
                        <div className="mt-1 text-xs text-slate-500">{globalPreview.recipient.corporateEmail}</div>
                      </div>
                      <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                        <div>Base operacional: <span className="font-semibold text-slate-900">{globalPreview.summary.operationalTasks}</span></div>
                        <div>Pendências: <span className="font-semibold text-slate-900">{globalPreview.summary.pendingTasks}</span></div>
                        <div>Concluídas na semana: <span className="font-semibold text-slate-900">{globalPreview.summary.completedThisWeek}</span></div>
                        <div>Vencidas: <span className="font-semibold text-slate-900">{globalPreview.summary.overdueTasks}</span></div>
                        <div>Aguardando aprovação: <span className="font-semibold text-slate-900">{globalPreview.summary.awaitingApprovalTasks}</span></div>
                        <div>Eficiência global: <span className="font-semibold text-slate-900">{buildEfficiencySummaryLabel(globalPreview.summary.efficiency)}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Destaques</div>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {globalPreview.highlightedOverdueTasks.slice(0, 2).map((task) => (
                            <div key={task.taskId} className="rounded-xl border border-white/80 bg-white px-3 py-2">
                              <div className="text-xs font-semibold text-[#17407E]">{task.protocolId}</div>
                              <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                            </div>
                          ))}
                          {globalPreview.highlightedOverdueTasks.length <= 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
                              Nenhuma tarefa vencida crítica destacada nesta prévia.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                      Gere uma prévia executiva para validar o conteúdo global antes do disparo.
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleAdminSection>

            <CollapsibleAdminSection
              title="Histórico de envios"
              description="Últimos jobs do report para auditoria rápida."
              open={sectionsOpen.history}
              onToggle={() => onToggleSection('history')}
              icon={<Activity size={16} className="text-[#17407E]" />}
            >
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {runs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Nenhum run registrado até o momento.
                  </div>
                ) : (
                  runs.map((run) => (
                    <div key={run.id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">Job semanal {formatDate(run.windowStartDate)} a {formatDate(run.windowEndDate)}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {run.triggerSource === 'manual' ? 'Disparo manual' : 'Disparo automático'} · tentativa {run.attemptNumber} · {formatDateTime(run.createdAt)}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          run.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : run.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                        <div>Elegíveis: <span className="font-semibold text-slate-900">{run.eligibleCount}</span></div>
                        <div>Enviados: <span className="font-semibold text-slate-900">{run.sentCount}</span></div>
                        <div>Ignorados: <span className="font-semibold text-slate-900">{run.skippedCount}</span></div>
                        <div>Falhas: <span className="font-semibold text-slate-900">{run.failedCount}</span></div>
                      </div>
                      {run.errorMessage ? <div className="mt-2 text-xs text-rose-600">{run.errorMessage}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </CollapsibleAdminSection>

            <CollapsibleAdminSection
              title="Pendências cadastrais"
              description="Quem ficou de fora e por quê."
              open={sectionsOpen.ignored}
              onToggle={() => onToggleSection('ignored')}
              icon={<AlertCircle size={16} className="text-[#17407E]" />}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <CompactInfoCard label="Sem e-mail corporativo" value={ignoredByCorporateEmail.length} helper="Cadastro do colaborador incompleto" />
                <CompactInfoCard label="Sem vínculo usuário-colaborador" value={ignoredByUserLink.length} helper="Resolver employee_id do usuário" />
                <CompactInfoCard label="Sem pendências elegíveis" value={ignoredByNoPending.length} helper="Fora do recorte operacional" />
              </div>
              {eligibility?.globalRecipients.skippedRecipients.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                  Relatório global: {eligibility.globalRecipients.skippedRecipients.length} destinatário(s) executivo(s) selecionado(s) ainda têm pendência cadastral.
                </div>
              ) : null}
              <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {(eligibility?.skippedRecipients || []).slice(0, 8).map((item, index) => (
                  <div key={`${item.employeeId || item.userId || 'skip'}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                    <div className="font-semibold text-slate-900">{item.employeeName || item.userId || 'Registro sem identificação'}</div>
                    <div className="mt-1 text-xs text-slate-500">{weeklyReportSkipReasonLabelMap[item.reason]}</div>
                  </div>
                ))}
                {!eligibility?.skippedRecipients.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Nenhum colaborador ignorado no recorte atual.
                  </div>
                ) : null}
              </div>
            </CollapsibleAdminSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactInfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function CollapsibleAdminSection({
  title,
  description,
  open,
  onToggle,
  icon,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5">{icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            <span className="mt-1 block text-xs text-slate-500">{description}</span>
          </span>
        </span>
        <span className="shrink-0 text-slate-400">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
      </button>
      {open ? <div className="border-t border-slate-200 px-4 py-4">{children}</div> : null}
    </section>
  );
}

function ExecutiveProjectDetailModal({
  project,
  saving,
  loading,
  users,
  usersById,
  memberUserId,
  onMemberUserIdChange,
  form,
  onFormChange,
  onClose,
  onSave,
  onChangeStatus,
  onAddMember,
  onRemoveMember,
  onMoveTask,
  onOpenTask,
  onRemoveDependency,
  canEdit,
}: {
  project: TaskProjectDetail | null;
  saving: boolean;
  loading: boolean;
  users: UserOption[];
  usersById: Map<string, UserOption>;
  memberUserId: string;
  onMemberUserIdChange: (value: string) => void;
  form: { name: string; description: string };
  onFormChange: (value: { name: string; description: string }) => void;
  onClose: () => void;
  onSave: () => void;
  onChangeStatus: (status: TaskProjectStatus) => void;
  onAddMember: () => void;
  onRemoveMember: (memberId: string) => void;
  onMoveTask: (taskId: string, direction: 'up' | 'down') => void;
  onOpenTask: (taskId: string) => void;
  onRemoveDependency: (dependencyId: string) => void;
  canEdit: boolean;
}) {
  const orderedTasks = useMemo(() => sortProjectTasks(project?.tasks || []), [project?.tasks]);
  const isConcluded = project?.status === 'CONCLUIDO';
  const isArchived = project?.status === 'ARQUIVADO';
  const memberOptions = useMemo(
    () => users.filter((user) => !project?.members.some((member) => member.userId === user.id)),
    [project?.members, users]
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#17407E]">Projeto</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{project?.name || 'Detalhes do projeto'}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Acompanhe membros, dependências e a ordem do cronograma em uma visão única da governança.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <X size={18} />
            </button>
          </div>
          {project ? (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <QuickMetaCard label="Membros" value={String(project.members.length)} />
              <QuickMetaCard label="Tarefas" value={String(project.tasks.length)} />
              <QuickMetaCard label="Agendadas" value={String(project.scheduledTaskCount)} />
              <QuickMetaCard label="Dependências" value={String(project.dependencies.length)} />
            </div>
          ) : null}
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto p-6">
            {loading && !project ? (
              <div className="flex min-h-[240px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Carregando projeto...
              </div>
            ) : project ? (
              <div className="space-y-5">
                {!canEdit ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-[#17407E]">
                    Este projeto está em modo leitura para o seu perfil atual de governança.
                  </div>
                ) : null}
                <TaskSectionCard
                  title="Metadados do projeto"
                  description="Edite o nome e a descrição do projeto sem sair da governança."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldInput label="Nome do projeto" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} disabled={!canEdit} />
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado</div>
                      <div className="mt-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${projectStatusToneMap[project.status]}`}>
                          {projectStatusLabelMap[project.status]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                    <textarea
                      value={form.description}
                      onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                      disabled={!canEdit}
                      className={`${inputClassName} min-h-[120px] resize-y disabled:bg-slate-50`}
                    />
                  </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Membros"
                  description="Todos os membros visualizam as tarefas do projeto, mesmo sem atribuição individual."
                >
                  {canEdit ? (
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="min-w-0 flex-1">
                        <SearchableOptionSelect
                          label="Adicionar membro"
                          value={memberUserId}
                          onChange={onMemberUserIdChange}
                          allLabel="Nenhum colaborador elegível encontrado"
                          options={memberOptions.map((user) => ({
                            value: user.id,
                            label: `${user.name} · ${user.department || user.email}`,
                          }))}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={onAddMember}
                        disabled={saving || !memberUserId}
                        className="inline-flex items-center justify-center rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
                      >
                        Adicionar membro
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {project.members.map((member) => {
                      const user = usersById.get(member.userId);
                      const isOwner = member.roleType === 'OWNER';
                      return (
                        <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{user?.name || member.userId}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>{user?.department || user?.email || 'Sem setor'}</span>
                              <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{isOwner ? 'Criador' : 'Membro'}</span>
                            </div>
                          </div>
                          {canEdit && !isOwner ? (
                            <button
                              type="button"
                              onClick={() => onRemoveMember(member.id)}
                              disabled={saving}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Remover
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Ordem do cronograma"
                  description="Reordene as tarefas para refletir a sequência executiva do projeto."
                >
                  <div className="space-y-2">
                    {orderedTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        Nenhuma tarefa vinculada a este projeto.
                      </div>
                    ) : (
                      orderedTasks.map((task, index) => (
                        <div key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                          <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</div>
                            <div className="mt-1 truncate text-sm font-semibold text-slate-900">{task.title}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>{statusLabelMap[task.status]}</span>
                              <span>{task.startDate ? formatDate(task.startDate) : 'Sem início'}</span>
                              <span>{task.dueDate ? formatDate(task.dueDate) : 'Sem prazo'}</span>
                            </div>
                          </button>
                          {canEdit ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => onMoveTask(task.id, 'up')}
                                disabled={saving || index === 0}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Subir
                              </button>
                              <button
                                type="button"
                                onClick={() => onMoveTask(task.id, 'down')}
                                disabled={saving || index === orderedTasks.length - 1}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Descer
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </TaskSectionCard>
              </div>
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-6">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Dependências</h3>
                <div className="mt-4 space-y-2">
                  {!project?.dependencies.length ? (
                    <p className="text-sm text-slate-500">Nenhuma dependência cadastrada.</p>
                  ) : (
                    project.dependencies.map((dependency) => {
                      const predecessor = project.tasks.find((task) => task.id === dependency.predecessorTaskId);
                      const successor = project.tasks.find((task) => task.id === dependency.successorTaskId);
                      return (
                        <div key={dependency.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fim para início</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {predecessor?.protocolId || dependency.predecessorTaskId} → {successor?.protocolId || dependency.successorTaskId}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {(predecessor?.title || 'Predecessora')} antecede {(successor?.title || 'Sucessora')}.
                          </div>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => onRemoveDependency(dependency.id)}
                              disabled={saving}
                              className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
                            >
                              Remover dependência
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {canEdit ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Governança</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {isArchived
                      ? 'Projeto arquivado: preservado apenas para histórico e fora da visão operacional padrão.'
                      : isConcluded
                        ? 'Projeto concluído: encerrado com sucesso e ainda disponível para consulta.'
                        : 'Projeto ativo e disponível no cronograma.'}
                  </p>
                  <div className="mt-4 space-y-2">
                    {!isConcluded && !isArchived ? (
                      <button
                        type="button"
                        onClick={() => onChangeStatus('CONCLUIDO')}
                        disabled={saving || !project}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Concluir projeto
                      </button>
                    ) : null}
                    {isConcluded ? (
                      <button
                        type="button"
                        onClick={() => onChangeStatus('ATIVO')}
                        disabled={saving || !project}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reabrir projeto
                      </button>
                    ) : null}
                    {isArchived ? (
                      <button
                        type="button"
                        onClick={() => onChangeStatus('ATIVO')}
                        disabled={saving || !project}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reativar projeto
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onChangeStatus('ARQUIVADO')}
                        disabled={saving || !project}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Arquivar projeto
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Columns3 size={16} />}
              Salvar projeto
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExecutiveProjectGanttBoard({
  project,
  portfolio,
  selectedProjectName,
  onOpenTask,
  canEdit,
  onOpenProject,
  onOpenUnscheduledList,
}: {
  project: TaskProjectDetail | null;
  portfolio: TaskPortfolioGantt | null;
  selectedProjectName: string | null;
  onOpenTask: (taskId: string) => void;
  canEdit: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenUnscheduledList: () => void;
}) {
  const sections = project
    ? [{ project, tasks: project.tasks, dependencies: project.dependencies } satisfies TaskPortfolioGanttSection]
    : portfolio?.sections || [];
  const unscheduledCount = !project ? portfolio?.unscheduledStandaloneTasks.length || 0 : 0;

  if (!sections.length && !unscheduledCount) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        Nenhum cronograma disponível para este recorte.
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto pr-1 overscroll-contain">
      {!project && portfolio ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <a
              href="/api/admin/tasks/portfolio-gantt/export.xlsx"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Exportar visão Todos em XLSX
            </a>
            <a
              href="/api/admin/tasks/portfolio-gantt/export.pdf"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Exportar visão Todos em PDF
            </a>
          </div>
          {unscheduledCount ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="font-semibold">{unscheduledCount} tarefa(s)</span> estão fora do cronograma por não terem início e prazo definidos.
              </div>
              <button
                type="button"
                onClick={onOpenUnscheduledList}
                className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Ver na lista
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {!sections.length && unscheduledCount ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          Não há tarefas com datas válidas para montar a timeline neste recorte.
        </div>
      ) : null}
      {sections.map((section) => {
        const scheduledTasks = section.tasks.filter((task) => task.startDate && task.dueDate && !isRetiredTaskStatus(task.status));
        const sectionTitle = section.project?.name || 'Tarefas avulsas';

        if (section.project && scheduledTasks.length < 2) {
          return (
            <div key={section.project.id} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10">
              <div className="text-lg font-semibold text-slate-900">{sectionTitle}</div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Este projeto ainda não tem massa crítica para Gantt. São necessárias pelo menos duas tarefas com início e prazo definidos.
              </p>
            </div>
          );
        }

        return (
          <div key={section.project?.id || 'standalone'} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{sectionTitle}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {section.project
                    ? `${section.tasks.length} tarefa(s), ${scheduledTasks.length} agendada(s) e ${section.dependencies.length} dependência(s) mapeadas.`
                    : 'Portfólio consolidado das tarefas avulsas visíveis na governança.'}
                </p>
              </div>
              {section.project ? (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => onOpenProject(section.project!.id)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Detalhes do projeto
                  </button>
                  <a
                    href={`/api/admin/task-projects/${encodeURIComponent(section.project.id)}/export.xlsx`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Exportar XLSX
                  </a>
                  <a
                    href={`/api/admin/task-projects/${encodeURIComponent(section.project.id)}/export.pdf`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Exportar PDF
                  </a>
                  <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
                    {canEdit ? 'Cronograma editável pela governança.' : 'Cronograma em modo leitura.'}
                  </span>
                </div>
              ) : null}
            </div>
            <ExecutiveGanttTimeline
              rows={scheduledTasks}
              dependencies={section.dependencies}
              onOpenTask={onOpenTask}
              projectName={selectedProjectName || sectionTitle}
            />
          </div>
        );
      })}
    </div>
  );
}

function ExecutiveGanttTimeline({
  rows,
  dependencies,
  onOpenTask,
  projectName,
}: {
  rows: TaskSummary[];
  dependencies: TaskDependency[];
  onOpenTask: (taskId: string) => void;
  projectName: string;
}) {
  const [previewState, setPreviewState] = useState<{
    row: TaskGanttPresentationRow;
    anchorElement: HTMLDivElement;
    position: { top: number; left: number };
  } | null>(null);
  const previewCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentation = useMemo(
    () =>
      buildTaskGanttPresentation(rows, dependencies, {
        compareTasks,
        locale: 'pt-BR',
        keyPrefix: projectName,
      }),
    [dependencies, projectName, rows]
  );

  const clearPreviewCloseTimeout = () => {
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current);
      previewCloseTimeoutRef.current = null;
    }
  };

  const schedulePreviewClose = () => {
    clearPreviewCloseTimeout();
    previewCloseTimeoutRef.current = setTimeout(() => {
      setPreviewState(null);
    }, 120);
  };

  const resolvePreviewPosition = (anchorElement: HTMLDivElement) => {
    const rect = anchorElement.getBoundingClientRect();
    const previewWidth = 360;
    const previewHeight = 214;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const top = rect.bottom + previewHeight + 12 <= viewportHeight
      ? rect.bottom + 10
      : Math.max(rect.top - previewHeight - 10, 16);
    const left = Math.min(Math.max(rect.left, 16), viewportWidth - previewWidth - 16);
    return { top, left };
  };

  const openPreview = (row: TaskGanttPresentationRow, anchorElement: HTMLDivElement) => {
    clearPreviewCloseTimeout();
    setPreviewState({
      row,
      anchorElement,
      position: resolvePreviewPosition(anchorElement),
    });
  };

  useEffect(() => {
    if (!previewState) return undefined;

    const updatePosition = () => {
      setPreviewState((current) => {
        if (!current) return current;
        return {
          ...current,
          position: resolvePreviewPosition(current.anchorElement),
        };
      });
    };

    const handleWindowChange = () => {
      clearPreviewCloseTimeout();
      updatePosition();
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [previewState]);

  useEffect(
    () => () => {
      clearPreviewCloseTimeout();
    },
    []
  );

  if (!presentation) {
    return <div className="px-5 py-10 text-sm text-slate-500">Nenhuma tarefa agendada neste recorte.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px]">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Período do cronograma</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatDate(presentation.timelineStart.toISOString().slice(0, 10))} até {formatDate(
                  presentation.timelineEnd.toISOString().slice(0, 10)
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {presentation.totalDays} dia(s) corridos neste recorte, com densidade preparada para cronogramas extensos.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600">Backlog/A fazer</span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700">Em andamento</span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-semibold text-violet-700">Aguardando aprovação</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Concluída</span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700">Atrasada</span>
              <span className="rounded-full border border-rose-200 bg-white px-2 py-1 font-semibold text-rose-700">Conflito</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[264px_minmax(0,1fr)] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tarefa</div>
          <div className="space-y-1.5">
            <div className="relative h-3.5">
              {presentation.monthTicks.map((tick) => (
                <span
                  key={tick.key}
                  className="absolute text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400"
                  style={{ left: `${(tick.offset / presentation.totalDays) * 100}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="relative h-5">
              {presentation.hasTodayMarker ? (
                <span
                  className="absolute inset-y-0 z-[1] w-px bg-rose-300"
                  style={{ left: `${(presentation.todayOffset / presentation.totalDays) * 100}%` }}
                />
              ) : null}
              {presentation.ticks.map((tick) => (
                <span
                  key={tick.key}
                  className="absolute -translate-x-1/2 text-[10px] font-semibold text-slate-500"
                  style={{ left: `${(tick.offset / presentation.totalDays) * 100}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div aria-hidden="true" className="absolute bottom-0 right-4 top-0" style={{ left: 'calc(16px + 264px)' }}>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(226,232,240,0.78)_1px,transparent_1px)] bg-[length:18px_100%] bg-left" />
            {presentation.hasTodayMarker ? (
              <span
                className="absolute bottom-0 top-0 z-[1] w-px bg-rose-300"
                style={{ left: `${(presentation.todayOffset / presentation.totalDays) * 100}%` }}
              />
            ) : null}
          </div>
          <div className="divide-y divide-slate-100/70">
          {presentation.rows.map((row, index) => {
            const task = row.task;
            const left = (row.startOffsetDays / presentation.totalDays) * 100;
            const width = Math.max((row.spanDays / presentation.totalDays) * 100, 2.3);
            const compactDescription = buildGanttCompactDescription(task);
            const barTone =
              task.status === 'CONCLUIDA'
                ? 'bg-emerald-500'
                : task.status === 'AGUARDANDO_APROVACAO'
                  ? 'bg-violet-500'
                  : task.status === 'EM_ANDAMENTO'
                    ? 'bg-blue-600'
                    : task.status === 'PAUSADO'
                      ? 'bg-orange-500'
                    : isOverdue(task.dueDate, task.status)
                      ? 'bg-rose-500'
                      : task.status === 'A_FAZER'
                        ? 'bg-amber-500'
                        : 'bg-slate-500';
            const orderLabel = `#${task.projectSortOrder ?? index + 1}`;

            return (
              <div
                key={task.id}
                className="grid grid-cols-[264px_minmax(0,1fr)] gap-0 px-4"
                onMouseEnter={(event) => openPreview(row, event.currentTarget as HTMLDivElement)}
                onMouseLeave={schedulePreviewClose}
              >
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="min-w-0 border-r border-slate-100/80 px-2 py-1.5 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#17407E]">{task.protocolId}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      {orderLabel}
                    </span>
                    {row.hasScheduleConflict ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        Conflito
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold leading-4 text-slate-900">{task.title}</div>
                  <div className="truncate text-[11px] leading-4 text-slate-500">{compactDescription}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="relative h-[42px] bg-transparent text-left focus-visible:outline-none"
                >
                  {row.predecessorProtocols.length ? (
                    <div
                      className={`absolute top-1/2 h-px -translate-y-1/2 border-t border-dashed ${row.hasScheduleConflict ? 'border-rose-300' : 'border-slate-300'}`}
                      style={{ left: 0, width: `${left}%` }}
                    />
                  ) : null}
                  {row.predecessorProtocols.length ? (
                    <span
                      className={`absolute top-1/2 z-[2] h-2 w-2 -translate-y-1/2 rounded-full bg-white ${
                        row.hasScheduleConflict ? 'border border-rose-300' : 'border border-slate-300'
                      }`}
                      style={{ left: `calc(${left}% - 4px)` }}
                    />
                  ) : null}
                  <div
                    className={`absolute top-1/2 z-[2] flex h-[14px] -translate-y-1/2 items-center rounded-[3px] px-1.5 text-[10px] font-semibold text-white shadow-sm ${barTone} ${
                      row.hasScheduleConflict ? 'ring-2 ring-rose-100' : ''
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={row.scheduleConflictReason || `${formatDate(task.startDate)} até ${formatDate(task.dueDate)}`}
                  >
                    <div className="truncate">{formatDate(task.startDate)} - {formatDate(task.dueDate)}</div>
                  </div>
                  {task.checklistTotalItems > 0 ? (
                    <div
                      className="absolute top-[24px] z-[2] h-[2px] rounded-full bg-emerald-400/95"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max((width * task.checklistProgressPercent) / 100, task.checklistProgressPercent ? 0.6 : 0)}%`,
                      }}
                    />
                  ) : null}
                  {row.hasScheduleConflict ? (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-rose-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      conflito
                    </div>
                  ) : null}
                </button>
              </div>
            );
          })}
          </div>
        </div>
      </div>
      {previewState
        ? createPortal(
            <div
              className="fixed z-[90] w-[360px] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xl"
              style={{ top: previewState.position.top, left: previewState.position.left }}
              onMouseEnter={clearPreviewCloseTimeout}
              onMouseLeave={schedulePreviewClose}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#17407E]">
                    {previewState.row.task.protocolId}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{previewState.row.task.title}</div>
                </div>
                {previewState.row.hasScheduleConflict ? (
                  <AlertCircle className="mt-0.5 text-rose-500" size={16} />
                ) : (
                  <CheckCircle2 className="mt-0.5 text-emerald-500" size={16} />
                )}
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                <div><span className="font-semibold text-slate-700">Descrição:</span> {buildGanttCompactDescription(previewState.row.task)}</div>
                <div><span className="font-semibold text-slate-700">Janela:</span> {formatDate(previewState.row.task.startDate)} até {formatDate(previewState.row.task.dueDate)}</div>
                <div><span className="font-semibold text-slate-700">Status:</span> {statusLabelMap[previewState.row.task.status]}</div>
                <div><span className="font-semibold text-slate-700">Setor:</span> {previewState.row.task.department || 'Sem setor'}</div>
                <div><span className="font-semibold text-slate-700">Projeto:</span> {previewState.row.task.projectName || 'Tarefa avulsa'}</div>
                <div>
                  <span className="font-semibold text-slate-700">Checklist:</span>{' '}
                  {previewState.row.task.checklistTotalItems > 0
                    ? `${previewState.row.task.checklistCompletedItems}/${previewState.row.task.checklistTotalItems} concluído(s)`
                    : 'Sem checklist'}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Predecessoras:</span>{' '}
                  {previewState.row.predecessorProtocols.length ? previewState.row.predecessorProtocols.join(', ') : 'Nenhuma'}
                </div>
                {previewState.row.scheduleConflictReason ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                    {previewState.row.scheduleConflictReason}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SearchableFilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const selectedOption = options.find((option) => option.value === value) || null;
  const visibleOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const normalized = normalizeText(searchTerm);
    return options.filter((option) => normalizeText(option.label).includes(normalized));
  }, [options, searchTerm]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="sr-only">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSearchTerm('');
        }}
        className={`${inputClassName} flex items-center justify-between gap-3 text-left`}
      >
        <span className="truncate">{selectedOption?.label || allLabel}</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                minWidth: dropdownStyle.minWidth,
              }}
            >
              <div className="border-b border-slate-200 p-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className={`${inputClassName} pl-9`}
                  />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange('all');
                    setOpen(false);
                    setSearchTerm('');
                  }}
                  className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    value === 'all' ? 'bg-blue-50 font-semibold text-[#17407E]' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {allLabel}
                </button>
                {visibleOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum usuário encontrado.</div>
                ) : (
                  visibleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setSearchTerm('');
                      }}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        value === option.value ? 'bg-blue-50 font-semibold text-[#17407E]' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SearchableMultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  helper,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  helper: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const selectedOptions = useMemo(
    () => value.map((selectedValue) => options.find((option) => option.value === selectedValue)).filter(Boolean) as Array<{ value: string; label: string }>,
    [options, value]
  );
  const visibleOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const normalized = normalizeText(searchTerm);
    return options.filter((option) => normalizeText(option.label).includes(normalized));
  }, [options, searchTerm]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: rect.width,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleValue = (selectedValue: string) => {
    if (value.includes(selectedValue)) {
      onChange(value.filter((item) => item !== selectedValue));
      return;
    }
    onChange([...value, selectedValue]);
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSearchTerm('');
        }}
        className={`${inputClassName} flex min-h-[44px] items-center justify-between gap-3 text-left`}
      >
        <span className={`truncate ${selectedOptions.length ? 'text-slate-700' : 'text-slate-400'}`}>
          {selectedOptions.length <= 0
            ? placeholder
            : selectedOptions.length <= 2
              ? selectedOptions.map((option) => option.label).join(', ')
              : `${selectedOptions.length} destinatários selecionados`}
        </span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleValue(option.value)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              <span className="truncate">{option.label}</span>
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="text-xs text-slate-500">{helper}</div>

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ top: dropdownStyle.top, left: dropdownStyle.left, minWidth: dropdownStyle.minWidth }}
            >
              <div className="border-b border-slate-200 p-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className={`${inputClassName} pl-9`}
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {visibleOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum usuário encontrado.</div>
                ) : (
                  visibleOptions.map((option) => {
                    const checked = value.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleValue(option.value)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                          checked ? 'bg-blue-50 font-semibold text-[#17407E]' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                            checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          <Check size={12} />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SearchableOptionSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const selectedOption = options.find((option) => option.value === value) || null;
  const visibleOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const normalized = normalizeText(searchTerm);
    return options.filter((option) => normalizeText(option.label).includes(normalized));
  }, [options, searchTerm]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSearchTerm('');
        }}
        className={`${inputClassName} flex items-center justify-between gap-3 text-left`}
      >
        <span className="truncate">{selectedOption?.label || allLabel}</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ top: dropdownStyle.top, left: dropdownStyle.left, minWidth: dropdownStyle.minWidth }}
            >
              <div className="border-b border-slate-200 p-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className={`${inputClassName} pl-9`}
                  />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto p-2">
                {visibleOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">{allLabel}</div>
                ) : (
                  visibleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setSearchTerm('');
                      }}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        value === option.value ? 'bg-blue-50 font-semibold text-[#17407E]' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TaskDetailPanel({
  task,
  users,
  departments,
  projectOptions,
  usersById,
  canEdit,
  loading,
  saving,
  form,
  onFormChange,
  onClose,
  onSave,
  lifecycleReason,
  onLifecycleReasonChange,
  projectLabel,
  projectContext,
  dependencyOptions,
  currentDependencies,
  onArchive,
  onCancelTask,
  onRestore,
  onDependencyCreate,
  onDependencyDelete,
  onChecklistCreate,
  onChecklistUpdate,
  onChecklistDelete,
}: {
  task: TaskDetail;
  users: UserOption[];
  departments: string[];
  projectOptions: Array<{ value: string; label: string }>;
  usersById: Map<string, UserOption>;
  canEdit: boolean;
  loading: boolean;
  saving: boolean;
  form: TaskFormState;
  onFormChange: (value: TaskFormState) => void;
  onClose: () => void;
  onSave: () => void;
  lifecycleReason: string;
  onLifecycleReasonChange: (value: string) => void;
  projectLabel: string;
  projectContext: TaskProjectDetail | null;
  dependencyOptions: Array<{ value: string; label: string; hasSchedule: boolean }>;
  currentDependencies: Array<{ id: string; label: string }>;
  onArchive: () => void;
  onCancelTask: () => void;
  onRestore: () => void;
  onDependencyCreate: (predecessorTaskId: string) => void;
  onDependencyDelete: (dependencyId: string) => void;
  onChecklistCreate: (title: string) => void;
  onChecklistUpdate: (itemId: string, input: { title?: string; isCompleted?: boolean }) => void;
  onChecklistDelete: (itemId: string) => void;
}) {
  const taskIsRetired = isRetiredTaskStatus(task.status);
  const requiresProjectSchedule = Boolean(form.projectId);
  const [selectedDependencyId, setSelectedDependencyId] = useState('');
  const orderedComments = [...task.comments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const orderedActivity = [...task.activity].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const approvalStateLabel = task.latestApproval ? approvalLabelMap[task.latestApproval.decisionStatus] : 'Sem ciclo aberto';
  const departmentOptions = buildDepartmentOptions(departments, form.department);
  const hasCurrentTaskSchedule = Boolean(form.startDate && form.dueDate);
  const selectedDependencyOption = dependencyOptions.find((option) => option.value === selectedDependencyId) || null;
  const canCreateDependency = Boolean(canEdit && selectedDependencyId && hasCurrentTaskSchedule && selectedDependencyOption?.hasSchedule);

  useEffect(() => {
    setSelectedDependencyId('');
  }, [task.id]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#17407E]">{task.protocolId}</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{form.title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Visão executiva da tarefa para acompanhar responsáveis, prazos, histórico e governança operacional.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ModalPill label={statusLabelMap[form.status]} tone="status" />
              <ModalPill label={priorityLabelMap[form.priority]} tone="priority" />
              {isOverdue(form.dueDate || null, task.status) ? <ModalPill label="Vencida" tone="danger" /> : null}
              {!isOverdue(form.dueDate || null, task.status) && isDueSoon(form.dueDate || null, task.status) ? <ModalPill label="A vencer" tone="warning" /> : null}
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <QuickMetaCard label="Criador" value={usersById.get(task.createdBy)?.name || 'Usuário'} />
            <QuickMetaCard label="Responsável" value={usersById.get(form.primaryAssigneeUserId)?.name || 'Não definido'} />
            <QuickMetaCard label="Prazo" value={form.dueDate ? formatDate(form.dueDate) : 'Sem prazo'} />
            <QuickMetaCard label="Projeto" value={projectLabel} />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-h-0 overflow-y-auto p-6">
            <div className="space-y-5">
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Atualizando detalhes...
              </div>
            ) : (
              <>
                <TaskSectionCard
                  title="Visão operacional"
                  description="Edite metadados principais e mantenha a governança alinhada com a execução."
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldInput label="Título" required value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} disabled={!canEdit} />
                  <FieldSelect
                    label="Setor"
                    required
                    value={form.department}
                    onChange={(value) => onFormChange({ ...form, department: value })}
                    disabled={!canEdit}
                    options={departmentOptions.map((department) => ({ value: department, label: department }))}
                  />
                  <FieldSelect
                    label="Prioridade"
                    required
                    value={form.priority}
                    onChange={(value) => onFormChange({ ...form, priority: value as TaskPriority })}
                    disabled={!canEdit}
                    options={[
                      { value: 'BAIXA', label: 'Baixa' },
                      { value: 'MEDIA', label: 'Média' },
                      { value: 'ALTA', label: 'Alta' },
                      { value: 'URGENTE', label: 'Urgente' },
                    ]}
                  />
                  <FieldSelect
                    label="Projeto"
                    value={form.projectId}
                    onChange={(value) => onFormChange({ ...form, projectId: value })}
                    disabled={!canEdit}
                    options={[{ value: '', label: 'Tarefa avulsa' }, ...projectOptions]}
                  />
                  <FieldSelect
                    label="Status"
                    required
                    value={form.status}
                    onChange={(value) => onFormChange({ ...form, status: value as TaskStatus })}
                    disabled={!canEdit}
                    options={Object.entries(statusLabelMap)
                      .filter(([value]) => value !== 'ARQUIVADA' && value !== 'CANCELADA')
                      .map(([value, label]) => ({ value, label }))}
                  />
                  <FieldInput label="Prazo" required type="date" value={form.dueDate} onChange={(value) => onFormChange({ ...form, dueDate: value })} disabled={!canEdit} />
                  <FieldInput label="Início" required type="date" value={form.startDate} onChange={(value) => onFormChange({ ...form, startDate: value })} disabled={!canEdit} />
                </div>
                <div className="text-xs text-slate-500">Campos com * são obrigatórios.</div>
                {requiresProjectSchedule ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-[#17407E]">
                    Tarefas de projeto precisam manter início e prazo válidos para compor o Gantt global.
                  </div>
                ) : null}
                </TaskSectionCard>

                <TaskSectionCard
                  title="Checklist"
                  description="Acompanhe subtarefas e progresso da execução sem alterar automaticamente o status principal."
                >
                  <ChecklistSection
                    items={task.checklist}
                    progressPercent={task.checklistProgressPercent}
                    completedItems={task.checklistCompletedItems}
                    totalItems={task.checklistTotalItems}
                    saving={saving}
                    readOnly={!canEdit || taskIsRetired}
                    onCreate={onChecklistCreate}
                    onToggle={(itemId, isCompleted) => onChecklistUpdate(itemId, { isCompleted })}
                    onRename={(itemId, title) => onChecklistUpdate(itemId, { title })}
                    onDelete={onChecklistDelete}
                  />
                </TaskSectionCard>

                <TaskSectionCard
                  title="Descrição"
                  description="Leitura rápida do escopo e do contexto da demanda para acompanhamento gerencial."
                >
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                    disabled={!canEdit}
                    className={`${inputClassName} min-h-[120px] resize-y disabled:bg-slate-50`}
                  />
                </TaskSectionCard>

                {task.linkedEquipmentWorkOrder ? (
                  <TaskSectionCard
                    title="OS vinculada"
                    description="Essa tarefa está amarrada à ordem de serviço do equipamento no painel."
                  >
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#17407E]">
                            OS {task.linkedEquipmentWorkOrder.workOrderId.slice(0, 8)}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {task.linkedEquipmentWorkOrder.equipmentDescription || 'Equipamento vinculado'}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            Identificação: {task.linkedEquipmentWorkOrder.equipmentIdentificationNumber || 'não informada'} · Status da OS: {task.linkedEquipmentWorkOrder.status.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <Link
                          href={task.linkedEquipmentWorkOrder.panelPath}
                          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#17407E] hover:bg-blue-100"
                        >
                          Abrir OS
                          <ExternalLink size={16} />
                        </Link>
                      </div>
                    </div>
                  </TaskSectionCard>
                ) : null}

                <TaskSectionCard
                  title="Projeto e predecessoras"
                  description="Governança estrutural do cronograma para leitura e ajuste executivo."
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-sm font-semibold text-slate-900">Projeto atual</div>
                      <p className="mt-1 text-sm text-slate-600">{projectLabel}</p>
                      {projectContext ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                            {projectContext.members.length} membro(s)
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                            {projectContext.tasks.length} tarefa(s)
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                            {projectContext.dependencies.length} dependência(s)
                          </span>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-500">Tarefa avulsa: sem cronograma de projeto associado.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-sm font-semibold text-slate-900">Predecessoras</div>
                      <p className="mt-1 text-sm text-slate-500">Defina a cadeia de execução para refletir corretamente a sequência do Gantt.</p>
                      {projectContext ? (
                        <div className="mt-4 space-y-3">
                          {canEdit ? (
                            <div className="space-y-3">
                              <SearchableOptionSelect
                                label="Selecionar predecessora"
                                value={selectedDependencyId}
                                onChange={setSelectedDependencyId}
                                allLabel="Nenhuma tarefa elegível encontrada"
                                options={dependencyOptions.map((option) => ({
                                  value: option.value,
                                  label: option.hasSchedule ? option.label : `${option.label} · sem datas`,
                                }))}
                              />
                              {!hasCurrentTaskSchedule ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  Defina início e prazo desta tarefa antes de configurar predecessoras.
                                </div>
                              ) : null}
                              {selectedDependencyOption && !selectedDependencyOption.hasSchedule ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  A tarefa predecessora escolhida ainda não possui início e prazo definidos.
                                </div>
                              ) : null}
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (canCreateDependency) {
                                      onDependencyCreate(selectedDependencyId);
                                      setSelectedDependencyId('');
                                    }
                                  }}
                                  disabled={saving || !canCreateDependency}
                                  className="inline-flex items-center justify-center rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
                                >
                                  Adicionar predecessora
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {currentDependencies.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                              Nenhuma predecessora definida para esta tarefa.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {currentDependencies.map((dependency) => (
                                <div key={dependency.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                                  <span className="min-w-0 truncate text-slate-700">{dependency.label}</span>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() => onDependencyDelete(dependency.id)}
                                      disabled={saving}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      Remover
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                          Vincule a tarefa a um projeto para habilitar predecessoras e cronograma.
                        </div>
                      )}
                    </div>
                  </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Responsáveis e aprovação"
                  description="Consolide responsável principal, colaboradores e aprovador em um mesmo bloco."
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldSelect
                    label="Responsável principal"
                    required
                    value={form.primaryAssigneeUserId}
                    onChange={(value) => onFormChange({ ...form, primaryAssigneeUserId: value })}
                    disabled={!canEdit}
                    options={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.department || user.email}` }))}
                  />
                  <FieldSelect
                    label="Aprovador"
                    value={form.approverUserId}
                    onChange={(value) => onFormChange({ ...form, approverUserId: value })}
                    disabled={!canEdit}
                    options={[{ value: '', label: 'Sem aprovador definido' }, ...users.map((user) => ({ value: user.id, label: `${user.name} · ${user.department || user.email}` }))]}
                  />
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Responsáveis adicionais</label>
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {users.map((user) => (
                        <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={form.assigneeUserIds.includes(user.id)}
                            onChange={() =>
                              onFormChange({
                                ...form,
                                assigneeUserIds: form.assigneeUserIds.includes(user.id)
                                  ? form.assigneeUserIds.filter((id) => id !== user.id)
                                  : [...form.assigneeUserIds, user.id],
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-[#17407E]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
                            <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Comentários"
                  description="Linha do tempo conversacional da intranet para leitura executiva do contexto."
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{task.comments.length}</span>
                  </div>
                  <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {orderedComments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum comentário registrado.
                      </div>
                    ) : (
                      orderedComments.map((comment) => (
                        <article key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{usersById.get(comment.authorUserId)?.name || 'Usuário'}</div>
                              <div className="mt-1 text-xs text-slate-500">{formatDateTime(comment.createdAt)}</div>
                            </div>
                            {orderedComments[0]?.id === comment.id ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Mais recente</span>
                            ) : null}
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{comment.body}</p>
                          {comment.attachments.length ? (
                            <TaskAttachmentList
                              items={comment.attachments.map((attachment) => ({
                                id: attachment.id,
                                href: `/api/admin/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(comment.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                                name: attachment.originalName,
                                subtitle: 'Anexo do comentário',
                                sizeLabel: formatFileSize(attachment.sizeBytes),
                              }))}
                              emptyLabel=""
                              compact
                            />
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </TaskSectionCard>
              </>
            )}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-6">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Resumo executivo</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <InfoRow icon={<Clock3 size={15} />} label="Status" value={statusLabelMap[form.status]} />
                  <InfoRow icon={<AlertCircle size={15} />} label="Prioridade" value={priorityLabelMap[form.priority]} />
                  <InfoRow icon={<Calendar size={15} />} label="Prazo" value={formatDate(form.dueDate || null)} />
                  <InfoRow icon={<Users size={15} />} label="Criador" value={usersById.get(task.createdBy)?.name || 'Usuário'} />
                  <InfoRow icon={<ShieldCheck size={15} />} label="Aprovador" value={form.approverUserId ? usersById.get(form.approverUserId)?.name || 'Usuário atribuído' : 'Não definido'} />
                  <InfoRow
                    icon={<CheckCircle2 size={15} />}
                    label="Checklist"
                    value={task.checklistTotalItems ? `${task.checklistCompletedItems}/${task.checklistTotalItems}` : 'Sem itens'}
                  />
                  <InfoRow icon={<MessageCircle size={15} />} label="Comentários" value={String(task.comments.length)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Anexos da tarefa</h3>
                <TaskAttachmentList
                  items={task.attachments.map((attachment) => ({
                    id: attachment.id,
                    href: `/api/admin/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                    name: attachment.originalName,
                    subtitle: formatDateTime(attachment.createdAt),
                    sizeLabel: formatFileSize(attachment.sizeBytes),
                  }))}
                  emptyLabel="Nenhum anexo enviado para esta tarefa."
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Histórico recente</h3>
                <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {orderedActivity.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
                  ) : (
                    <TaskActivityTimeline items={orderedActivity.slice(0, 12)} usersById={usersById} />
                  )}
                </div>
              </div>

              {canEdit ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Encerramento da tarefa</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {taskIsRetired
                      ? 'A tarefa está fora do fluxo operacional, mas pode ser restaurada quando necessário.'
                      : 'Arquive ou cancele a tarefa sem perder histórico, comentários ou anexos.'}
                  </p>
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={lifecycleReason}
                      onChange={(event) => onLifecycleReasonChange(event.target.value)}
                      className={`${inputClassName} min-h-[110px] resize-y`}
                      placeholder="Motivo do cancelamento ou observação do arquivamento"
                    />
                    {taskIsRetired ? (
                      <button
                        type="button"
                        onClick={onRestore}
                        disabled={saving}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} />
                        Restaurar tarefa
                      </button>
                    ) : (
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={onArchive}
                          disabled={saving}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <FileText size={15} />
                          Arquivar tarefa
                        </button>
                        <button
                          type="button"
                          onClick={onCancelTask}
                          disabled={saving || !lifecycleReason.trim()}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          <X size={15} />
                          Cancelar tarefa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.title.trim() || !form.department.trim() || (requiresProjectSchedule && (!form.startDate || !form.dueDate))}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Columns3 size={16} />}
              Salvar alterações
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModalPill({
  label,
  tone,
}: {
  label: string;
  tone: 'status' | 'priority' | 'warning' | 'danger';
}) {
  const toneClassName =
    tone === 'status'
      ? 'border-blue-200 bg-blue-50 text-[#17407E]'
      : tone === 'priority'
        ? 'border-slate-200 bg-slate-50 text-slate-700'
        : tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-rose-200 bg-rose-50 text-rose-700';

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClassName}`}>{label}</span>;
}

function QuickMetaCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function TaskSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ChecklistSection({
  items,
  progressPercent,
  completedItems,
  totalItems,
  saving,
  readOnly,
  onCreate,
  onToggle,
  onRename,
  onDelete,
}: {
  items: TaskDetail['checklist'];
  progressPercent: number;
  completedItems: number;
  totalItems: number;
  saving: boolean;
  readOnly: boolean;
  onCreate: (title: string) => void;
  onToggle: (itemId: string, isCompleted: boolean) => void;
  onRename: (itemId: string, title: string) => void;
  onDelete: (itemId: string) => void;
}) {
  const [newTitle, setNewTitle] = useState('');

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title || saving || readOnly) return;
    onCreate(title);
    setNewTitle('');
  };

  return (
    <div className="space-y-4">
      <ChecklistProgressInline
        completedItems={completedItems}
        totalItems={totalItems}
        progressPercent={progressPercent}
        detailed
      />

      {readOnly ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Este checklist está somente leitura neste contexto.
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitCreate();
              }
            }}
            placeholder="Adicionar item ao checklist"
            className={inputClassName}
          />
          <button
            type="button"
            onClick={submitCreate}
            disabled={saving || !newTitle.trim()}
            className="rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum item no checklist ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              saving={saving}
              readOnly={readOnly}
              onToggle={(isCompleted) => onToggle(item.id, isCompleted)}
              onRename={(title) => onRename(item.id, title)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  saving,
  readOnly,
  onToggle,
  onRename,
  onDelete,
}: {
  item: TaskDetail['checklist'][number];
  saving: boolean;
  readOnly: boolean;
  onToggle: (isCompleted: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(item.title);

  useEffect(() => {
    setTitle(item.title);
  }, [item.title]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
      <input
        type="checkbox"
        checked={item.isCompleted}
        disabled={saving || readOnly}
        onChange={(event) => onToggle(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-[#17407E]"
      />
      <input
        value={title}
        disabled={saving || readOnly}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          const nextTitle = title.trim();
          if (nextTitle && nextTitle !== item.title) {
            onRename(nextTitle);
          } else if (!nextTitle) {
            setTitle(item.title);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const nextTitle = title.trim();
            if (nextTitle && nextTitle !== item.title) {
              onRename(nextTitle);
            }
          }
          if (event.key === 'Escape') {
            setTitle(item.title);
          }
        }}
        className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${item.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}
      />
      {!readOnly ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Remover item do checklist"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function ChecklistProgressInline({
  completedItems,
  totalItems,
  progressPercent,
  detailed = false,
}: {
  completedItems: number;
  totalItems: number;
  progressPercent: number;
  detailed?: boolean;
}) {
  const safePercent = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  const label = totalItems ? `${completedItems}/${totalItems} concluídos` : 'Sem checklist';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-600">{detailed ? 'Progresso do checklist' : label}</span>
        <span className="text-slate-500">{detailed ? `${label} · ${safePercent}%` : `${safePercent}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${safePercent}%` }} />
      </div>
    </div>
  );
}

function TaskAttachmentList({
  items,
  emptyLabel,
  compact = false,
}: {
  items: Array<{ id: string; href: string; name: string; subtitle: string; sizeLabel: string }>;
  emptyLabel: string;
  compact?: boolean;
}) {
  if (!items.length) {
    return emptyLabel ? <p className="mt-4 text-sm text-slate-500">{emptyLabel}</p> : null;
  }

  return (
    <div className="mt-4 grid gap-2">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 ${compact ? 'bg-white px-3 py-2.5' : 'bg-slate-50 px-3 py-3'} text-sm text-slate-700 hover:border-slate-300`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Paperclip size={14} className="shrink-0 text-[#17407E]" />
            <span className="min-w-0">
              <span className="block truncate">{item.name}</span>
              <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
            </span>
          </span>
          <span className="shrink-0 text-xs text-slate-500">{item.sizeLabel}</span>
        </a>
      ))}
    </div>
  );
}

function TaskActivityTimeline({
  items,
  usersById,
}: {
  items: TaskDetail['activity'];
  usersById: Map<string, UserOption>;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const actorLabel = item.actorUserName || (item.actorUserId ? usersById.get(item.actorUserId)?.name : null) || 'Usuário';
        return (
          <div key={item.id} className="relative pl-5">
            <span className="absolute left-0 top-2.5 h-2.5 w-2.5 rounded-full bg-[#17407E]" />
            <span className="absolute left-[4px] top-5 h-[calc(100%-0.25rem)] w-px bg-slate-200" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-sm font-semibold text-slate-900">{describeTaskActivity(item.action, item.payloadJson)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {actorLabel} • {formatDateTime(item.createdAt)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      <input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${inputClassName} disabled:bg-slate-50`} />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${inputClassName} disabled:bg-slate-50`}>
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-[#17407E]">{icon}</span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-sm text-slate-700">{value}</div>
      </div>
    </div>
  );
}
