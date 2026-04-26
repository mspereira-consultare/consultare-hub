'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleHelp,
  Edit,
  Info,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type AudienceRule = {
  id?: string;
  ruleType: 'role' | 'department' | 'team' | string;
  ruleValue: string;
  isActive: boolean;
};

type AudienceAssignment = {
  id: string;
  userId: string;
};

type AudienceGroup = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  rules: AudienceRule[];
  assignments: AudienceAssignment[];
  updatedAt: string;
};

type AudienceUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
};

type AudienceForm = {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
  userIds: string[];
  rules: AudienceRule[];
};

type AudiencesAdminProps = {
  canEdit: boolean;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  INTRANET: 'Intranet',
};

const blankForm = (): AudienceForm => ({
  id: null,
  name: '',
  description: '',
  isActive: true,
  userIds: [],
  rules: [],
});

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const ruleLabel = (rule: AudienceRule) => {
  if (rule.ruleType === 'role') return `Perfil: ${roleLabels[rule.ruleValue] || rule.ruleValue}`;
  if (rule.ruleType === 'department') return `Departamento: ${rule.ruleValue}`;
  return `${rule.ruleType}: ${rule.ruleValue}`;
};

export function AudiencesAdmin({ canEdit }: AudiencesAdminProps) {
  const [audiences, setAudiences] = useState<AudienceGroup[]>([]);
  const [users, setUsers] = useState<AudienceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState<AudienceForm>(() => blankForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [audiencesRes, usersRes] = await Promise.all([
        fetch('/api/admin/intranet/audiences', { cache: 'no-store' }),
        fetch('/api/admin/intranet/audiences/users', { cache: 'no-store' }),
      ]);
      if (!audiencesRes.ok) throw new Error(await normalizeError(audiencesRes));
      if (!usersRes.ok) throw new Error(await normalizeError(usersRes));
      const [audiencesJson, usersJson] = await Promise.all([audiencesRes.json(), usersRes.json()]);
      setAudiences(Array.isArray(audiencesJson.data) ? audiencesJson.data : []);
      setUsers(Array.isArray(usersJson.data) ? usersJson.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar audiências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const departments = useMemo(
    () => Array.from(new Set(users.map((user) => user.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [users]
  );

  const filteredAudiences = useMemo(() => {
    const term = normalizeText(search);
    return audiences.filter((audience) => {
      const haystack = normalizeText(`${audience.name} ${audience.description || ''} ${audience.rules.map(ruleLabel).join(' ')}`);
      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && audience.isActive) ||
        (statusFilter === 'inactive' && !audience.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [audiences, search, statusFilter]);

  const matchedPreviewUsers = useMemo(() => {
    const ids = new Set(form.userIds);
    for (const rule of form.rules.filter((item) => item.isActive && item.ruleValue)) {
      for (const user of users) {
        if (rule.ruleType === 'role' && normalizeText(user.role) === normalizeText(rule.ruleValue)) ids.add(user.id);
        if (rule.ruleType === 'department' && normalizeText(user.department) === normalizeText(rule.ruleValue)) ids.add(user.id);
      }
    }
    return Array.from(ids).map((id) => usersById.get(id)).filter(Boolean) as AudienceUser[];
  }, [form.rules, form.userIds, users, usersById]);

  const filteredUsers = useMemo(() => {
    const term = normalizeText(userSearch);
    return users.filter((user) => !term || normalizeText(`${user.name} ${user.email} ${user.department} ${user.role}`).includes(term));
  }, [userSearch, users]);

  const openCreate = () => {
    setForm(blankForm());
    setUserSearch('');
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (audience: AudienceGroup) => {
    setForm({
      id: audience.id,
      name: audience.name,
      description: audience.description || '',
      isActive: audience.isActive,
      userIds: audience.assignments.map((assignment) => assignment.userId),
      rules: audience.rules.map((rule) => ({
        ruleType: rule.ruleType,
        ruleValue: rule.ruleValue,
        isActive: rule.isActive,
      })),
    });
    setUserSearch('');
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const updateForm = <K extends keyof AudienceForm>(key: K, value: AudienceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleUser = (userId: string) => {
    setForm((current) => ({
      ...current,
      userIds: current.userIds.includes(userId)
        ? current.userIds.filter((id) => id !== userId)
        : [...current.userIds, userId],
    }));
  };

  const updateRule = (index: number, patch: Partial<AudienceRule>) => {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule),
    }));
  };

  const saveAudience = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        isActive: form.isActive,
        userIds: form.userIds,
        rules: form.rules.filter((rule) => rule.ruleValue.trim()),
      };
      const endpoint = form.id ? `/api/admin/intranet/audiences/${form.id}` : '/api/admin/intranet/audiences';
      const res = await fetch(endpoint, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setModalOpen(false);
      setNotice(form.id ? 'Audiência atualizada.' : 'Audiência criada.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar audiência.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAudience = async (audience: AudienceGroup) => {
    if (!canEdit || !window.confirm(`Excluir a audiência "${audience.name}"? Ela será removida dos conteúdos vinculados.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/audiences/${audience.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Audiência excluída.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir audiência.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (audience: AudienceGroup) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/audiences/${audience.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: audience.name,
          description: audience.description || '',
          isActive: !audience.isActive,
          userIds: audience.assignments.map((assignment) => assignment.userId),
          rules: audience.rules,
        }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice(audience.isActive ? 'Audiência inativada.' : 'Audiência ativada.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status da audiência.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModuleShell
      icon={Users}
      title="Audiências"
      description="Defina quais usuários enxergam páginas, FAQs, notícias e itens de navegação da intranet."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={16} />
            Como funciona
          </button>
          <button type="button" onClick={openCreate} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} />
            Nova audiência
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por audiência, descrição ou regra" className={`${inputClassName} pl-9`} />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClassName}>
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </div>
      )}
    >
      <section className="p-5">
        {notice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
        {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando audiências...
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAudiences.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Nenhuma audiência encontrada.
              </div>
            ) : null}
            {filteredAudiences.map((audience) => (
              <article key={audience.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">{audience.name}</h2>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${audience.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {audience.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    {audience.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{audience.description}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{audience.assignments.length} usuário(s) manuais</span>
                      <span>{audience.rules.length} regra(s)</span>
                      <span>Atualizada em {formatDate(audience.updatedAt)}</span>
                    </div>
                    {audience.rules.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {audience.rules.map((rule, index) => (
                          <span key={`${rule.ruleType}-${rule.ruleValue}-${index}`} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#17407E]">
                            {ruleLabel(rule)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => toggleActive(audience)} disabled={!canEdit || saving} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                      {audience.isActive ? 'Inativar' : 'Ativar'}
                    </button>
                    <button type="button" onClick={() => openEdit(audience)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      <Edit size={15} />
                      Editar
                    </button>
                    <button type="button" onClick={() => deleteAudience(audience)} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen ? (
        <AudienceModal
          form={form}
          users={users}
          departments={departments}
          filteredUsers={filteredUsers}
          previewUsers={matchedPreviewUsers}
          userSearch={userSearch}
          canEdit={canEdit}
          saving={saving}
          onUserSearch={setUserSearch}
          onUpdate={updateForm}
          onToggleUser={toggleUser}
          onUpdateRule={updateRule}
          onAddRule={() => updateForm('rules', [...form.rules, { ruleType: 'department', ruleValue: '', isActive: true }])}
          onRemoveRule={(index) => updateForm('rules', form.rules.filter((_, ruleIndex) => ruleIndex !== index))}
          onClose={() => setModalOpen(false)}
          onSubmit={saveAudience}
        />
      ) : null}

      <AudienceHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AdminModuleShell>
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className={labelClassName}>
      {label}
      <span title={help}>
        <Info size={13} className="text-slate-400" aria-label={help} />
      </span>
    </span>
  );
}

function AudienceModal({
  form,
  users,
  departments,
  filteredUsers,
  previewUsers,
  userSearch,
  canEdit,
  saving,
  onUserSearch,
  onUpdate,
  onToggleUser,
  onUpdateRule,
  onAddRule,
  onRemoveRule,
  onClose,
  onSubmit,
}: {
  form: AudienceForm;
  users: AudienceUser[];
  departments: string[];
  filteredUsers: AudienceUser[];
  previewUsers: AudienceUser[];
  userSearch: string;
  canEdit: boolean;
  saving: boolean;
  onUserSearch: (value: string) => void;
  onUpdate: <K extends keyof AudienceForm>(key: K, value: AudienceForm[K]) => void;
  onToggleUser: (userId: string) => void;
  onUpdateRule: (index: number, patch: Partial<AudienceRule>) => void;
  onAddRule: () => void;
  onRemoveRule: (index: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{form.id ? 'Editar audiência' : 'Nova audiência'}</h2>
            <p className="mt-1 text-sm text-slate-500">Combine usuários selecionados manualmente com regras por perfil ou departamento.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid max-h-[72vh] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <FieldLabel label="Nome" help="Nome exibido aos gestores ao selecionar audiências em páginas, notícias, FAQ e navegação." />
                <input className={inputClassName} value={form.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Ex.: Recepção" />
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" checked={form.isActive} onChange={(event) => onUpdate('isActive', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                <span>
                  <FieldLabel label="Audiência ativa" help="Audiências inativas não devem ser usadas em novos conteúdos e podem ser desconsideradas na gestão." />
                  <span className="text-sm text-slate-600">{form.isActive ? 'Ativa' : 'Inativa'}</span>
                </span>
              </label>
            </div>

            <label className="block">
              <FieldLabel label="Descrição" help="Explique quando este grupo deve ser usado para reduzir erro de seleção." />
              <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.description} onChange={(event) => onUpdate('description', event.target.value)} placeholder="Ex.: Usuários da recepção das unidades." />
            </label>

            <section className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <FieldLabel label="Regras automáticas" help="Incluem usuários ativos que tenham o perfil ou departamento indicado." />
                  <p className="text-sm text-slate-500">Use regras para evitar manutenção manual quando o grupo segue um atributo do cadastro.</p>
                </div>
                <button type="button" onClick={onAddRule} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Adicionar regra
                </button>
              </div>
              <div className="space-y-2">
                {form.rules.length === 0 ? <p className="text-sm text-slate-500">Nenhuma regra configurada.</p> : null}
                {form.rules.map((rule, index) => (
                  <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <select className={inputClassName} value={rule.ruleType} onChange={(event) => onUpdateRule(index, { ruleType: event.target.value, ruleValue: '' })}>
                      <option value="department">Departamento</option>
                      <option value="role">Perfil</option>
                    </select>
                    {rule.ruleType === 'role' ? (
                      <select className={inputClassName} value={rule.ruleValue} onChange={(event) => onUpdateRule(index, { ruleValue: event.target.value })}>
                        <option value="">Selecione um perfil</option>
                        {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    ) : (
                      <select className={inputClassName} value={rule.ruleValue} onChange={(event) => onUpdateRule(index, { ruleValue: event.target.value })}>
                        <option value="">Selecione um departamento</option>
                        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => onRemoveRule(index)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <FieldLabel label="Usuários manuais" help="Inclui usuários específicos independentemente do perfil ou departamento." />
              <div className="relative mt-2">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={userSearch} onChange={(event) => onUserSearch(event.target.value)} placeholder="Buscar usuário por nome, email, perfil ou departamento" className={`${inputClassName} pl-9`} />
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredUsers.map((user) => (
                  <label key={user.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-50">
                    <input type="checkbox" checked={form.userIds.includes(user.id)} onChange={() => onToggleUser(user.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{user.name}</span>
                      <span className="block truncate text-xs text-slate-500">{user.email}</span>
                      <span className="mt-1 block text-xs text-slate-500">{roleLabels[user.role] || user.role} • {user.department || 'Sem departamento'}</span>
                    </span>
                  </label>
                ))}
                {filteredUsers.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum usuário ativo encontrado.</p> : null}
              </div>
            </section>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-[#17407E]">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} />
                Prévia da audiência
              </div>
              <p className="mt-2 text-sm leading-6">Usuários manuais e usuários que batem com as regras entram no grupo.</p>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">{previewUsers.length} usuário(s) contemplado(s)</p>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {previewUsers.slice(0, 40).map((user) => (
                  <div key={user.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.department || 'Sem departamento'} • {roleLabels[user.role] || user.role}</p>
                  </div>
                ))}
                {previewUsers.length > 40 ? <p className="text-xs text-slate-500">+ {previewUsers.length - 40} usuário(s)</p> : null}
                {previewUsers.length === 0 ? <p className="text-sm text-slate-500">Nenhum usuário entra nesta audiência ainda.</p> : null}
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Total de usuários ativos disponíveis: {users.length}</p>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancelar
          </button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar audiência
          </button>
        </div>
      </div>
    </div>
  );
}

function AudienceHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#17407E]">
              <CircleHelp size={14} />
              Como funciona
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Audiências da intranet</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Audiências controlam visibilidade de conteúdos públicos autenticados. Elas não substituem permissões administrativas.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[
            ['Sem audiência', 'Conteúdos sem audiência ficam visíveis para todos os usuários autenticados.'],
            ['Usuários manuais', 'Use quando uma pessoa específica precisa entrar em um grupo, independente do setor.'],
            ['Regras automáticas', 'Use perfil ou departamento para compor grupos de forma mais sustentável.'],
            ['Gestão', 'Acesso a /gestao continua sendo definido pelas permissões de módulo do usuário.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
