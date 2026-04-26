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

type ScopeType = 'global' | 'section' | 'faq' | 'news' | 'catalog';

type EditorialScope = {
  id: string;
  name: string;
  description: string | null;
  scopeType: ScopeType | string;
  scopeRef: string | null;
  isActive: boolean;
  userIds: string[];
  updatedAt: string;
};

type ScopeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
};

type ScopeRefOption = {
  value: string;
  label: string;
};

type ScopeOptions = {
  users: ScopeUser[];
  refs: Record<string, ScopeRefOption[]>;
};

type ScopeForm = {
  id: string | null;
  name: string;
  description: string;
  scopeType: ScopeType;
  scopeRef: string;
  isActive: boolean;
  userIds: string[];
};

type ScopesAdminProps = {
  canEdit: boolean;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const scopeTypes: Array<{ value: ScopeType; label: string; helper: string }> = [
  { value: 'global', label: 'Global', helper: 'Permite editar todos os conteúdos cobertos por escopo.' },
  { value: 'section', label: 'Páginas', helper: 'Permite editar uma página/seção e suas páginas filhas.' },
  { value: 'faq', label: 'FAQ', helper: 'Permite editar todo o FAQ ou uma categoria específica.' },
  { value: 'news', label: 'Notícias', helper: 'Permite editar notícias/avisos por tipo ou categoria.' },
  { value: 'catalog', label: 'Catálogo', helper: 'Permite editar especialidades, procedimentos, exames ou vínculos.' },
];

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  INTRANET: 'Intranet',
};

const emptyForm = (): ScopeForm => ({
  id: null,
  name: '',
  description: '',
  scopeType: 'section',
  scopeRef: '',
  isActive: true,
  userIds: [],
});

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

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

const scopeTypeLabel = (value: string) => scopeTypes.find((item) => item.value === value)?.label || value;

const FieldLabel = ({ label, help }: { label: string; help: string }) => (
  <label className={labelClassName}>
    {label}
    <span title={help} className="inline-flex text-slate-400">
      <Info size={14} />
    </span>
  </label>
);

export function ScopesAdmin({ canEdit }: ScopesAdminProps) {
  const [scopes, setScopes] = useState<EditorialScope[]>([]);
  const [options, setOptions] = useState<ScopeOptions>({ users: [], refs: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState<ScopeForm>(() => emptyForm());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scopesRes, optionsRes] = await Promise.all([
        fetch('/api/admin/intranet/editorial-scopes', { cache: 'no-store' }),
        fetch('/api/admin/intranet/editorial-scopes/options', { cache: 'no-store' }),
      ]);
      if (!scopesRes.ok) throw new Error(await normalizeError(scopesRes));
      if (!optionsRes.ok) throw new Error(await normalizeError(optionsRes));
      const [scopesJson, optionsJson] = await Promise.all([scopesRes.json(), optionsRes.json()]);
      setScopes(Array.isArray(scopesJson.data) ? scopesJson.data : []);
      setOptions({
        users: Array.isArray(optionsJson.data?.users) ? optionsJson.data.users : [],
        refs: optionsJson.data?.refs && typeof optionsJson.data.refs === 'object' ? optionsJson.data.refs : {},
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar escopos editoriais.');
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

  const usersById = useMemo(() => new Map(options.users.map((user) => [user.id, user])), [options.users]);

  const refsForType = useMemo(() => options.refs[form.scopeType] || [], [form.scopeType, options.refs]);

  const refLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const refs of Object.values(options.refs)) {
      for (const ref of refs) labels.set(ref.value, ref.label);
    }
    return labels;
  }, [options.refs]);

  const filteredScopes = useMemo(() => {
    const term = normalizeText(search);
    return scopes.filter((scope) => {
      const users = scope.userIds.map((id) => usersById.get(id)?.name || id).join(' ');
      const haystack = normalizeText(`${scope.name} ${scope.description || ''} ${scope.scopeType} ${scope.scopeRef || ''} ${users}`);
      const matchesSearch = !term || haystack.includes(term);
      const matchesType = typeFilter === 'all' || scope.scopeType === typeFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && scope.isActive) ||
        (statusFilter === 'inactive' && !scope.isActive);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [scopes, search, statusFilter, typeFilter, usersById]);

  const filteredUsers = useMemo(() => {
    const term = normalizeText(userSearch);
    return options.users.filter((user) => !term || normalizeText(`${user.name} ${user.email} ${user.department} ${user.role}`).includes(term));
  }, [options.users, userSearch]);

  const scopeSummary = useMemo(() => {
    const typeLabel = scopeTypeLabel(form.scopeType);
    if (form.scopeType === 'global') return 'Este escopo libera edição em todos os módulos cobertos por governança editorial.';
    if (!form.scopeRef) return `Este escopo libera edição em todo o módulo ${typeLabel}.`;
    return `Este escopo libera edição em ${refLabels.get(form.scopeRef) || form.scopeRef}.`;
  }, [form.scopeRef, form.scopeType, refLabels]);

  const openCreate = () => {
    setForm(emptyForm());
    setUserSearch('');
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (scope: EditorialScope) => {
    setForm({
      id: scope.id,
      name: scope.name,
      description: scope.description || '',
      scopeType: (scope.scopeType || 'section') as ScopeType,
      scopeRef: scope.scopeRef || '',
      isActive: scope.isActive,
      userIds: scope.userIds || [],
    });
    setUserSearch('');
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const updateForm = <K extends keyof ScopeForm>(key: K, value: ScopeForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateScopeType = (scopeType: ScopeType) => {
    setForm((current) => ({ ...current, scopeType, scopeRef: current.scopeType === scopeType ? current.scopeRef : '' }));
  };

  const toggleUser = (userId: string) => {
    setForm((current) => ({
      ...current,
      userIds: current.userIds.includes(userId)
        ? current.userIds.filter((id) => id !== userId)
        : [...current.userIds, userId],
    }));
  };

  const saveScope = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        scopeType: form.scopeType,
        scopeRef: form.scopeType === 'global' ? null : form.scopeRef || null,
        isActive: form.isActive,
        userIds: form.userIds,
      };
      const endpoint = form.id ? `/api/admin/intranet/editorial-scopes/${form.id}` : '/api/admin/intranet/editorial-scopes';
      const res = await fetch(endpoint, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setModalOpen(false);
      setNotice(form.id ? 'Escopo atualizado.' : 'Escopo criado.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar escopo editorial.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (scope: EditorialScope) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/editorial-scopes/${scope.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !scope.isActive }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice(scope.isActive ? 'Escopo inativado.' : 'Escopo ativado.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do escopo.');
    } finally {
      setSaving(false);
    }
  };

  const deleteScope = async (scope: EditorialScope) => {
    if (!canEdit || !window.confirm(`Excluir o escopo "${scope.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/editorial-scopes/${scope.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Escopo excluído.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir escopo editorial.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModuleShell
      icon={ShieldCheck}
      title="Escopos Editoriais"
      description="Defina quais gestores podem editar cada área da intranet, separando governança editorial de audiência pública."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={18} />
            Como funciona
          </button>
          <button type="button" onClick={openCreate} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={18} />
            Novo escopo
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, usuário ou referência" />
          </div>
          <select className={inputClassName} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Todos os tipos</option>
            {scopeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      )}
    >
      <section className="p-5">
        {notice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Escopos cadastrados</h2>
            <p className="text-sm text-slate-500">{filteredScopes.length} escopo(s) encontrado(s)</p>
          </div>
          {loading ? <span className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando</span> : null}
        </div>

        {filteredScopes.length ? (
          <div className="grid gap-3">
            {filteredScopes.map((scope) => {
              const assignedUsers = scope.userIds.map((id) => usersById.get(id)).filter(Boolean) as ScopeUser[];
              return (
                <article key={scope.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{scope.name}</h3>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-[#17407E] ring-1 ring-blue-100">{scopeTypeLabel(scope.scopeType)}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${scope.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                          {scope.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{scope.description || 'Sem descrição.'}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Referência: <strong>{scope.scopeRef ? refLabels.get(scope.scopeRef) || scope.scopeRef : scope.scopeType === 'global' ? 'Todos os módulos' : `Todo o módulo ${scopeTypeLabel(scope.scopeType)}`}</strong>
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Users size={14} /> {assignedUsers.length} usuário(s)</span>
                        <span>Atualizado em {formatDate(scope.updatedAt)}</span>
                      </div>
                      {assignedUsers.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {assignedUsers.slice(0, 5).map((user) => (
                            <span key={user.id} className="rounded-full bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-100">{user.name}</span>
                          ))}
                          {assignedUsers.length > 5 ? <span className="rounded-full bg-slate-50 px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-100">+{assignedUsers.length - 5}</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => toggleActive(scope)} disabled={!canEdit || saving} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                        {scope.isActive ? 'Inativar' : 'Ativar'}
                      </button>
                      <button type="button" onClick={() => openEdit(scope)} disabled={!canEdit} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                        <Edit size={16} />
                        Editar
                      </button>
                      <button type="button" onClick={() => deleteScope(scope)} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            {loading ? 'Carregando escopos editoriais...' : 'Nenhum escopo editorial encontrado.'}
          </div>
        )}
      </section>

      {modalOpen ? (
        <ScopeModal
          form={form}
          canEdit={canEdit}
          saving={saving}
          users={options.users}
          filteredUsers={filteredUsers}
          userSearch={userSearch}
          refsForType={refsForType}
          scopeSummary={scopeSummary}
          onClose={() => setModalOpen(false)}
          onSubmit={saveScope}
          onSearchUsers={setUserSearch}
          onToggleUser={toggleUser}
          onUpdate={updateForm}
          onUpdateScopeType={updateScopeType}
        />
      ) : null}

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    </AdminModuleShell>
  );
}

function ScopeModal({
  form,
  canEdit,
  saving,
  users,
  filteredUsers,
  userSearch,
  refsForType,
  scopeSummary,
  onClose,
  onSubmit,
  onSearchUsers,
  onToggleUser,
  onUpdate,
  onUpdateScopeType,
}: {
  form: ScopeForm;
  canEdit: boolean;
  saving: boolean;
  users: ScopeUser[];
  filteredUsers: ScopeUser[];
  userSearch: string;
  refsForType: ScopeRefOption[];
  scopeSummary: string;
  onClose: () => void;
  onSubmit: () => void;
  onSearchUsers: (value: string) => void;
  onToggleUser: (userId: string) => void;
  onUpdate: <K extends keyof ScopeForm>(key: K, value: ScopeForm[K]) => void;
  onUpdateScopeType: (scopeType: ScopeType) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{form.id ? 'Editar escopo' : 'Novo escopo'}</h2>
            <p className="mt-1 text-sm text-slate-500">Defina o recorte editorial e os usuários que poderão editar esse conteúdo.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div>
              <FieldLabel label="Nome" help="Use um nome que deixe claro a área governada, como Escopo RH ou Serviços - Exames." />
              <input className={inputClassName} value={form.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Ex.: Gestão de RH" />
            </div>
            <div>
              <FieldLabel label="Descrição" help="Explique rapidamente quando esse escopo deve ser usado." />
              <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.description} onChange={(event) => onUpdate('description', event.target.value)} placeholder="Ex.: Permite editar páginas e FAQs da área de RH." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel label="Tipo" help="Define qual módulo ou área da intranet este escopo governa." />
                <select className={inputClassName} value={form.scopeType} onChange={(event) => onUpdateScopeType(event.target.value as ScopeType)}>
                  {scopeTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel label="Referência" help="Sem referência, o escopo vale para todo o tipo escolhido. Com referência, vale apenas para aquele recorte." />
                <select className={inputClassName} value={form.scopeRef} onChange={(event) => onUpdate('scopeRef', event.target.value)} disabled={form.scopeType === 'global'}>
                  <option value="">{form.scopeType === 'global' ? 'Todos os módulos' : `Todo o módulo ${scopeTypeLabel(form.scopeType)}`}</option>
                  {refsForType.map((ref) => <option key={ref.value} value={ref.value}>{ref.label}</option>)}
                </select>
                {form.scopeType !== 'global' && !refsForType.length ? (
                  <p className="mt-2 text-xs text-slate-500">Nenhuma referência disponível para este tipo. Ainda assim é possível salvar o escopo para o módulo inteiro.</p>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" checked={form.isActive} onChange={(event) => onUpdate('isActive', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Escopo ativo</span>
                <span className="text-sm text-slate-500">Escopos inativos não liberam edição para nenhum usuário.</span>
              </span>
            </label>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-[#17407E]">
              <strong>Resumo:</strong> {scopeSummary}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <FieldLabel label="Usuários atribuídos" help="Somente usuários selecionados recebem este escopo. Eles ainda precisam ter permissão de edição no módulo." />
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClassName} pl-9`} value={userSearch} onChange={(event) => onSearchUsers(event.target.value)} placeholder="Buscar usuário" />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {users.length ? filteredUsers.map((user) => (
                <label key={user.id} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50">
                  <input type="checkbox" checked={form.userIds.includes(user.id)} onChange={() => onToggleUser(user.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                    <span className="text-xs text-slate-400">{roleLabels[user.role] || user.role}{user.department ? ` • ${user.department}` : ''}</span>
                  </span>
                </label>
              )) : (
                <div className="p-4 text-sm text-slate-500">Nenhum usuário ativo disponível.</div>
              )}
              {users.length && !filteredUsers.length ? <div className="p-4 text-sm text-slate-500">Nenhum usuário encontrado.</div> : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">{form.userIds.length} usuário(s) selecionado(s).</p>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Fechar</button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar escopo
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Como funcionam os escopos</h2>
            <p className="mt-1 text-sm text-slate-500">Governança editorial define quem edita; audiência define quem vê.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-5 text-sm leading-6 text-slate-600">
          <p><strong className="text-slate-900">Permissão de módulo:</strong> vem do painel e libera acesso à gestão de Páginas, FAQ, Notícias ou Catálogo.</p>
          <p><strong className="text-slate-900">Escopo editorial:</strong> limita o conteúdo específico que o gestor pode alterar dentro desses módulos.</p>
          <p><strong className="text-slate-900">Audiência:</strong> controla quais usuários visualizam conteúdos públicos da intranet. Ela não concede permissão de edição.</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">Exemplos práticos</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Gestor de RH com escopo de páginas da seção RH edita apenas aquela área.</li>
              <li>Gestor do atendimento com escopo de FAQ em uma categoria responde apenas perguntas daquela categoria.</li>
              <li>Gestor de serviços com escopo de catálogo em uma especialidade ajusta apenas aquela página.</li>
            </ul>
          </div>
          <p>Admins continuam com edição total. Usuários sem escopo compatível recebem bloqueio server-side mesmo que tentem salvar por chamada direta.</p>
        </div>
        <div className="flex justify-end border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463]">Entendi</button>
        </div>
      </div>
    </div>
  );
}
