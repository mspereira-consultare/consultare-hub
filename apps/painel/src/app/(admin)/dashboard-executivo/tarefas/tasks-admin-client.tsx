'use client';

import { createPortal } from 'react-dom';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Columns3,
  FileText,
  Filter,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Paperclip,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Users,
  X,
} from 'lucide-react';
import type {
  TaskApprovalDecisionStatus,
  TaskDashboardSummary,
  TaskDetail,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from '@consultare/core/tasks/types';

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

type ViewMode = 'KANBAN' | 'LIST';

type TaskFormState = {
  title: string;
  description: string;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  startDate: string;
  primaryAssigneeUserId: string;
  assigneeUserIds: string[];
  approverUserId: string;
};

type FiltersState = {
  search: string;
  department: string;
  createdBy: string;
  assigneeUserId: string;
  approverUserId: string;
  priority: string;
  status: string;
  dueBucket: string;
};

const KANBAN_COLUMNS: Array<{ key: TaskStatus; label: string; description: string }> = [
  { key: 'BACKLOG', label: 'Backlog', description: 'Entradas ainda em triagem.' },
  { key: 'A_FAZER', label: 'A fazer', description: 'Priorizadas para execução.' },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', description: 'Execução ativa pela equipe.' },
  { key: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', description: 'Em revisão formal.' },
  { key: 'CONCLUIDA', label: 'Concluídas', description: 'Entregas encerradas.' },
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

const RETIRED_TASK_STATUSES: TaskStatus[] = ['ARQUIVADA', 'CANCELADA'];

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const panelClassName = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

const defaultFilters: FiltersState = {
  search: '',
  department: 'all',
  createdBy: 'all',
  assigneeUserId: 'all',
  approverUserId: 'all',
  priority: 'all',
  status: 'all',
  dueBucket: 'all',
};

const defaultForm = (): TaskFormState => ({
  title: '',
  description: '',
  department: '',
  priority: 'MEDIA',
  status: 'BACKLOG',
  dueDate: '',
  startDate: '',
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

const buildQueryString = (filters: FiltersState) => {
  const params = new URLSearchParams();
  params.set('includeCanceled', '1');
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.department !== 'all') params.set('department', filters.department);
  if (filters.createdBy !== 'all') params.set('createdBy', filters.createdBy);
  if (filters.assigneeUserId !== 'all') params.set('assigneeUserId', filters.assigneeUserId);
  if (filters.approverUserId !== 'all') params.set('approverUserId', filters.approverUserId);
  if (filters.priority !== 'all') params.set('priorities', filters.priority);
  if (filters.status !== 'all') params.set('statuses', filters.status);
  if (filters.dueBucket !== 'all') params.set('dueBucket', filters.dueBucket);
  return params.toString();
};

const canDropTaskToStatus = (task: TaskSummary, status: TaskStatus, canEdit: boolean) => {
  if (!canEdit) return false;
  if (task.status === status || status === 'CANCELADA' || status === 'ARQUIVADA') return false;
  if (status === 'AGUARDANDO_APROVACAO' && !task.approverUserId) return false;
  return true;
};

export function ExecutiveTasksClient({ users, departments, canEdit }: ExecutiveTasksClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('KANBAN');
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [summary, setSummary] = useState<TaskDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBoard, setRefreshingBoard] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(defaultForm());
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const dragClickGuardRef = useRef<string | null>(null);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
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
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

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
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ExecutiveMetricCard label="Total de tarefas" value={summary?.totalTasks || 0} helper="Tudo sob escopo global" tone="neutral" icon={<FileText size={18} />} />
        <ExecutiveMetricCard label="A vencer" value={summary?.dueSoonTasks || 0} helper="Próximos 2 dias" tone="warning" icon={<Clock3 size={18} />} />
        <ExecutiveMetricCard label="Vencidas" value={summary?.overdueTasks || 0} helper="Prazos já expirados" tone="danger" icon={<AlertCircle size={18} />} />
        <ExecutiveMetricCard label="Aguardando aprovação" value={summary?.awaitingApprovalTasks || 0} helper="Fila de decisão" tone="info" icon={<ShieldCheck size={18} />} />
        <ExecutiveMetricCard label="Aprovadas" value={summary?.approvedTasks || 0} helper="Último ciclo aprovado" tone="success" icon={<CheckCircle2 size={18} />} />
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
            <div className="overflow-x-auto">
              <div className="grid min-w-[1200px] grid-cols-5 items-start gap-4">
                {boardByColumn.map((column) => (
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
                    className={`flex h-[72vh] min-h-[520px] min-w-0 flex-col rounded-2xl border bg-slate-50/70 transition ${
                      dragOverColumn === column.key ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="border-b border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{column.label}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{column.tasks.length}</span>
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
                ))}
              </div>
            </div>
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
          onArchive={() => void changeTaskLifecycle('ARQUIVADA')}
          onCancelTask={() => void changeTaskLifecycle('CANCELADA')}
          onRestore={() => void changeTaskLifecycle('BACKLOG')}
        />
      ) : null}
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
  value: number;
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

function TaskDetailPanel({
  task,
  users,
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
  onArchive,
  onCancelTask,
  onRestore,
}: {
  task: TaskDetail;
  users: UserOption[];
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
  onArchive: () => void;
  onCancelTask: () => void;
  onRestore: () => void;
}) {
  const taskIsRetired = isRetiredTaskStatus(task.status);
  const orderedComments = [...task.comments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const orderedActivity = [...task.activity].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const approvalStateLabel = task.latestApproval ? approvalLabelMap[task.latestApproval.decisionStatus] : 'Sem ciclo aberto';
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
            <QuickMetaCard label="Aprovação" value={approvalStateLabel} />
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
                  <FieldInput label="Título" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} disabled={!canEdit} />
                  <FieldInput label="Setor" value={form.department} onChange={(value) => onFormChange({ ...form, department: value })} disabled={!canEdit} />
                  <FieldSelect
                    label="Prioridade"
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
                    label="Status"
                    value={form.status}
                    onChange={(value) => onFormChange({ ...form, status: value as TaskStatus })}
                    disabled={!canEdit}
                    options={Object.entries(statusLabelMap)
                      .filter(([value]) => value !== 'ARQUIVADA' && value !== 'CANCELADA')
                      .map(([value, label]) => ({ value, label }))}
                  />
                  <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onFormChange({ ...form, dueDate: value })} disabled={!canEdit} />
                  <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onFormChange({ ...form, startDate: value })} disabled={!canEdit} />
                </div>
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

                <TaskSectionCard
                  title="Responsáveis e aprovação"
                  description="Consolide responsável principal, colaboradores e aprovador em um mesmo bloco."
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldSelect
                    label="Responsável principal"
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
                    <TaskActivityTimeline items={orderedActivity.slice(0, 12)} />
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
              disabled={saving || !form.title.trim() || !form.department.trim()}
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
}: {
  items: TaskDetail['activity'];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="relative pl-5">
          <span className="absolute left-0 top-2.5 h-2.5 w-2.5 rounded-full bg-[#17407E]" />
          <span className="absolute left-[4px] top-5 h-[calc(100%-0.25rem)] w-px bg-slate-200" />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-sm font-semibold text-slate-900">{describeTaskActivity(item.action, item.payloadJson)}</div>
            <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
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
