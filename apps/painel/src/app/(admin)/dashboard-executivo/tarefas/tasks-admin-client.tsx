'use client';

import { useEffect, useMemo, useState } from 'react';
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
  CANCELADA: 'Cancelada',
};

const approvalLabelMap: Record<TaskApprovalDecisionStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  DEVOLVIDA: 'Devolvida',
  CANCELADA: 'Cancelada',
};

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

export function ExecutiveTasksClient({ users, departments, canEdit }: ExecutiveTasksClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('KANBAN');
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [summary, setSummary] = useState<TaskDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(defaultForm());

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const queryString = useMemo(() => buildQueryString(filters), [filters]);

  const loadBoard = async (focusTaskId?: string) => {
    setLoading(true);
    setError(null);
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
    }
  };

  const loadTaskDetail = async (taskId: string) => {
    if (!taskId) return;
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const payload = await response.json();
      const task = payload.data as TaskDetail;
      setSelectedTask(task);
      setForm(taskToForm(task));
      setDetailOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da tarefa.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    if (!selectedTaskId) return;
    void loadTaskDetail(selectedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

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
      await loadTaskDetail(selectedTask.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      <section className="rounded-2xl bg-[#053F74] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Dashboard executivo</p>
            <h1 className="mt-3 text-3xl font-semibold">Governança global de tarefas</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-blue-50">
              Acompanhe o ritmo da operação, identifique gargalos por prioridade e aproveite uma visão única das tarefas criadas em toda a intranet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                viewMode === 'KANBAN' ? 'bg-white text-[#17407E]' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <LayoutGrid size={16} />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                viewMode === 'LIST' ? 'bg-white text-[#17407E]' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Table2 size={16} />
              Lista
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            <div className="flex flex-wrap gap-2">
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
              <select value={filters.createdBy} onChange={(event) => setFilters((current) => ({ ...current, createdBy: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os criadores</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <select value={filters.assigneeUserId} onChange={(event) => setFilters((current) => ({ ...current, assigneeUserId: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os responsáveis</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <select value={filters.approverUserId} onChange={(event) => setFilters((current) => ({ ...current, approverUserId: event.target.value }))} className={inputClassName}>
                <option value="all">Todos os aprovadores</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
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
              <div className="grid min-w-[1200px] grid-cols-5 gap-4">
                {boardByColumn.map((column) => (
                  <div key={column.key} className="flex min-h-[540px] flex-col rounded-2xl border border-slate-200 bg-slate-50/70">
                    <div className="border-b border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{column.label}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{column.tasks.length}</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 p-3">
                      {column.tasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma tarefa nesta coluna
                        </div>
                      ) : (
                        column.tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTaskId(task.id)}
                            className={`w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-[#17407E] hover:shadow-md ${
                              selectedTaskId === task.id ? 'border-blue-200 bg-blue-50/50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'
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
                      onClick={() => setSelectedTaskId(task.id)}
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
    <div className={`rounded-2xl border p-5 shadow-sm ${styles[tone]}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/70 ring-1 ring-black/5">{icon}</div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <p className="mt-2 text-sm opacity-80">{helper}</p>
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
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-6 p-5">
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-slate-500">
                <Loader2 size={18} className="mr-2 animate-spin" />
                Atualizando detalhes...
              </div>
            ) : (
              <>
                <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2">
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
                    options={Object.entries(statusLabelMap).map(([value, label]) => ({ value, label }))}
                  />
                  <FieldInput label="Prazo" type="date" value={form.dueDate} onChange={(value) => onFormChange({ ...form, dueDate: value })} disabled={!canEdit} />
                  <FieldInput label="Início" type="date" value={form.startDate} onChange={(value) => onFormChange({ ...form, startDate: value })} disabled={!canEdit} />
                </section>

                <section>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                    disabled={!canEdit}
                    className={`${inputClassName} min-h-[120px] resize-y disabled:bg-slate-50`}
                  />
                </section>

                <section className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
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
                </section>

                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">Comentários</h3>
                      <p className="mt-1 text-sm text-slate-500">Leitura consolidada do contexto registrado na intranet.</p>
                    </div>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{task.comments.length}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {task.comments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum comentário registrado.
                      </div>
                    ) : (
                      task.comments.map((comment) => (
                        <article key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="text-sm font-semibold text-slate-900">{usersById.get(comment.authorUserId)?.name || 'Usuário'}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDateTime(comment.createdAt)}</div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{comment.body}</p>
                          {comment.attachments.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {comment.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={`/api/admin/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(comment.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
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
                <h3 className="font-semibold text-slate-900">Resumo executivo</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <InfoRow icon={<Clock3 size={15} />} label="Status" value={statusLabelMap[task.status]} />
                  <InfoRow icon={<AlertCircle size={15} />} label="Prioridade" value={task.priority} />
                  <InfoRow icon={<Calendar size={15} />} label="Prazo" value={formatDate(task.dueDate)} />
                  <InfoRow icon={<Users size={15} />} label="Criador" value={usersById.get(task.createdBy)?.name || 'Usuário'} />
                  <InfoRow icon={<ShieldCheck size={15} />} label="Aprovador" value={task.approverUserId ? usersById.get(task.approverUserId)?.name || 'Usuário atribuído' : 'Não definido'} />
                  <InfoRow icon={<MessageCircle size={15} />} label="Comentários" value={String(task.comments.length)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Anexos da tarefa</h3>
                <div className="mt-4 space-y-2">
                  {task.attachments.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum anexo enviado para esta tarefa.</p>
                  ) : (
                    task.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/api/admin/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(attachment.id)}`}
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
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">Histórico recente</h3>
                <div className="mt-4 space-y-3">
                  {task.activity.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
                  ) : (
                    task.activity.slice(0, 12).map((item) => (
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
