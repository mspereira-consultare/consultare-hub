'use client';

/* eslint-disable @next/next/no-img-element -- Admin previews render dynamic private asset URLs. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Eye,
  FileText,
  Home,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Table,
  Trash2,
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

type AssetUploadResult = {
  id: string;
  originalName: string;
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
  { value: 'image', label: 'Imagem', icon: ImageIcon },
  { value: 'callout', label: 'Destaque / aviso', icon: Sparkles },
  { value: 'quick_links', label: 'Links rápidos', icon: LinkIcon },
  { value: 'table', label: 'Tabela simples', icon: Table },
  { value: 'contact_cards', label: 'Contatos', icon: Users },
  { value: 'chatbot_entry', label: 'Entrada IA Consultare', icon: Bot },
];

const iconOptions: Array<SelectOption & { icon: typeof FileText }> = [
  { value: '', label: 'Sem ícone', icon: FileText },
  { value: 'file-text', label: 'Documento', icon: FileText },
  { value: 'home', label: 'Institucional', icon: Home },
  { value: 'book-open', label: 'Manual', icon: BookOpen },
  { value: 'megaphone', label: 'Comunicado', icon: Megaphone },
  { value: 'list-checks', label: 'Processo', icon: ListChecks },
  { value: 'layout-grid', label: 'Catálogo', icon: LayoutGrid },
  { value: 'users', label: 'Equipe', icon: Users },
  { value: 'bot', label: 'IA Consultare', icon: Bot },
];

const calloutSeverities: SelectOption[] = [
  { value: 'info', label: 'Informativo' },
  { value: 'success', label: 'Orientação' },
  { value: 'warning', label: 'Atenção' },
  { value: 'danger', label: 'Crítico' },
];

const emptyBlockData = (type: string): Record<string, unknown> => {
  if (type === 'quick_links') {
    return { title: 'Links rápidos', items: [{ label: '', url: '', description: '' }] };
  }
  if (type === 'table') {
    return { title: '', columns: ['Coluna 1', 'Coluna 2'], rows: [['', '']] };
  }
  if (type === 'image') {
    return { title: '', imageUrl: '', imageAlt: '', caption: '' };
  }
  if (type === 'contact_cards') {
    return { title: 'Contatos', contacts: [{ name: '', role: '', phone: '', email: '', notes: '' }] };
  }
  if (type === 'chatbot_entry') {
    return { title: 'IA Consultare', description: 'Assistente institucional da intranet.' };
  }
  if (type === 'callout') {
    return { title: '', body: '', severity: 'info' };
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [uploadingBlockIndex, setUploadingBlockIndex] = useState<number | null>(null);

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

  const uploadBlockImage = async (index: number, file: File | null) => {
    if (!file) return;
    try {
      setError(null);
      setUploadingBlockIndex(index);
      const body = new FormData();
      body.set('file', file);
      body.set('entityType', 'page-image');
      if (selectedPage?.id) body.set('entityId', selectedPage.id);
      const res = await fetch('/api/admin/intranet/assets', { method: 'POST', body });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const asset = json?.data as AssetUploadResult | undefined;
      if (!asset?.id) throw new Error('Falha ao recuperar o asset enviado.');
      const imageUrl = `/api/intranet/assets/${encodeURIComponent(asset.id)}/download`;
      const imageAlt = asset.originalName || 'Imagem da página';
      updateBlocks(form.blocks.map((block, currentIndex) =>
        currentIndex === index
          ? { ...block, data: { ...blockData(block), imageUrl, imageAlt } }
          : block,
      ));
      setNotice('Imagem enviada e vinculada ao bloco.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingBlockIndex(null);
    }
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
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#17407E]"
            >
              <CircleHelp size={16} />
              Como funciona
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
          onUploadBlockImage={uploadBlockImage}
          uploadingBlockIndex={uploadingBlockIndex}
          onApplyAdvancedJson={applyAdvancedJson}
        />
      ) : null}

      <PagesHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
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
  onUploadBlockImage,
  uploadingBlockIndex,
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
  onUploadBlockImage: (index: number, file: File | null) => void;
  uploadingBlockIndex: number | null;
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
                <FieldLabel label="Título" help="Nome exibido no topo da página e na lista administrativa. Use algo claro para o colaborador." />
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
                <FieldLabel label="Slug" help="Parte final do endereço. Ex.: politica-atendimento vira /politica-atendimento." />
                <input className={inputClassName} value={form.slug} onChange={(event) => updateField('slug', slugify(event.target.value))} />
              </label>
              <label className="block">
                <FieldLabel label="Status" help="Rascunho não aparece publicamente. Publicado aparece no endereço da página. Arquivado remove da experiência pública." />
                <select className={inputClassName} value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                  {pageStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel label="Tipo" help="Classificação interna da página. Para páginas comuns, mantenha Conteúdo." />
                <select className={inputClassName} value={form.pageType} onChange={(event) => updateField('pageType', event.target.value)}>
                  {pageTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel label="Ordem" help="Número usado para ordenar páginas e listas. Valores menores aparecem antes." />
                <input type="number" className={inputClassName} value={form.sortOrder} onChange={(event) => updateField('sortOrder', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <FieldLabel label="Página pai" help="Use para criar hierarquia e caminhos como /rh/beneficios. Deixe vazio para página raiz." />
                <select className={inputClassName} value={form.parentPageId} onChange={(event) => updateField('parentPageId', event.target.value)}>
                  <option value="">Sem página pai</option>
                  {pages.map((page) => <option key={page.id} value={page.id}>{page.title} (/{page.fullPath})</option>)}
                </select>
              </label>
              <div className="block">
                <FieldLabel label="Ícone" help="Ícone sugerido para menu e cartões administrativos. A navegação poderá reaproveitar esse visual." />
                <IconPicker value={form.iconName} onChange={(value) => updateField('iconName', value)} />
              </div>
              <label className="block">
                <FieldLabel label="Meta título" help="Título técnico para busca e SEO interno. Pode ficar vazio para usar o título da página." />
                <input className={inputClassName} value={form.metaTitle} onChange={(event) => updateField('metaTitle', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <FieldLabel label="Descrição / resumo" help="Resumo exibido no cabeçalho da página e usado pela busca interna." />
                <textarea className={`${inputClassName} min-h-[96px] resize-y`} value={form.metaDescription} onChange={(event) => updateField('metaDescription', event.target.value)} />
              </label>
              <label className="block md:col-span-2">
                <FieldLabel label="Resumo da alteração" help="Comentário salvo na revisão para explicar o que mudou." />
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
                  onUploadImage={onUploadBlockImage}
                  uploading={uploadingBlockIndex === index}
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

function FieldLabel({ label, help }: { label: string; help: string }) {
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const showTooltip = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 288;
    const margin = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, margin),
      window.innerWidth - tooltipWidth - margin,
    );
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

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = iconOptions.find((item) => item.value === value) || iconOptions[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition hover:border-[#17407E]"
      >
        <span className="inline-flex items-center gap-2">
          <SelectedIcon size={16} className="text-[#17407E]" />
          {selected.label}
        </span>
        <ChevronDown size={15} className="text-slate-400" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {iconOptions.map((item) => {
            const Icon = item.icon;
            const active = item.value === value;
            return (
              <button
                key={`${item.value}-${item.label}`}
                type="button"
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                  active ? 'bg-blue-50 text-[#17407E]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
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
  onUploadImage,
  uploading,
}: {
  block: IntranetBlock;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUploadImage: (index: number, file: File | null) => void;
  uploading: boolean;
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
        {block.type === 'rich_text' || block.type === 'chatbot_entry' ? (
          <SimpleTextFields
            data={data}
            index={index}
            onUpdate={onUpdate}
            descriptionLabel={block.type === 'chatbot_entry' ? 'Descrição' : 'Texto'}
            imageEnabled={block.type === 'rich_text'}
            onUploadImage={onUploadImage}
            uploading={uploading}
          />
        ) : null}
        {block.type === 'callout' ? <CalloutFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'image' ? <ImageFields data={data} index={index} onUpdate={onUpdate} onUploadImage={onUploadImage} uploading={uploading} /> : null}
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
  imageEnabled,
  onUpdate,
  onUploadImage,
  uploading,
}: {
  data: Record<string, unknown>;
  index: number;
  descriptionLabel: string;
  imageEnabled?: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onUploadImage: (index: number, file: File | null) => void;
  uploading: boolean;
}) {
  return (
    <>
      <label className="block">
        <FieldLabel label="Título" help="Título do bloco. Pode ficar vazio se o texto já tiver contexto suficiente." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <label className="block">
        <FieldLabel label={descriptionLabel} help="Conteúdo principal do bloco. Quebras de linha são preservadas na renderização." />
        <textarea
          className={`${inputClassName} min-h-[120px] resize-y`}
          value={asString(data.body || data.description)}
          onChange={(event) => onUpdate(index, data.description !== undefined ? 'description' : 'body', event.target.value)}
        />
      </label>
      {imageEnabled ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <FieldLabel label="Imagem no texto" help="Use para colocar uma imagem acima do texto ou ao lado dele em telas maiores." />
          {asString(data.imageUrl) ? (
            <img src={asString(data.imageUrl)} alt={asString(data.imageAlt) || 'Imagem do bloco'} className="mb-3 max-h-44 rounded-lg border border-slate-200 object-cover" />
          ) : null}
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onUploadImage(index, event.target.files?.[0] || null)}
                disabled={uploading}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#17407E] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-60"
              />
            </label>
            <select className={inputClassName} value={asString(data.imagePosition) || 'above'} onChange={(event) => onUpdate(index, 'imagePosition', event.target.value)}>
              <option value="above">Acima do texto</option>
              <option value="side">Ao lado do texto</option>
            </select>
          </div>
          <input className={`${inputClassName} mt-2`} placeholder="Texto alternativo da imagem" value={asString(data.imageAlt)} onChange={(event) => onUpdate(index, 'imageAlt', event.target.value)} />
          {uploading ? <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Enviando imagem...</div> : null}
        </div>
      ) : null}
    </>
  );
}

function CalloutFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  return (
    <>
      <label className="block">
        <FieldLabel label="Criticidade" help="Define cor e destaque do aviso publicado." />
        <select className={inputClassName} value={asString(data.severity) || 'info'} onChange={(event) => onUpdate(index, 'severity', event.target.value)}>
          {calloutSeverities.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
        </select>
      </label>
      <label className="block">
        <FieldLabel label="Título" help="Mensagem curta que resume o aviso." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <label className="block">
        <FieldLabel label="Texto" help="Explique o alerta, orientação ou regra que precisa aparecer em destaque." />
        <textarea className={`${inputClassName} min-h-[120px] resize-y`} value={asString(data.body)} onChange={(event) => onUpdate(index, 'body', event.target.value)} />
      </label>
    </>
  );
}

function ImageFields({
  data,
  index,
  onUpdate,
  onUploadImage,
  uploading,
}: {
  data: Record<string, unknown>;
  index: number;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onUploadImage: (index: number, file: File | null) => void;
  uploading: boolean;
}) {
  return (
    <>
      <label className="block">
        <FieldLabel label="Título" help="Título opcional exibido acima da imagem." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <FieldLabel label="Arquivo de imagem" help="Envie uma imagem para ser exibida como um bloco próprio na página." />
        {asString(data.imageUrl) ? (
          <img src={asString(data.imageUrl)} alt={asString(data.imageAlt) || 'Imagem do bloco'} className="mb-3 max-h-72 rounded-lg border border-slate-200 object-cover" />
        ) : null}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onUploadImage(index, event.target.files?.[0] || null)}
          disabled={uploading}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#17407E] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-60"
        />
        {uploading ? <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Enviando imagem...</div> : null}
      </div>
      <label className="block">
        <FieldLabel label="Texto alternativo" help="Descrição curta para acessibilidade e quando a imagem não carregar." />
        <input className={inputClassName} value={asString(data.imageAlt)} onChange={(event) => onUpdate(index, 'imageAlt', event.target.value)} />
      </label>
      <label className="block">
        <FieldLabel label="Legenda" help="Texto opcional exibido abaixo da imagem." />
        <input className={inputClassName} value={asString(data.caption)} onChange={(event) => onUpdate(index, 'caption', event.target.value)} />
      </label>
    </>
  );
}

function QuickLinksFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const items = asArray(data.items) as Array<Record<string, unknown>>;
  const updateItem = (itemIndex: number, key: string, value: string) => {
    onUpdate(index, 'items', items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, [key]: value } : item));
  };
  const removeItem = (itemIndex: number) => {
    onUpdate(index, 'items', items.filter((_, currentIndex) => currentIndex !== itemIndex));
  };

  return (
    <>
      <label className="block">
        <FieldLabel label="Título" help="Nome opcional exibido acima do conjunto de links." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <div className="space-y-3">
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Link {itemIndex + 1}</span>
              <button
                type="button"
                onClick={() => removeItem(itemIndex)}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                aria-label={`Remover link ${itemIndex + 1}`}
              >
                <Trash2 size={13} />
                Remover
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label>
                <FieldLabel label="Rótulo" help="Texto curto que aparece no cartão do link." />
                <input className={inputClassName} placeholder="Portal RH" value={asString(item.label)} onChange={(event) => updateItem(itemIndex, 'label', event.target.value)} />
              </label>
              <label>
                <FieldLabel label="Destino" help="Use um caminho interno, como /documentos, ou uma URL completa." />
                <input className={inputClassName} placeholder="/caminho ou URL" value={asString(item.url)} onChange={(event) => updateItem(itemIndex, 'url', event.target.value)} />
              </label>
              <label>
                <FieldLabel label="Descrição" help="Resumo opcional para orientar o usuário antes de abrir o link." />
                <input className={inputClassName} placeholder="Descrição" value={asString(item.description)} onChange={(event) => updateItem(itemIndex, 'description', event.target.value)} />
              </label>
            </div>
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
        <FieldLabel label="Título" help="Título opcional exibido acima da tabela." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <label className="block">
        <FieldLabel label="Colunas" help="Separe os nomes das colunas por vírgula." />
        <input className={inputClassName} value={columns.join(', ')} onChange={(event) => onUpdate(index, 'columns', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />
      </label>
      <label className="block">
        <FieldLabel label="Linhas" help="Digite uma linha por registro e separe as células com barra vertical." />
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
  const removeContact = (contactIndex: number) => {
    onUpdate(index, 'contacts', contacts.filter((_, currentIndex) => currentIndex !== contactIndex));
  };

  return (
    <>
      <label className="block">
        <FieldLabel label="Título" help="Nome opcional exibido acima dos cartões de contato." />
        <input className={inputClassName} value={asString(data.title)} onChange={(event) => onUpdate(index, 'title', event.target.value)} />
      </label>
      <div className="space-y-3">
        {contacts.map((contact, contactIndex) => (
          <div key={contactIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Contato {contactIndex + 1}</span>
              <button
                type="button"
                onClick={() => removeContact(contactIndex)}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                aria-label={`Remover contato ${contactIndex + 1}`}
              >
                <Trash2 size={13} />
                Remover
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label>
                <FieldLabel label="Nome" help="Pessoa, setor ou canal que deve aparecer no cartão." />
                <input className={inputClassName} placeholder="Nome" value={asString(contact.name)} onChange={(event) => updateContact(contactIndex, 'name', event.target.value)} />
              </label>
              <label>
                <FieldLabel label="Função" help="Cargo, responsabilidade ou contexto do contato." />
                <input className={inputClassName} placeholder="Função" value={asString(contact.role)} onChange={(event) => updateContact(contactIndex, 'role', event.target.value)} />
              </label>
              <label>
                <FieldLabel label="Telefone" help="Telefone, ramal ou WhatsApp de referência." />
                <input className={inputClassName} placeholder="Telefone" value={asString(contact.phone)} onChange={(event) => updateContact(contactIndex, 'phone', event.target.value)} />
              </label>
              <label>
                <FieldLabel label="E-mail" help="E-mail do contato ou da caixa compartilhada." />
                <input className={inputClassName} placeholder="E-mail" value={asString(contact.email)} onChange={(event) => updateContact(contactIndex, 'email', event.target.value)} />
              </label>
              <label className="md:col-span-2">
                <FieldLabel label="Observações" help="Instrução curta, horário de atendimento ou regra de uso do contato." />
                <input className={inputClassName} placeholder="Observações" value={asString(contact.notes)} onChange={(event) => updateContact(contactIndex, 'notes', event.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(index, 'contacts', [...contacts, { name: '', role: '', phone: '', email: '', notes: '' }])} className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        Adicionar contato
      </button>
    </>
  );
}

function PagesHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      icon: BookOpen,
      title: 'Fluxo recomendado',
      items: [
        'Crie a página como rascunho para revisar título, slug e conteúdo sem publicar.',
        'Use Publicado apenas quando o conteúdo estiver pronto para aparecer no acesso público.',
        'Arquivar remove a página da experiência pública sem apagar o histórico administrativo.',
      ],
    },
    {
      icon: LayoutGrid,
      title: 'Blocos de conteúdo',
      items: [
        'Texto simples serve para orientações, normas e páginas institucionais.',
        'Imagem pode ser usada como bloco próprio; no texto simples, a imagem pode ficar acima ou ao lado.',
        'Links rápidos, contatos e tabelas ajudam a transformar páginas em ferramentas de consulta.',
      ],
    },
    {
      icon: AlertTriangle,
      title: 'Avisos e criticidade',
      items: [
        'Informativo é neutro, Orientação destaca boas práticas, Atenção sinaliza cuidado e Crítico chama mais atenção.',
        'Prefira avisos curtos; regras longas funcionam melhor em texto simples abaixo do destaque.',
      ],
    },
    {
      icon: ImageIcon,
      title: 'Imagens e arquivos',
      items: [
        'Envie imagens diretamente no bloco; o sistema salva o arquivo e preenche o caminho de exibição.',
        'Use texto alternativo sempre que a imagem carregar informação importante.',
        'Para documentos, mantenha links rápidos por enquanto; a biblioteca visual de arquivos fica para um próximo corte.',
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
              Ajuda do CMS
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">Como criar e manter páginas da intranet</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use esta tela para estruturar conteúdo interno de forma padronizada, com revisão simples e blocos reutilizáveis.
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

        <div className="border-t border-slate-200 bg-white px-6 py-5">
          <h3 className="font-semibold text-slate-900">Campos principais</h3>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
            <p><strong className="text-slate-800">Slug:</strong> define o endereço público da página.</p>
            <p><strong className="text-slate-800">Página pai:</strong> monta caminhos hierárquicos, como setor/manual.</p>
            <p><strong className="text-slate-800">Público:</strong> restringe a página aos grupos selecionados quando houver grupos ativos.</p>
            <p><strong className="text-slate-800">Ícone:</strong> ajuda a identificar a página em listagens e menus.</p>
            <p><strong className="text-slate-800">Ordem:</strong> prepara a organização visual em navegação e listas.</p>
            <p><strong className="text-slate-800">JSON avançado:</strong> é um escape técnico para blocos ainda sem formulário visual.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
