'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Table,
  Users,
  X,
} from 'lucide-react';

type SelectOption = {
  value: string;
  label: string;
};

type IntranetBlock = {
  type: string;
  data: Record<string, unknown>;
};

type IntranetPage = {
  id: string;
  title: string;
  slug: string;
  fullPath: string;
  pageType: string;
  status: string;
  parentPageId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  iconName: string | null;
  sortOrder: number;
  content: {
    blocks?: IntranetBlock[];
    [key: string]: unknown;
  };
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

type PageFormState = {
  title: string;
  slug: string;
  parentPageId: string;
  pageType: string;
  status: string;
  metaTitle: string;
  metaDescription: string;
  iconName: string;
  sortOrder: string;
  audienceGroupIds: string[];
  blocks: IntranetBlock[];
  contentJson: string;
  changeSummary: string;
};

type PagesAdminProps = {
  canEdit: boolean;
};

const pageTypes: SelectOption[] = [
  { value: 'content', label: 'Conteúdo' },
  { value: 'landing', label: 'Landing page' },
  { value: 'catalog', label: 'Catálogo' },
  { value: 'faq', label: 'FAQ' },
  { value: 'news_index', label: 'Índice de notícias' },
  { value: 'system', label: 'Sistema' },
];

const pageStatuses: SelectOption[] = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Arquivado' },
];

const blockTypes: Array<SelectOption & { icon: typeof FileText }> = [
  { value: 'rich_text', label: 'Texto simples', icon: FileText },
  { value: 'callout', label: 'Destaque / aviso', icon: Sparkles },
  { value: 'quick_links', label: 'Links rápidos', icon: LinkIcon },
  { value: 'table', label: 'Tabela simples', icon: Table },
  { value: 'contact_cards', label: 'Contatos', icon: Users },
  { value: 'chatbot_entry', label: 'Entrada IA Consultare', icon: Bot },
];

const emptyBlockData = (type: string): Record<string, unknown> => {
  if (type === 'quick_links') {
    return { title: 'Links rápidos', items: [{ label: '', url: '', description: '' }] };
  }
  if (type === 'table') {
    return { title: '', columns: ['Coluna 1', 'Coluna 2'], rows: [['', '']] };
  }
  if (type === 'contact_cards') {
    return { title: 'Contatos', contacts: [{ name: '', role: '', phone: '', email: '', notes: '' }] };
  }
  if (type === 'chatbot_entry') {
    return { title: 'IA Consultare', description: 'Assistente institucional da intranet.' };
  }
  return { title: '', body: '' };
};

const emptyForm = (): PageFormState => ({
  title: '',
  slug: '',
  parentPageId: '',
  pageType: 'content',
  status: 'draft',
  metaTitle: '',
  metaDescription: '',
  iconName: '',
  sortOrder: '0',
  audienceGroupIds: [],
  blocks: [],
  contentJson: JSON.stringify({ blocks: [] }, null, 2),
  changeSummary: '',
});

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

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

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const statusLabel = (status: string) => pageStatuses.find((item) => item.value === status)?.label || status;
const pageTypeLabel = (type: string) => pageTypes.find((item) => item.value === type)?.label || type;
const blockTypeLabel = (type: string) => blockTypes.find((item) => item.value === type)?.label || type;

const blockData = (block: IntranetBlock) => block.data || {};

const asString = (value: unknown) => String(value ?? '');
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const setBlockDataValue = (
  blocks: IntranetBlock[],
  blockIndex: number,
  key: string,
  value: unknown,
) =>
  blocks.map((block, index) =>
    index === blockIndex ? { ...block, data: { ...blockData(block), [key]: value } } : block,
  );

const blocksToJson = (blocks: IntranetBlock[]) => JSON.stringify({ blocks }, null, 2);

const formFromPage = (page: IntranetPage): PageFormState => {
  const blocks = Array.isArray(page.content?.blocks) ? page.content.blocks : [];
  return {
    title: page.title || '',
    slug: page.slug || '',
    parentPageId: page.parentPageId || '',
    pageType: page.pageType || 'content',
    status: page.status || 'draft',
    metaTitle: page.metaTitle || '',
    metaDescription: page.metaDescription || '',
    iconName: page.iconName || '',
    sortOrder: String(page.sortOrder || 0),
    audienceGroupIds: page.audienceGroupIds || [],
    blocks,
    contentJson: JSON.stringify({ ...page.content, blocks }, null, 2),
    changeSummary: '',
  };
};

export function PagesAdmin({ canEdit }: PagesAdminProps) {
  const [pages, setPages] = useState<IntranetPage[]>([]);
  const [audiences, setAudiences] = useState<AudienceGroup[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState<IntranetPage | null>(null);
  const [form, setForm] = useState<PageFormState>(() => emptyForm());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const filteredParentPages = useMemo(
    () => pages.filter((page) => page.id !== selectedPage?.id && page.status !== 'archived'),
    [pages, selectedPage?.id],
  );

  const loadPages = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const query = new URLSearchParams({ search, status });
      const res = await fetch(`/api/admin/intranet/pages?${query.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setPages(Array.isArray(json?.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

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
      loadPages();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadPages]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadAudiences();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAudiences]);

  const openCreate = () => {
    setSelectedPage(null);
    setForm(emptyForm());
    setAdvancedOpen(false);
    setModalOpen(true);
  };

  const openEdit = (page: IntranetPage) => {
    setSelectedPage(page);
    setForm(formFromPage(page));
    setAdvancedOpen(false);
    setModalOpen(true);
  };

  const updateBlocks = (blocks: IntranetBlock[]) => {
    setForm((current) => ({ ...current, blocks, contentJson: blocksToJson(blocks) }));
  };

  const addBlock = (type: string) => {
    updateBlocks([...form.blocks, { type, data: emptyBlockData(type) }]);
  };

  const updateBlock = (index: number, key: string, value: unknown) => {
    updateBlocks(setBlockDataValue(form.blocks, index, key, value));
  };

  const removeBlock = (index: number) => {
    updateBlocks(form.blocks.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.blocks.length) return;
    const next = [...form.blocks];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    updateBlocks(next);
  };

  const applyAdvancedJson = () => {
    try {
      const parsed = JSON.parse(form.contentJson);
      const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
      setForm((current) => ({ ...current, blocks, contentJson: JSON.stringify({ ...parsed, blocks }, null, 2) }));
      setNotice('JSON aplicado ao editor de blocos.');
    } catch {
      setError('JSON inválido. Revise o conteúdo avançado antes de aplicar.');
    }
  };

  const submitPage = async () => {
    if (!canEdit) {
      setError('Sem permissão para editar páginas.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      let content = { blocks: form.blocks };
      if (advancedOpen) {
        const parsed = JSON.parse(form.contentJson);
        content = { ...parsed, blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [] };
      }

      const payload = {
        title: form.title,
        slug: form.slug || form.title,
        parentPageId: form.parentPageId || null,
        pageType: form.pageType,
        status: form.status,
        metaTitle: form.metaTitle || null,
        metaDescription: form.metaDescription || null,
        iconName: form.iconName || null,
        sortOrder: Number(form.sortOrder || 0),
        audienceGroupIds: form.audienceGroupIds,
        content,
        changeSummary: form.changeSummary || (selectedPage ? 'Atualização via gestão de páginas' : 'Criação via gestão de páginas'),
      };

      const url = selectedPage
        ? `/api/admin/intranet/pages/${encodeURIComponent(selectedPage.id)}`
        : '/api/admin/intranet/pages';
      const res = await fetch(url, {
        method: selectedPage ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as IntranetPage;
      setNotice(selectedPage ? 'Página atualizada com sucesso.' : 'Página criada com sucesso.');
      setSelectedPage(saved);
      setForm(formFromPage(saved));
      await loadPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const archivePage = async (page: IntranetPage) => {
    if (!canEdit) return;
    if (!window.confirm(`Arquivar "${page.title}"? A página deixará de aparecer publicamente.`)) return;
    try {
      setError(null);
      const res = await fetch(`/api/admin/intranet/pages/${encodeURIComponent(page.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Página arquivada com sucesso.');
      await loadPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3 text-[#17407E]">
              <FileText size={26} />
              <span className="text-xs font-semibold uppercase tracking-wide">CMS da Intranet</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Páginas</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Crie, edite, publique e arquive páginas baseadas em blocos padronizados.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadPages}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#17407E] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Recarregar
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={!canEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} />
              Nova página
            </button>
          </div>
        </div>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="block">
              <span className={labelClassName}>Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${inputClassName} pl-9`}
                  placeholder="Título ou caminho da página"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>
            <label className="block">
              <span className={labelClassName}>Status</span>
              <select className={inputClassName} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Todos</option>
                {pageStatuses.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Páginas cadastradas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Página</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Blocos</th>
                  <th className="px-4 py-3">Atualização</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Carregando páginas...
                    </td>
                  </tr>
                ) : pages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Nenhuma página encontrada.
                    </td>
                  </tr>
                ) : (
                  pages.map((page) => (
                    <tr key={page.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{page.title}</div>
                        <div className="mt-1 text-xs text-slate-500">/{page.fullPath}</div>
                        {page.metaDescription ? <div className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{page.metaDescription}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{pageTypeLabel(page.pageType)}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#17407E] ring-1 ring-blue-100">
                          {statusLabel(page.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{page.content?.blocks?.length || 0}</td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(page.updatedAt)}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {page.status === 'published' ? (
                            <a
                              href={`/${page.fullPath}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]"
                            >
                              <Eye size={14} />
                              Ver
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(page)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]"
                          >
                            Editar
                          </button>
                          {canEdit && page.status !== 'archived' ? (
                            <button
                              type="button"
                              onClick={() => archivePage(page)}
                              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                            >
                              <Archive size={14} />
                              Arquivar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <PageModal
          canEdit={canEdit}
          form={form}
          selectedPage={selectedPage}
          pages={filteredParentPages}
          audiences={audiences}
          saving={saving}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={setAdvancedOpen}
          onFormChange={setForm}
          onClose={() => setModalOpen(false)}
          onSubmit={submitPage}
          onAddBlock={addBlock}
          onUpdateBlock={updateBlock}
          onRemoveBlock={removeBlock}
          onMoveBlock={moveBlock}
          onApplyAdvancedJson={applyAdvancedJson}
        />
      ) : null}
    </main>
  );
}

function PageModal({
  canEdit,
  form,
  selectedPage,
  pages,
  audiences,
  saving,
  advancedOpen,
  onAdvancedOpenChange,
  onFormChange,
  onClose,
  onSubmit,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onApplyAdvancedJson,
}: {
  canEdit: boolean;
  form: PageFormState;
  selectedPage: IntranetPage | null;
  pages: IntranetPage[];
  audiences: AudienceGroup[];
  saving: boolean;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onFormChange: (form: PageFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  onAddBlock: (type: string) => void;
  onUpdateBlock: (index: number, key: string, value: unknown) => void;
  onRemoveBlock: (index: number) => void;
  onMoveBlock: (index: number, direction: -1 | 1) => void;
  onApplyAdvancedJson: () => void;
}) {
  const updateField = (key: keyof PageFormState, value: PageFormState[keyof PageFormState]) => {
    onFormChange({ ...form, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selectedPage ? 'Editar página' : 'Nova página'}</h2>
            <p className="text-sm text-slate-500">Metadados, publicação, audiências e conteúdo em blocos.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 overflow-hidden xl:grid-cols-[0.78fr_1.22fr]">
          <aside className="overflow-y-auto border-b border-slate-200 p-5 xl:border-b-0 xl:border-r">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className={labelClassName}>Título</span>
                <input
                  className={inputClassName}
                  value={form.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    onFormChange({ ...form, title, slug: form.slug || slugify(title) });
                  }}
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Slug</span>
                <input className={inputClassName} value={form.slug} onChange={(event) => updateField('slug', slugify(event.target.value))} />
              </label>
              <label className="block">
                <span className={labelClassName}>Status</span>
                <select className={inputClassName} value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                  {pageStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Tipo</span>
                <select className={inputClassName} value={form.pageType} onChange={(event) => updateField('pageType', event.target.value)}>
                  {pageTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Ordem</span>
                <input type="number" className={inputClassName} value={form.sortOrder} onChange={(event) => updateField('sortOrder', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <span className={labelClassName}>Página pai</span>
                <select className={inputClassName} value={form.parentPageId} onChange={(event) => updateField('parentPageId', event.target.value)}>
                  <option value="">Sem página pai</option>
                  {pages.map((page) => <option key={page.id} value={page.id}>{page.title} (/{page.fullPath})</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Ícone</span>
                <input className={inputClassName} value={form.iconName} onChange={(event) => updateField('iconName', event.target.value)} placeholder="file-text" />
              </label>
              <label className="block">
                <span className={labelClassName}>Meta título</span>
                <input className={inputClassName} value={form.metaTitle} onChange={(event) => updateField('metaTitle', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <span className={labelClassName}>Descrição / resumo</span>
                <textarea className={`${inputClassName} min-h-[96px] resize-y`} value={form.metaDescription} onChange={(event) => updateField('metaDescription', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <span className={labelClassName}>Resumo da alteração</span>
                <input className={inputClassName} value={form.changeSummary} onChange={(event) => updateField('changeSummary', event.target.value)} placeholder="Ex.: Ajuste de conteúdo institucional" />
              </label>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Audiências</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Sem seleção, a página fica aberta para todos os usuários autenticados.</p>
              <div className="mt-3 space-y-2">
                {audiences.length === 0 ? <p className="text-sm text-slate-500">Nenhuma audiência ativa disponível.</p> : null}
                {audiences.map((audience) => (
                  <label key={audience.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.audienceGroupIds.includes(audience.id)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...form.audienceGroupIds, audience.id]
                          : form.audienceGroupIds.filter((id) => id !== audience.id);
                        updateField('audienceGroupIds', next);
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E] focus:ring-[#17407E]"
                    />
                    <span>
                      <span className="font-medium text-slate-800">{audience.name}</span>
                      {audience.description ? <span className="block text-xs leading-5 text-slate-500">{audience.description}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          <section className="overflow-y-auto p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Conteúdo em blocos</h3>
                <p className="text-sm text-slate-500">Adicione blocos na ordem em que devem aparecer na página.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {blockTypes.map((block) => {
                  const Icon = block.icon;
                  return (
                    <button
                      key={block.value}
                      type="button"
                      onClick={() => onAddBlock(block.value)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#17407E]"
                    >
                      <Icon size={14} />
                      {block.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {form.blocks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Nenhum bloco adicionado. Comece por texto simples, destaque ou links rápidos.
                </div>
              ) : null}

              {form.blocks.map((block, index) => (
                <BlockEditor
                  key={`${block.type}-${index}`}
                  block={block}
                  index={index}
                  canMoveUp={index > 0}
                  canMoveDown={index < form.blocks.length - 1}
                  onUpdate={onUpdateBlock}
                  onRemove={onRemoveBlock}
                  onMove={onMoveBlock}
                />
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => onAdvancedOpenChange(!advancedOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
              >
                JSON avançado
                {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {advancedOpen ? (
                <div className="border-t border-slate-200 p-4">
                  <textarea
                    className={`${inputClassName} min-h-[260px] font-mono text-xs`}
                    value={form.contentJson}
                    onChange={(event) => updateField('contentJson', event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={onApplyAdvancedJson}
                    className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]"
                  >
                    Aplicar JSON no editor
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-xs text-slate-500">{selectedPage ? `ID: ${selectedPage.id}` : 'A página pública só fica disponível quando o status for Publicado.'}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Fechar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canEdit || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar página
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  index,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: IntranetBlock;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const data = blockData(block);

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Bloco {index + 1}</p>
          <h4 className="font-semibold text-slate-900">{blockTypeLabel(block.type)}</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(index, -1)} className="rounded-md border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Mover para cima">
            <ChevronUp size={15} />
          </button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(index, 1)} className="rounded-md border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Mover para baixo">
            <ChevronDown size={15} />
          </button>
          <button type="button" onClick={() => onRemove(index)} className="rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            Remover
          </button>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {block.type === 'rich_text' || block.type === 'callout' || block.type === 'chatbot_entry' ? (
          <SimpleTextFields data={data} index={index} onUpdate={onUpdate} descriptionLabel={block.type === 'chatbot_entry' ? 'Descrição' : 'Texto'} />
        ) : null}
        {block.type === 'quick_links' ? <QuickLinksFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'table' ? <TableFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'contact_cards' ? <ContactFields data={data} index={index} onUpdate={onUpdate} /> : null}
      </div>
    </article>
  );
}

function SimpleTextFields({
  data,
  index,
  descriptionLabel,
  onUpdate,
}: {
  data: Record<string, unknown>;
  index: number;
  descriptionLabel: string;
  onUpdate: (index: number, key: string, value: unknown) => void;
}) {
  return (
    <>
      <label className="block">
        <span className={labelClassName}>Título</span>
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <label className="block">
        <span className={labelClassName}>{descriptionLabel}</span>
        <textarea
          className={`${inputClassName} min-h-[120px] resize-y`}
          value={asString(data.body || data.description)}
          onChange={(event) => onUpdate(index, data.description !== undefined ? 'description' : 'body', event.target.value)}
        />
      </label>
    </>
  );
}

function QuickLinksFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const items = asArray(data.items) as Array<Record<string, unknown>>;
  const updateItem = (itemIndex: number, key: string, value: string) => {
    onUpdate(index, 'items', items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, [key]: value } : item));
  };

  return (
    <>
      <label className="block">
        <span className={labelClassName}>Título</span>
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <div className="space-y-3">
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
            <input className={inputClassName} placeholder="Rótulo" value={asString(item.label)} onChange={(event) => updateItem(itemIndex, 'label', event.target.value)} />
            <input className={inputClassName} placeholder="/caminho ou URL" value={asString(item.url)} onChange={(event) => updateItem(itemIndex, 'url', event.target.value)} />
            <input className={inputClassName} placeholder="Descrição" value={asString(item.description)} onChange={(event) => updateItem(itemIndex, 'description', event.target.value)} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(index, 'items', [...items, { label: '', url: '', description: '' }])} className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        Adicionar link
      </button>
    </>
  );
}

function TableFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const columns = (asArray(data.columns) as unknown[]).map(asString);
  const rows = asArray(data.rows) as unknown[][];

  return (
    <>
      <label className="block">
        <span className={labelClassName}>Título</span>
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <label className="block">
        <span className={labelClassName}>Colunas</span>
        <input className={inputClassName} value={columns.join(', ')} onChange={(event) => onUpdate(index, 'columns', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />
      </label>
      <label className="block">
        <span className={labelClassName}>Linhas</span>
        <textarea
          className={`${inputClassName} min-h-[120px] font-mono text-xs`}
          value={rows.map((row) => (Array.isArray(row) ? row.map(asString).join(' | ') : '')).join('\n')}
          onChange={(event) => onUpdate(index, 'rows', event.target.value.split('\n').map((row) => row.split('|').map((cell) => cell.trim())))}
          placeholder="Célula A | Célula B"
        />
      </label>
    </>
  );
}

function ContactFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const contacts = asArray(data.contacts) as Array<Record<string, unknown>>;
  const updateContact = (contactIndex: number, key: string, value: string) => {
    onUpdate(index, 'contacts', contacts.map((item, currentIndex) => currentIndex === contactIndex ? { ...item, [key]: value } : item));
  };

  return (
    <>
      <label className="block">
        <span className={labelClassName}>Título</span>
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <div className="space-y-3">
        {contacts.map((contact, contactIndex) => (
          <div key={contactIndex} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
            <input className={inputClassName} placeholder="Nome" value={asString(contact.name)} onChange={(event) => updateContact(contactIndex, 'name', event.target.value)} />
            <input className={inputClassName} placeholder="Função" value={asString(contact.role)} onChange={(event) => updateContact(contactIndex, 'role', event.target.value)} />
            <input className={inputClassName} placeholder="Telefone" value={asString(contact.phone)} onChange={(event) => updateContact(contactIndex, 'phone', event.target.value)} />
            <input className={inputClassName} placeholder="E-mail" value={asString(contact.email)} onChange={(event) => updateContact(contactIndex, 'email', event.target.value)} />
            <input className={`${inputClassName} md:col-span-2`} placeholder="Observações" value={asString(contact.notes)} onChange={(event) => updateContact(contactIndex, 'notes', event.target.value)} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(index, 'contacts', [...contacts, { name: '', role: '', phone: '', email: '', notes: '' }])} className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        Adicionar contato
      </button>
    </>
  );
}
