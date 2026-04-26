'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleHelp, Edit, Loader2, MessageCircle, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type ChatUser = {
  id: string;
  name: string;
  email: string;
  department: string;
};

type ChatMember = {
  userId: string;
  name: string;
  role: string;
  department: string;
};

type ChatConversation = {
  id: string;
  conversationType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isAnnouncementOnly: boolean;
  memberCount: number;
  members: ChatMember[];
  updatedAt: string;
};

type ChatForm = {
  id: string | null;
  name: string;
  description: string;
  conversationType: string;
  isActive: boolean;
  isAnnouncementOnly: boolean;
  memberIds: string[];
  moderatorIds: string[];
  ownerIds: string[];
};

type ChatAdminProps = {
  canEdit: boolean;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const emptyForm = (): ChatForm => ({
  id: null,
  name: '',
  description: '',
  conversationType: 'custom_group',
  isActive: true,
  isAnnouncementOnly: false,
  memberIds: [],
  moderatorIds: [],
  ownerIds: [],
});

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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

const typeLabel = (type: string, announcementOnly: boolean) => {
  if (type === 'dm') return 'DM';
  if (type === 'department_channel') return 'Setor';
  if (announcementOnly || type === 'announcement_channel') return 'Comunicados';
  return 'Grupo';
};

export function ChatAdmin({ canEdit }: ChatAdminProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState<ChatForm>(() => emptyForm());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conversationsRes, usersRes] = await Promise.all([
        fetch('/api/admin/intranet/chat/conversations', { cache: 'no-store' }),
        fetch('/api/chat/users', { cache: 'no-store' }),
      ]);
      if (!conversationsRes.ok) throw new Error(await normalizeError(conversationsRes));
      if (!usersRes.ok) throw new Error(await normalizeError(usersRes));
      const [conversationsJson, usersJson] = await Promise.all([conversationsRes.json(), usersRes.json()]);
      setConversations(Array.isArray(conversationsJson.data) ? conversationsJson.data : []);
      setUsers(Array.isArray(usersJson.data) ? usersJson.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar chat.');
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

  const filteredConversations = useMemo(() => {
    const term = normalizeText(search);
    return conversations.filter((conversation) => {
      const matchesSearch = !term || normalizeText(`${conversation.name} ${conversation.description || ''} ${conversation.members.map((member) => member.name).join(' ')}`).includes(term);
      const matchesType =
        typeFilter === 'all' ||
        conversation.conversationType === typeFilter ||
        (typeFilter === 'announcement_channel' && conversation.isAnnouncementOnly);
      return matchesSearch && matchesType;
    });
  }, [conversations, search, typeFilter]);

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (conversation: ChatConversation) => {
    setForm({
      id: conversation.id,
      name: conversation.name,
      description: conversation.description || '',
      conversationType: conversation.isAnnouncementOnly ? 'announcement_channel' : conversation.conversationType,
      isActive: conversation.isActive,
      isAnnouncementOnly: conversation.isAnnouncementOnly,
      memberIds: conversation.members.map((member) => member.userId),
      moderatorIds: conversation.members.filter((member) => member.role === 'moderator').map((member) => member.userId),
      ownerIds: conversation.members.filter((member) => member.role === 'owner').map((member) => member.userId),
    });
    setModalOpen(true);
  };

  const updateForm = <K extends keyof ChatForm>(key: K, value: ChatForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleList = (key: 'memberIds' | 'moderatorIds' | 'ownerIds', userId: string) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(userId) ? current[key].filter((id) => id !== userId) : [...current[key], userId],
      memberIds: key === 'memberIds' || current.memberIds.includes(userId) ? current.memberIds : [...current.memberIds, userId],
    }));
  };

  const saveConversation = async () => {
    if (!canEdit || saving || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        conversationType: form.conversationType,
        isActive: form.isActive,
        isAnnouncementOnly: form.conversationType === 'announcement_channel' || form.isAnnouncementOnly,
        memberIds: form.memberIds,
        moderatorIds: form.moderatorIds,
        ownerIds: form.ownerIds,
      };
      if (form.id) {
        const updateRes = await fetch(`/api/admin/intranet/chat/conversations/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!updateRes.ok) throw new Error(await normalizeError(updateRes));
        const membersRes = await fetch(`/api/admin/intranet/chat/conversations/${form.id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!membersRes.ok) throw new Error(await normalizeError(membersRes));
      } else {
        const res = await fetch('/api/admin/intranet/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await normalizeError(res));
      }
      setModalOpen(false);
      setNotice(form.id ? 'Conversa atualizada.' : 'Conversa criada.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar conversa.');
    } finally {
      setSaving(false);
    }
  };

  const deactivateConversation = async (conversation: ChatConversation) => {
    if (!canEdit || !window.confirm(`Desativar "${conversation.name}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/intranet/chat/conversations/${conversation.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Conversa desativada.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao desativar conversa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModuleShell
      icon={MessageCircle}
      title="Chat Interno"
      description="Administre grupos personalizados, canais de comunicados, participantes e moderação básica."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={18} />
            Como funciona
          </button>
          <button type="button" onClick={openCreate} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:opacity-60">
            <Plus size={18} />
            Novo grupo
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou participante" />
          </div>
          <select className={inputClassName} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Todos os tipos</option>
            <option value="department_channel">Setores</option>
            <option value="custom_group">Grupos</option>
            <option value="announcement_channel">Comunicados</option>
            <option value="dm">DMs</option>
          </select>
        </div>
      )}
    >
      <section className="p-5">
        {notice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Conversas cadastradas</h2>
            <p className="text-sm text-slate-500">{filteredConversations.length} conversa(s)</p>
          </div>
          {loading ? <span className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando</span> : null}
        </div>
        <div className="grid gap-3">
          {filteredConversations.map((conversation) => (
            <article key={conversation.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{conversation.name}</h3>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-[#17407E] ring-1 ring-blue-100">{typeLabel(conversation.conversationType, conversation.isAnnouncementOnly)}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${conversation.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{conversation.isActive ? 'Ativa' : 'Inativa'}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{conversation.description || `${conversation.memberCount} participante(s)`}</p>
                  <p className="mt-2 text-xs text-slate-500">Atualizada em {formatDate(conversation.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEdit(conversation)} disabled={!canEdit || conversation.conversationType === 'dm' || conversation.conversationType === 'department_channel'} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                    <Edit size={16} />
                    Editar
                  </button>
                  <button type="button" onClick={() => deactivateConversation(conversation)} disabled={!canEdit || saving || conversation.conversationType === 'dm'} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">
                    <Trash2 size={16} />
                    Desativar
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!loading && !filteredConversations.length ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Nenhuma conversa encontrada.</div> : null}
        </div>
      </section>

      {modalOpen ? (
        <ChatConversationModal
          form={form}
          users={users}
          canEdit={canEdit}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSubmit={saveConversation}
          onUpdate={updateForm}
          onToggleList={toggleList}
        />
      ) : null}
      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    </AdminModuleShell>
  );
}

function ChatConversationModal({
  form,
  users,
  canEdit,
  saving,
  onClose,
  onSubmit,
  onUpdate,
  onToggleList,
}: {
  form: ChatForm;
  users: ChatUser[];
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onUpdate: <K extends keyof ChatForm>(key: K, value: ChatForm[K]) => void;
  onToggleList: (key: 'memberIds' | 'moderatorIds' | 'ownerIds', userId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h2 className="text-xl font-semibold text-slate-900">{form.id ? 'Editar conversa' : 'Nova conversa'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>
        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <input className={inputClassName} value={form.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Nome" />
            <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.description} onChange={(event) => onUpdate('description', event.target.value)} placeholder="Descrição" />
            <select className={inputClassName} value={form.conversationType} onChange={(event) => onUpdate('conversationType', event.target.value)}>
              <option value="custom_group">Grupo personalizado</option>
              <option value="announcement_channel">Canal de comunicados</option>
            </select>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" checked={form.isActive} onChange={(event) => onUpdate('isActive', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Conversa ativa</span>
                <span className="text-sm text-slate-500">Conversas inativas deixam de aparecer para os usuários.</span>
              </span>
            </label>
          </div>
          <aside>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Participantes</p>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
              {users.map((user) => (
                <div key={user.id} className="border-b border-slate-100 p-3 last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={form.memberIds.includes(user.id)} onChange={() => onToggleList('memberIds', user.id)} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
                      <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                    </span>
                  </label>
                  {form.memberIds.includes(user.id) ? (
                    <div className="mt-2 flex gap-3 pl-7 text-xs text-slate-500">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={form.moderatorIds.includes(user.id)} onChange={() => onToggleList('moderatorIds', user.id)} />
                        Moderador
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={form.ownerIds.includes(user.id)} onChange={() => onToggleList('ownerIds', user.id)} />
                        Owner
                      </label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fechar</button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving || !form.name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar conversa
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
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h2 className="text-xl font-semibold text-slate-900">Como funciona o chat</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={20} /></button>
        </div>
        <div className="space-y-3 p-5 text-sm leading-6 text-slate-600">
          <p>Conversas privadas são criadas pelos próprios usuários. Grupos personalizados e canais de comunicados são administrados por quem tem permissão de gestão do chat.</p>
          <p>Canais de setor são criados automaticamente a partir do departamento dos usuários ativos.</p>
          <p>Canais de comunicados restringem envio a owners e moderadores. Mensagens apagadas preservam auditoria.</p>
        </div>
        <div className="flex justify-end border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463]">Entendi</button>
        </div>
      </div>
    </div>
  );
}
