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
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
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

type TasksClientProps = {
  currentUser: CurrentUser;
};

type FilterKey = 'ALL' | 'CREATED_BY_ME' | 'ASSIGNED_TO_ME' | 'AWAITING_MY_APPROVAL' | 'OVERDUE' | 'DUE_SOON';

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
  { value: 'CANCELADA', label: 'Cancelada' },
];

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'Todas as visíveis' },
  { key: 'CREATED_BY_ME', label: 'Criadas por mim' },
  { key: 'ASSIGNED_TO_ME', label: 'Atribuídas a mim' },
  { key: 'AWAITING_MY_APPROVAL', label: 'Aguardando minha aprovação' },
  { key: 'OVERDUE', label: 'Vencidas' },
  { key: 'DUE_SOON', label: 'A vencer' },
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
  CANCELADA: 'Cancelada',
};

const approvalLabelMap: Record<TaskApprovalDecisionStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  DEVOLVIDA: 'Devolvida',
  CANCELADA: 'Cancelada',
};

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

const isDueSoon = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || status === 'CANCELADA') return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return due >= start && due <= end;
};

const isOverdue = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || status === 'CANCELADA') return false;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TaskFormState>(defaultForm(currentUser));
  const [editForm, setEditForm] = useState<TaskFormState>(defaultForm(currentUser));
  const [newTaskFiles, setNewTaskFiles] = useState<File[]>([]);
  const [detailTaskFiles, setDetailTaskFiles] = useState<File[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
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
      const response = await fetch('/api/tasks', { cache: 'no-store' });
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
    void loadTasks();
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setNewTaskFiles([]);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setNewTaskFiles([]);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTaskFiles([]);
    setCommentFiles([]);
    setCommentBody('');
    setApprovalNotes('');
    setDecisionNotes('');
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

  const canCurrentUserApprove =
    selectedTask?.status === 'AGUARDANDO_APROVACAO' &&
    selectedTask.approverUserId === currentUser.id &&
    selectedTask.latestApproval?.decisionStatus === 'PENDENTE';

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
        <div className="grid gap-3 border-b border-slate-200 p-5 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1fr)]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por protocolo, título, descrição ou setor"
              className={`${inputClassName} pl-9`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
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
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">Cadastro</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
              <input
                value={form.title}
                onChange={(event) => onChange({ ...form, title: event.target.value })}
                className={inputClassName}
                placeholder="Ex.: Atualizar material do setor"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
              <textarea
                value={form.description}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
                className={textAreaClassName}
                placeholder="Contexto, objetivo e anexos relevantes"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldSelect label="Prioridade" value={form.priority} onChange={(value) => onChange({ ...form, priority: value as TaskPriority })} options={PRIORITY_OPTIONS} />
              <FieldSelect label="Status inicial" value={form.status} onChange={(value) => onChange({ ...form, status: value as TaskStatus })} options={STATUS_OPTIONS.filter((item) => item.value !== 'CANCELADA')} />
              <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onChange({ ...form, dueDate: value })} />
              <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onChange({ ...form, startDate: value })} />
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <FieldInput label="Setor" value={form.department} onChange={(value) => onChange({ ...form, department: value })} placeholder="Ex.: RH, Operacional, Financeiro" />
            <SearchableUserSelect
              label="Responsável principal"
              value={form.primaryAssigneeUserId}
              onChange={(value) => onChange({ ...form, primaryAssigneeUserId: value })}
              users={users}
            />
            <SearchableUserMultiSelect
              label="Responsáveis adicionais"
              currentUserId={currentUserId}
              users={users}
              selectedIds={form.assigneeUserIds}
              onChange={(assigneeUserIds) => onChange({ ...form, assigneeUserIds })}
            />
            <SearchableUserSelect
              label="Aprovador"
              value={form.approverUserId}
              onChange={(value) => onChange({ ...form, approverUserId: value })}
              users={users}
              emptyLabel="Sem aprovador no momento"
            />
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">Anexos iniciais</label>
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
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
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
}: {
  task: TaskDetail;
  currentUserId: string;
  saving: boolean;
  loading: boolean;
  users: Array<TaskUserOption & { label: string }>;
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
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.05fr)_420px]">
          <div className="space-y-6 p-5">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Atualizando detalhes...
              </div>
            ) : (
              <>
                <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2">
                  <FieldInput label="Título" value={form.title} onChange={(value) => onFormChange({ ...form, title: value })} />
                  <FieldInput label="Setor" value={form.department} onChange={(value) => onFormChange({ ...form, department: value })} />
                  <FieldSelect label="Prioridade" value={form.priority} onChange={(value) => onFormChange({ ...form, priority: value as TaskPriority })} options={PRIORITY_OPTIONS} />
                  <FieldSelect label="Status" value={form.status} onChange={(value) => onFormChange({ ...form, status: value as TaskStatus })} options={STATUS_OPTIONS} />
                  <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onFormChange({ ...form, dueDate: value })} />
                  <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onFormChange({ ...form, startDate: value })} />
                </section>

                <section>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                    className={textAreaClassName}
                    placeholder="Detalhe a entrega, os passos e o contexto esperado"
                  />
                </section>

                <section className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
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
                </section>

                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">Arquivos da tarefa</h3>
                      <p className="mt-1 text-sm text-slate-500">Anexe materiais de apoio e evidências da execução.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Incluir anexo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => onFilesChange(Array.from(event.target.files || []))}
                    />
                  </div>
                  <div className="mt-4 grid gap-3">
                    {task.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/api/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 hover:border-slate-300"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <Paperclip size={14} className="shrink-0 text-[#17407E]" />
                          <span className="truncate">{attachment.originalName}</span>
                        </span>
                        <span className="text-xs text-slate-500">{Math.round(attachment.sizeBytes / 1024)} KB</span>
                      </a>
                    ))}
                    <FileList files={files} onRemove={(index) => onFilesChange(files.filter((_, currentIndex) => currentIndex !== index))} />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">Comentários</h3>
                      <p className="mt-1 text-sm text-slate-500">Registre alinhamentos, ajustes e devolutivas.</p>
                    </div>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {task.comments.length}
                    </span>
                  </div>
                  <div className="mt-4 space-y-4">
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

                    {task.comments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum comentário registrado ainda.
                      </div>
                    ) : (
                      task.comments.map((comment) => (
                        <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {comment.authorUserId === currentUserId
                                  ? 'Você'
                                  : usersById.get(comment.authorUserId)?.name || 'Usuário'}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{formatDateTime(comment.createdAt)}</div>
                            </div>
                            {comment.attachments.length ? (
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-[#17407E]">
                                {comment.attachments.length} anexo(s)
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{comment.body}</p>
                          {comment.attachments.length ? (
                            <div className="mt-3 grid gap-2">
                              {comment.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={`/api/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(comment.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
                                >
                                  <Paperclip size={14} className="text-[#17407E]" />
                                  {attachment.originalName}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="border-l border-slate-200 bg-slate-50/60 p-5">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Resumo rápido</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <InfoRow icon={<Clock3 size={15} />} label="Status" value={statusLabelMap[task.status]} />
                  <InfoRow icon={<AlertCircle size={15} />} label="Prioridade" value={task.priority} />
                  <InfoRow icon={<Calendar size={15} />} label="Prazo" value={formatDate(task.dueDate)} />
                  <InfoRow icon={<UserCheck size={15} />} label="Criada em" value={formatDateTime(task.createdAt)} />
                  <InfoRow icon={<Users size={15} />} label="Comentários" value={String(task.comments.length)} />
                  <InfoRow icon={<FileText size={15} />} label="Anexos" value={String(task.attachments.length)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Fluxo de aprovação</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <InfoRow
                    icon={<ShieldCheck size={15} />}
                    label="Aprovador"
                    value={task.approverUserId ? usersById.get(task.approverUserId)?.name || 'Usuário atribuído' : 'Não definido'}
                  />
                  <InfoRow
                    icon={<CheckCircle2 size={15} />}
                    label="Última decisão"
                    value={task.latestApproval ? approvalLabelMap[task.latestApproval.decisionStatus] : 'Sem ciclo aberto'}
                  />
                  <InfoRow
                    icon={<MessageCircle size={15} />}
                    label="Atualizado em"
                    value={formatDateTime(task.updatedAt)}
                  />
                </div>

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

                {canCurrentUserApprove ? (
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

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Histórico recente</h3>
                <div className="mt-4 space-y-3">
                  {task.activity.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
                  ) : (
                    task.activity.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">{item.action}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
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
  return previousStatus(status) !== status && status !== 'BACKLOG' && status !== 'CANCELADA';
};

const nextStatus = (status: TaskStatus): TaskStatus => {
  const order: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA'];
  const index = order.indexOf(status);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : status;
};

const canMoveForward = (task: TaskSummary) => {
  if (task.status === 'CONCLUIDA' || task.status === 'CANCELADA' || task.status === 'AGUARDANDO_APROVACAO') {
    return false;
  }
  return nextStatus(task.status) !== task.status;
};

const canDropTaskToStatus = (task: TaskSummary, status: TaskStatus) => {
  if (task.status === status || status === 'CANCELADA') return false;
  if (canMoveBackward(task.status) && previousStatus(task.status) === status) return true;
  if (canMoveForward(task) && nextStatus(task.status) === status) return true;
  return false;
};
