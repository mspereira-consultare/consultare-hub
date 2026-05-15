'use client';

import { useEffect, useMemo, useState } from 'react';
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
};

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

export function ChatbotClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      setSelectedSessionId(focusSessionId || data[0]?.id || '');
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
      await loadSessions(session.id);
      setMessages([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conversa.');
    } finally {
      setSending(false);
    }
  };

  const sendQuestion = async () => {
    if (!question.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSessionId || undefined,
          question: question.trim(),
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      const json = await response.json();
      const nextSessionId = String(json.data?.sessionId || '');
      setQuestion('');
      await loadSessions(nextSessionId);
      await loadMessages(nextSessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar pergunta.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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
        <div className="max-h-[68vh] overflow-y-auto p-3">
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
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedSessionId === session.id
                      ? 'border-[#17407E] bg-blue-50 text-[#17407E]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="truncate text-sm font-semibold">{session.title || 'Nova conversa'}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(session.updatedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
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

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 py-5">
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
                      : 'max-w-4xl border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    {message.role === 'user' ? 'Você' : 'IA Consultare'}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6">{message.content}</p>
                  {message.sourcesJson.length ? (
                    <div className="mt-4 grid gap-2">
                      {message.sourcesJson.map((source) => (
                        <a
                          key={`${message.id}-${source.sourceId}-${source.title}`}
                          href={
                            source.url ||
                            `/api/chatbot/sources/${encodeURIComponent(source.sourceId)}/download`
                          }
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
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Digite sua pergunta sobre a empresa, processos, documentos ou serviços..."
              className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Se a base oficial não tiver resposta confiável, sua pergunta será registrada para revisão.
              </p>
              <button
                type="button"
                onClick={() => void sendQuestion()}
                disabled={sending || !question.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

