'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RefreshCw, Send, Upload } from 'lucide-react';

type Summary = {
  sourcesTotal: number;
  indexedSources: number;
  pendingSources: number;
  failedSources: number;
  unansweredPending: number;
  recentJobs: Array<{
    id: string;
    jobType: string;
    status: string;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorMessage?: string | null;
  }>;
};

type Source = {
  id: string;
  sourceType: string;
  title: string;
  status: string;
  canonicalUrl: string | null;
  updatedAt: string;
  lastError: string | null;
};

type Unanswered = {
  id: string;
  question: string;
  status: string;
  answerDraft: string | null;
  answerReviewed: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

type Session = {
  id: string;
  userId: string;
  title: string | null;
  startedAt: string;
  updatedAt: string;
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

export function ChatbotAdminClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [unanswered, setUnanswered] = useState<Unanswered[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [summaryResponse, sourcesResponse, unansweredResponse, sessionsResponse] = await Promise.all([
        fetch('/api/admin/intranet/chatbot', { cache: 'no-store' }),
        fetch(`/api/admin/intranet/knowledge/sources${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`, {
          cache: 'no-store',
        }),
        fetch('/api/admin/intranet/chatbot/unanswered', { cache: 'no-store' }),
        fetch('/api/admin/intranet/chatbot/sessions', { cache: 'no-store' }),
      ]);

      if (!summaryResponse.ok) throw new Error(await normalizeError(summaryResponse));
      if (!sourcesResponse.ok) throw new Error(await normalizeError(sourcesResponse));
      if (!unansweredResponse.ok) throw new Error(await normalizeError(unansweredResponse));
      if (!sessionsResponse.ok) throw new Error(await normalizeError(sessionsResponse));

      const [summaryJson, sourcesJson, unansweredJson, sessionsJson] = await Promise.all([
        summaryResponse.json(),
        sourcesResponse.json(),
        unansweredResponse.json(),
        sessionsResponse.json(),
      ]);

      setSummary((summaryJson.data || null) as Summary | null);
      setSources(Array.isArray(sourcesJson.data) ? (sourcesJson.data as Source[]) : []);
      const unansweredRows = Array.isArray(unansweredJson.data) ? (unansweredJson.data as Unanswered[]) : [];
      setUnanswered(unansweredRows);
      setDrafts(
        unansweredRows.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.answerReviewed || item.answerDraft || '';
          return acc;
        }, {})
      );
      setSessions(Array.isArray(sessionsJson.data) ? (sessionsJson.data as Session[]) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar gestão do chatbot.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const hasActiveJobs = useMemo(
    () => (summary?.recentJobs || []).some((item) => ['pending', 'running'].includes(String(item.status || '').toLowerCase())),
    [summary]
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  const filteredSources = useMemo(
    () =>
      search.trim()
        ? sources.filter((item) => `${item.title} ${item.sourceType}`.toLowerCase().includes(search.trim().toLowerCase()))
        : sources,
    [search, sources]
  );

  const reindex = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/intranet/knowledge/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setNotice('Reindexação enfileirada com sucesso. O worker vai processar a base em segundo plano.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao reindexar base.');
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async () => {
    if (!uploadFile || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const data = new FormData();
      data.append('file', uploadFile);
      if (uploadTitle.trim()) data.append('title', uploadTitle.trim());
      const response = await fetch('/api/admin/intranet/knowledge/upload', {
        method: 'POST',
        body: data,
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      setUploadFile(null);
      setUploadTitle('');
      setNotice('Documento enviado com sucesso. A indexação foi enfileirada e aparecerá nos jobs recentes.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar documento.');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async (item: Unanswered) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/intranet/chatbot/unanswered/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'answered',
          answerReviewed: drafts[item.id] || '',
        }),
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resposta.');
    } finally {
      setSaving(false);
    }
  };

  const publishAnswer = async (item: Unanswered) => {
    setSaving(true);
    setError(null);
    try {
      if ((drafts[item.id] || '') !== (item.answerReviewed || item.answerDraft || '')) {
        const saveResponse = await fetch(`/api/admin/intranet/chatbot/unanswered/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'answered',
            answerReviewed: drafts[item.id] || '',
          }),
        });
        if (!saveResponse.ok) throw new Error(await normalizeError(saveResponse));
      }

      const response = await fetch(`/api/admin/intranet/chatbot/unanswered/${encodeURIComponent(item.id)}/publish`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(await normalizeError(response));
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar resposta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Fontes totais" value={summary?.sourcesTotal || 0} helper="Base rastreada" />
        <MetricCard label="Indexadas" value={summary?.indexedSources || 0} helper="Prontas para responder" tone="success" />
        <MetricCard label="Pendentes" value={summary?.pendingSources || 0} helper="Aguardando indexação" tone="warning" />
        <MetricCard label="Com falha" value={summary?.failedSources || 0} helper="Exigem intervenção" tone="danger" />
        <MetricCard label="Sem resposta" value={summary?.unansweredPending || 0} helper="Fila editorial aberta" tone="info" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Fontes de conhecimento</h2>
                <p className="mt-1 text-sm text-slate-500">Conteúdos publicados e documentos manuais preparados para a IA.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar fonte"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => void reindex()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Reindexar
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[150px_minmax(0,1.6fr)_120px_160px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Tipo</span>
                <span>Fonte</span>
                <span>Status</span>
                <span>Atualizada</span>
              </div>
              <div className="max-h-[430px] overflow-y-auto divide-y divide-slate-200">
                {loading ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">Carregando fontes...</div>
                ) : filteredSources.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">Nenhuma fonte encontrada.</div>
                ) : (
                  filteredSources.map((item) => (
                    <div key={item.id} className="grid grid-cols-[150px_minmax(0,1.6fr)_120px_160px] gap-3 px-4 py-4">
                      <span className="text-sm text-slate-600">{item.sourceType}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{item.title}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{item.lastError || item.canonicalUrl || 'Sem URL pública'}</span>
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{item.status}</span>
                      <span className="text-sm text-slate-600">{formatDateTime(item.updatedAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Jobs recentes</h2>
                <p className="mt-1 text-sm text-slate-500">Acompanhe a fila e o processamento do worker de conhecimento.</p>
              </div>
              {hasActiveJobs ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-[#17407E]">
                  <Loader2 size={12} className="animate-spin" />
                  Atualização automática ativa
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {(summary?.recentJobs || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum job registrado ainda.
                </div>
              ) : (
                (summary?.recentJobs || []).map((job) => {
                  const status = String(job.status || '').toLowerCase();
                  const toneClassName =
                    status === 'completed'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : status === 'failed'
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : status === 'running'
                          ? 'border-blue-200 bg-blue-50 text-[#17407E]'
                          : 'border-amber-200 bg-amber-50 text-amber-800';

                  return (
                    <article key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {job.jobType === 'reindex' ? 'Reindexação' : 'Indexação'} · {job.id.slice(0, 8)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Criado em {formatDateTime(job.createdAt)}
                            {job.startedAt ? ` · iniciado em ${formatDateTime(job.startedAt)}` : ''}
                            {job.finishedAt ? ` · finalizado em ${formatDateTime(job.finishedAt)}` : ''}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${toneClassName}`}>
                          {status}
                        </span>
                      </div>
                      {job.errorMessage ? <div className="mt-2 text-xs text-rose-700">{job.errorMessage}</div> : null}
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Perguntas sem resposta</h2>
            <p className="mt-1 text-sm text-slate-500">Responda, revise e publique novas entradas para a base institucional.</p>
            <div className="mt-4 space-y-4">
              {unanswered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma pendência editorial no momento.
                </div>
              ) : (
                unanswered.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.question}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.status} · {formatDateTime(item.createdAt)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveDraft(item)}
                          disabled={saving || !drafts[item.id]?.trim()}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Salvar resposta
                        </button>
                        <button
                          type="button"
                          onClick={() => void publishAnswer(item)}
                          disabled={saving || !drafts[item.id]?.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Send size={13} />
                          Publicar na base
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={drafts[item.id] || ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Escreva a resposta oficial revisada para esta dúvida."
                      className="mt-4 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
                    />
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#17407E]">
                <Upload size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload manual</h2>
                <p className="mt-1 text-sm text-slate-500">TXT e Markdown já podem ser indexados inline no V1.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Título opcional da fonte"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
              />
              <input
                type="file"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => void uploadDocument()}
                disabled={saving || !uploadFile}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123463] disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Enviar documento
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#17407E]">
                <Bot size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Auditoria recente</h2>
                <p className="mt-1 text-sm text-slate-500">Últimas sessões iniciadas pelos colaboradores.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma sessão registrada ainda.
                </div>
              ) : (
                sessions.slice(0, 12).map((session) => (
                  <div key={session.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-sm font-semibold text-slate-900">{session.title || 'Nova conversa'}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Usuário: {session.userId} · {formatDateTime(session.updatedAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  helper: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneClassName =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : tone === 'info'
            ? 'border-blue-200 bg-blue-50 text-[#17407E]'
            : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClassName}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <div className="mt-2 text-sm opacity-80">{helper}</div>
    </div>
  );
}
