'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import type {
  EmployeeLifecycleCase,
  EmployeeLifecycleCaseType,
  EmployeeLifecycleStage,
  EmployeeLifecycleTask,
  EmployeeLifecycleTaskStatus,
  EmployeeListItem,
} from '@/lib/colaboradores/types';

const stageLabels: Record<EmployeeLifecycleStage, string> = {
  PRE_ADMISSION: 'Pré-admissão',
  ADMISSION_IN_PROGRESS: 'Admissão em andamento',
  TERMINATION_IN_PROGRESS: 'Desligamento em andamento',
  CLOSED: 'Encerrados',
};

const caseTypeLabels: Record<EmployeeLifecycleCaseType, string> = {
  ADMISSION: 'Admissão',
  TERMINATION: 'Desligamento',
};

const taskStatusLabels: Record<EmployeeLifecycleTaskStatus, string> = {
  PENDING: 'Pendente',
  DONE: 'Concluída',
  BLOCKED: 'Com bloqueio',
  WAIVED: 'Dispensada',
};

const stageOrder: EmployeeLifecycleStage[] = ['PRE_ADMISSION', 'ADMISSION_IN_PROGRESS', 'TERMINATION_IN_PROGRESS', 'CLOSED'];
const taskStatuses: EmployeeLifecycleTaskStatus[] = ['PENDING', 'DONE', 'BLOCKED', 'WAIVED'];

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const employeeMeta = (employee: EmployeeListItem) =>
  [employee.cpf || 'CPF não informado', employee.email, employee.status].filter(Boolean).join(' · ');

const stageToneMap: Record<EmployeeLifecycleStage, string> = {
  PRE_ADMISSION: 'border-blue-200 bg-blue-50 text-[#17407E]',
  ADMISSION_IN_PROGRESS: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  TERMINATION_IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-700',
  CLOSED: 'border-slate-200 bg-slate-100 text-slate-600',
};

const taskToneMap: Record<EmployeeLifecycleTaskStatus, string> = {
  PENDING: 'border-slate-200 bg-slate-50 text-slate-600',
  DONE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  BLOCKED: 'border-rose-200 bg-rose-50 text-rose-700',
  WAIVED: 'border-blue-200 bg-blue-50 text-[#17407E]',
};

type LifecycleFormState = {
  employeeId: string;
  caseType: EmployeeLifecycleCaseType;
  stage: EmployeeLifecycleStage;
  ownerName: string;
  targetDate: string;
  notes: string;
};

const emptyLifecycleForm = (): LifecycleFormState => ({
  employeeId: '',
  caseType: 'ADMISSION',
  stage: 'PRE_ADMISSION',
  ownerName: '',
  targetDate: '',
  notes: '',
});

type EmployeeListPayload = {
  status: string;
  data: EmployeeListItem[];
  pagination?: {
    totalPages?: number;
  };
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown })?.error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

async function fetchAllEmployeesForLifecycle() {
  const firstPage = await fetchJson<EmployeeListPayload>('/api/admin/colaboradores?status=all&page=1&pageSize=100');
  const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages || 1));
  if (totalPages <= 1) return firstPage.data || [];

  const nextPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fetchJson<EmployeeListPayload>(`/api/admin/colaboradores?status=all&page=${index + 2}&pageSize=100`),
    ),
  );

  return [firstPage, ...nextPages].flatMap((page) => page.data || []);
}

function EmployeeSearchableSelect({
  employees,
  value,
  disabled,
  onChange,
}: {
  employees: EmployeeListItem[];
  value: string;
  disabled: boolean;
  onChange: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === value) || null,
    [employees, value],
  );

  const filteredEmployees = useMemo(() => {
    const query = normalizeSearch(search.trim());
    const list = query
      ? employees.filter((employee) =>
          normalizeSearch(`${employee.fullName} ${employee.cpf || ''} ${employee.email || ''} ${employee.status}`).includes(query),
        )
      : employees;
    return list.slice(0, 60);
  }, [employees, search]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) setSearch('');
          setOpen((current) => !current);
        }}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none transition hover:bg-slate-50 focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className={selectedEmployee ? 'truncate text-slate-800' : 'truncate text-slate-500'}>
          {selectedEmployee ? selectedEmployee.fullName : 'Pesquisar colaborador'}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:min-w-[320px]">
          <div className="border-b border-slate-100 bg-slate-50 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search size={14} className="text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Digite nome, CPF ou e-mail..."
                className="w-full bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
              {search ? (
                <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600" aria-label="Limpar busca">
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filteredEmployees.length ? (
              filteredEmployees.map((employee) => {
                const selected = value === employee.id;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => {
                      onChange(employee.id);
                      setSearch('');
                      setOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 border-t border-slate-50 px-4 py-2.5 text-left transition hover:bg-blue-50 hover:text-[#17407E] ${
                      selected ? 'bg-blue-50 text-[#17407E]' : 'text-slate-700'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{employee.fullName}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{employeeMeta(employee)}</span>
                    </span>
                    {selected ? <Check size={14} className="mt-0.5 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-4 text-center text-xs text-slate-400">Nenhum colaborador encontrado.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeLifecyclePanel({
  canEdit,
  onOpenEmployee,
  onCreateEmployee,
}: {
  canEdit: boolean;
  onOpenEmployee: (employeeId: string) => void;
  onCreateEmployee: () => void;
}) {
  const [cases, setCases] = useState<EmployeeLifecycleCase[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [form, setForm] = useState<LifecycleFormState>(emptyLifecycleForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const groupedCases = useMemo(
    () =>
      stageOrder.map((stage) => ({
        stage,
        items: cases.filter((item) => item.stage === stage),
      })),
    [cases],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [casesPayload, employeesPayload] = await Promise.all([
        fetchJson<{ status: string; data: EmployeeLifecycleCase[] }>('/api/admin/colaboradores/lifecycle'),
        fetchAllEmployeesForLifecycle(),
      ]);
      setCases(casesPayload.data || []);
      setEmployees(employeesPayload || []);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, 'Falha ao carregar admissões e desligamentos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const updateCaseList = (nextCases: EmployeeLifecycleCase[]) => {
    setCases(nextCases || []);
  };

  const createCase = async () => {
    if (!form.employeeId) {
      setError('Selecione um colaborador para iniciar o processo.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeLifecycleCase[] }>('/api/admin/colaboradores/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      updateCaseList(payload.data);
      setForm(emptyLifecycleForm());
      setNotice('Processo criado com checklist inicial.');
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, 'Falha ao criar processo.'));
    } finally {
      setSaving(false);
    }
  };

  const updateCase = async (item: EmployeeLifecycleCase, patch: Partial<LifecycleFormState> & { closeCase?: boolean }) => {
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeLifecycleCase[] }>(
        `/api/admin/colaboradores/lifecycle/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      updateCaseList(payload.data);
      setNotice(patch.closeCase ? 'Processo encerrado.' : 'Processo atualizado.');
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, 'Falha ao atualizar processo.'));
    }
  };

  const updateTask = async (item: EmployeeLifecycleCase, task: EmployeeLifecycleTask, patch: Partial<EmployeeLifecycleTask>) => {
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeLifecycleCase[] }>(
        `/api/admin/colaboradores/lifecycle/${encodeURIComponent(item.id)}/tasks`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, ...patch }),
        },
      );
      updateCaseList(payload.data);
    } catch (updateError: unknown) {
      setError(getErrorMessage(updateError, 'Falha ao atualizar tarefa.'));
    }
  };

  const resolvedStage = form.caseType === 'TERMINATION' ? 'TERMINATION_IN_PROGRESS' : form.stage;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Controle operacional</div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Admissões & Demissões</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Workflow operacional em cima do cadastro oficial. O checklist referencia documentos, uniforme, armário e campos do colaborador, sem criar uma segunda fonte da verdade.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>

        {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2 text-slate-600 shadow-sm ring-1 ring-slate-200">
              <Plus size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Novo processo</h3>
              <p className="mt-1 text-xs text-slate-500">
                Se for uma pré-admissão, crie primeiro o colaborador com status Pré-admissão e depois inicie o processo aqui.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-12">
            <label className="lg:col-span-3">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Colaborador</span>
              <EmployeeSearchableSelect
                employees={employees}
                value={form.employeeId}
                disabled={!canEdit}
                onChange={(employeeId) => setForm((current) => ({ ...current, employeeId }))}
              />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
              <select
                value={form.caseType}
                onChange={(event) => {
                  const caseType = event.target.value as EmployeeLifecycleCaseType;
                  setForm((current) => ({ ...current, caseType, stage: caseType === 'TERMINATION' ? 'TERMINATION_IN_PROGRESS' : 'PRE_ADMISSION' }));
                }}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
              >
                <option value="ADMISSION">Admissão</option>
                <option value="TERMINATION">Desligamento</option>
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Etapa</span>
              <select
                value={resolvedStage}
                onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value as EmployeeLifecycleStage }))}
                disabled={!canEdit || form.caseType === 'TERMINATION'}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 disabled:bg-slate-100"
              >
                <option value="PRE_ADMISSION">Pré-admissão</option>
                <option value="ADMISSION_IN_PROGRESS">Admissão em andamento</option>
                <option value="TERMINATION_IN_PROGRESS">Desligamento em andamento</option>
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responsável</span>
              <input value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} disabled={!canEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Prazo</span>
              <input type="date" value={form.targetDate} onChange={(event) => setForm((current) => ({ ...current, targetDate: event.target.value }))} disabled={!canEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" />
            </label>
            <div className="flex items-end lg:col-span-1">
              <button type="button" onClick={createCase} disabled={!canEdit || saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        {groupedCases.map((group) => (
          <section key={group.stage} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{stageLabels[group.stage]}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stageToneMap[group.stage]}`}>{group.items.length}</span>
              </div>
            </div>
            <div className="space-y-3 p-3">
              {loading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">Carregando...</div>
              ) : group.items.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">Nenhum processo nesta etapa.</div>
              ) : (
                group.items.map((item) => (
                  <LifecycleCaseCard
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    onOpenEmployee={onOpenEmployee}
                    onUpdateCase={updateCase}
                    onUpdateTask={updateTask}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
        Precisa iniciar uma pré-admissão que ainda não está na lista? Use <button type="button" onClick={onCreateEmployee} className="font-semibold text-[#17407E] hover:underline">Novo colaborador</button> e selecione o status Pré-admissão.
      </div>
    </div>
  );
}

function LifecycleCaseCard({
  item,
  canEdit,
  onOpenEmployee,
  onUpdateCase,
  onUpdateTask,
}: {
  item: EmployeeLifecycleCase;
  canEdit: boolean;
  onOpenEmployee: (employeeId: string) => void;
  onUpdateCase: (item: EmployeeLifecycleCase, patch: Partial<LifecycleFormState> & { closeCase?: boolean }) => void;
  onUpdateTask: (item: EmployeeLifecycleCase, task: EmployeeLifecycleTask, patch: Partial<EmployeeLifecycleTask>) => void;
}) {
  const progressLabel = item.totalTasks ? `${item.doneTasks}/${item.totalTasks}` : '0/0';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{item.employeeName}</div>
          <div className="mt-1 text-xs text-slate-500">{item.employeeCpf || 'CPF não informado'} · {caseTypeLabels[item.caseType]}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageToneMap[item.stage]}`}>{stageLabels[item.stage]}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
          <div className="font-semibold text-slate-800">{progressLabel}</div>
          <div className="text-slate-500">tarefas</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
          <div className="font-semibold text-slate-800">{item.sourcePendingTasks}</div>
          <div className="text-slate-500">fontes</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
          <div className="font-semibold text-slate-800">{item.blockedTasks}</div>
          <div className="text-slate-500">bloq.</div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div>Responsável: <span className="font-medium text-slate-700">{item.ownerName || '-'}</span></div>
        <div>Prazo: <span className="font-medium text-slate-700">{item.targetDate || '-'}</span></div>
      </div>

      {canEdit && item.stage !== 'CLOSED' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={item.stage} onChange={(event) => onUpdateCase(item, { stage: event.target.value as EmployeeLifecycleStage })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
            {item.caseType === 'ADMISSION' ? <option value="PRE_ADMISSION">Pré-admissão</option> : null}
            {item.caseType === 'ADMISSION' ? <option value="ADMISSION_IN_PROGRESS">Admissão em andamento</option> : null}
            {item.caseType === 'TERMINATION' ? <option value="TERMINATION_IN_PROGRESS">Desligamento em andamento</option> : null}
          </select>
          <button type="button" onClick={() => onUpdateCase(item, { closeCase: true })} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={12} />
            Encerrar
          </button>
        </div>
      ) : null}

      <button type="button" onClick={() => onOpenEmployee(item.employeeId)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#17407E] hover:underline">
        <UserRound size={12} />
        Abrir cadastro oficial
      </button>

      <div className="mt-3 space-y-2">
        {item.tasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-800">{task.title}</div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">{task.sourceSummary}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${task.sourceReady ? 'border-emerald-200 bg-white text-emerald-700' : 'border-amber-200 bg-white text-amber-700'}`}>
                {task.sourceReady ? 'fonte ok' : 'fonte pend.'}
              </span>
            </div>
            <div className="mt-2 grid gap-2">
              <select
                value={task.status}
                disabled={!canEdit}
                onChange={(event) => onUpdateTask(item, task, { status: event.target.value as EmployeeLifecycleTaskStatus })}
                className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${taskToneMap[task.status]}`}
              >
                {taskStatuses.map((status) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}
              </select>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                <input
                  disabled={!canEdit}
                  onBlur={(event) => onUpdateTask(item, task, { ownerName: event.target.value })}
                  placeholder="Responsável"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                  defaultValue={task.ownerName || ''}
                />
                <input
                  type="date"
                  disabled={!canEdit}
                  defaultValue={task.dueDate || ''}
                  onBlur={(event) => onUpdateTask(item, task, { dueDate: event.target.value })}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                />
              </div>
              <textarea
                disabled={!canEdit}
                defaultValue={task.notes || ''}
                onBlur={(event) => onUpdateTask(item, task, { notes: event.target.value })}
                placeholder="Observação"
                rows={2}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
