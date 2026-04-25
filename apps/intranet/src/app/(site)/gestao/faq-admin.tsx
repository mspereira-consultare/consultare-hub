'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleHelp,
  Edit3,
  Info,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type FaqCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
};

type FaqItem = {
  id: string;
  categoryId: string | null;
  question: string;
  answer: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  sourceType: string;
  sourceQuestionId: string | null;
  knowledgeStatus: string;
  approvedAt: string | null;
  audienceGroupIds: string[];
  updatedAt: string;
};

type AudienceGroup = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type FaqFormState = {
  question: string;
  answerText: string;
  categoryId: string;
  sortOrder: string;
  isActive: boolean;
  audienceGroupIds: string[];
};

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type FaqAdminProps = {
  canEdit: boolean;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const emptyFaqForm = (): FaqFormState => ({
  question: '',
  answerText: '',
  categoryId: '',
  sortOrder: '0',
  isActive: true,
  audienceGroupIds: [],
});

const emptyCategoryForm = (): CategoryFormState => ({
  name: '',
  slug: '',
  description: '',
  sortOrder: '0',
  isActive: true,
});

const asString = (value: unknown) => String(value ?? '');
const answerText = (answer: Record<string, unknown>) => asString(answer.text || answer.body || '');

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

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const categoryLabel = (categories: FaqCategory[], categoryId: string | null) =>
  categories.find((category) => category.id === categoryId)?.name || 'Sem categoria';

const formFromItem = (item: FaqItem): FaqFormState => ({
  question: item.question || '',
  answerText: answerText(item.answer),
  categoryId: item.categoryId || '',
  sortOrder: String(item.sortOrder || 0),
  isActive: item.isActive,
  audienceGroupIds: item.audienceGroupIds || [],
});

const formFromCategory = (category: FaqCategory): CategoryFormState => ({
  name: category.name || '',
  slug: category.slug || '',
  description: category.description || '',
  sortOrder: String(category.sortOrder || 0),
  isActive: category.isActive,
});

export function FaqAdmin({ canEdit }: FaqAdminProps) {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [audiences, setAudiences] = useState<AudienceGroup[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FaqItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory | null>(null);
  const [faqForm, setFaqForm] = useState<FaqFormState>(() => emptyFaqForm());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(() => emptyCategoryForm());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFaq = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch('/api/admin/intranet/faq', { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setCategories(Array.isArray(json?.data?.categories) ? json.data.categories : []);
      setItems(Array.isArray(json?.data?.items) ? json.data.items : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar FAQ.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      void loadFaq();
      void loadAudiences();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAudiences, loadFaq]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query || `${item.question} ${answerText(item.answer)}`.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.isActive : !item.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, items, search, statusFilter]);

  const openCreateItem = () => {
    setSelectedItem(null);
    setFaqForm({ ...emptyFaqForm(), categoryId: categories.find((category) => category.isActive)?.id || '' });
    setError(null);
    setNotice(null);
    setFaqModalOpen(true);
  };

  const openEditItem = (item: FaqItem) => {
    setSelectedItem(item);
    setFaqForm(formFromItem(item));
    setError(null);
    setNotice(null);
    setFaqModalOpen(true);
  };

  const openCreateCategory = () => {
    setSelectedCategory(null);
    setCategoryForm(emptyCategoryForm());
    setError(null);
    setNotice(null);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: FaqCategory) => {
    setSelectedCategory(category);
    setCategoryForm(formFromCategory(category));
    setError(null);
    setNotice(null);
    setCategoryModalOpen(true);
  };

  const updateFaqForm = <K extends keyof FaqFormState>(key: K, value: FaqFormState[K]) => {
    setFaqForm((current) => ({ ...current, [key]: value }));
  };

  const updateCategoryForm = <K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) => {
    setCategoryForm((current) => ({ ...current, [key]: value }));
  };

  const toggleAudience = (audienceId: string) => {
    setFaqForm((current) => ({
      ...current,
      audienceGroupIds: current.audienceGroupIds.includes(audienceId)
        ? current.audienceGroupIds.filter((id) => id !== audienceId)
        : [...current.audienceGroupIds, audienceId],
    }));
  };

  const submitItem = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        question: faqForm.question,
        answer: { text: faqForm.answerText },
        categoryId: faqForm.categoryId || null,
        sortOrder: Number(faqForm.sortOrder || 0),
        isActive: faqForm.isActive,
        sourceType: selectedItem?.sourceType || 'manual',
        sourceQuestionId: selectedItem?.sourceQuestionId || null,
        knowledgeStatus: selectedItem?.knowledgeStatus || 'pending_index',
        approvedAt: selectedItem?.approvedAt || null,
        audienceGroupIds: faqForm.audienceGroupIds,
      };
      const endpoint = selectedItem ? `/api/admin/intranet/faq/items/${encodeURIComponent(selectedItem.id)}` : '/api/admin/intranet/faq/items';
      const res = await fetch(endpoint, {
        method: selectedItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice(selectedItem ? 'Pergunta atualizada.' : 'Pergunta criada.');
      setFaqModalOpen(false);
      await loadFaq();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pergunta.');
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: categoryForm.name,
        slug: categoryForm.slug || slugify(categoryForm.name),
        description: categoryForm.description,
        sortOrder: Number(categoryForm.sortOrder || 0),
        isActive: categoryForm.isActive,
      };
      const endpoint = selectedCategory ? `/api/admin/intranet/faq/categories/${encodeURIComponent(selectedCategory.id)}` : '/api/admin/intranet/faq/categories';
      const res = await fetch(endpoint, {
        method: selectedCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice(selectedCategory ? 'Categoria atualizada.' : 'Categoria criada.');
      setCategoryModalOpen(false);
      await loadFaq();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: FaqItem) => {
    if (!canEdit) return;
    if (!window.confirm(`Excluir a pergunta "${item.question}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/faq/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Pergunta excluída.');
      await loadFaq();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir pergunta.');
    }
  };

  const deleteCategory = async (category: FaqCategory) => {
    if (!canEdit) return;
    if (!window.confirm(`Excluir a categoria "${category.name}"? Perguntas associadas ficarão sem categoria.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/faq/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Categoria excluída.');
      await loadFaq();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir categoria.');
    }
  };

  return (
    <AdminModuleShell
      icon={CircleHelp}
      title="FAQ"
      description="Gerencie perguntas frequentes, categorias e audiências publicadas na intranet."
      actions={(
        <>
          <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <CircleHelp size={16} />
            Como funciona
          </button>
          <button type="button" onClick={openCreateItem} disabled={!canEdit} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#17407E] px-3.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} />
            Nova pergunta
          </button>
        </>
      )}
      filters={(
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_240px_180px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClassName} pl-9`} placeholder="Buscar por pergunta ou resposta" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className={inputClassName} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">Todas as categorias</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      )}
    >
      {notice ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Perguntas cadastradas</h2>
            <p className="text-sm text-slate-500">{filteredItems.length} pergunta(s) encontradas</p>
          </div>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Carregando FAQ...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-semibold text-slate-800">Nenhuma pergunta encontrada</p>
              <p className="mt-1 text-sm text-slate-500">Crie perguntas frequentes para publicar respostas oficiais.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
                          <CircleHelp size={17} />
                        </div>
                        <h3 className="font-semibold text-slate-900">{item.question}</h3>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${item.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-50 text-slate-600 ring-slate-100'}`}>
                          {item.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-[#17407E] ring-1 ring-blue-100">{categoryLabel(categories, item.categoryId)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{answerText(item.answer) || 'Sem resposta cadastrada.'}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Ordem: {item.sortOrder}</span>
                        <span>Audiências: {item.audienceGroupIds.length || 'Todos'}</span>
                        <span>Conhecimento: {item.knowledgeStatus}</span>
                        <span>Atualizado em {formatDate(item.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditItem(item)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]">
                        <Edit3 size={14} />
                        Editar
                      </button>
                      {canEdit ? (
                        <button type="button" onClick={() => deleteItem(item)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50">
                          <Trash2 size={14} />
                          Excluir
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Categorias</h2>
              <p className="text-sm text-slate-500">{categories.length} categoria(s)</p>
            </div>
            <button type="button" onClick={openCreateCategory} disabled={!canEdit} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Plus size={14} />
              Nova
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {categories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Nenhuma categoria cadastrada.</div>
            ) : null}
            {categories.map((category) => (
              <div key={category.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers3 size={16} className="text-[#17407E]" />
                      <h3 className="font-semibold text-slate-900">{category.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">/{category.slug} • Ordem {category.sortOrder}</p>
                    {category.description ? <p className="mt-2 text-sm leading-5 text-slate-600">{category.description}</p> : null}
                    <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${category.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-50 text-slate-600 ring-slate-100'}`}>
                      {category.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEditCategory(category)} className="rounded-md border border-slate-200 p-2 text-slate-600 transition hover:border-[#17407E]" aria-label="Editar categoria">
                      <Edit3 size={14} />
                    </button>
                    {canEdit ? (
                      <button type="button" onClick={() => deleteCategory(category)} className="rounded-md border border-rose-100 p-2 text-rose-700 transition hover:bg-rose-50" aria-label="Excluir categoria">
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {faqModalOpen ? (
        <FaqItemModal
          canEdit={canEdit}
          form={faqForm}
          categories={categories}
          audiences={audiences}
          selectedItem={selectedItem}
          saving={saving}
          onClose={() => setFaqModalOpen(false)}
          onSubmit={submitItem}
          onUpdate={updateFaqForm}
          onToggleAudience={toggleAudience}
        />
      ) : null}
      {categoryModalOpen ? (
        <FaqCategoryModal
          canEdit={canEdit}
          form={categoryForm}
          selectedCategory={selectedCategory}
          saving={saving}
          onClose={() => setCategoryModalOpen(false)}
          onSubmit={submitCategory}
          onUpdate={updateCategoryForm}
        />
      ) : null}
      <FaqHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
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
            className="fixed z-[200] w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium normal-case leading-5 tracking-normal text-slate-600 shadow-xl"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
          >
            {help}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function FaqItemModal({
  canEdit,
  form,
  categories,
  audiences,
  selectedItem,
  saving,
  onClose,
  onSubmit,
  onUpdate,
  onToggleAudience,
}: {
  canEdit: boolean;
  form: FaqFormState;
  categories: FaqCategory[];
  audiences: AudienceGroup[];
  selectedItem: FaqItem | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onUpdate: <K extends keyof FaqFormState>(key: K, value: FaqFormState[K]) => void;
  onToggleAudience: (audienceId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selectedItem ? 'Editar pergunta' : 'Nova pergunta'}</h2>
            <p className="mt-1 text-sm text-slate-500">Pergunta, resposta, categoria, audiência e publicação.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <FieldLabel label="Pergunta" help="Use uma frase objetiva, como o colaborador naturalmente pesquisaria." />
              <input className={inputClassName} value={form.question} onChange={(event) => onUpdate('question', event.target.value)} placeholder="Ex.: Como solicito acesso ao sistema?" />
            </label>
            <label>
              <FieldLabel label="Categoria" help="Agrupa perguntas por tema na página pública e nos filtros administrativos." />
              <select className={inputClassName} value={form.categoryId} onChange={(event) => onUpdate('categoryId', event.target.value)}>
                <option value="">Sem categoria</option>
                {categories.filter((category) => category.isActive || category.id === form.categoryId).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel label="Ordem" help="Número usado para ordenar perguntas. Valores menores aparecem antes." />
              <input className={inputClassName} type="number" value={form.sortOrder} onChange={(event) => onUpdate('sortOrder', event.target.value)} />
            </label>
            <label className="md:col-span-2">
              <FieldLabel label="Resposta" help="Resposta oficial que será exibida no FAQ e poderá alimentar a base de conhecimento do chatbot." />
              <textarea className={`${inputClassName} min-h-44 resize-y`} value={form.answerText} onChange={(event) => onUpdate('answerText', event.target.value)} placeholder="Escreva uma resposta clara e validada." />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
              <input type="checkbox" checked={form.isActive} onChange={(event) => onUpdate('isActive', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
              <span>
                <FieldLabel label="Status ativo" help="Perguntas ativas aparecem na página pública quando a audiência permitir. Inativas ficam apenas na gestão." />
                <span className="text-sm text-slate-600">Publicar pergunta no FAQ.</span>
              </span>
            </label>
          </div>

          <section className="mt-5 rounded-lg border border-slate-200 p-4">
            <FieldLabel label="Audiências" help="Sem seleção, a pergunta fica disponível para todos os usuários autenticados. Com seleção, aparece apenas para os grupos escolhidos." />
            <p className="mb-3 text-sm text-slate-500">Sem seleção, a pergunta fica aberta para todos os usuários autenticados.</p>
            <div className="grid gap-2 md:grid-cols-2">
              {audiences.length === 0 ? <p className="text-sm text-slate-500">Nenhuma audiência ativa cadastrada.</p> : null}
              {audiences.map((audience) => (
                <label key={audience.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="checkbox" checked={form.audienceGroupIds.includes(audience.id)} onChange={() => onToggleAudience(audience.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
                  <span>
                    <span className="font-medium text-slate-800">{audience.name}</span>
                    {audience.description ? <span className="mt-0.5 block text-xs text-slate-500">{audience.description}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Fechar
          </button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Save size={16} />
            Salvar pergunta
          </button>
        </footer>
      </div>
    </div>
  );
}

function FaqCategoryModal({
  canEdit,
  form,
  selectedCategory,
  saving,
  onClose,
  onSubmit,
  onUpdate,
}: {
  canEdit: boolean;
  form: CategoryFormState;
  selectedCategory: FaqCategory | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onUpdate: <K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selectedCategory ? 'Editar categoria' : 'Nova categoria'}</h2>
            <p className="mt-1 text-sm text-slate-500">Organize perguntas por áreas ou temas recorrentes.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label>
            <FieldLabel label="Nome" help="Nome exibido na gestão e na página pública de FAQ." />
            <input className={inputClassName} value={form.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Ex.: RH" />
          </label>
          <label>
            <FieldLabel label="Slug" help="Identificador técnico da categoria. Se ficar vazio, será gerado pelo nome." />
            <input className={inputClassName} value={form.slug} onChange={(event) => onUpdate('slug', event.target.value)} placeholder="rh" />
          </label>
          <label>
            <FieldLabel label="Ordem" help="Número usado para ordenar categorias na página pública." />
            <input className={inputClassName} type="number" value={form.sortOrder} onChange={(event) => onUpdate('sortOrder', event.target.value)} />
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
            <input type="checkbox" checked={form.isActive} onChange={(event) => onUpdate('isActive', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
            <span>
              <FieldLabel label="Categoria ativa" help="Categorias inativas ficam disponíveis na gestão, mas não organizam a página pública." />
              <span className="text-sm text-slate-600">Exibir categoria no FAQ público.</span>
            </span>
          </label>
          <label className="md:col-span-2">
            <FieldLabel label="Descrição" help="Texto curto opcional para contextualizar a categoria." />
            <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.description} onChange={(event) => onUpdate('description', event.target.value)} />
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Fechar
          </button>
          <button type="button" onClick={onSubmit} disabled={!canEdit || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
            <Save size={16} />
            Salvar categoria
          </button>
        </footer>
      </div>
    </div>
  );
}

function FaqHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const sections = [
    {
      title: 'Publicação',
      text: 'Perguntas ativas aparecem na página /faq. Perguntas inativas ficam salvas apenas para revisão administrativa.',
    },
    {
      title: 'Categorias',
      text: 'Categorias organizam a página pública e ajudam o colaborador a encontrar respostas por tema.',
    },
    {
      title: 'Audiências',
      text: 'Sem audiência, a pergunta fica aberta para todos. Com audiência, só aparece para os grupos escolhidos.',
    },
    {
      title: 'Chatbot',
      text: 'As respostas validadas ficam preparadas para alimentar a futura base de conhecimento da IA Consultare.',
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#17407E]">
              <CircleHelp size={14} />
              Como funciona
            </div>
            <h2 className="text-xl font-semibold text-slate-900">FAQ da intranet</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Cadastre respostas oficiais para dúvidas recorrentes e mantenha a base preparada para o chatbot.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">{section.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.text}</p>
            </div>
          ))}
        </div>
        <footer className="border-t border-slate-200 p-5 text-sm leading-6 text-slate-600">
          Prefira perguntas curtas, respostas revisadas e termos usados no dia a dia da clínica. Isso melhora a busca pública e a futura indexação da IA.
        </footer>
      </div>
    </div>
  );
}
