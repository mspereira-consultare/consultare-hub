'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bot, Loader2, MessageSquarePlus, Send, Sparkles } from 'lucide-react';

type ChatSession = {
  id: string;
  title: string | null;
  startedAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sourcesJson: Array<{ sourceId: string; title: string; url: string | null }>;
  createdAt: string;
  isStreaming?: boolean;
  statusLabel?: string | null;
  isError?: boolean;
};

type StreamEvent =
  | { type: 'session'; payload: { sessionId: string } }
  | { type: 'user_message'; payload: { message: ChatMessage } }
  | { type: 'status'; payload: { code: string; label: string } }
  | { type: 'delta'; payload: { content: string } }
  | { type: 'sources'; payload: { sources: Array<{ sourceId: string; title: string; url: string | null }> } }
  | { type: 'done'; payload: { sessionId: string; message: ChatMessage } }
  | { type: 'error'; payload: { message: string } };

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const normalizeError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

const parseStreamEvents = (chunk: string) => {
  const events: StreamEvent[] = [];
  const blocks = chunk.split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const eventLine = lines.find((line) => line.startsWith('event:'));
    const dataLine = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (!eventLine || !dataLine) continue;

    const type = eventLine.slice(6).trim() as StreamEvent['type'];
    try {
      events.push({ type, payload: JSON.parse(dataLine) } as StreamEvent);
    } catch {
      continue;
    }
  }

  return events;
};

const upsertSession = (sessions: ChatSession[], next: ChatSession) => {
  const merged = [next, ...sessions.filter((item) => item.id !== next.id)];
  return merged.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
};

const TYPING_STATUS_BY_CODE: Record<string, string> = {
  buscando_fontes: 'Buscando fontes oficiais...',
  pensando: 'Pensando...',
  gerando_resposta: 'Escrevendo a resposta...',
};

export function ChatbotClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streamPhase, setStreamPhase] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const streamSessionIdRef = useRef<string>('');
  const tempAssistantIdRef = useRef<string>('');
  const tempUserIdRef = useRef<string>('');

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );

  const loadSessions = async (focusSessionId?: string) => {
    setLoadingSessions(true);
    setError(null);
    try {
      const response = await fetch('/api/chatbot/sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const data = Array.isArray(json.data) ? (json.data as ChatSession[]) : [];
      setSessions(data);
      setSelectedSessionId((current) => focusSessionId || current || data[0]?.id || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    if (sending && streamSessionIdRef.current === sessionId) return;
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch(`/api/chatbot/sessions/${encodeURIComponent(sessionId)}/messages`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      setMessages(Array.isArray(json.data) ? (json.data as ChatMessage[]) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    void loadMessages(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamPhase]);

  const createSession = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/chatbot/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nova conversa' }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const session = json.data as ChatSession;
      setSessions((current) => upsertSession(current, session));
      setSelectedSessionId(session.id);
      setMessages([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conversa.');
    } finally {
      setSending(false);
    }
  };

  const sendQuestion = async () => {
    const text = question.trim();
    if (!text || sending) return;

    const stamp = new Date().toISOString();
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    tempUserIdRef.current = tempUserId;
    tempAssistantIdRef.current = tempAssistantId;
    streamSessionIdRef.current = selectedSessionId;

    const optimisticUserMessage: ChatMessage = {
      id: tempUserId,
      sessionId: selectedSessionId || 'pending',
      role: 'user',
      content: text,
      sourcesJson: [],
      createdAt: stamp,
    };

    const optimisticAssistantMessage: ChatMessage = {
      id: tempAssistantId,
      sessionId: selectedSessionId || 'pending',
      role: 'assistant',
      content: '',
      sourcesJson: [],
      createdAt: stamp,
      isStreaming: true,
      statusLabel: TYPING_STATUS_BY_CODE.buscando_fontes,
    };

    setError(null);
    setSending(true);
    setQuestion('');
    setStreamPhase('buscando_fontes');
    setMessages((current) => [...current, optimisticUserMessage, optimisticAssistantMessage]);

    let doneReceived = false;

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSessionId || undefined,
          question: text,
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      if (!response.body) throw new Error('A resposta do chatbot nao retornou streaming.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const event of parts.flatMap((part) => parseStreamEvents(part))) {
          if (event.type === 'session') {
            const nextSessionId = String(event.payload.sessionId || '').trim();
            if (!nextSessionId) continue;
            streamSessionIdRef.current = nextSessionId;
            setSelectedSessionId(nextSessionId);
            setSessions((current) =>
              upsertSession(current, {
                id: nextSessionId,
                title: text.slice(0, 120),
                startedAt: stamp,
                updatedAt: stamp,
              })
            );
            setMessages((current) =>
              current.map((message) =>
                message.id === tempUserId || message.id === tempAssistantId
                  ? { ...message, sessionId: nextSessionId }
                  : message
              )
            );
            continue;
          }

          if (event.type === 'user_message') {
            const persisted = event.payload.message;
            setMessages((current) => current.map((message) => (message.id === tempUserId ? persisted : message)));
            setSessions((current) =>
              upsertSession(current, {
                id: persisted.sessionId,
                title: selectedSession?.title || text.slice(0, 120),
                startedAt: stamp,
                updatedAt: persisted.createdAt,
              })
            );
            continue;
          }

          if (event.type === 'status') {
            setStreamPhase(String(event.payload.code || 'pensando'));
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantIdRef.current
                  ? {
                      ...message,
                      statusLabel:
                        String(event.payload.label || '').trim() ||
                        TYPING_STATUS_BY_CODE[String(event.payload.code || '')] ||
                        'Pensando...',
                    }
                  : message
              )
            );
            continue;
          }

          if (event.type === 'delta') {
            setStreamPhase('gerando_resposta');
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantIdRef.current
                  ? {
                      ...message,
                      content: `${message.content}${String(event.payload.content || '')}`,
                      statusLabel: TYPING_STATUS_BY_CODE.gerando_resposta,
                    }
                  : message
              )
            );
            continue;
          }

          if (event.type === 'sources') {
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantIdRef.current
                  ? {
                      ...message,
                      sourcesJson: Array.isArray(event.payload.sources) ? event.payload.sources : [],
                    }
                  : message
              )
            );
            continue;
          }

          if (event.type === 'done') {
            doneReceived = true;
            const persisted = event.payload.message;
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantIdRef.current
                  ? {
                      ...persisted,
                      isStreaming: false,
                      statusLabel: null,
                    }
                  : message
              )
            );
            setSessions((current) =>
              upsertSession(current, {
                id: persisted.sessionId,
                title: selectedSession?.title || text.slice(0, 120),
                startedAt: stamp,
                updatedAt: persisted.createdAt,
              })
            );
            setStreamPhase(null);
            continue;
          }

          if (event.type === 'error') {
            throw new Error(String(event.payload.message || 'Erro ao responder pergunta.'));
          }
        }
      }

      if (!doneReceived) {
        throw new Error('A resposta do chatbot foi interrompida antes de ser concluida.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar pergunta.';
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === tempAssistantIdRef.current
            ? {
                ...item,
                isStreaming: false,
                isError: true,
                statusLabel: 'Nao foi possivel concluir a resposta.',
                content:
                  item.content ||
                  'Nao foi possivel concluir a resposta agora. Tente novamente em instantes.',
              }
            : item
        )
      );
    } finally {
      setSending(false);
      setStreamPhase(null);
      setMessages((current) =>
        current.map((item) =>
          item.id === tempAssistantIdRef.current
            ? {
                ...item,
                isStreaming: false,
                statusLabel: null,
              }
            : item
        )
      );
      streamSessionIdRef.current = '';
      tempAssistantIdRef.current = '';
      tempUserIdRef.current = '';
    }
  };

  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendQuestion();
  };

  return (
    <section className="grid h-[calc(100vh-13rem)] min-h-[680px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Conversas</p>
            <p className="mt-1 text-xs text-slate-500">Seu histórico com o assistente institucional.</p>
          </div>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <MessageSquarePlus size={14} />
            Nova
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Carregando conversas...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma conversa iniciada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  disabled={sending}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedSessionId === session.id
                      ? 'border-[#17407E] bg-blue-50 text-[#17407E]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  } disabled:opacity-60`}
                >
                  <div className="truncate text-sm font-semibold">{session.title || 'Nova conversa'}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(session.updatedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#17407E]">
              <Bot size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{selectedSession?.title || 'IA Consultare'}</p>
              <p className="mt-1 text-xs text-slate-500">
                Responde apenas com base em fontes oficiais e cita as referências usadas.
              </p>
            </div>
          </div>
        </div>

        {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Carregando conversa...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
              <Sparkles size={24} className="text-[#17407E]" />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Pergunte sobre a Consultare</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Você pode tirar dúvidas sobre páginas da intranet, FAQ, documentos publicados, procedimentos e outras
                informações oficiais selecionadas para a base institucional.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-2xl px-4 py-4 ${
                    message.role === 'user'
                      ? 'ml-auto max-w-3xl bg-[#17407E] text-white'
                      : message.isError
                        ? 'max-w-4xl border border-rose-200 bg-rose-50 text-rose-800'
                        : 'max-w-4xl border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                    <span>{message.role === 'user' ? 'Você' : 'IA Consultare'}</span>
                    {message.role === 'assistant' && message.isStreaming ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#17407E]">
                        <TypingDots />
                        {message.statusLabel || TYPING_STATUS_BY_CODE[streamPhase || ''] || 'Pensando...'}
                      </span>
                    ) : null}
                    {message.role === 'assistant' && message.isError ? (
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        Resposta interrompida
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6">
                    {message.content || (message.isStreaming ? ' ' : '')}
                  </p>
                  {message.sourcesJson.length ? (
                    <div className="mt-4 grid gap-2">
                      {message.sourcesJson.map((source) => (
                        <a
                          key={`${message.id}-${source.sourceId}-${source.title}`}
                          href={source.url || `/api/chatbot/sources/${encodeURIComponent(source.sourceId)}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#17407E] hover:border-slate-300"
                        >
                          {source.title || 'Fonte oficial'}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              placeholder="Digite sua pergunta sobre a empresa, processos, documentos ou serviços..."
              className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {sending
                  ? TYPING_STATUS_BY_CODE[streamPhase || ''] || 'Pensando...'
                  : 'Se a base oficial não tiver resposta confiável, sua pergunta será registrada para revisão.'}
              </p>
              <button
                type="button"
                onClick={() => void sendQuestion()}
                disabled={sending || !question.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Respondendo...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}
