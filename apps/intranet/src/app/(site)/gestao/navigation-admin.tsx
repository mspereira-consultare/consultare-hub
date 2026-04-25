'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Bot,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Home,
  LayoutGrid,
  ListChecks,
  Loader2,
  Megaphone,
  Navigation,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type NavigationNode = {
  id: string;
  parentNodeId: string | null;
  nodeType: 'page' | 'external_link' | 'label' | string;
  pageId: string | null;
  label: string;
  url: string | null;
  iconName: string | null;
  sortOrder: number;
  isVisible: boolean;
  audienceMode: string;
  updatedAt: string;
};

type PageOption = {
  id: string;
  title: string;
  fullPath: string;
  iconName: string | null;
  status: string;
};

type ParentOption = {
  id: string;
  label: string;
  fixed?: boolean;
};

type NavFormState = {
  id: string | null;
  parentNodeId: string;
  nodeType: 'page' | 'external_link' | 'label';
  pageId: string;
  label: string;
  url: string;
  iconName: string;
  sortOrder: string;
  isVisible: boolean;
};

type NavigationAdminProps = {
  canEdit: boolean;
};

type IconOption = {
  value: string;
  label: string;
  icon: typeof FileText;
};

const nodeTypes = [
  { value: 'page', label: 'Página interna', description: 'Aponta para uma página publicada da intranet.' },
  { value: 'external_link', label: 'Link externo', description: 'Aponta para um sistema, documento ou URL fora da intranet.' },
  { value: 'label', label: 'Seção', description: 'Agrupa itens no menu lateral, sem link próprio.' },
] as const;

const fixedParentOptions: ParentOption[] = [
  { id: '__fixed_services__', label: 'Serviços', fixed: true },
  { id: '__fixed_system__', label: 'Sistema', fixed: true },
];

const iconOptions: IconOption[] = [
  { value: '', label: 'Sem ícone', icon: FileText },
  { value: 'file-text', label: 'Documento', icon: FileText },
  { value: 'home', label: 'Institucional', icon: Home },
  { value: 'book-open', label: 'Manual', icon: BookOpen },
  { value: 'megaphone', label: 'Comunicado', icon: Megaphone },
  { value: 'list-checks', label: 'Processo', icon: ListChecks },
  { value: 'layout-grid', label: 'Catálogo', icon: LayoutGrid },
  { value: 'users', label: 'Equipe', icon: Users },
  { value: 'bot', label: 'IA Consultare', icon: Bot },
  { value: 'external-link', label: 'Link externo', icon: ExternalLink },
];

const emptyForm = (nodeType: NavFormState['nodeType'] = 'page'): NavFormState => ({
  id: null,
  parentNodeId: '',
  nodeType,
  pageId: '',
  label: '',
  url: '',
  iconName: nodeType === 'external_link' ? 'external-link' : '',
  sortOrder: '0',
  isVisible: true,
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

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const nodeTypeLabel = (value: string) => nodeTypes.find((item) => item.value === value)?.label || value;
const iconOption = (value: string | null) => iconOptions.find((item) => item.value === (value || '')) || iconOptions[0];
const pageHref = (page: PageOption | undefined) => page ? `/${page.fullPath}`.replace(/\/+/g, '/') : '';

const buildTree = (nodes: NavigationNode[]) => {
  const byParent = new Map<string, NavigationNode[]>();
  for (const node of nodes) {
    const key = node.parentNodeId || 'root';
    byParent.set(key, [...(byParent.get(key) || []), node]);
  }
  for (const [key, children] of byParent) {
    byParent.set(key, [...children].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)));
  }
  return byParent;
};

export function NavigationAdmin({ canEdit }: NavigationAdminProps) {
  const [nodes, setNodes] = useState<NavigationNode[]>([]);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState<NavFormState>(() => emptyForm());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/navigation', { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setNodes(Array.isArray(json.data) ? json.data : []);
      setPages(Array.isArray(json.pages) ? json.pages : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar navegação.');
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

  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const parentOptions = useMemo(
    () => [
      ...fixedParentOptions,
      ...nodes
        .filter((node) => node.nodeType === 'label' && node.id !== form.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map((node) => ({ id: node.id, label: node.label })),
    ],
    [form.id, nodes],
  );
  const filteredNodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return nodes.filter((node) => {
      const page = node.pageId ? pageById.get(node.pageId) : undefined;
      const haystack = [node.label, node.url, page?.title, page?.fullPath, nodeTypeLabel(node.nodeType)].join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesType = typeFilter === 'all' || node.nodeType === typeFilter;
      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'visible' && node.isVisible) ||
        (visibilityFilter === 'hidden' && !node.isVisible);
      return matchesSearch && matchesType && matchesVisibility;
    });
  }, [nodes, pageById, search, typeFilter, visibilityFilter]);

  const openCreate = (nodeType: NavFormState['nodeType'] = 'page') => {
    setForm(emptyForm(nodeType));
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (node: NavigationNode) => {
    setForm({
      id: node.id,
      parentNodeId: node.parentNodeId || '',
      nodeType: node.nodeType === 'external_link' || node.nodeType === 'label' ? node.nodeType : 'page',
      pageId: node.pageId || '',
      label: node.label,
      url: node.url || '',
      iconName: node.iconName || '',
      sortOrder: String(node.sortOrder || 0),
      isVisible: node.isVisible,
    });
    setNotice(null);
    setError(null);
    setModalOpen(true);
  };

  const updateForm = <K extends keyof NavFormState>(key: K, value: NavFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handlePageChange = (pageId: string) => {
    const page = pageById.get(pageId);
    setForm((current) => ({
      ...current,
      pageId,
      label: current.label || page?.title || '',
      iconName: current.iconName || page?.iconName || '',
    }));
  };

  const saveNode = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        parentNodeId: form.parentNodeId || null,
        nodeType: form.nodeType,
        pageId: form.nodeType === 'page' ? form.pageId || null : null,
        label: form.label,
        url: form.nodeType === 'external_link' ? form.url : null,
        iconName: form.iconName || null,
        sortOrder: Number(form.sortOrder || 0),
        isVisible: form.isVisible,
        audienceMode: 'inherit',
      };
      const endpoint = form.id ? `/api/admin/intranet/navigation/${form.id}` : '/api/admin/intranet/navigation';
      const res = await fetch(endpoint, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setModalOpen(false);
      setNotice(form.id ? 'Item de navegação atualizado.' : 'Item de navegação criado.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNode = async (node: NavigationNode) => {
    if (!canEdit) return;
    const hasChildren = nodes.some((item) => item.parentNodeId === node.id);
    const message = hasChildren
      ? 'Este item possui filhos. Excluir agora remove apenas o item selecionado e os filhos ficarão sem seção. Continuar?'
      : `Excluir "${node.label}" da navegação?`;
    if (!window.confirm(message)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/navigation/${node.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Item removido da navegação.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir item.');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (node: NavigationNode) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/navigation/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...node, isVisible: !node.isVisible }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice(node.isVisible ? 'Item ocultado do menu.' : 'Item voltou a aparecer no menu.');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar visibilidade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModuleShell
      icon={Navigation}
      title="Navegação"
      description="Organize o menu lateral com seções, páginas publicadas e links externos usados no dia a dia."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={16} />
            Como funciona
          </button>
          <button type="button" onClick={() => openCreate('page')} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} />
            Novo item
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, página ou URL" className={`${inputClassName} pl-9`} />
          </div>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClassName}>
            <option value="all">Todos os tipos</option>
            {nodeTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className={inputClassName}>
            <option value="all">Todos</option>
            <option value="visible">Visíveis</option>
            <option value="hidden">Ocultos</option>
          </select>
        </div>
      )}
    >

          {notice ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{notice}</div> : null}
          {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}

          <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Itens cadastrados</h2>
                  <p className="text-sm text-slate-500">{filteredNodes.length} item(ns) encontrados</p>
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Carregando navegação...
                </div>
              ) : filteredNodes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p className="font-semibold text-slate-800">Nenhum item encontrado</p>
                  <p className="mt-1 text-sm text-slate-500">Crie uma seção ou vincule uma página publicada para começar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNodes.map((node) => (
                    <NodeRow
                      key={node.id}
                      node={node}
                      page={node.pageId ? pageById.get(node.pageId) : undefined}
                      depth={nodes.some((item) => item.id === node.parentNodeId) ? 1 : 0}
                      canEdit={canEdit}
                      saving={saving}
                      onEdit={openEdit}
                      onDelete={deleteNode}
                      onToggleVisibility={toggleVisibility}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside className="bg-slate-50 p-5">
              <h2 className="font-semibold text-slate-900">Prévia do menu</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">A prévia segue ordem, hierarquia e visibilidade. Páginas arquivadas ou rascunhos não aparecem no menu público.</p>
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <PreviewNodes tree={tree} pageById={pageById} parentId="root" />
                <PreviewFixedSection label="Serviços" tree={tree} pageById={pageById} parentId="__fixed_services__" />
                <PreviewFixedSection label="Sistema" tree={tree} pageById={pageById} parentId="__fixed_system__" />
              </div>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
                Use seções para organizar áreas como RH, Processos e Documentos. Também é possível colocar páginas nas seções fixas Serviços e Sistema.
              </div>
            </aside>
          </div>
      {modalOpen ? (
        <NavigationModal
          form={form}
          pages={pages}
          parentOptions={parentOptions}
          canEdit={canEdit}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onUpdate={updateForm}
          onPageChange={handlePageChange}
          onSubmit={saveNode}
        />
      ) : null}
      <NavigationHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AdminModuleShell>
  );
}

function NodeRow({
  node,
  page,
  depth,
  canEdit,
  saving,
  onEdit,
  onDelete,
  onToggleVisibility,
}: {
  node: NavigationNode;
  page?: PageOption;
  depth: number;
  canEdit: boolean;
  saving: boolean;
  onEdit: (node: NavigationNode) => void;
  onDelete: (node: NavigationNode) => void;
  onToggleVisibility: (node: NavigationNode) => void;
}) {
  const Icon = iconOption(node.iconName).icon;
  const href = node.nodeType === 'page' ? pageHref(page) : node.url || '';

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" style={{ marginLeft: depth ? 20 : 0 }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
              {node.nodeType === 'external_link' ? <ExternalLink size={17} /> : <Icon size={17} />}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{node.label}</h3>
              <p className="text-xs text-slate-500">{nodeTypeLabel(node.nodeType)} • Ordem {node.sortOrder} • Atualizado em {formatDate(node.updatedAt)}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${node.isVisible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {node.isVisible ? 'Visível' : 'Oculto'}
            </span>
          </div>
          {href ? <p className="mt-3 break-all text-sm text-slate-600">{href}</p> : null}
          {node.nodeType === 'page' && !page ? <p className="mt-3 text-sm text-amber-700">Página vinculada não está publicada ou não foi encontrada.</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onToggleVisibility(node)} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            {node.isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
            {node.isVisible ? 'Ocultar' : 'Mostrar'}
          </button>
          <button type="button" onClick={() => onEdit(node)} disabled={!canEdit} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Pencil size={15} />
            Editar
          </button>
          <button type="button" onClick={() => onDelete(node)} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg border border-rose-100 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Trash2 size={15} />
            Excluir
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewNodes({
  tree,
  pageById,
  parentId,
}: {
  tree: Map<string, NavigationNode[]>;
  pageById: Map<string, PageOption>;
  parentId: string;
}) {
  const children = tree.get(parentId) || [];
  if (children.length === 0 && parentId === 'root') return <p className="px-2 py-3 text-sm text-slate-500">Menu vazio.</p>;

  return (
    <div className={parentId === 'root' ? 'space-y-1' : 'ml-3 mt-1 space-y-1 border-l border-slate-100 pl-3'}>
      {children.filter((node) => node.isVisible).map((node) => {
        const Icon = iconOption(node.iconName).icon;
        const page = node.pageId ? pageById.get(node.pageId) : undefined;
        const href = node.nodeType === 'page' ? pageHref(page) : node.url || null;
        if (node.nodeType === 'label') {
          return (
            <div key={node.id} className="pt-2">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{node.label}</div>
              <PreviewNodes tree={tree} pageById={pageById} parentId={node.id} />
            </div>
          );
        }
        return (
          <div key={node.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-700">
            {node.nodeType === 'external_link' ? <ExternalLink size={15} className="text-[#17407E]" /> : <Icon size={15} className="text-[#17407E]" />}
            <span className="truncate">{node.label}</span>
            {href ? <span className="ml-auto max-w-[120px] truncate text-xs font-normal text-slate-400">{href}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function PreviewFixedSection({ label, tree, pageById, parentId }: {
  label: string;
  tree: Map<string, NavigationNode[]>;
  pageById: Map<string, PageOption>;
  parentId: string;
}) {
  const children = tree.get(parentId) || [];
  if (!children.some((node) => node.isVisible)) return null;
  return (
    <div className="pt-2">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <PreviewNodes tree={tree} pageById={pageById} parentId={parentId} />
    </div>
  );
}

function NavigationModal({
  form,
  pages,
  parentOptions,
  canEdit,
  saving,
  onClose,
  onUpdate,
  onPageChange,
  onSubmit,
}: {
  form: NavFormState;
  pages: PageOption[];
  parentOptions: ParentOption[];
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onUpdate: <K extends keyof NavFormState>(key: K, value: NavFormState[K]) => void;
  onPageChange: (pageId: string) => void;
  onSubmit: () => void;
}) {
  const selectedType = nodeTypes.find((item) => item.value === form.nodeType) || nodeTypes[0];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{form.id ? 'Editar item de navegação' : 'Novo item de navegação'}</h2>
            <p className="mt-1 text-sm text-slate-500">{selectedType.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <span className={labelClassName}>Tipo</span>
            <div className="grid gap-2 md:grid-cols-3">
              {nodeTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => onUpdate('nodeType', type.value)}
                  className={`rounded-lg border px-3 py-3 text-left transition ${
                    form.nodeType === type.value ? 'border-[#17407E] bg-blue-50 text-[#17407E]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-semibold">{type.label}</span>
                  <span className="mt-1 block text-xs leading-5 opacity-75">{type.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Título no menu</span>
              <input className={inputClassName} value={form.label} onChange={(event) => onUpdate('label', event.target.value)} placeholder="Ex.: Documentos internos" />
            </label>
            <label className="block">
              <span className={labelClassName}>Seção pai</span>
              <select className={inputClassName} value={form.parentNodeId} onChange={(event) => onUpdate('parentNodeId', event.target.value)}>
                <option value="">Sem seção pai</option>
                {parentOptions.map((node) => <option key={node.id} value={node.id}>{node.fixed ? `${node.label} (seção fixa)` : node.label}</option>)}
              </select>
            </label>
          </div>

          {form.nodeType === 'page' ? (
            <label className="block">
              <span className={labelClassName}>Página publicada</span>
              <select className={inputClassName} value={form.pageId} onChange={(event) => onPageChange(event.target.value)}>
                <option value="">Selecione uma página</option>
                {pages.map((page) => <option key={page.id} value={page.id}>{page.title} • /{page.fullPath}</option>)}
              </select>
            </label>
          ) : null}

          {form.nodeType === 'external_link' ? (
            <label className="block">
              <span className={labelClassName}>URL</span>
              <input className={inputClassName} value={form.url} onChange={(event) => onUpdate('url', event.target.value)} placeholder="https://..." />
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Ícone</span>
              <IconPicker value={form.iconName} onChange={(value) => onUpdate('iconName', value)} />
            </label>
            <label className="block">
              <span className={labelClassName}>Ordem</span>
              <input className={inputClassName} type="number" value={form.sortOrder} onChange={(event) => onUpdate('sortOrder', event.target.value)} />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <input type="checkbox" checked={form.isVisible} onChange={(event) => onUpdate('isVisible', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Exibir no menu lateral</span>
              <span className="mt-1 block text-sm leading-6 text-slate-500">Se desativado, o item fica salvo na gestão, mas não aparece para os usuários.</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancelar
          </button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar item
          </button>
        </div>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = iconOption(value);
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

function NavigationHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      icon: Archive,
      title: 'Seções',
      items: [
        'Use seções como títulos de grupo no menu lateral, por exemplo RH, Processos, Documentos ou Sistemas.',
        'A seção não abre página; ela apenas organiza os itens filhos.',
        'Ao excluir uma seção, os itens filhos ficam salvos e voltam para o primeiro nível do menu.',
      ],
    },
    {
      icon: FileText,
      title: 'Páginas internas',
      items: [
        'Itens de página só podem apontar para páginas publicadas no CMS.',
        'Rascunhos e páginas arquivadas não aparecem no menu público, mesmo que exista item de navegação.',
        'Ao escolher uma página, o sistema sugere título e ícone quando esses dados já existem no cadastro da página.',
      ],
    },
    {
      icon: ExternalLink,
      title: 'Links externos',
      items: [
        'Use para sistemas, documentos externos, portais ou links úteis que não são páginas da intranet.',
        'Links com http, https, mailto ou tel abrem como destinos externos quando aplicável.',
        'Prefira URLs completas para reduzir erro de navegação.',
      ],
    },
    {
      icon: Eye,
      title: 'Publicação',
      items: [
        'Visível exibe o item no menu lateral para usuários com acesso.',
        'Oculto mantém o item salvo na gestão sem aparecer publicamente.',
        'A prévia da direita ajuda a conferir ordem, hierarquia e itens ocultos antes de salvar novas mudanças.',
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
              Ajuda da navegação
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">Como organizar o menu da intranet</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Esta tela controla a estrutura do menu lateral: grupos, links para páginas publicadas e atalhos externos usados pela equipe.
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
          <h3 className="font-semibold text-slate-900">Boas práticas</h3>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
            <p><strong className="text-slate-800">Ordem:</strong> valores menores aparecem antes dentro da mesma seção.</p>
            <p><strong className="text-slate-800">Hierarquia:</strong> use no máximo poucos níveis para manter o menu fácil de escanear.</p>
            <p><strong className="text-slate-800">Títulos:</strong> prefira nomes curtos, objetivos e reconhecíveis pela equipe.</p>
            <p><strong className="text-slate-800">Ícones:</strong> ajudam na leitura, mas não precisam ser únicos em todos os itens.</p>
            <p><strong className="text-slate-800">Visibilidade:</strong> oculte itens temporários sem excluir a configuração.</p>
            <p><strong className="text-slate-800">Páginas:</strong> publique primeiro no CMS para depois vincular no menu.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
