'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Table2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  TaskApprovalDecisionStatus,
  TaskDetail,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from '@consultare/core/tasks/types';

type TaskUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  department: string;
};

type DraftChecklistItem = {
  id: string;
  title: string;
  isCompleted: boolean;
};

type TasksClientProps = {
  currentUser: CurrentUser;
};

type ViewMode = 'KANBAN' | 'LIST';

type FilterKey =
  | 'ALL'
  | 'CREATED_BY_ME'
  | 'ASSIGNED_TO_ME'
  | 'AWAITING_MY_APPROVAL'
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'ARCHIVED_BY_ME'
  | 'CANCELED_BY_ME';

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

const KANBAN_COLUMNS: Array<{ key: TaskStatus; label: string; description: string }> = [
  { key: 'BACKLOG', label: 'Backlog', description: 'Entradas e ideias pendentes de triagem.' },
  { key: 'A_FAZER', label: 'A fazer', description: 'Itens priorizados e prontos para iniciar.' },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', description: 'Tarefas em execução no dia a dia.' },
  { key: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', description: 'Itens enviados para revisão formal.' },
  { key: 'CONCLUIDA', label: 'Concluída', description: 'Entregas finalizadas.' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'URGENTE', label: 'Urgente' },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'A_FAZER', label: 'A fazer' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação' },
  { value: 'CONCLUIDA', label: 'Concluída' },
  { value: 'ARQUIVADA', label: 'Arquivada' },
  { value: 'CANCELADA', label: 'Cancelada' },
];

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'Todas as visíveis' },
  { key: 'CREATED_BY_ME', label: 'Criadas por mim' },
  { key: 'ASSIGNED_TO_ME', label: 'Atribuídas a mim' },
  { key: 'AWAITING_MY_APPROVAL', label: 'Aguardando minha aprovação' },
  { key: 'OVERDUE', label: 'Vencidas' },
  { key: 'DUE_SOON', label: 'A vencer' },
  { key: 'ARCHIVED_BY_ME', label: 'Arquivadas por mim' },
  { key: 'CANCELED_BY_ME', label: 'Canceladas por mim' },
];

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const textAreaClassName = `${inputClassName} min-h-[110px] resize-y`;
const cardBaseClassName = 'rounded-xl border bg-white p-4 shadow-sm transition hover:border-[#17407E] hover:shadow-md';

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

const priorityRank: Record<TaskPriority, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

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
const isRetiredFilter = (filter: FilterKey) => filter === 'ARCHIVED_BY_ME' || filter === 'CANCELED_BY_ME';

const defaultForm = (currentUser: CurrentUser): TaskFormState => ({
  title: '',
  description: '',
  department: currentUser.department || '',
  priority: 'MEDIA',
  status: 'BACKLOG',
  dueDate: '',
  startDate: '',
  primaryAssigneeUserId: currentUser.id,
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
  assigneeUserIds: task.assignees
    .filter((assignee) => assignee.roleType !== 'PRIMARY')
    .map((assignee) => assignee.userId),
  approverUserId: task.approverUserId || '',
});

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

const sortByLocalizedText = (items: string[]) => [...items].sort((left, right) => left.localeCompare(right, 'pt-BR'));

const buildDepartmentOptions = (primary: string[], legacy: string[] = [], currentValue?: string | null) =>
  sortByLocalizedText(
    Array.from(new Set([...primary, ...legacy, String(currentValue || '').trim()].filter(Boolean)))
  );

const formOrTaskDepartment = (task: TaskDetail | null, form: TaskFormState) =>
  String(form.department || task?.department || '').trim();

const createDraftChecklistItem = (title = '', isCompleted = false): DraftChecklistItem => ({
  id: globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title,
  isCompleted,
});

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
      return 'Campos da tarefa atualizados';
    case 'TASK_STATUS_CHANGED': {
      const nextStatus = typeof payload?.nextStatus === 'string' ? payload.nextStatus : null;
      return nextStatus && nextStatus in statusLabelMap
        ? `Status alterado para ${statusLabelMap[nextStatus as TaskStatus]}`
        : 'Status alterado';
    }
    case 'TASK_PRIORITY_CHANGED':
      return 'Prioridade ajustada';
    case 'TASK_COMMENTED':
      return 'Comentário publicado';
    case 'TASK_ATTACHMENT_ADDED':
      return 'Anexo incluído na tarefa';
    case 'TASK_COMMENT_ATTACHMENT_ADDED':
      return 'Arquivo incluído em comentário';
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

const getTaskTone = (task: TaskSummary) => {
  if (task.status === 'AGUARDANDO_APROVACAO') return 'border-violet-200 bg-violet-50/50';
  if (isOverdue(task.dueDate, task.status)) return 'border-rose-200 bg-rose-50/60';
  if (isDueSoon(task.dueDate, task.status)) return 'border-amber-200 bg-amber-50/60';
  return 'border-slate-200 bg-white';
};

const compareTasks = (left: TaskSummary, right: TaskSummary) => {
  const leftOverdue = isOverdue(left.dueDate, left.status);
  const rightOverdue = isOverdue(right.dueDate, right.status);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const leftDueSoon = isDueSoon(left.dueDate, left.status);
  const rightDueSoon = isDueSoon(right.dueDate, right.status);
  if (leftDueSoon !== rightDueSoon) return leftDueSoon ? -1 : 1;

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

export function TasksClient({ currentUser }: TasksClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('KANBAN');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [users, setUsers] = useState<TaskUserOption[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [taskLoading, setTaskLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TaskFormState>(defaultForm(currentUser));
  const [createChecklistItems, setCreateChecklistItems] = useState<DraftChecklistItem[]>([]);
  const [editForm, setEditForm] = useState<TaskFormState>(defaultForm(currentUser));
  const [newTaskFiles, setNewTaskFiles] = useState<File[]>([]);
  const [detailTaskFiles, setDetailTaskFiles] = useState<File[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const createFileRef = useRef<HTMLInputElement | null>(null);
  const detailFileRef = useRef<HTMLInputElement | null>(null);
  const commentFileRef = useRef<HTMLInputElement | null>(null);
  const dragClickGuardRef = useRef<string | null>(null);

  const loadTasks = async (focusTaskId?: string) => {
    setBoardLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeFilter === 'ARCHIVED_BY_ME') {
        params.set('statuses', 'ARQUIVADA');
      }
      if (activeFilter === 'CANCELED_BY_ME') {
        params.set('statuses', 'CANCELADA');
      }
      if (assigneeFilter) {
        params.set('assigneeUserId', assigneeFilter);
      }
      if (departmentFilter) {
        params.set('department', departmentFilter);
      }
      const response = await fetch(`/api/tasks${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const nextTasks = Array.isArray(json.data) ? (json.data as TaskSummary[]) : [];
      setTasks(nextTasks);
      if (focusTaskId) {
        setSelectedTaskId(focusTaskId);
      } else if (!selectedTaskId && nextTasks[0]?.id) {
        setSelectedTaskId(nextTasks[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar tarefas.');
    } finally {
      setBoardLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/chat/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const remoteUsers = Array.isArray(json.data) ? (json.data as TaskUserOption[]) : [];
      const merged = [
        {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: 'OPERADOR',
          department: currentUser.department,
        },
        ...remoteUsers,
      ];
      const unique = Array.from(new Map(merged.map((user) => [user.id, user])).values());
      setUsers(unique.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    } catch (err: unknown) {
      console.error('Erro ao carregar usuários das tarefas:', err);
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: 'OPERADOR',
          department: currentUser.department,
        },
      ]);
    }
  };

  const loadTaskDetail = async (taskId: string, openModal = true) => {
    if (!taskId) return;
    setTaskLoading(true);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const task = json.data as TaskDetail;
      setSelectedTask(task);
      setEditForm(taskToForm(task));
      setLifecycleReason(task.cancellationReason || '');
      if (openModal) {
        setDetailOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da tarefa.');
    } finally {
      setTaskLoading(false);
    }
  };

  const openTaskDetail = async (taskId: string) => {
    setSelectedTaskId(taskId);
    await loadTaskDetail(taskId, true);
  };

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, assigneeFilter, departmentFilter]);

  useEffect(() => {
    if (!successMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const visibleTasks = useMemo(() => {
    const term = normalizeText(search);
    return tasks.filter((task) => {
      if (term) {
        const searchable = normalizeText(`${task.protocolId} ${task.title} ${task.description} ${task.department}`);
        if (!searchable.includes(term)) return false;
      }

      if (activeFilter === 'CREATED_BY_ME' && task.createdBy !== currentUser.id) return false;
      if (activeFilter === 'ASSIGNED_TO_ME') {
        const isMine =
          task.primaryAssigneeUserId === currentUser.id ||
          task.assignees.some((assignee) => assignee.userId === currentUser.id);
        if (!isMine) return false;
      }
      if (activeFilter === 'AWAITING_MY_APPROVAL' && !(task.approverUserId === currentUser.id && task.status === 'AGUARDANDO_APROVACAO')) return false;
      if (activeFilter === 'OVERDUE' && !isOverdue(task.dueDate, task.status)) return false;
      if (activeFilter === 'DUE_SOON' && !isDueSoon(task.dueDate, task.status)) return false;
      if (activeFilter === 'ARCHIVED_BY_ME' && !(task.createdBy === currentUser.id && task.status === 'ARQUIVADA')) return false;
      if (activeFilter === 'CANCELED_BY_ME' && !(task.createdBy === currentUser.id && task.status === 'CANCELADA')) return false;
      return true;
    });
  }, [activeFilter, currentUser.id, search, tasks]);

  const boardByColumn = useMemo(() => {
    return KANBAN_COLUMNS.map((column) => ({
      ...column,
      tasks: visibleTasks.filter((task) => task.status === column.key).sort(compareTasks),
    }));
  }, [visibleTasks]);

  const summary = useMemo(() => ({
    total: tasks.length,
    dueSoon: tasks.filter((task) => isDueSoon(task.dueDate, task.status)).length,
    overdue: tasks.filter((task) => isOverdue(task.dueDate, task.status)).length,
    awaitingApproval: tasks.filter((task) => task.status === 'AGUARDANDO_APROVACAO').length,
    approved: tasks.filter((task) => task.latestApproval?.decisionStatus === 'APROVADA').length,
  }), [tasks]);

  const openCreate = () => {
    setCreateForm(defaultForm(currentUser));
    setCreateChecklistItems([]);
    setNewTaskFiles([]);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateChecklistItems([]);
    setNewTaskFiles([]);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTaskFiles([]);
    setCommentFiles([]);
    setCommentBody('');
    setApprovalNotes('');
    setDecisionNotes('');
    setLifecycleReason('');
  };

  const createTask = async () => {
    if (!createForm.title.trim() || !createForm.department.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title,
          description: createForm.description,
          department: createForm.department,
          priority: createForm.priority,
          status: createForm.status,
          dueDate: createForm.dueDate || null,
          startDate: createForm.startDate || null,
          primaryAssigneeUserId: createForm.primaryAssigneeUserId || currentUser.id,
          assigneeUserIds: createForm.assigneeUserIds,
          approverUserId: createForm.approverUserId || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const task = json.data as TaskDetail;

      for (const draftItem of createChecklistItems) {
        const title = draftItem.title.trim();
        if (!title) continue;

        const checklistResponse = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/checklist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (!checklistResponse.ok) throw new Error(await normalizeError(checklistResponse));

        if (draftItem.isCompleted) {
          const checklistPayload = await checklistResponse.json();
          const taskWithChecklist = checklistPayload.data as TaskDetail;
          const createdItem = [...taskWithChecklist.checklist]
            .reverse()
            .find((item) => item.title === title && !item.isCompleted);
          if (createdItem) {
            const toggleResponse = await fetch(
              `/api/tasks/${encodeURIComponent(task.id)}/checklist/${encodeURIComponent(createdItem.id)}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isCompleted: true }),
              }
            );
            if (!toggleResponse.ok) throw new Error(await normalizeError(toggleResponse));
          }
        }
      }

      for (const file of newTaskFiles) {
        const data = new FormData();
        data.append('file', file);
        const uploadResponse = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/attachments`, {
          method: 'POST',
          body: data,
        });
        if (!uploadResponse.ok) throw new Error(await normalizeError(uploadResponse));
      }

      closeCreate();
      setSuccessMessage(`Tarefa ${task.protocolId} criada com sucesso.`);
      await loadTasks(task.id);
      await loadTaskDetail(task.id, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const saveTaskChanges = async () => {
    if (!selectedTask || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          department: editForm.department,
          priority: editForm.priority,
          status: editForm.status,
          dueDate: editForm.dueDate || null,
          startDate: editForm.startDate || null,
          primaryAssigneeUserId: editForm.primaryAssigneeUserId || null,
          assigneeUserIds: editForm.assigneeUserIds,
          approverUserId: editForm.approverUserId || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));

      for (const file of detailTaskFiles) {
        const data = new FormData();
        data.append('file', file);
        const uploadResponse = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/attachments`, {
          method: 'POST',
          body: data,
        });
        if (!uploadResponse.ok) throw new Error(await normalizeError(uploadResponse));
      }

      setDetailTaskFiles([]);
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
      setSuccessMessage('Tarefa atualizada com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (task: TaskSummary, status: TaskStatus) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadTasks(task.id);
      setSuccessMessage(`Tarefa ${task.protocolId} movida para ${statusLabelMap[status]}.`);
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
    if (!task || !canDropTaskToStatus(task, status) || saving) return;
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
    if (!task || !canDropTaskToStatus(task, status) || saving) return;
    await moveTask(task, status);
  };

  const changeTaskLifecycle = async (status: TaskStatus) => {
    if (!selectedTask || saving) return;
    if (status === 'CANCELADA' && !lifecycleReason.trim()) {
      setError('Informe um motivo para cancelar a tarefa.');
      return;
    }

    const restoreStatus = selectedTask.previousOperationalStatus || 'BACKLOG';

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status === 'BACKLOG' ? restoreStatus : status,
          cancellationReason: status === 'BACKLOG' ? null : lifecycleReason.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const task = json.data as TaskDetail;
      setSuccessMessage(
        status === 'ARQUIVADA'
          ? `Tarefa ${task.protocolId} arquivada com sucesso.`
          : status === 'CANCELADA'
            ? `Tarefa ${task.protocolId} cancelada com sucesso.`
            : `Tarefa ${task.protocolId} restaurada com sucesso.`
      );
      setLifecycleReason(task.cancellationReason || '');
      await loadTasks(task.id);
      await loadTaskDetail(task.id, detailOpen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar o encerramento da tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const addChecklistItem = async (title: string) => {
    if (!selectedTask || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const updateChecklistItem = async (itemId: string, input: { title?: string; isCompleted?: boolean }) => {
    if (!selectedTask || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/checklist/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const deleteChecklistItem = async (itemId: string) => {
    if (!selectedTask || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/checklist/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover item do checklist.');
    } finally {
      setSaving(false);
    }
  };

  const sendComment = async () => {
    if (!selectedTask || !commentBody.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const commentId = String(json.data?.id || '');

      for (const file of commentFiles) {
        const data = new FormData();
        data.append('file', file);
        const uploadResponse = await fetch(
          `/api/tasks/${encodeURIComponent(selectedTask.id)}/comments/${encodeURIComponent(commentId)}/attachments`,
          { method: 'POST', body: data }
        );
        if (!uploadResponse.ok) throw new Error(await normalizeError(uploadResponse));
      }

      setCommentBody('');
      setCommentFiles([]);
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao comentar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const requestApproval = async () => {
    if (!selectedTask || !editForm.approverUserId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/approval/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverUserId: editForm.approverUserId,
          notes: approvalNotes || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setApprovalNotes('');
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
      setSuccessMessage('Solicitação de aprovação enviada.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar aprovação.');
    } finally {
      setSaving(false);
    }
  };

  const decideApproval = async (decisionStatus: Extract<TaskApprovalDecisionStatus, 'APROVADA' | 'REPROVADA' | 'DEVOLVIDA'>) => {
    if (!selectedTask || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}/approval/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionStatus,
          notes: decisionNotes || null,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setDecisionNotes('');
      await loadTasks(selectedTask.id);
      await loadTaskDetail(selectedTask.id, detailOpen);
      setSuccessMessage(`Solicitação ${approvalLabelMap[decisionStatus].toLowerCase()} com sucesso.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao decidir aprovação.');
    } finally {
      setSaving(false);
    }
  };

  const selectableUsers = useMemo(
    () => users.map((user) => ({ ...user, label: `${user.name} · ${user.department || user.email}` })),
    [users]
  );

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const officialDepartments = useMemo(
    () =>
      sortByLocalizedText(
        Array.from(
          new Set(
            [currentUser.department, ...users.map((user) => user.department)]
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        )
      ),
    [currentUser.department, users]
  );
  const departmentFilterOptions = useMemo(
    () => buildDepartmentOptions(officialDepartments, tasks.map((task) => task.department), selectedTask?.department),
    [officialDepartments, tasks, selectedTask?.department]
  );
  const createDepartmentOptions = officialDepartments;
  const editDepartmentOptions = useMemo(
    () => buildDepartmentOptions(officialDepartments, tasks.map((task) => task.department), formOrTaskDepartment(selectedTask, editForm)),
    [officialDepartments, tasks, selectedTask, editForm]
  );

  const canCurrentUserApprove =
    selectedTask?.status === 'AGUARDANDO_APROVACAO' &&
    selectedTask.approverUserId === currentUser.id &&
    selectedTask.latestApproval?.decisionStatus === 'PENDENTE';
  const canManageLifecycle = selectedTask?.createdBy === currentUser.id;
  const selectedTaskIsRetired = selectedTask ? isRetiredTaskStatus(selectedTask.status) : false;

  return (
    <main className="px-4 py-6 lg:px-8">
      <section className="rounded-2xl bg-[#053F74] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Tarefas internas</p>
            <h1 className="mt-3 text-3xl font-semibold">Board operacional da intranet</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
              Acompanhe suas entregas, compartilhe contexto com comentários e envie itens para aprovação sem sair da intranet.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[#17407E] transition hover:bg-blue-50"
          >
            <Plus size={16} />
            Nova tarefa
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total de tarefas" value={summary.total} helper="Tudo que você pode visualizar" tone="neutral" />
        <SummaryCard label="A vencer" value={summary.dueSoon} helper="Prazo até 2 dias" tone="warning" />
        <SummaryCard label="Vencidas" value={summary.overdue} helper="Pendências com prazo expirado" tone="danger" />
        <SummaryCard label="Aguardando aprovação" value={summary.awaitingApproval} helper="Solicitações pendentes" tone="info" />
        <SummaryCard label="Aprovadas" value={summary.approved} helper="Última decisão aprovada" tone="success" />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-5xl flex-1">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por protocolo, título, descrição ou setor"
                    className={`${inputClassName} pl-9`}
                  />
                </div>
              </div>
              {!isRetiredFilter(activeFilter) ? (
                <div className="inline-flex items-center gap-2 self-start rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('KANBAN')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      viewMode === 'KANBAN' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <LayoutGrid size={16} />
                    Kanban
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('LIST')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      viewMode === 'LIST' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <Table2 size={16} />
                    Lista
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filtros rápidos</p>
                <p className="mt-1 text-sm text-slate-500">Escolha o recorte que você quer acompanhar no board.</p>
              </div>

              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max flex-wrap gap-2 px-1 lg:justify-end">
                  {FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setActiveFilter(filter.key)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                        activeFilter === filter.key
                          ? 'border-[#17407E] bg-blue-50 text-[#17407E]'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_320px_240px]">
              <SearchableUserSelect
                label="Responsável"
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                users={selectableUsers}
                emptyLabel="Todos os responsáveis"
                placeholder="Filtrar por responsável"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Setor</label>
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className={inputClassName}>
                  <option value="">Todos os setores</option>
                  {departmentFilterOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  {visibleTasks.length} tarefa(s) no recorte
                </span>
                {(assigneeFilter || departmentFilter) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAssigneeFilter('');
                      setDepartmentFilter('');
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Limpar filtros extras
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</div>
        ) : null}
        {successMessage ? (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">{successMessage}</div>
        ) : null}

        <div className="overflow-x-auto p-5">
          {boardLoading ? (
            <div className="flex min-h-[320px] items-center justify-center text-slate-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Carregando tarefas...
            </div>
          ) : isRetiredFilter(activeFilter) ? (
            visibleTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Nenhuma tarefa encerrada encontrada neste filtro.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {visibleTasks.sort(compareTasks).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      void openTaskDetail(task.id);
                    }}
                    className={`w-full text-left ${cardBaseClassName} ${getTaskTone(task)} ${
                      selectedTaskId === task.id ? 'ring-2 ring-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</p>
                        <h3 className="mt-1 line-clamp-2 font-semibold text-slate-900">{task.title}</h3>
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
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{task.department}</span>
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ring-1 ${
                          task.status === 'ARQUIVADA'
                            ? 'bg-slate-100 text-slate-700 ring-slate-200'
                            : 'bg-rose-100 text-rose-700 ring-rose-200'
                        }`}
                      >
                        {statusLabelMap[task.status]}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(task.dueDate)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatDateTime(task.updatedAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : viewMode === 'LIST' ? (
            visibleTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Nenhuma tarefa encontrada neste recorte.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[160px_minmax(0,1.5fr)_140px_180px_160px_130px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Protocolo</span>
                  <span>Tarefa</span>
                  <span>Prioridade</span>
                  <span>Responsável</span>
                  <span>Prazo</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {visibleTasks.sort(compareTasks).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        void openTaskDetail(task.id);
                      }}
                      className="grid w-full grid-cols-[160px_minmax(0,1.5fr)_140px_180px_160px_130px] gap-3 px-4 py-4 text-left transition hover:bg-slate-50"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{task.title}</span>
                        <span className="mt-1 block truncate text-sm text-slate-500">{task.department}</span>
                        {task.checklistTotalItems > 0 ? (
                          <div className="mt-2 max-w-[240px]">
                            <ChecklistProgressInline
                              completedItems={task.checklistCompletedItems}
                              totalItems={task.checklistTotalItems}
                              progressPercent={task.checklistProgressPercent}
                            />
                          </div>
                        ) : null}
                      </span>
                      <span>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityStyles[task.priority]}`}>
                          {priorityLabelMap[task.priority]}
                        </span>
                      </span>
                      <span className="truncate text-sm text-slate-600">
                        {task.primaryAssigneeUserId
                          ? task.primaryAssigneeUserId === currentUser.id
                            ? 'Você'
                            : usersById.get(task.primaryAssigneeUserId)?.name || 'Atribuído'
                          : 'Sem responsável'}
                      </span>
                      <span className="text-sm text-slate-600">{formatDate(task.dueDate)}</span>
                      <span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                          {statusLabelMap[task.status]}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
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
                        <h2 className="font-semibold text-slate-900">{column.label}</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {column.tasks.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    {column.tasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        Nenhuma tarefa nesta coluna
                      </div>
                    ) : (
                      column.tasks.map((task) => (
                        <div
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          draggable={!saving}
                          onDragStart={(event) => handleTaskDragStart(task, event)}
                          onDragEnd={() => handleTaskDragEnd(task.id)}
                          onClick={() => {
                            if (dragClickGuardRef.current === task.id) {
                              dragClickGuardRef.current = null;
                              return;
                            }
                            void openTaskDetail(task.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              void openTaskDetail(task.id);
                            }
                          }}
                          className={`w-full text-left ${cardBaseClassName} ${getTaskTone(task)} ${
                            selectedTaskId === task.id ? 'ring-2 ring-blue-200' : ''
                          } ${
                            draggedTaskId === task.id ? 'cursor-grabbing opacity-60' : 'cursor-grab'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17407E]">
                                {task.protocolId}
                              </p>
                              <h3 className="mt-1 line-clamp-2 font-semibold text-slate-900">{task.title}</h3>
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
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{task.department}</span>
                            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                              {task.primaryAssigneeUserId
                                ? `Responsável: ${
                                    task.primaryAssigneeUserId === currentUser.id
                                      ? 'você'
                                      : usersById.get(task.primaryAssigneeUserId)?.name || 'atribuído'
                                  }`
                                : 'Sem responsável principal'}
                            </span>
                            {task.status === 'AGUARDANDO_APROVACAO' ? (
                              <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-700 ring-1 ring-violet-200">
                                Em aprovação
                              </span>
                            ) : null}
                            {isOverdue(task.dueDate, task.status) ? (
                              <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700 ring-1 ring-rose-200">
                                Vencida
                              </span>
                            ) : null}
                            {!isOverdue(task.dueDate, task.status) && isDueSoon(task.dueDate, task.status) ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">
                                A vencer
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={12} />
                              {formatDate(task.dueDate)}
                            </span>
                            <span className="inline-flex items-center gap-3">
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle size={12} />
                                {task.commentCount}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Paperclip size={12} />
                                {task.attachmentCount}
                              </span>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {createOpen ? (
        <TaskModal
          title="Nova tarefa"
          currentUserId={currentUser.id}
          saving={saving}
          users={selectableUsers}
          departmentOptions={createDepartmentOptions}
          checklistItems={createChecklistItems}
          onChecklistChange={setCreateChecklistItems}
          form={createForm}
          onChange={setCreateForm}
          files={newTaskFiles}
          onFilesChange={setNewTaskFiles}
          fileInputRef={createFileRef}
          onClose={closeCreate}
          onSubmit={() => void createTask()}
          submitLabel="Criar tarefa"
        />
      ) : null}

      {detailOpen && selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          currentUserId={currentUser.id}
          saving={saving}
          loading={taskLoading}
          users={selectableUsers}
          departmentOptions={editDepartmentOptions}
          usersById={usersById}
          form={editForm}
          onFormChange={setEditForm}
          files={detailTaskFiles}
          onFilesChange={setDetailTaskFiles}
          fileInputRef={detailFileRef}
          onClose={closeDetail}
          onSave={() => void saveTaskChanges()}
          commentBody={commentBody}
          onCommentBodyChange={setCommentBody}
          commentFiles={commentFiles}
          onCommentFilesChange={setCommentFiles}
          commentFileRef={commentFileRef}
          onSendComment={() => void sendComment()}
          canCurrentUserApprove={Boolean(canCurrentUserApprove)}
          approvalNotes={approvalNotes}
          onApprovalNotesChange={setApprovalNotes}
          onRequestApproval={() => void requestApproval()}
          decisionNotes={decisionNotes}
          onDecisionNotesChange={setDecisionNotes}
          onApprove={() => void decideApproval('APROVADA')}
          onReject={() => void decideApproval('REPROVADA')}
          onReturnToWork={() => void decideApproval('DEVOLVIDA')}
          lifecycleReason={lifecycleReason}
          onLifecycleReasonChange={setLifecycleReason}
          canManageLifecycle={Boolean(canManageLifecycle)}
          onArchive={() => void changeTaskLifecycle('ARQUIVADA')}
          onCancelTask={() => void changeTaskLifecycle('CANCELADA')}
          onRestore={() => void changeTaskLifecycle('BACKLOG')}
          onChecklistCreate={(title) => void addChecklistItem(title)}
          onChecklistUpdate={(itemId, input) => void updateChecklistItem(itemId, input)}
          onChecklistDelete={(itemId) => void deleteChecklistItem(itemId)}
        />
      ) : null}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: 'neutral' | 'warning' | 'danger' | 'info' | 'success';
}) {
  const styles: Record<typeof tone, string> = {
    neutral: 'border-slate-200 bg-white text-slate-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    info: 'border-blue-200 bg-blue-50 text-[#17407E]',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${styles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <p className="mt-2 text-sm opacity-80">{helper}</p>
    </div>
  );
}

function SearchableUserSelect({
  label,
  users,
  value,
  onChange,
  placeholder = 'Selecione um colaborador',
  emptyLabel,
}: {
  label: string;
  users: Array<TaskUserOption & { label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const normalized = normalizeText(searchTerm);
    return users.filter((user) => normalizeText(`${user.name} ${user.email} ${user.department}`).includes(normalized));
  }, [searchTerm, users]);

  const selectedUser = users.find((user) => user.id === value) || null;

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
    <div ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${inputClassName} flex min-h-[44px] items-center justify-between text-left`}
      >
        <span className={`truncate ${selectedUser ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedUser ? selectedUser.label : emptyLabel || placeholder}
        </span>
        <Search size={15} className="shrink-0 text-slate-400" />
      </button>

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                minWidth: dropdownStyle.minWidth,
              }}
              className="z-[90] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="border-b border-slate-100 p-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <div className="max-h-72 overflow-y-auto p-2">
                {emptyLabel ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                      !value ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{emptyLabel}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${!value ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ) : null}

                {filteredUsers.length ? (
                  filteredUsers.map((user) => {
                    const checked = user.id === value;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          onChange(user.id);
                          setOpen(false);
                        }}
                        className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0 text-left">
                          <span className="block truncate font-medium">{user.name}</span>
                          <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                        </span>
                        <span className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum colaborador encontrado.</div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SearchableUserMultiSelect({
  label,
  currentUserId,
  users,
  selectedIds,
  onChange,
}: {
  label: string;
  currentUserId: string;
  users: Array<TaskUserOption & { label: string }>;
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const normalized = normalizeText(searchTerm);
    return users.filter((user) => normalizeText(`${user.name} ${user.email} ${user.department}`).includes(normalized));
  }, [searchTerm, users]);

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.includes(user.id)),
    [selectedIds, users]
  );

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

  const toggleUser = (userId: string) => {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]
    );
  };

  return (
    <div ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${inputClassName} flex min-h-[44px] items-center justify-between text-left`}
      >
        <span className={`truncate ${selectedUsers.length ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedUsers.length
            ? `${selectedUsers.length} colaborador(es) selecionado(s)`
            : 'Selecione os responsáveis adicionais'}
        </span>
        <Search size={15} className="shrink-0 text-slate-400" />
      </button>

      {selectedUsers.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedUsers.slice(0, 4).map((user) => (
            <span key={user.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {user.id === currentUserId ? `${user.name} (você)` : user.name}
            </span>
          ))}
          {selectedUsers.length > 4 ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              +{selectedUsers.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                minWidth: dropdownStyle.minWidth,
              }}
              className="z-[90] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="border-b border-slate-100 p-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <div className="max-h-72 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  <span>Limpar seleção</span>
                  <X className="h-4 w-4 text-slate-400" />
                </button>

                {filteredUsers.length ? (
                  filteredUsers.map((user) => {
                    const checked = selectedIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0 text-left">
                          <span className="block truncate font-medium">
                            {user.id === currentUserId ? `${user.name} (você)` : user.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                        </span>
                        <span className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum colaborador encontrado.</div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TaskModal({
  title,
  currentUserId,
  saving,
  users,
  departmentOptions,
  checklistItems,
  onChecklistChange,
  form,
  onChange,
  files,
  onFilesChange,
  fileInputRef,
  onClose,
  onSubmit,
  submitLabel,
}: {
  title: string;
  currentUserId: string;
  saving: boolean;
  users: Array<TaskUserOption & { label: string }>;
  departmentOptions: string[];
  checklistItems: DraftChecklistItem[];
  onChecklistChange: (items: DraftChecklistItem[]) => void;
  form: TaskFormState;
  onChange: (next: TaskFormState) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#17407E]">Nova tarefa</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Organize a demanda com responsável, prazo, aprovador e contexto completo desde o primeiro registro.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ModalPill label={priorityLabelMap[form.priority]} tone="priority" />
              <ModalPill label={statusLabelMap[form.status]} tone="status" />
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <QuickMetaCard label="Responsável inicial" value={users.find((user) => user.id === form.primaryAssigneeUserId)?.name || 'Defina no formulário'} />
            <QuickMetaCard label="Setor" value={form.department || 'Preencha o setor'} />
            <QuickMetaCard label="Prazo" value={form.dueDate ? formatDate(form.dueDate) : 'Sem prazo definido'} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
            <div className="space-y-5">
              <TaskSectionCard
                title="Contexto da entrega"
                description="Defina o que precisa ser entregue e o contexto operacional da tarefa."
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
                  <input
                    value={form.title}
                    onChange={(event) => onChange({ ...form, title: event.target.value })}
                    className={inputClassName}
                    placeholder="Ex.: Atualizar material do setor"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldSelect label="Prioridade" value={form.priority} onChange={(value) => onChange({ ...form, priority: value as TaskPriority })} options={PRIORITY_OPTIONS} />
                  <FieldSelect
                    label="Status inicial"
                    value={form.status}
                    onChange={(value) => onChange({ ...form, status: value as TaskStatus })}
                    options={STATUS_OPTIONS.filter((item) => item.value !== 'CANCELADA' && item.value !== 'ARQUIVADA')}
                  />
                  <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onChange({ ...form, dueDate: value })} />
                  <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onChange({ ...form, startDate: value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => onChange({ ...form, description: event.target.value })}
                    className={textAreaClassName}
                    placeholder="Contexto, objetivo, passos esperados e observações importantes"
                  />
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <ChecklistSectionHeader
                    title="Checklist inicial"
                    description="Quebre a entrega em subtarefas desde a abertura para acompanhar o progresso desde o início."
                  />
                  <div className="mt-4">
                    <DraftChecklistSection items={checklistItems} onChange={onChecklistChange} saving={saving} />
                  </div>
                </div>
              </TaskSectionCard>
            </div>

            <div className="space-y-5">
              <TaskSectionCard
                title="Governança e responsáveis"
                description="Defina quem executa, quem acompanha e se a tarefa terá aprovação."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <FieldSelect
                    label="Setor"
                    value={form.department}
                    onChange={(value) => onChange({ ...form, department: value })}
                    options={departmentOptions.map((department) => ({ value: department, label: department }))}
                  />
                  <SearchableUserSelect
                    label="Responsável principal"
                    value={form.primaryAssigneeUserId}
                    onChange={(value) => onChange({ ...form, primaryAssigneeUserId: value })}
                    users={users}
                  />
                  <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
                    <SearchableUserMultiSelect
                      label="Responsáveis adicionais"
                      currentUserId={currentUserId}
                      users={users}
                      selectedIds={form.assigneeUserIds}
                      onChange={(assigneeUserIds) => onChange({ ...form, assigneeUserIds })}
                    />
                  </div>
                  <SearchableUserSelect
                    label="Aprovador"
                    value={form.approverUserId}
                    onChange={(value) => onChange({ ...form, approverUserId: value })}
                    users={users}
                    emptyLabel="Sem aprovador no momento"
                  />
                </div>
              </TaskSectionCard>

              <TaskSectionCard
                title="Arquivos iniciais"
                description="Inclua materiais de apoio já no cadastro para reduzir retrabalho da equipe."
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">Anexos enviados agora ficam associados ao protocolo desde a criação.</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Adicionar arquivo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => onFilesChange(Array.from(event.target.files || []))}
                  />
                </div>
                <FileList files={files} onRemove={(index) => onFilesChange(files.filter((_, currentIndex) => currentIndex !== index))} />
              </TaskSectionCard>

            </div>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !form.title.trim() || !form.department.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  currentUserId,
  saving,
  loading,
  users,
  departmentOptions,
  form,
  onFormChange,
  files,
  onFilesChange,
  fileInputRef,
  onClose,
  onSave,
  commentBody,
  onCommentBodyChange,
  commentFiles,
  onCommentFilesChange,
  commentFileRef,
  onSendComment,
  canCurrentUserApprove,
  usersById,
  approvalNotes,
  onApprovalNotesChange,
  onRequestApproval,
  decisionNotes,
  onDecisionNotesChange,
  onApprove,
  onReject,
  onReturnToWork,
  lifecycleReason,
  onLifecycleReasonChange,
  canManageLifecycle,
  onArchive,
  onCancelTask,
  onRestore,
  onChecklistCreate,
  onChecklistUpdate,
  onChecklistDelete,
}: {
  task: TaskDetail;
  currentUserId: string;
  saving: boolean;
  loading: boolean;
  users: Array<TaskUserOption & { label: string }>;
  departmentOptions: string[];
  form: TaskFormState;
  onFormChange: (next: TaskFormState) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSave: () => void;
  commentBody: string;
  onCommentBodyChange: (value: string) => void;
  commentFiles: File[];
  onCommentFilesChange: (files: File[]) => void;
  commentFileRef: React.RefObject<HTMLInputElement | null>;
  onSendComment: () => void;
  canCurrentUserApprove: boolean;
  usersById: Map<string, TaskUserOption>;
  approvalNotes: string;
  onApprovalNotesChange: (value: string) => void;
  onRequestApproval: () => void;
  decisionNotes: string;
  onDecisionNotesChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onReturnToWork: () => void;
  lifecycleReason: string;
  onLifecycleReasonChange: (value: string) => void;
  canManageLifecycle: boolean;
  onArchive: () => void;
  onCancelTask: () => void;
  onRestore: () => void;
  onChecklistCreate: (title: string) => void;
  onChecklistUpdate: (itemId: string, input: { title?: string; isCompleted?: boolean }) => void;
  onChecklistDelete: (itemId: string) => void;
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
                Acompanhe execução, responsáveis, aprovação e evidências da tarefa em um único lugar.
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
            <QuickMetaCard label="Prazo" value={form.dueDate ? formatDate(form.dueDate) : 'Sem prazo'} />
            <QuickMetaCard label="Responsável" value={usersById.get(form.primaryAssigneeUserId)?.name || 'Não definido'} />
            <QuickMetaCard label="Aprovação" value={approvalStateLabel} />
            <QuickMetaCard
              label="Checklist"
              value={
                task.checklistTotalItems
                  ? `${task.checklistCompletedItems}/${task.checklistTotalItems} concluídos`
                  : 'Sem itens'
              }
            />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1.08fr)_420px]">
          <div className="min-h-0 overflow-y-auto p-6">
            <div className="space-y-5">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Atualizando detalhes...
              </div>
            ) : (
              <>
                <TaskSectionCard
                  title="Visão operacional"
                  description="Edite os principais campos da tarefa sem perder contexto de prazo, prioridade e execução."
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldInput label="Título" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} />
                  <FieldSelect
                    label="Setor"
                    value={form.department}
                    onChange={(value) => onFormChange({ ...form, department: value })}
                    options={departmentOptions.map((department) => ({ value: department, label: department }))}
                  />
                  <FieldSelect label="Prioridade" value={form.priority} onChange={(value) => onFormChange({ ...form, priority: value as TaskPriority })} options={PRIORITY_OPTIONS} />
                  <FieldSelect
                    label="Status"
                    value={form.status}
                    onChange={(value) => onFormChange({ ...form, status: value as TaskStatus })}
                    options={STATUS_OPTIONS.filter((item) => item.value !== 'ARQUIVADA' && item.value !== 'CANCELADA')}
                  />
                  <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onFormChange({ ...form, dueDate: value })} />
                  <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onFormChange({ ...form, startDate: value })} />
                </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Descrição"
                  description="Centralize objetivo, contexto, dependências e critérios de entrega da demanda."
                >
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                    className={textAreaClassName}
                    placeholder="Detalhe a entrega, os passos e o contexto esperado"
                  />
                </TaskSectionCard>

                <TaskSectionCard
                  title="Responsáveis e aprovação"
                  description="Agrupe quem executa, quem colabora e quem aprova a entrega."
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <SearchableUserSelect
                    label="Responsável principal"
                    value={form.primaryAssigneeUserId}
                    onChange={(value) => onFormChange({ ...form, primaryAssigneeUserId: value })}
                    users={users}
                  />
                  <SearchableUserSelect
                    label="Aprovador"
                    value={form.approverUserId}
                    onChange={(value) => onFormChange({ ...form, approverUserId: value })}
                    users={users}
                    emptyLabel="Sem aprovador no momento"
                  />
                  <div className="md:col-span-2">
                    <SearchableUserMultiSelect
                      label="Responsáveis adicionais"
                      currentUserId={currentUserId}
                      users={users}
                      selectedIds={form.assigneeUserIds}
                      onChange={(assigneeUserIds) => onFormChange({ ...form, assigneeUserIds })}
                    />
                  </div>
                </div>
                </TaskSectionCard>

                <TaskSectionCard
                  title="Checklist"
                  description="Quebre a tarefa em subtarefas menores e acompanhe o progresso sem alterar o status automaticamente."
                >
                  <ChecklistSection
                    items={task.checklist}
                    progressPercent={task.checklistProgressPercent}
                    completedItems={task.checklistCompletedItems}
                    totalItems={task.checklistTotalItems}
                    saving={saving}
                    readOnly={taskIsRetired}
                    onCreate={onChecklistCreate}
                    onToggle={(itemId, isCompleted) => onChecklistUpdate(itemId, { isCompleted })}
                    onRename={(itemId, title) => onChecklistUpdate(itemId, { title })}
                    onDelete={onChecklistDelete}
                  />
                </TaskSectionCard>

                <TaskSectionCard
                  title="Arquivos da tarefa"
                  description="Reúna materiais de apoio, evidências de execução e documentos úteis do protocolo."
                >
                  <div className="flex items-center justify-between gap-3">
                    {!taskIsRetired ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Incluir anexo
                      </button>
                    ) : null}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      disabled={taskIsRetired}
                      onChange={(event) => onFilesChange(Array.from(event.target.files || []))}
                    />
                  </div>
                  <TaskAttachmentList
                    items={task.attachments.map((attachment) => ({
                      id: attachment.id,
                      href: `/api/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                      name: attachment.originalName,
                      subtitle: formatDateTime(attachment.createdAt),
                      sizeLabel: formatFileSize(attachment.sizeBytes),
                    }))}
                    emptyLabel="Nenhum anexo enviado para esta tarefa."
                  />
                  <FileList files={files} onRemove={(index) => onFilesChange(files.filter((_, currentIndex) => currentIndex !== index))} />
                </TaskSectionCard>

                <TaskSectionCard
                  title="Comentários"
                  description="Mantenha alinhamentos, devolutivas e decisões recentes sempre visíveis para a equipe."
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {task.comments.length}
                    </span>
                  </div>
                  <div className="mt-4 space-y-4">
                    {taskIsRetired ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        Esta tarefa está encerrada. Restaure a tarefa para voltar a comentar ou anexar novos arquivos.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <textarea
                          value={commentBody}
                          onChange={(event) => onCommentBodyChange(event.target.value)}
                          className={textAreaClassName}
                          placeholder="Escreva um comentário para a equipe"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => commentFileRef.current?.click()}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Anexar comentário
                            </button>
                            <input
                              ref={commentFileRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(event) => onCommentFilesChange(Array.from(event.target.files || []))}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={onSendComment}
                            disabled={saving || !commentBody.trim()}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            Publicar comentário
                          </button>
                        </div>
                        <div className="mt-3">
                          <FileList files={commentFiles} onRemove={(index) => onCommentFilesChange(commentFiles.filter((_, currentIndex) => currentIndex !== index))} />
                        </div>
                      </div>
                    )}

                    {orderedComments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum comentário registrado ainda.
                      </div>
                    ) : (
                      <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                      {orderedComments.map((comment) => (
                        <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {comment.authorUserId === currentUserId ? 'Você' : usersById.get(comment.authorUserId)?.name || 'Usuário'}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{formatDateTime(comment.createdAt)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {comment.attachments.length ? (
                                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-[#17407E]">
                                  {comment.attachments.length} anexo(s)
                                </span>
                              ) : null}
                              {orderedComments[0]?.id === comment.id ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Mais recente</span>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{comment.body}</p>
                          {comment.attachments.length ? (
                            <TaskAttachmentList
                              items={comment.attachments.map((attachment) => ({
                                id: attachment.id,
                                href: `/api/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(comment.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                                name: attachment.originalName,
                                subtitle: 'Anexo do comentário',
                                sizeLabel: formatFileSize(attachment.sizeBytes),
                              }))}
                              emptyLabel=""
                              compact
                            />
                          ) : null}
                        </article>
                      ))}
                      </div>
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
                <h3 className="font-semibold text-slate-900">Resumo rápido</h3>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <InfoRow icon={<Clock3 size={15} />} label="Status" value={statusLabelMap[form.status]} />
                  <InfoRow icon={<AlertCircle size={15} />} label="Prioridade" value={priorityLabelMap[form.priority]} />
                  <InfoRow icon={<Calendar size={15} />} label="Prazo" value={formatDate(form.dueDate || null)} />
                  <InfoRow icon={<UserCheck size={15} />} label="Criada em" value={formatDateTime(task.createdAt)} />
                  <InfoRow icon={<Users size={15} />} label="Comentários" value={String(task.comments.length)} />
                  <InfoRow
                    icon={<CheckCircle2 size={15} />}
                    label="Checklist"
                    value={task.checklistTotalItems ? `${task.checklistCompletedItems}/${task.checklistTotalItems}` : 'Sem itens'}
                  />
                  <InfoRow icon={<FileText size={15} />} label="Anexos" value={String(task.attachments.length)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Fluxo de aprovação</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <InfoRow
                    icon={<ShieldCheck size={15} />}
                    label="Aprovador"
                    value={form.approverUserId ? usersById.get(form.approverUserId)?.name || 'Usuário atribuído' : 'Não definido'}
                  />
                  <InfoRow
                    icon={<CheckCircle2 size={15} />}
                    label="Última decisão"
                    value={approvalStateLabel}
                  />
                  <InfoRow
                    icon={<MessageCircle size={15} />}
                    label="Atualizado em"
                    value={formatDateTime(task.updatedAt)}
                  />
                </div>

                {!taskIsRetired ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={approvalNotes}
                      onChange={(event) => onApprovalNotesChange(event.target.value)}
                      className={textAreaClassName}
                      placeholder="Observação opcional para enviar à aprovação"
                    />
                    <button
                      type="button"
                      onClick={onRequestApproval}
                      disabled={saving || !form.approverUserId}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                      Enviar para aprovação
                    </button>
                  </div>
                ) : null}

                {canCurrentUserApprove && !taskIsRetired ? (
                  <div className="mt-5 space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="text-sm font-semibold text-violet-900">Ação do aprovador</div>
                    <textarea
                      value={decisionNotes}
                      onChange={(event) => onDecisionNotesChange(event.target.value)}
                      className={textAreaClassName}
                      placeholder="Observação opcional para a decisão"
                    />
                    <div className="grid gap-2">
                      <button type="button" onClick={onApprove} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check size={15} />
                        Aprovar e concluir
                      </button>
                      <button type="button" onClick={onReturnToWork} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                        <ChevronRight size={15} />
                        Devolver para execução
                      </button>
                      <button type="button" onClick={onReject} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                        <X size={15} />
                        Reprovar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {canManageLifecycle ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Encerramento da tarefa</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {taskIsRetired
                      ? 'Esta tarefa está encerrada e fora do fluxo operacional padrão.'
                      : 'Use essas ações para retirar a tarefa do fluxo sem apagá-la do histórico.'}
                  </p>
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={lifecycleReason}
                      onChange={(event) => onLifecycleReasonChange(event.target.value)}
                      className={textAreaClassName}
                      placeholder="Motivo do cancelamento ou observação do arquivamento"
                    />
                    {task.status === 'CANCELADA' || task.status === 'ARQUIVADA' ? (
                      <button
                        type="button"
                        onClick={onRestore}
                        disabled={saving}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
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

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Histórico recente</h3>
                <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
                  {orderedActivity.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
                  ) : (
                    <TaskActivityTimeline items={orderedActivity.slice(0, 12)} />
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.title.trim() || !form.department.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar alterações
          </button>
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

function ChecklistSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h4 className="font-semibold text-slate-900">{title}</h4>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

function DraftChecklistSection({
  items,
  onChange,
  saving,
}: {
  items: DraftChecklistItem[];
  onChange: (items: DraftChecklistItem[]) => void;
  saving: boolean;
}) {
  const [newTitle, setNewTitle] = useState('');
  const completedItems = items.filter((item) => item.isCompleted && item.title.trim()).length;
  const totalItems = items.filter((item) => item.title.trim()).length;
  const progressPercent = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    onChange([...items, createDraftChecklistItem(title)]);
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
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
        >
          <Plus size={15} />
          Adicionar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum item no checklist ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
              <input
                type="checkbox"
                checked={item.isCompleted}
                disabled={saving}
                onChange={(event) =>
                  onChange(items.map((current) => (current.id === item.id ? { ...current, isCompleted: event.target.checked } : current)))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#17407E]"
              />
              <input
                value={item.title}
                disabled={saving}
                onChange={(event) =>
                  onChange(items.map((current) => (current.id === item.id ? { ...current, title: event.target.value } : current)))
                }
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${item.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((current) => current.id !== item.id))}
                disabled={saving}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Remover item do checklist"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
      <div>
        <ChecklistProgressInline
          completedItems={completedItems}
          totalItems={totalItems}
          progressPercent={progressPercent}
          detailed
        />
      </div>

      {readOnly ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Esta tarefa está encerrada. Restaure a tarefa para editar o checklist.
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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
          >
            <Plus size={15} />
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
    <div className={`mt-4 grid gap-2 ${compact ? '' : ''}`}>
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 ${compact ? 'bg-slate-50 px-3 py-2.5' : 'bg-slate-50 px-3 py-3'} text-sm text-slate-700 hover:border-slate-300`}
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
          <span className="absolute left-[4px] top-5 h-[calc(100%-0.25rem)] w-px bg-slate-200 last:hidden" />
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputClassName} />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName}>
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FileList({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (!files.length) {
    return <p className="text-sm text-slate-500">Nenhum arquivo pendente.</p>;
  }

  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={() => onRemove(index)} className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50">
            <X size={14} />
          </button>
        </div>
      ))}
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

const previousStatus = (status: TaskStatus): TaskStatus => {
  const order: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA'];
  const index = order.indexOf(status);
  return index > 0 ? order[index - 1] : 'BACKLOG';
};

const canMoveBackward = (status: TaskStatus) => {
  return previousStatus(status) !== status && status !== 'BACKLOG' && !isRetiredTaskStatus(status);
};

const nextStatus = (status: TaskStatus): TaskStatus => {
  const order: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA'];
  const index = order.indexOf(status);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : status;
};

const canMoveForward = (task: TaskSummary) => {
  if (task.status === 'CONCLUIDA' || isRetiredTaskStatus(task.status) || task.status === 'AGUARDANDO_APROVACAO') {
    return false;
  }
  return nextStatus(task.status) !== task.status;
};

const canDropTaskToStatus = (task: TaskSummary, status: TaskStatus) => {
  if (task.status === status || isRetiredTaskStatus(task.status) || isRetiredTaskStatus(status)) return false;
  if (canMoveBackward(task.status) && previousStatus(task.status) === status) return true;
  if (canMoveForward(task) && nextStatus(task.status) === status) return true;
  return false;
};
