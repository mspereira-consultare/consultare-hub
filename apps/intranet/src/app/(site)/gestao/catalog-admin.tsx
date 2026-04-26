'use client';

/* eslint-disable @next/next/no-img-element -- Pré-visualizações administrativas usam URLs autenticadas de assets da intranet. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  Link as LinkIcon,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Stethoscope,
  Table,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AdminModuleShell } from './admin-module-shell';

type Specialty = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  serviceGuidance: string | null;
};

type IntranetBlock = {
  type: string;
  data: Record<string, unknown>;
};

type SpecialtyPage = {
  specialtySlug: string;
  specialtyName: string;
  content: {
    blocks?: IntranetBlock[];
    [key: string]: unknown;
  };
  updatedAt: string | null;
};

type Professional = {
  professionalId: string;
  displayName: string;
  specialties: string[];
  serviceUnits: string[];
};

type CatalogItem = {
  id: string;
  procedimentoId: number | null;
  slug: string;
  displayName: string;
  catalogType: 'consultation' | 'procedure' | 'exam';
  category: string | null;
  subcategory: string | null;
  summary: string | null;
  description: string | null;
  requiresPreparation: boolean;
  whoPerforms: string | null;
  howItWorks: string | null;
  patientInstructions: string | null;
  preparationInstructions: string | null;
  contraindications: string | null;
  estimatedDurationText: string | null;
  recoveryNotes: string | null;
  showPrice: boolean;
  publishedPrice: number | null;
  basePrice: number | null;
  isFeatured: boolean;
  isPublished: boolean;
  displayOrder: number;
  updatedAt: string | null;
};

type ProfessionalProcedure = {
  id: string;
  professionalId: string;
  itemId: string;
  notes: string | null;
  displayOrder: number;
  isPublished: boolean;
};

type CatalogAdminProps = {
  canEdit: boolean;
};

type AssetUploadResult = {
  id: string;
  originalName: string;
};

type TabKey = 'specialties' | 'items' | 'links';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'specialties', label: 'Especialidades' },
  { key: 'items', label: 'Procedimentos e exames' },
  { key: 'links', label: 'Vínculos' },
];

const blockTypes: Array<{ value: string; label: string; icon: typeof FileText }> = [
  { value: 'rich_text', label: 'Texto simples', icon: FileText },
  { value: 'image', label: 'Imagem', icon: ImageIcon },
  { value: 'callout', label: 'Destaque / aviso', icon: Sparkles },
  { value: 'quick_links', label: 'Links rápidos', icon: LinkIcon },
  { value: 'table', label: 'Tabela simples', icon: Table },
  { value: 'contact_cards', label: 'Contatos', icon: Users },
  { value: 'chatbot_entry', label: 'Entrada IA Consultare', icon: Bot },
];

const calloutSeverities = [
  { value: 'info', label: 'Informativo' },
  { value: 'success', label: 'Orientação' },
  { value: 'warning', label: 'Atenção' },
  { value: 'danger', label: 'Crítico' },
];

const catalogTypes = [
  { value: 'consultation', label: 'Consulta' },
  { value: 'procedure', label: 'Procedimento' },
  { value: 'exam', label: 'Exame' },
] as const;

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

const typeLabel = (value: string) => catalogTypes.find((item) => item.value === value)?.label || value;

const asString = (value: unknown) => String(value ?? '');
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);
const blockData = (block: IntranetBlock) => block.data || {};
const blocksToJson = (blocks: IntranetBlock[]) => JSON.stringify({ blocks }, null, 2);

const emptyBlockData = (type: string): Record<string, unknown> => {
  if (type === 'quick_links') return { title: 'Links rápidos', items: [{ label: '', url: '', description: '' }] };
  if (type === 'table') return { title: '', columns: ['Coluna 1', 'Coluna 2'], rows: [['', '']] };
  if (type === 'image') return { title: '', imageUrl: '', imageAlt: '', caption: '' };
  if (type === 'contact_cards') return { title: 'Contatos', contacts: [{ name: '', role: '', phone: '', email: '', notes: '' }] };
  if (type === 'chatbot_entry') return { title: 'IA Consultare', description: 'Assistente institucional da intranet.' };
  if (type === 'callout') return { title: '', body: '', severity: 'info' };
  return { title: '', body: '' };
};

const blockTypeLabel = (type: string) => blockTypes.find((item) => item.value === type)?.label || type;

const blankCatalogItem = (): CatalogItem => ({
  id: '',
  procedimentoId: null,
  slug: '',
  displayName: '',
  catalogType: 'procedure',
  category: '',
  subcategory: '',
  summary: '',
  description: '',
  requiresPreparation: false,
  whoPerforms: '',
  howItWorks: '',
  patientInstructions: '',
  preparationInstructions: '',
  contraindications: '',
  estimatedDurationText: '',
  recoveryNotes: '',
  showPrice: true,
  publishedPrice: null,
  basePrice: null,
  isFeatured: false,
  isPublished: false,
  displayOrder: 0,
  updatedAt: null,
});

export function CatalogAdmin({ canEdit }: CatalogAdminProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('specialties');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyPages, setSpecialtyPages] = useState<SpecialtyPage[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [professionalProcedures, setProfessionalProcedures] = useState<ProfessionalProcedure[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [draftItem, setDraftItem] = useState<CatalogItem | null>(null);
  const [selectedLinkProfessionalId, setSelectedLinkProfessionalId] = useState('');
  const [selectedLinkItemId, setSelectedLinkItemId] = useState('');
  const [linkNotes, setLinkNotes] = useState('');
  const [selectedSpecialtySlug, setSelectedSpecialtySlug] = useState('');
  const [specialtyBlocks, setSpecialtyBlocks] = useState<IntranetBlock[]>([]);
  const [specialtyContentJson, setSpecialtyContentJson] = useState(blocksToJson([]));
  const [specialtyJsonOpen, setSpecialtyJsonOpen] = useState(false);
  const [uploadingBlockIndex, setUploadingBlockIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedSpecialtySlugRef = useRef('');

  const selectedItem = useMemo(
    () => draftItem || items.find((item) => item.id === selectedItemId) || items[0] || null,
    [draftItem, items, selectedItemId]
  );

  const selectedSpecialty = useMemo(
    () => specialties.find((item) => item.slug === selectedSpecialtySlug) || specialties[0] || null,
    [specialties, selectedSpecialtySlug]
  );

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [specialtiesRes, specialtyPagesRes, professionalsRes, itemsRes, profProceduresRes] = await Promise.all([
        fetch('/api/admin/intranet/catalog/specialties?limit=500', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/specialty-pages', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professionals?limit=500', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/procedures?limit=200', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professional-procedures', { cache: 'no-store' }),
      ]);
      for (const res of [specialtiesRes, specialtyPagesRes, professionalsRes, itemsRes, profProceduresRes]) {
        if (!res.ok) throw new Error(await normalizeError(res));
      }
      const [specialtiesJson, specialtyPagesJson, professionalsJson, itemsJson, profProceduresJson] = await Promise.all([
        specialtiesRes.json(),
        specialtyPagesRes.json(),
        professionalsRes.json(),
        itemsRes.json(),
        profProceduresRes.json(),
      ]);
      const nextSpecialties = Array.isArray(specialtiesJson?.data) ? specialtiesJson.data : [];
      const nextSpecialtyPages = Array.isArray(specialtyPagesJson?.data) ? specialtyPagesJson.data : [];
      const nextProfessionals = Array.isArray(professionalsJson?.data) ? professionalsJson.data : [];
      const nextItems = Array.isArray(itemsJson?.data) ? itemsJson.data : [];
      setSpecialties(nextSpecialties);
      setSpecialtyPages(nextSpecialtyPages);
      setProfessionals(nextProfessionals);
      setItems(nextItems);
      setProfessionalProcedures(Array.isArray(profProceduresJson?.data) ? profProceduresJson.data : []);
      setSelectedItemId((current) => current || nextItems[0]?.id || '');
      setDraftItem(null);
      setSelectedLinkProfessionalId((current) => current || nextProfessionals[0]?.professionalId || '');
      setSelectedLinkItemId((current) => current || nextItems[0]?.id || '');
      const nextSpecialtySlug = selectedSpecialtySlugRef.current || nextSpecialties[0]?.slug || '';
      selectedSpecialtySlugRef.current = nextSpecialtySlug;
      setSelectedSpecialtySlug(nextSpecialtySlug);
      const nextSpecialtyPage = nextSpecialtyPages.find((page: SpecialtyPage) => page.specialtySlug === nextSpecialtySlug);
      const nextBlocks = Array.isArray(nextSpecialtyPage?.content?.blocks) ? nextSpecialtyPage.content.blocks : [];
      setSpecialtyBlocks(nextBlocks);
      setSpecialtyContentJson(blocksToJson(nextBlocks));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAll]);

  const filteredSpecialties = useMemo(() => filterBySearch(specialties, search, (item) => `${item.displayName} ${item.shortDescription || ''}`), [search, specialties]);
  const filteredItems = useMemo(() => filterBySearch(items, search, (item) => `${item.displayName} ${item.category || ''} ${item.summary || ''}`), [items, search]);
  const filteredLinks = useMemo(() => filterBySearch(professionalProcedures, search, (link) => {
    const professional = professionals.find((item) => item.professionalId === link.professionalId);
    const item = items.find((entry) => entry.id === link.itemId);
    return `${professional?.displayName || link.professionalId} ${item?.displayName || link.itemId} ${link.notes || ''}`;
  }), [items, professionalProcedures, professionals, search]);

  const saveItem = async () => {
    if (!canEdit || saving || !selectedItem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selectedItem, slug: selectedItem.slug || slugify(selectedItem.displayName) }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as CatalogItem | undefined;
      if (saved?.id) setSelectedItemId(saved.id);
      setNotice('Item de catálogo salvo.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const saveProcedureLink = async () => {
    if (!canEdit || saving || !selectedLinkProfessionalId || !selectedLinkItemId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/professional-procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId: selectedLinkProfessionalId,
          itemId: selectedLinkItemId,
          notes: linkNotes,
          isPublished: true,
        }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Vínculo salvo.');
      setLinkNotes('');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar vínculo.');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = <K extends keyof CatalogItem>(key: K, value: CatalogItem[K]) => {
    if (!selectedItem) return;
    const updated = { ...selectedItem, [key]: value };
    if (!updated.id) {
      setDraftItem(updated);
      return;
    }
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const setBlocks = (blocks: IntranetBlock[]) => {
    setSpecialtyBlocks(blocks);
    setSpecialtyContentJson(blocksToJson(blocks));
  };

  const handleSpecialtyChange = (slug: string) => {
    selectedSpecialtySlugRef.current = slug;
    setSelectedSpecialtySlug(slug);
    const page = specialtyPages.find((item) => item.specialtySlug === slug);
    const blocks = Array.isArray(page?.content?.blocks) ? page.content.blocks : [];
    setBlocks(blocks);
  };

  const addSpecialtyBlock = (type: string) => {
    setBlocks([...specialtyBlocks, { type, data: emptyBlockData(type) }]);
  };

  const updateSpecialtyBlock = (index: number, key: string, value: unknown) => {
    setBlocks(specialtyBlocks.map((block, currentIndex) =>
      currentIndex === index ? { ...block, data: { ...blockData(block), [key]: value } } : block
    ));
  };

  const removeSpecialtyBlock = (index: number) => {
    setBlocks(specialtyBlocks.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveSpecialtyBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= specialtyBlocks.length) return;
    const next = [...specialtyBlocks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setBlocks(next);
  };

  const applySpecialtyJson = () => {
    try {
      const parsed = JSON.parse(specialtyContentJson || '{}');
      const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
      setBlocks(blocks);
      setNotice('JSON aplicado ao editor de especialidade.');
    } catch {
      setError('JSON inválido para a página da especialidade.');
    }
  };

  const uploadSpecialtyBlockImage = async (index: number, file: File | null) => {
    if (!file) return;
    setUploadingBlockIndex(index);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('entityType', 'specialty-page-image');
      body.set('entityId', selectedSpecialty?.slug || 'specialty');
      const res = await fetch('/api/admin/intranet/assets', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erro ao enviar imagem.');
      const asset = json?.data as AssetUploadResult;
      if (!asset?.id) throw new Error('Imagem enviada sem identificador.');
      setBlocks(specialtyBlocks.map((block, currentIndex) =>
        currentIndex === index
          ? { ...block, data: { ...blockData(block), imageUrl: `/api/intranet/assets/${encodeURIComponent(asset.id)}/download`, imageAlt: asset.originalName || 'Imagem da especialidade' } }
          : block
      ));
      setNotice('Imagem enviada e vinculada ao bloco.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar imagem.');
    } finally {
      setUploadingBlockIndex(null);
    }
  };

  const saveSpecialtyPage = async () => {
    if (!canEdit || saving || !selectedSpecialty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intranet/catalog/specialty-pages/${encodeURIComponent(selectedSpecialty.slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialtyName: selectedSpecialty.displayName,
          content: { blocks: specialtyBlocks },
        }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Página da especialidade salva.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar página da especialidade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModuleShell
      icon={Stethoscope}
      title="Catálogo"
      description="Cadastre procedimentos e exames; médicos e especialidades vêm do painel."
      actions={(
        <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <CircleHelp size={16} />
          Como funciona
        </button>
      )}
      filters={(
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClassName} pl-9`} placeholder="Buscar no catálogo" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? 'border-[#17407E] bg-blue-50 text-[#17407E]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}
    >
      {notice ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}

      {loading ? (
        <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">
          <Loader2 size={18} className="mr-2 animate-spin" />
          Carregando catálogo...
        </div>
      ) : (
        <div className="grid min-h-[620px] lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            {activeTab === 'specialties' ? (
              <CatalogList title="Especialidades" count={filteredSpecialties.length}>
                {filteredSpecialties.map((specialty) => {
                  const page = specialtyPages.find((item) => item.specialtySlug === specialty.slug);
                  const blockCount = page?.content?.blocks?.length || 0;
                  return (
                    <ListButton
                      key={specialty.slug}
                      active={selectedSpecialty?.slug === specialty.slug}
                      onClick={() => handleSpecialtyChange(specialty.slug)}
                      title={specialty.displayName}
                      meta={`${blockCount} bloco(s) • ${page?.updatedAt ? 'Editada' : 'Sem edição'}`}
                    />
                  );
                })}
              </CatalogList>
            ) : null}

            {activeTab === 'items' ? (
              <CatalogList
                title="Procedimentos e exames"
                count={filteredItems.length}
                actionLabel="Novo"
                onAction={() => {
                  setDraftItem(blankCatalogItem());
                  setSelectedItemId('');
                }}
              >
                {filteredItems.map((item) => (
                  <ListButton
                    key={item.id}
                    active={!draftItem && selectedItem?.id === item.id}
                    onClick={() => {
                      setDraftItem(null);
                      setSelectedItemId(item.id);
                    }}
                    title={item.displayName}
                    meta={`${typeLabel(item.catalogType)} • ${item.isPublished ? 'Publicado' : 'Não publicado'}`}
                  />
                ))}
              </CatalogList>
            ) : null}

            {activeTab === 'links' ? (
              <CatalogList title="Vínculos publicados" count={filteredLinks.length}>
                {filteredLinks.map((link) => {
                  const professional = professionals.find((item) => item.professionalId === link.professionalId);
                  const item = items.find((entry) => entry.id === link.itemId);
                  return (
                    <div key={link.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-semibold text-slate-900">{professional?.displayName || link.professionalId}</p>
                      <p className="mt-1 text-xs text-slate-500">{item?.displayName || link.itemId}</p>
                    </div>
                  );
                })}
              </CatalogList>
            ) : null}

          </section>

          <section className="p-5">
            {activeTab === 'specialties' && selectedSpecialty ? (
              <SpecialtyPageForm
                specialty={selectedSpecialty}
                blocks={specialtyBlocks}
                contentJson={specialtyContentJson}
                jsonOpen={specialtyJsonOpen}
                uploadingBlockIndex={uploadingBlockIndex}
                saving={saving}
                canEdit={canEdit}
                onAddBlock={addSpecialtyBlock}
                onUpdateBlock={updateSpecialtyBlock}
                onRemoveBlock={removeSpecialtyBlock}
                onMoveBlock={moveSpecialtyBlock}
                onUploadImage={uploadSpecialtyBlockImage}
                onContentJsonChange={setSpecialtyContentJson}
                onJsonOpenChange={setSpecialtyJsonOpen}
                onApplyJson={applySpecialtyJson}
                onSave={saveSpecialtyPage}
              />
            ) : null}
            {activeTab === 'items' && selectedItem ? <CatalogItemForm value={selectedItem} onChange={updateItem} onSave={saveItem} saving={saving} canEdit={canEdit} /> : null}
            {activeTab === 'links' ? (
              <LinkForm
                professionals={professionals}
                items={items.filter((item) => item.isPublished)}
                professionalId={selectedLinkProfessionalId}
                itemId={selectedLinkItemId}
                notes={linkNotes}
                onProfessionalChange={setSelectedLinkProfessionalId}
                onItemChange={setSelectedLinkItemId}
                onNotesChange={setLinkNotes}
                onSave={saveProcedureLink}
                saving={saving}
                canEdit={canEdit}
              />
            ) : null}
          </section>
        </div>
      )}

      <CatalogHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AdminModuleShell>
  );
}

function filterBySearch<T>(items: T[], queryRaw: string, getText: (item: T) => string) {
  const query = queryRaw.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => getText(item).toLowerCase().includes(query));
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
    setTooltipPosition({ top: Math.min(rect.bottom + 8, window.innerHeight - 120), left });
  };

  return (
    <span className={`${labelClassName} flex items-center gap-1.5`}>
      {label}
      <span ref={iconRef} className="inline-flex" onMouseEnter={showTooltip} onMouseLeave={() => setTooltipPosition(null)} onFocus={showTooltip} onBlur={() => setTooltipPosition(null)} tabIndex={0}>
        <Info size={13} className="text-slate-400" />
        {tooltipPosition ? (
          <span className="fixed z-[200] w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium normal-case leading-5 tracking-normal text-slate-600 shadow-xl" style={{ top: tooltipPosition.top, left: tooltipPosition.left }}>
            {help}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CatalogList({ title, count, actionLabel, onAction, children }: { title: string; count: number; actionLabel?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{count} item(ns)</p>
        </div>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function ListButton({ active, onClick, title, meta }: { active: boolean; onClick: () => void; title: string; meta: string }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-lg border p-3 text-left transition ${active ? 'border-[#17407E] bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
    </button>
  );
}

function SpecialtyPageForm({
  specialty,
  blocks,
  contentJson,
  jsonOpen,
  uploadingBlockIndex,
  saving,
  canEdit,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onUploadImage,
  onContentJsonChange,
  onJsonOpenChange,
  onApplyJson,
  onSave,
}: {
  specialty: Specialty;
  blocks: IntranetBlock[];
  contentJson: string;
  jsonOpen: boolean;
  uploadingBlockIndex: number | null;
  saving: boolean;
  canEdit: boolean;
  onAddBlock: (type: string) => void;
  onUpdateBlock: (index: number, key: string, value: unknown) => void;
  onRemoveBlock: (index: number) => void;
  onMoveBlock: (index: number, direction: -1 | 1) => void;
  onUploadImage: (index: number, file: File | null) => void;
  onContentJsonChange: (value: string) => void;
  onJsonOpenChange: (open: boolean) => void;
  onApplyJson: () => void;
  onSave: () => void;
}) {
  return (
    <FormShell title={`Página da especialidade: ${specialty.displayName}`} onSave={onSave} saving={saving} canEdit={canEdit} saveLabel="Salvar página">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
        Use blocos para montar o conteúdo editorial da especialidade. A lista de médicos continua automática pelo cadastro do painel.
      </div>

      <div className="mt-5">
        <div className="mb-3 flex flex-wrap gap-2">
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

        <div className="space-y-4">
          {blocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Nenhum bloco adicionado. Comece por texto simples, destaque ou tabela de valores.
            </div>
          ) : null}
          {blocks.map((block, index) => (
            <SpecialtyBlockEditor
              key={`${block.type}-${index}`}
              block={block}
              index={index}
              canMoveUp={index > 0}
              canMoveDown={index < blocks.length - 1}
              uploading={uploadingBlockIndex === index}
              onUpdate={onUpdateBlock}
              onRemove={onRemoveBlock}
              onMove={onMoveBlock}
              onUploadImage={onUploadImage}
            />
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => onJsonOpenChange(!jsonOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
          >
            JSON avançado
            {jsonOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {jsonOpen ? (
            <div className="border-t border-slate-200 p-4">
              <textarea className={`${inputClassName} min-h-[240px] font-mono text-xs`} value={contentJson} onChange={(event) => onContentJsonChange(event.target.value)} />
              <button type="button" onClick={onApplyJson} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#17407E]">
                Aplicar JSON no editor
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </FormShell>
  );
}

function SpecialtyBlockEditor({ block, index, canMoveUp, canMoveDown, uploading, onUpdate, onRemove, onMove, onUploadImage }: {
  block: IntranetBlock;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  uploading: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUploadImage: (index: number, file: File | null) => void;
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
          <button type="button" onClick={() => onRemove(index)} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            <Trash2 size={14} />
            Remover
          </button>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {(block.type === 'rich_text' || block.type === 'chatbot_entry') ? (
          <SimpleBlockFields data={data} index={index} onUpdate={onUpdate} imageEnabled={block.type === 'rich_text'} onUploadImage={onUploadImage} uploading={uploading} />
        ) : null}
        {block.type === 'callout' ? <CalloutBlockFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'image' ? <ImageBlockFields data={data} index={index} onUpdate={onUpdate} onUploadImage={onUploadImage} uploading={uploading} /> : null}
        {block.type === 'quick_links' ? <QuickLinksBlockFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'table' ? <TableBlockFields data={data} index={index} onUpdate={onUpdate} /> : null}
        {block.type === 'contact_cards' ? <ContactBlockFields data={data} index={index} onUpdate={onUpdate} /> : null}
      </div>
    </article>
  );
}

function SimpleBlockFields({ data, index, imageEnabled, uploading, onUpdate, onUploadImage }: {
  data: Record<string, unknown>;
  index: number;
  imageEnabled: boolean;
  uploading: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onUploadImage: (index: number, file: File | null) => void;
}) {
  return (
    <>
      <TextField label="Título" help="Título opcional exibido acima do bloco." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <TextArea
        label={data.description !== undefined ? 'Descrição' : 'Texto'}
        help="Conteúdo principal do bloco. Quebras de linha são preservadas."
        value={asString(data.body || data.description)}
        onChange={(next) => onUpdate(index, data.description !== undefined ? 'description' : 'body', next)}
      />
      {imageEnabled ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <FieldLabel label="Imagem no texto" help="Use para colocar uma imagem acima do texto ou ao lado dele em telas maiores." />
          {asString(data.imageUrl) ? <img src={asString(data.imageUrl)} alt={asString(data.imageAlt) || 'Imagem do bloco'} className="mb-3 max-h-44 rounded-lg border border-slate-200 object-cover" /> : null}
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <input type="file" accept="image/*" disabled={uploading} onChange={(event) => onUploadImage(index, event.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#17407E] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-60" />
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

function CalloutBlockFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  return (
    <>
      <label>
        <FieldLabel label="Criticidade" help="Define cor e destaque do aviso publicado." />
        <select className={inputClassName} value={asString(data.severity) || 'info'} onChange={(event) => onUpdate(index, 'severity', event.target.value)}>
          {calloutSeverities.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
        </select>
      </label>
      <TextField label="Título" help="Mensagem curta que resume o aviso." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <TextArea label="Texto" help="Explique o alerta, orientação ou regra da especialidade." value={asString(data.body)} onChange={(next) => onUpdate(index, 'body', next)} />
    </>
  );
}

function ImageBlockFields({ data, index, uploading, onUpdate, onUploadImage }: {
  data: Record<string, unknown>;
  index: number;
  uploading: boolean;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onUploadImage: (index: number, file: File | null) => void;
}) {
  return (
    <>
      <TextField label="Título" help="Título opcional exibido acima da imagem." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <FieldLabel label="Arquivo de imagem" help="Envie uma imagem para ser exibida como bloco próprio." />
        {asString(data.imageUrl) ? <img src={asString(data.imageUrl)} alt={asString(data.imageAlt) || 'Imagem do bloco'} className="mb-3 max-h-72 rounded-lg border border-slate-200 object-cover" /> : null}
        <input type="file" accept="image/*" disabled={uploading} onChange={(event) => onUploadImage(index, event.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#17407E] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-60" />
        {uploading ? <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Enviando imagem...</div> : null}
      </div>
      <TextField label="Texto alternativo" help="Descrição curta para acessibilidade." value={asString(data.imageAlt)} onChange={(next) => onUpdate(index, 'imageAlt', next)} />
      <TextField label="Legenda" help="Texto opcional exibido abaixo da imagem." value={asString(data.caption)} onChange={(next) => onUpdate(index, 'caption', next)} />
    </>
  );
}

function QuickLinksBlockFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const items = asArray(data.items).map((item) => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {});
  const updateItem = (itemIndex: number, key: string, value: string) => {
    onUpdate(index, 'items', items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, [key]: value } : item));
  };
  return (
    <>
      <TextField label="Título" help="Título da lista de links." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <div className="space-y-3">
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => onUpdate(index, 'items', items.filter((_, currentIndex) => currentIndex !== itemIndex))} className="text-xs font-semibold text-rose-700">Remover link</button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <input className={inputClassName} placeholder="Rótulo" value={asString(item.label)} onChange={(event) => updateItem(itemIndex, 'label', event.target.value)} />
              <input className={inputClassName} placeholder="URL" value={asString(item.url)} onChange={(event) => updateItem(itemIndex, 'url', event.target.value)} />
              <input className={inputClassName} placeholder="Descrição" value={asString(item.description)} onChange={(event) => updateItem(itemIndex, 'description', event.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(index, 'items', [...items, { label: '', url: '', description: '' }])} className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        <Plus size={14} />
        Adicionar link
      </button>
    </>
  );
}

function TableBlockFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  return (
    <>
      <TextField label="Título" help="Título opcional da tabela." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <TextArea label="Colunas" help="Informe uma coluna por linha." value={asArray(data.columns).map(asString).join('\n')} onChange={(next) => onUpdate(index, 'columns', next.split('\n').map((item) => item.trim()).filter(Boolean))} />
      <TextArea label="Linhas" help="Uma linha por registro; separe células com ponto e vírgula." value={asArray(data.rows).map((row) => Array.isArray(row) ? row.map(asString).join('; ') : asString(row)).join('\n')} onChange={(next) => onUpdate(index, 'rows', next.split('\n').filter(Boolean).map((row) => row.split(';').map((cell) => cell.trim())))} />
    </>
  );
}

function ContactBlockFields({ data, index, onUpdate }: { data: Record<string, unknown>; index: number; onUpdate: (index: number, key: string, value: unknown) => void }) {
  const contacts = asArray(data.contacts).map((item) => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {});
  const updateContact = (contactIndex: number, key: string, value: string) => {
    onUpdate(index, 'contacts', contacts.map((item, currentIndex) => currentIndex === contactIndex ? { ...item, [key]: value } : item));
  };
  return (
    <>
      <TextField label="Título" help="Título da seção de contatos." value={asString(data.title)} onChange={(next) => onUpdate(index, 'title', next)} />
      <div className="space-y-3">
        {contacts.map((contact, contactIndex) => (
          <div key={contactIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => onUpdate(index, 'contacts', contacts.filter((_, currentIndex) => currentIndex !== contactIndex))} className="text-xs font-semibold text-rose-700">Remover contato</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input className={inputClassName} placeholder="Nome" value={asString(contact.name)} onChange={(event) => updateContact(contactIndex, 'name', event.target.value)} />
              <input className={inputClassName} placeholder="Função" value={asString(contact.role)} onChange={(event) => updateContact(contactIndex, 'role', event.target.value)} />
              <input className={inputClassName} placeholder="Telefone" value={asString(contact.phone)} onChange={(event) => updateContact(contactIndex, 'phone', event.target.value)} />
              <input className={inputClassName} placeholder="E-mail" value={asString(contact.email)} onChange={(event) => updateContact(contactIndex, 'email', event.target.value)} />
              <input className={`${inputClassName} md:col-span-2`} placeholder="Observações" value={asString(contact.notes)} onChange={(event) => updateContact(contactIndex, 'notes', event.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(index, 'contacts', [...contacts, { name: '', role: '', phone: '', email: '', notes: '' }])} className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        <Plus size={14} />
        Adicionar contato
      </button>
    </>
  );
}

function CatalogItemForm({ value, onChange, onSave, saving, canEdit }: {
  value: CatalogItem;
  onChange: <K extends keyof CatalogItem>(key: K, value: CatalogItem[K]) => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
}) {
  return (
    <FormShell title="Procedimento ou exame" onSave={onSave} saving={saving} canEdit={canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nome público" help="Nome exibido na página pública." value={value.displayName} onChange={(next) => onChange('displayName', next)} />
        <label>
          <FieldLabel label="Tipo" help="Define se o item aparece em Consultas, Procedimentos ou Exames." />
          <select className={inputClassName} value={value.catalogType} onChange={(event) => onChange('catalogType', event.target.value as CatalogItem['catalogType'])}>
            {catalogTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <TextField label="Slug" help="Parte final da URL pública." value={value.slug} onChange={(next) => onChange('slug', next)} placeholder={slugify(value.displayName)} />
        <TextField label="Categoria" help="Agrupamento usado em filtros e cards." value={value.category || ''} onChange={(next) => onChange('category', next)} />
        <TextField label="Subcategoria" help="Detalhe adicional, como exames de imagem ou laboratoriais." value={value.subcategory || ''} onChange={(next) => onChange('subcategory', next)} />
        <TextField label="Quem realiza" help="Setor, profissional ou equipe responsável." value={value.whoPerforms || ''} onChange={(next) => onChange('whoPerforms', next)} />
        <TextField label="Duração estimada" help="Tempo médio ou regra de agenda." value={value.estimatedDurationText || ''} onChange={(next) => onChange('estimatedDurationText', next)} />
        <TextField label="Preço publicado" help="Valor exibido quando a opção de mostrar preço estiver ativa." value={value.publishedPrice === null ? '' : String(value.publishedPrice)} onChange={(next) => onChange('publishedPrice', next ? Number(next) : null)} />
        <TextArea label="Resumo" help="Chamada curta para índice e busca." value={value.summary || ''} onChange={(next) => onChange('summary', next)} />
        <TextArea label="Como funciona" help="Explicação prática para atendimento orientar pacientes." value={value.howItWorks || ''} onChange={(next) => onChange('howItWorks', next)} />
        <TextArea label="Preparo" help="Obrigatório para exames quando exige preparo." value={value.preparationInstructions || ''} onChange={(next) => onChange('preparationInstructions', next)} />
        <TextArea label="Orientações ao paciente" help="Instruções antes/depois, documentos ou chegada antecipada." value={value.patientInstructions || ''} onChange={(next) => onChange('patientInstructions', next)} />
        <TextArea label="Contraindicações" help="Situações em que o atendimento precisa de atenção." value={value.contraindications || ''} onChange={(next) => onChange('contraindications', next)} />
        <TextArea label="Recuperação" help="Cuidados após procedimento ou exame." value={value.recoveryNotes || ''} onChange={(next) => onChange('recoveryNotes', next)} />
        <TextField label="Ordem" help="Ordenação nas listas públicas." type="number" value={String(value.displayOrder)} onChange={(next) => onChange('displayOrder', Number(next || 0))} />
        <CheckField label="Exige preparo" help="Para exames, destaque se há preparo obrigatório." checked={value.requiresPreparation} onChange={(next) => onChange('requiresPreparation', next)} />
        <CheckField label="Mostrar preço" help="Exibe o preço publicado nas páginas públicas." checked={value.showPrice} onChange={(next) => onChange('showPrice', next)} />
        <CheckField label="Publicado" help="Quando ativo, aparece nas páginas públicas." checked={value.isPublished} onChange={(next) => onChange('isPublished', next)} />
        <CheckField label="Destaque" help="Prioriza o item nos índices." checked={value.isFeatured} onChange={(next) => onChange('isFeatured', next)} />
      </div>
    </FormShell>
  );
}

function LinkForm({ professionals, items, professionalId, itemId, notes, onProfessionalChange, onItemChange, onNotesChange, onSave, saving, canEdit }: {
  professionals: Professional[];
  items: CatalogItem[];
  professionalId: string;
  itemId: string;
  notes: string;
  onProfessionalChange: (value: string) => void;
  onItemChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
}) {
  return (
    <FormShell title="Vincular profissional a procedimento/exame" onSave={onSave} saving={saving} canEdit={canEdit} saveLabel="Salvar vínculo">
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <FieldLabel label="Profissional" help="Lista de profissionais ativos do painel. Dados cadastrais são alterados no painel." />
          <select className={inputClassName} value={professionalId} onChange={(event) => onProfessionalChange(event.target.value)}>
            {professionals.map((professional) => <option key={professional.professionalId} value={professional.professionalId}>{professional.displayName}</option>)}
          </select>
        </label>
        <label>
          <FieldLabel label="Procedimento ou exame" help="Item publicado relacionado ao profissional. O vínculo é opcional para cada exame/procedimento." />
          <select className={inputClassName} value={itemId} onChange={(event) => onItemChange(event.target.value)}>
            {items.map((item) => <option key={item.id} value={item.id}>{item.displayName} • {typeLabel(item.catalogType)}</option>)}
          </select>
        </label>
        <TextArea label="Observações do vínculo" help="Use para regras específicas desse profissional no item selecionado." value={notes} onChange={onNotesChange} className="md:col-span-2" />
      </div>
      <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
        <Link2 size={16} className="mb-2" />
        Exames e procedimentos podem ficar sem profissional vinculado. Crie vínculo apenas quando isso ajudar o atendimento.
      </div>
    </FormShell>
  );
}

function FormShell({ title, onSave, saving, canEdit, saveLabel = 'Salvar', children }: { title: string; onSave: () => void; saving: boolean; canEdit: boolean; saveLabel?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onSave} disabled={!canEdit || saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#17407E] px-4 text-sm font-semibold text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60">
          <Save size={16} />
          {saveLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function TextField({ label, help, value, onChange, placeholder, type = 'text', className = '' }: { label: string; help: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <label className={className}>
      <FieldLabel label={label} help={help} />
      <input className={inputClassName} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, help, value, onChange, className = '' }: { label: string; help: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={className}>
      <FieldLabel label={label} help={help} />
      <textarea className={`${inputClassName} min-h-28 resize-y`} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CheckField({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#17407E]" />
      <span>
        <FieldLabel label={label} help={help} />
        <span className="text-sm text-slate-600">{checked ? 'Sim' : 'Não'}</span>
      </span>
    </label>
  );
}

function CatalogHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#17407E]">
              <CircleHelp size={14} />
              Como funciona
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Catálogo de serviços</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Use este módulo para padronizar procedimentos, exames, vínculos e páginas públicas de especialidade.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[
            ['Médicos', 'Nome, foto, especialidades, unidades, idade e observações exibidas na intranet vêm do painel.'],
            ['Especialidades', 'Edite aqui o conteúdo em blocos da página pública da especialidade; isso substitui observações soltas.'],
            ['Procedimentos e exames', 'São cadastrados diretamente na intranet, com preparo, preço publicado e orientações.'],
            ['Vínculos', 'Relacione profissionais ativos aos itens quando isso ajudar. Um exame pode existir sem vínculo.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
