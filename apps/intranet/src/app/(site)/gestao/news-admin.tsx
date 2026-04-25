'use client';

/* eslint-disable @next/next/no-img-element -- Admin previews render dynamic private asset URLs. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarClock,
  CircleHelp,
  Eye,
  Image as ImageIcon,
  Info,
  Loader2,
  Newspaper,
  Plus,
  Save,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type NewsPost = {
  id: string;
  postType: string;
  title: string;
  slug: string;
  summary: string | null;
  body: Record<string, unknown>;
  coverAssetId: string | null;
  category: string;
  highlightLevel: string;
  isFeatured: boolean;
  status: string;
  publishStartAt: string | null;
  publishEndAt: string | null;
  audienceGroupIds: string[];
  updatedAt: string;
  publishedAt: string | null;
};

type AudienceGroup = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type NewsFormState = {
  postType: string;
  title: string;
  slug: string;
  summary: string;
  bodyText: string;
  coverAssetId: string;
  category: string;
  highlightLevel: string;
  isFeatured: boolean;
  status: string;
  publishStartAt: string;
  publishEndAt: string;
  audienceGroupIds: string[];
};

type AssetUploadResult = {
  id: string;
  originalName: string;
};

type NewsAdminProps = {
  canEdit: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

const postTypes: SelectOption[] = [
  { value: 'news', label: 'Notícia' },
  { value: 'notice', label: 'Aviso' },
  { value: 'banner', label: 'Banner' },
];

const postStatuses: SelectOption[] = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Arquivado' },
];

const newsCategories: SelectOption[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'rh', label: 'RH' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'comunicado', label: 'Comunicado' },
  { value: 'qualidade', label: 'Qualidade' },
  { value: 'ti', label: 'TI' },
  { value: 'eventos', label: 'Eventos' },
];

const highlightLevels: Array<SelectOption & { badge: string; card: string }> = [
  { value: 'info', label: 'Informativo', badge: 'bg-blue-50 text-[#17407E] ring-blue-100', card: 'border-blue-100' },
  { value: 'attention', label: 'Atenção', badge: 'bg-amber-50 text-amber-700 ring-amber-100', card: 'border-amber-200' },
  { value: 'important', label: 'Importante', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-100', card: 'border-indigo-200' },
  { value: 'urgent', label: 'Urgente', badge: 'bg-rose-50 text-rose-700 ring-rose-100', card: 'border-rose-200' },
];

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const emptyForm = (): NewsFormState => ({
  postType: 'news',
  title: '',
  slug: '',
  summary: '',
  bodyText: '',
  coverAssetId: '',
  category: 'geral',
  highlightLevel: 'info',
  isFeatured: false,
  status: 'draft',
  publishStartAt: '',
  publishEndAt: '',
  audienceGroupIds: [],
});

const asString = (value: unknown) => String(value ?? '');

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const statusLabel = (status: string) => postStatuses.find((item) => item.value === status)?.label || status;
const postTypeLabel = (type: string) => postTypes.find((item) => item.value === type)?.label || type;
const categoryLabel = (category: string) => newsCategories.find((item) => item.value === category)?.label || category || 'Geral';
const highlightOption = (level: string) => highlightLevels.find((item) => item.value === level) || highlightLevels[0];
const coverUrl = (assetId: string | null | undefined) => assetId ? `/api/intranet/assets/${encodeURIComponent(assetId)}/download` : '';

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const toDatetimeLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const fromDatetimeLocal = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const formFromPost = (post: NewsPost): NewsFormState => ({
  postType: post.postType || 'news',
  title: post.title || '',
  slug: post.slug || '',
  summary: post.summary || '',
  bodyText: asString(post.body?.text || post.body?.body || ''),
  coverAssetId: post.coverAssetId || '',
  category: post.category || 'geral',
  highlightLevel: post.highlightLevel || 'info',
  isFeatured: Boolean(post.isFeatured),
  status: post.status || 'draft',
  publishStartAt: toDatetimeLocal(post.publishStartAt),
  publishEndAt: toDatetimeLocal(post.publishEndAt),
  audienceGroupIds: post.audienceGroupIds || [],
});

export function NewsAdmin({ canEdit }: NewsAdminProps) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [audiences, setAudiences] = useState<AudienceGroup[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [postType, setPostType] = useState('all');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<NewsPost | null>(null);
  const [form, setForm] = useState<NewsFormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const query = new URLSearchParams({ search, status, postType, category });
      const res = await fetch(`/api/admin/intranet/news?${query.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setPosts(Array.isArray(json?.data) ? json.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar notícias.');
    } finally {
      setLoading(false);
    }
  }, [category, postType, search, status]);

  const loadAudiences = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/intranet/audiences', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setAudiences(Array.isArray(json?.data) ? json.data.filter((item: AudienceGroup) => item.isActive) : []);
    } catch {
      setAudiences([]);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPosts();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadPosts]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAudiences();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAudiences]);

  const openCreate = () => {
    setSelectedPost(null);
    setForm(emptyForm());
    setError(null);
    setNotice(null);
    setModalOpen(true);
  };

  const openEdit = (post: NewsPost) => {
    setSelectedPost(post);
    setForm(formFromPost(post));
    setError(null);
    setNotice(null);
    setModalOpen(true);
  };

  const updateForm = <K extends keyof NewsFormState>(key: K, value: NewsFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleAudience = (audienceId: string) => {
    setForm((current) => ({
      ...current,
      audienceGroupIds: current.audienceGroupIds.includes(audienceId)
        ? current.audienceGroupIds.filter((id) => id !== audienceId)
        : [...current.audienceGroupIds, audienceId],
    }));
  };

  const uploadCover = async (file: File | null) => {
    if (!file) return;
    try {
      setError(null);
      setUploadingCover(true);
      const body = new FormData();
      body.set('file', file);
      body.set('entityType', 'news-cover');
      if (selectedPost?.id) body.set('entityId', selectedPost.id);
      const res = await fetch('/api/admin/intranet/assets', { method: 'POST', body });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const asset = json?.data as AssetUploadResult;
      if (!asset?.id) throw new Error('Upload concluído, mas o asset não retornou identificador.');
      updateForm('coverAssetId', asset.id);
      setNotice('Imagem de capa enviada.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar imagem de capa.');
    } finally {
      setUploadingCover(false);
    }
  };

  const submitPost = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        postType: form.postType,
        title: form.title,
        slug: form.slug || slugify(form.title),
        summary: form.summary,
        body: { text: form.bodyText },
        coverAssetId: form.coverAssetId || null,
        category: form.category,
        highlightLevel: form.highlightLevel,
        isFeatured: form.isFeatured,
        status: form.status,
        publishStartAt: fromDatetimeLocal(form.publishStartAt),
        publishEndAt: fromDatetimeLocal(form.publishEndAt),
        audienceGroupIds: form.audienceGroupIds,
      };
      const endpoint = selectedPost ? `/api/admin/intranet/news/${encodeURIComponent(selectedPost.id)}` : '/api/admin/intranet/news';
      const res = await fetch(endpoint, {
        method: selectedPost ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as NewsPost;
      setSelectedPost(saved);
      setForm(formFromPost(saved));
      setNotice(selectedPost ? 'Notícia/aviso atualizado.' : 'Notícia/aviso criado.');
      await loadPosts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar notícia.');
    } finally {
      setSaving(false);
    }
  };

  const archivePost = async (post: NewsPost) => {
    if (!canEdit) return;
    if (!window.confirm(`Arquivar "${post.title}"? O conteúdo deixará de aparecer publicamente.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/news/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Notícia/aviso arquivado.');
      await loadPosts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao arquivar notícia.');
    }
  };

  const featuredCount = useMemo(() => posts.filter((post) => post.isFeatured && post.status === 'published').length, [posts]);

  return (
    <AdminModuleShell
      icon={Newspaper}
      title="Notícias e Avisos"
      description="Publique comunicados, avisos e destaques exibidos na intranet."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={16} />
            Como funciona
          </button>
          <button type="button" onClick={openCreate} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} />
            Novo conteúdo
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_200px_200px_200px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClassName} pl-9`} placeholder="Buscar por título ou resumo" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className={inputClassName} value={postType} onChange={(event) => setPostType(event.target.value)}>
            <option value="all">Todos os tipos</option>
            {postTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className={inputClassName} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">Todas as categorias</option>
            {newsCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className={inputClassName} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos</option>
            {postStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      )}
    >
      {notice ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Conteúdos cadastrados</h2>
            <p className="text-sm text-slate-500">{posts.length} item(ns) encontrados</p>
          </div>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Carregando notícias e avisos...
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-semibold text-slate-800">Nenhum conteúdo encontrado</p>
              <p className="mt-1 text-sm text-slate-500">Crie uma notícia, aviso ou banner para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <article key={post.id} className={`rounded-lg border bg-white p-4 shadow-sm ${highlightOption(post.highlightLevel).card}`}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
                          {post.isFeatured ? <Sparkles size={17} /> : <Newspaper size={17} />}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{post.title}</h3>
                          <p className="text-xs text-slate-500">{postTypeLabel(post.postType)} • Atualizado em {formatDate(post.updatedAt)}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-[#17407E] ring-1 ring-blue-100">{statusLabel(post.status)}</span>
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">{categoryLabel(post.category)}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${highlightOption(post.highlightLevel).badge}`}>{highlightOption(post.highlightLevel).label}</span>
                        {post.isFeatured ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">Destaque</span> : null}
                      </div>
                      <p className="mt-3 text-sm text-slate-500">/{post.slug}</p>
                      {post.summary ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{post.summary}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Início: {formatDate(post.publishStartAt)}</span>
                        <span>Fim: {formatDate(post.publishEndAt)}</span>
                        <span>Audiências: {post.audienceGroupIds.length || 'Todos'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(post)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]">
                        Editar
                      </button>
                      {canEdit && post.status !== 'archived' ? (
                        <button type="button" onClick={() => archivePost(post)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                          <Archive size={14} />
                          Arquivar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">Resumo editorial</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Publicados</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{posts.filter((post) => post.status === 'published').length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Em destaque</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{featuredCount}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
              Publique avisos curtos para comunicados operacionais e use notícias para conteúdos mais explicativos.
            </div>
          </div>
        </aside>
      </div>

      {modalOpen ? (
        <NewsModal
          canEdit={canEdit}
          form={form}
          selectedPost={selectedPost}
          audiences={audiences}
          saving={saving}
          uploadingCover={uploadingCover}
          onClose={() => setModalOpen(false)}
          onSubmit={submitPost}
          onUpdate={updateForm}
          onToggleAudience={toggleAudience}
          onUploadCover={uploadCover}
        />
      ) : null}
      <NewsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AdminModuleShell>
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const showTooltip = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 288;
    const margin = 12;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, margin), window.innerWidth - tooltipWidth - margin);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
    setTooltipPosition({ top, left });
  };

  return (
    <span className={`${labelClassName} flex items-center gap-1.5`}>
      {label}
      <span
        ref={iconRef}
        className="inline-flex"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltipPosition(null)}
        tabIndex={0}
      >
        <Info size={13} className="text-slate-400" />
        {tooltipPosition ? (
          <span
            className="pointer-events-none fixed z-[70] w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs normal-case leading-5 tracking-normal text-slate-600 shadow-xl"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
          >
            {help}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function NewsModal({
  canEdit,
  form,
  selectedPost,
  audiences,
  saving,
  uploadingCover,
  onClose,
  onSubmit,
  onUpdate,
  onToggleAudience,
  onUploadCover,
}: {
  canEdit: boolean;
  form: NewsFormState;
  selectedPost: NewsPost | null;
  audiences: AudienceGroup[];
  saving: boolean;
  uploadingCover: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onUpdate: <K extends keyof NewsFormState>(key: K, value: NewsFormState[K]) => void;
  onToggleAudience: (audienceId: string) => void;
  onUploadCover: (file: File | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selectedPost ? 'Editar notícia/aviso' : 'Novo conteúdo'}</h2>
            <p className="mt-1 text-sm text-slate-500">Defina publicação, conteúdo, capa e visibilidade.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid max-h-[72vh] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-5 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <FieldLabel label="Título" help="Nome exibido nos cards, listas e chamadas da intranet." />
                <input className={inputClassName} value={form.title} onChange={(event) => onUpdate('title', event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel label="Slug" help="Parte final do endereço técnico. Se ficar vazio, será gerado a partir do título." />
                <input className={inputClassName} value={form.slug} onChange={(event) => onUpdate('slug', slugify(event.target.value))} placeholder="gerado-pelo-titulo" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <FieldLabel label="Tipo" help="Notícia é informativa, Aviso é operacional e Banner serve para destaques de maior visibilidade." />
                <select className={inputClassName} value={form.postType} onChange={(event) => onUpdate('postType', event.target.value)}>
                  {postTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel label="Categoria" help="Agrupa o conteúdo por tema para facilitar leitura e filtro editorial." />
                <select className={inputClassName} value={form.category} onChange={(event) => onUpdate('category', event.target.value)}>
                  {newsCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel label="Status" help="Rascunho não aparece publicamente. Publicado entra nas listagens. Arquivado remove da experiência pública." />
                <select className={inputClassName} value={form.status} onChange={(event) => onUpdate('status', event.target.value)}>
                  {postStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <FieldLabel label="Nível de destaque" help="Define a cor e a formatação visual do card na home e na gestão." />
                <select className={inputClassName} value={form.highlightLevel} onChange={(event) => onUpdate('highlightLevel', event.target.value)}>
                  {highlightLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input type="checkbox" checked={form.isFeatured} onChange={(event) => onUpdate('isFeatured', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                <span>
                  <FieldLabel label="Destaque" help="Marca o conteúdo como prioritário em listas e chamadas editoriais." />
                  <span className="block text-xs leading-5 text-slate-500">Prioriza a ordem; a cor vem do nível de destaque.</span>
                </span>
              </label>
            </div>

            <label className="block">
              <FieldLabel label="Resumo" help="Chamada curta exibida antes do texto completo e usada na busca interna." />
              <textarea className={`${inputClassName} min-h-[90px] resize-y`} value={form.summary} onChange={(event) => onUpdate('summary', event.target.value)} />
            </label>

            <label className="block">
              <FieldLabel label="Corpo" help="Texto principal da notícia ou aviso. Nesta primeira versão, quebras de linha são preservadas no JSON." />
              <textarea className={`${inputClassName} min-h-[220px] resize-y`} value={form.bodyText} onChange={(event) => onUpdate('bodyText', event.target.value)} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <FieldLabel label="Início da publicação" help="Data/hora opcional para começar a exibir o conteúdo publicado." />
                <input className={inputClassName} type="datetime-local" value={form.publishStartAt} onChange={(event) => onUpdate('publishStartAt', event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel label="Fim da publicação" help="Data/hora opcional para retirar automaticamente o conteúdo das listagens públicas." />
                <input className={inputClassName} type="datetime-local" value={form.publishEndAt} onChange={(event) => onUpdate('publishEndAt', event.target.value)} />
              </label>
            </div>
          </section>

          <aside className="space-y-5 bg-slate-50 p-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <FieldLabel label="Imagem de capa" help="Imagem opcional para representar a notícia em chamadas futuras e listagens editoriais." />
              {form.coverAssetId ? (
                <img src={coverUrl(form.coverAssetId)} alt="Capa do conteúdo" className="mt-3 max-h-44 w-full rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="mt-3 flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400">
                  <ImageIcon size={24} />
                </div>
              )}
              <label className="mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                {uploadingCover ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Enviar capa
                <input type="file" accept="image/*" disabled={uploadingCover} onChange={(event) => onUploadCover(event.target.files?.[0] || null)} className="sr-only" />
              </label>
              {form.coverAssetId ? (
                <button type="button" onClick={() => onUpdate('coverAssetId', '')} className="ml-2 text-sm font-medium text-rose-700">
                  Remover
                </button>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">Audiências</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Sem seleção, o conteúdo fica disponível para todos os usuários autenticados.</p>
              <div className="mt-3 space-y-2">
                {audiences.length === 0 ? <p className="text-sm text-slate-500">Nenhuma audiência ativa disponível.</p> : null}
                {audiences.map((audience) => (
                  <label key={audience.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <input type="checkbox" checked={form.audienceGroupIds.includes(audience.id)} onChange={() => onToggleAudience(audience.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{audience.name}</span>
                      {audience.description ? <span className="text-xs leading-5 text-slate-500">{audience.description}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Fechar
          </button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar conteúdo
          </button>
        </div>
      </div>
    </div>
  );
}

function NewsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections = [
    {
      icon: Newspaper,
      title: 'Tipos de conteúdo',
      items: [
        'Notícia funciona melhor para conteúdos explicativos e novidades internas.',
        'Aviso é indicado para comunicados objetivos, regras e orientações operacionais.',
        'Banner deve ser reservado para destaques de maior visibilidade.',
      ],
    },
    {
      icon: CalendarClock,
      title: 'Janela de publicação',
      items: [
        'Use início e fim quando o conteúdo tem validade definida.',
        'Campos vazios deixam o conteúdo publicado sem restrição por data.',
        'Rascunhos nunca aparecem publicamente, mesmo com datas preenchidas.',
      ],
    },
    {
      icon: Info,
      title: 'Categorias',
      items: [
        'Use categorias fixas para agrupar comunicados por tema sem criar variações de escrita.',
        'A categoria aparece como badge na gestão e nos cards da home.',
      ],
    },
    {
      icon: Sparkles,
      title: 'Destaque visual',
      items: [
        'O nível de destaque define cor e formatação do card.',
        'A opção Destaque continua servindo para priorizar a ordem do conteúdo.',
        'Urgente deve ser reservado para comunicações realmente críticas.',
      ],
    },
    {
      icon: Eye,
      title: 'Audiência',
      items: [
        'Sem audiência selecionada, o conteúdo fica aberto para todos os usuários autenticados.',
        'Com audiências, a publicação fica preparada para segmentação por grupos internos.',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#17407E]">
              <CircleHelp size={14} />
              Ajuda de notícias
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">Como publicar notícias e avisos</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use esta tela para comunicar novidades, avisos operacionais e destaques internos da Consultare.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#17407E] shadow-sm">
                    <Icon size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-900">{section.title}</h3>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#229A8A]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
