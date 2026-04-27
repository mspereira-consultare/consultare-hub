'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCheck,
  Edit3,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';

type ChatUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

type ChatMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  lastReadAt: string | null;
};

type ChatAttachment = {
  assetId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  isImage: boolean;
};

type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  attachments: ChatAttachment[];
  readBy: Array<{ userId: string; name: string }>;
};

type ChatConversation = {
  id: string;
  conversationType: string;
  name: string;
  description: string | null;
  isAnnouncementOnly: boolean;
  currentMemberRole: string;
  memberCount: number;
  members: ChatMember[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
};

type Capabilities = {
  canCreateGroups: boolean;
  canManageChat: boolean;
};

type MessageActionMenu = {
  messageId: string;
  x: number;
  y: number;
} | null;

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function ChatClient() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities>({ canCreateGroups: false, canManageChat: false });
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [messageActionMenu, setMessageActionMenu] = useState<MessageActionMenu>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations', { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const nextConversations = Array.isArray(json.data?.conversations) ? json.data.conversations : [];
      setConversations(nextConversations);
      setCapabilities(json.data?.capabilities || { canCreateGroups: false, canManageChat: false });
      setCurrentUserId(String(json.data?.currentUserId || ''));
      setSelectedId((current) => current || nextConversations[0]?.id || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/users', { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setUsers(Array.isArray(json.data) ? json.data : []);
    } catch {
      setUsers([]);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, mode: 'replace' | 'older' = 'replace') => {
    if (!conversationId) return;
    try {
      const before = mode === 'older' ? messages[0]?.createdAt || '' : '';
      const url = new URL(`/api/chat/conversations/${conversationId}/messages`, window.location.origin);
      if (before) url.searchParams.set('before', before);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const next = Array.isArray(json.data) ? json.data : [];
      setMessages((current) => mode === 'older' ? [...next, ...current] : next);
      if (mode === 'replace') {
        const last = next[next.length - 1];
        if (last) {
          void fetch(`/api/chat/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: last.id }),
          });
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
    }
  }, [messages]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadConversations();
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversations, loadUsers]);

  useEffect(() => {
    if (!selectedId) return;
    const timeout = window.setTimeout(() => {
      void loadMessages(selectedId);
    }, 0);
    const interval = window.setInterval(() => {
      void loadMessages(selectedId);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadMessages, selectedId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadConversations();
    }, 12000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!messageActionMenu) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (messageMenuRef.current?.contains(event.target as Node)) return;
      setMessageActionMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessageActionMenu(null);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [messageActionMenu]);

  const filteredConversations = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      normalizeText(`${conversation.name} ${conversation.description || ''} ${conversation.members.map((member) => member.name).join(' ')}`).includes(term)
    );
  }, [conversations, search]);

  const uploadFiles = async () => {
    const assetIds: string[] = [];
    for (const file of files) {
      const data = new FormData();
      data.append('file', file);
      data.append('conversationId', selectedId);
      const res = await fetch('/api/chat/attachments', { method: 'POST', body: data });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      assetIds.push(String(json.data?.id || ''));
    }
    return assetIds.filter(Boolean);
  };

  const sendMessage = async () => {
    if (!selectedId || sending || (!body.trim() && !files.length)) return;
    setSending(true);
    setError(null);
    try {
      const attachmentIds = await uploadFiles();
      const res = await fetch(`/api/chat/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, attachmentIds }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setBody('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await Promise.all([loadMessages(selectedId), loadConversations()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const editMessage = async (message: ChatMessage) => {
    const nextBody = window.prompt('Editar mensagem', message.body);
    if (nextBody === null || !nextBody.trim()) return;
    const res = await fetch(`/api/chat/messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: nextBody }),
    });
    if (!res.ok) {
      setError(await normalizeError(res));
      return;
    }
    await loadMessages(selectedId);
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!window.confirm('Apagar esta mensagem?')) return;
    const res = await fetch(`/api/chat/messages/${message.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(await normalizeError(res));
      return;
    }
    await loadMessages(selectedId);
  };

  const canUseMessageActions = (message: ChatMessage) => message.senderUserId === currentUserId && !message.isDeleted;

  const openMessageActionMenu = (message: ChatMessage, x: number, y: number) => {
    if (!canUseMessageActions(message)) return;
    const menuWidth = 180;
    const menuHeight = 96;
    const padding = 12;
    setMessageActionMenu({
      messageId: message.id,
      x: Math.min(Math.max(padding, x), window.innerWidth - menuWidth - padding),
      y: Math.min(Math.max(padding, y), window.innerHeight - menuHeight - padding),
    });
  };

  const openMessageActionMenuFromButton = (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openMessageActionMenu(message, rect.right - 180, rect.bottom + 6);
  };

  const openMessageActionMenuFromContext = (message: ChatMessage, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (!canUseMessageActions(message)) return;
    openMessageActionMenu(message, event.clientX, event.clientY);
  };

  const selectedActionMessage = messageActionMenu
    ? messages.find((message) => message.id === messageActionMenu.messageId) || null
    : null;

  const canSendInSelected =
    selectedConversation &&
    (!selectedConversation.isAnnouncementOnly || ['owner', 'moderator'].includes(selectedConversation.currentMemberRole));

  return (
    <div className="h-[calc(100vh-73px)] min-h-[720px] bg-slate-50 p-4 lg:p-6">
      <div className="grid h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm xl:grid-cols-[340px_minmax(0,1fr)_300px]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Chat interno</p>
                <h1 className="mt-1 text-xl font-semibold text-slate-900">Conversas</h1>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDmOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50" aria-label="Nova conversa">
                  <MessageCircle size={18} />
                </button>
                {capabilities.canCreateGroups ? (
                  <button type="button" onClick={() => setGroupOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#17407E] text-white transition hover:bg-[#123463]" aria-label="Novo grupo">
                    <Plus size={18} />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="relative mt-4">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando</div>
            ) : filteredConversations.length ? filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setMessageActionMenu(null);
                  setSelectedId(conversation.id);
                }}
                className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition ${selectedId === conversation.id ? 'bg-blue-50 text-[#17407E]' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{conversation.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessage?.isDeleted ? 'Mensagem apagada' : conversation.lastMessage?.body || conversation.description || `${conversation.memberCount} participante(s)`}</p>
                  </div>
                  {conversation.unreadCount ? <span className="rounded-full bg-[#17407E] px-2 py-0.5 text-xs font-semibold text-white">{conversation.unreadCount}</span> : null}
                </div>
              </button>
            )) : (
              <div className="p-4 text-sm text-slate-500">Nenhuma conversa encontrada.</div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">{selectedConversation.name}</h2>
                <p className="text-sm text-slate-500">{selectedConversation.isAnnouncementOnly ? 'Canal de comunicados' : `${selectedConversation.memberCount} participante(s)`}</p>
              </div>
              {error ? <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-700">{error}</div> : null}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                {messages.length >= 40 ? (
                  <button type="button" onClick={() => loadMessages(selectedId, 'older')} className="mx-auto block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Carregar anteriores
                  </button>
                ) : null}
                {messages.map((message) => {
                  const mine = message.senderUserId === currentUserId;
                  const canOpenActions = canUseMessageActions(message);
                  return (
                    <article key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        onContextMenu={(event) => openMessageActionMenuFromContext(message, event)}
                        className={`relative max-w-[78%] rounded-lg border px-4 py-3 shadow-sm ${mine ? 'border-blue-100 bg-blue-50' : 'border-slate-200 bg-white'}`}
                      >
                        {canOpenActions ? (
                          <button
                            type="button"
                            onClick={(event) => openMessageActionMenuFromButton(message, event)}
                            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 opacity-100 transition hover:bg-white/80 hover:text-[#17407E] focus:bg-white/80 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-100 md:opacity-0 md:group-hover:opacity-100"
                            aria-label="Abrir ações da mensagem"
                          >
                            <MoreVertical size={15} />
                          </button>
                        ) : null}
                        <div className={`mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 ${canOpenActions ? 'pr-7' : ''}`}>
                          <span className="font-semibold text-slate-700">{message.senderName}</span>
                        </div>
                        {message.isDeleted ? (
                          <p className="text-sm italic text-slate-500">Mensagem apagada</p>
                        ) : (
                          <>
                            {message.body ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.body}</p> : null}
                            {message.attachments.length ? (
                              <div className="mt-3 grid gap-2">
                                {message.attachments.map((attachment) => (
                                  <a key={attachment.assetId} href={attachment.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                    {attachment.isImage ? <ImageIcon size={16} className="text-[#229A8A]" /> : <FileText size={16} className="text-[#17407E]" />}
                                    <span className="truncate">{attachment.originalName}</span>
                                  </a>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                              <span>{formatTime(message.createdAt)}</span>
                              {message.isEdited ? <span>Editada</span> : null}
                              <span title={message.readBy.map((item) => item.name).join(', ')} className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                <CheckCheck size={13} />
                                {message.readBy.length}
                              </span>
                            </div>
                          </>
                        )}
                        {message.isDeleted ? (
                          <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                            <span>{formatTime(message.createdAt)}</span>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="border-t border-slate-200 bg-white p-4">
                {files.length ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {files.map((file) => <span key={`${file.name}-${file.size}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{file.name}</span>)}
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canSendInSelected} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Anexar arquivo">
                    <Paperclip size={18} />
                  </button>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} disabled={!canSendInSelected} rows={1} placeholder={canSendInSelected ? 'Digite uma mensagem' : 'Envio restrito a moderadores'} className="min-h-11 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" />
                  <button type="button" onClick={sendMessage} disabled={!canSendInSelected || sending || (!body.trim() && !files.length)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#17407E] text-white hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar">
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">Selecione uma conversa.</div>
          )}
        </section>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 xl:block">
          <h2 className="text-sm font-semibold text-slate-900">Detalhes</h2>
          {selectedConversation ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tipo</p>
                <p className="mt-1 text-sm text-slate-700">{selectedConversation.conversationType === 'dm' ? 'Conversa privada' : selectedConversation.isAnnouncementOnly ? 'Comunicados' : 'Grupo/canal'}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Participantes</p>
                <div className="space-y-2">
                  {selectedConversation.members.map((member) => (
                    <div key={member.userId} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                      <p className="truncate text-xs text-slate-500">{member.role}{member.department ? ` • ${member.department}` : ''}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{member.lastReadAt ? `Leu em ${formatDateTime(member.lastReadAt)}` : 'Sem leitura registrada'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {dmOpen ? <DmModal users={users} onClose={() => setDmOpen(false)} onCreated={async (id) => { setDmOpen(false); setMessageActionMenu(null); await loadConversations(); if (id) setSelectedId(id); }} /> : null}
      {groupOpen && capabilities.canCreateGroups ? <GroupModal users={users} onClose={() => setGroupOpen(false)} onCreated={async () => { setGroupOpen(false); await loadConversations(); }} /> : null}
      {messageActionMenu && selectedActionMessage ? (
        <div
          ref={messageMenuRef}
          className="fixed z-50 w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: messageActionMenu.x, top: messageActionMenu.y }}
          role="menu"
        >
          <button
            type="button"
            onClick={async () => {
              setMessageActionMenu(null);
              await editMessage(selectedActionMessage);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            role="menuitem"
          >
            <Edit3 size={15} className="text-[#17407E]" />
            Editar mensagem
          </button>
          <button
            type="button"
            onClick={async () => {
              setMessageActionMenu(null);
              await deleteMessage(selectedActionMessage);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            role="menuitem"
          >
            <Trash2 size={15} />
            Apagar mensagem
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DmModal({ users, onClose, onCreated }: { users: ChatUser[]; onClose: () => void; onCreated: (id?: string) => void }) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = users.filter((user) => normalizeText(`${user.name} ${user.email} ${user.department}`).includes(normalizeText(search)));

  const startDm = async (userId: string) => {
    setSaving(true);
    const res = await fetch('/api/chat/conversations/dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const json = await res.json();
      onCreated(json.data?.id);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Nova conversa</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={18} /></button>
        </div>
        <div className="p-4">
          <input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário" />
          <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
            {filtered.map((user) => (
              <button key={user.id} type="button" disabled={saving} onClick={() => startDm(user.id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50">
                <MessageCircle size={17} className="text-[#17407E]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
                  <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ users, onClose, onCreated }: { users: ChatUser[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [conversationType, setConversationType] = useState('custom_group');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch('/api/chat/conversations/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, conversationType, memberIds }),
    });
    setSaving(false);
    if (res.ok) onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Novo grupo</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={18} /></button>
        </div>
        <div className="grid gap-4 p-4">
          <input className={inputClassName} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do grupo" />
          <select className={inputClassName} value={conversationType} onChange={(event) => setConversationType(event.target.value)}>
            <option value="custom_group">Grupo personalizado</option>
            <option value="announcement_channel">Canal de comunicados</option>
          </select>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            {users.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50">
                <input type="checkbox" checked={memberIds.includes(user.id)} onChange={() => setMemberIds((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id])} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
                  <span className="block truncate text-xs text-slate-500">{user.department || user.email}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fechar</button>
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}
