'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CircleHelp,
  Info,
  Link2,
  Loader2,
  Save,
  Search,
  Stethoscope,
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

type Professional = {
  professionalId: string;
  displayName: string;
  specialties: string[];
  serviceUnits: string[];
  contactNotes: string | null;
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

type TabKey = 'items' | 'links' | 'notes';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'items', label: 'Procedimentos e exames' },
  { key: 'links', label: 'Vínculos' },
  { key: 'notes', label: 'Observações' },
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
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
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
  const [selectedNoteProfessionalId, setSelectedNoteProfessionalId] = useState('');
  const [professionalNote, setProfessionalNote] = useState('');
  const [selectedNoteSpecialtySlug, setSelectedNoteSpecialtySlug] = useState('');
  const [specialtyNote, setSpecialtyNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => draftItem || items.find((item) => item.id === selectedItemId) || items[0] || null,
    [draftItem, items, selectedItemId]
  );

  const selectedNoteProfessional = useMemo(
    () => professionals.find((item) => item.professionalId === selectedNoteProfessionalId) || professionals[0] || null,
    [professionals, selectedNoteProfessionalId]
  );

  const selectedNoteSpecialty = useMemo(
    () => specialties.find((item) => item.slug === selectedNoteSpecialtySlug) || specialties[0] || null,
    [specialties, selectedNoteSpecialtySlug]
  );

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [specialtiesRes, professionalsRes, itemsRes, profProceduresRes] = await Promise.all([
        fetch('/api/admin/intranet/catalog/specialties?limit=500', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professionals?limit=500', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/procedures?limit=200', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professional-procedures', { cache: 'no-store' }),
      ]);
      for (const res of [specialtiesRes, professionalsRes, itemsRes, profProceduresRes]) {
        if (!res.ok) throw new Error(await normalizeError(res));
      }
      const [specialtiesJson, professionalsJson, itemsJson, profProceduresJson] = await Promise.all([
        specialtiesRes.json(),
        professionalsRes.json(),
        itemsRes.json(),
        profProceduresRes.json(),
      ]);
      const nextSpecialties = Array.isArray(specialtiesJson?.data) ? specialtiesJson.data : [];
      const nextProfessionals = Array.isArray(professionalsJson?.data) ? professionalsJson.data : [];
      const nextItems = Array.isArray(itemsJson?.data) ? itemsJson.data : [];
      setSpecialties(nextSpecialties);
      setProfessionals(nextProfessionals);
      setItems(nextItems);
      setProfessionalProcedures(Array.isArray(profProceduresJson?.data) ? profProceduresJson.data : []);
      setSelectedItemId((current) => current || nextItems[0]?.id || '');
      setDraftItem(null);
      setSelectedLinkProfessionalId((current) => current || nextProfessionals[0]?.professionalId || '');
      setSelectedLinkItemId((current) => current || nextItems[0]?.id || '');
      setSelectedNoteProfessionalId((current) => current || nextProfessionals[0]?.professionalId || '');
      setSelectedNoteSpecialtySlug((current) => current || nextSpecialties[0]?.slug || '');
      setProfessionalNote((current) => current || nextProfessionals[0]?.contactNotes || '');
      setSpecialtyNote((current) => current || nextSpecialties[0]?.serviceGuidance || nextSpecialties[0]?.shortDescription || '');
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

  const saveProfessionalNote = async () => {
    if (!canEdit || saving || !selectedNoteProfessional) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/professional-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId: selectedNoteProfessional.professionalId, notes: professionalNote }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Observação do profissional salva.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar observação do profissional.');
    } finally {
      setSaving(false);
    }
  };

  const saveSpecialtyNote = async () => {
    if (!canEdit || saving || !selectedNoteSpecialty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/specialty-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialtySlug: selectedNoteSpecialty.slug,
          specialtyName: selectedNoteSpecialty.displayName,
          notes: specialtyNote,
        }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Observação da especialidade salva.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar observação da especialidade.');
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

  const handleNoteProfessionalChange = (professionalId: string) => {
    setSelectedNoteProfessionalId(professionalId);
    const professional = professionals.find((item) => item.professionalId === professionalId);
    setProfessionalNote(professional?.contactNotes || '');
  };

  const handleNoteSpecialtyChange = (slug: string) => {
    setSelectedNoteSpecialtySlug(slug);
    const specialty = specialties.find((item) => item.slug === slug);
    setSpecialtyNote(specialty?.serviceGuidance || specialty?.shortDescription || '');
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

            {activeTab === 'notes' ? (
              <CatalogList title="Dados vindos do painel" count={professionals.length + specialties.length}>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
                  Médicos, especialidades, unidades e fotos são alterados no painel. Use esta aba apenas para observações internas da intranet.
                </div>
              </CatalogList>
            ) : null}
          </section>

          <section className="p-5">
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
            {activeTab === 'notes' ? (
              <NotesForm
                professionals={professionals}
                specialties={specialties}
                professionalId={selectedNoteProfessionalId}
                professionalNote={professionalNote}
                specialtySlug={selectedNoteSpecialtySlug}
                specialtyNote={specialtyNote}
                onProfessionalChange={handleNoteProfessionalChange}
                onProfessionalNoteChange={setProfessionalNote}
                onSpecialtyChange={handleNoteSpecialtyChange}
                onSpecialtyNoteChange={setSpecialtyNote}
                onSaveProfessional={saveProfessionalNote}
                onSaveSpecialty={saveSpecialtyNote}
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

function NotesForm({ professionals, specialties, professionalId, professionalNote, specialtySlug, specialtyNote, onProfessionalChange, onProfessionalNoteChange, onSpecialtyChange, onSpecialtyNoteChange, onSaveProfessional, onSaveSpecialty, saving, canEdit }: {
  professionals: Professional[];
  specialties: Specialty[];
  professionalId: string;
  professionalNote: string;
  specialtySlug: string;
  specialtyNote: string;
  onProfessionalChange: (value: string) => void;
  onProfessionalNoteChange: (value: string) => void;
  onSpecialtyChange: (value: string) => void;
  onSpecialtyNoteChange: (value: string) => void;
  onSaveProfessional: () => void;
  onSaveSpecialty: () => void;
  saving: boolean;
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <FormShell title="Observação do profissional" onSave={onSaveProfessional} saving={saving} canEdit={canEdit}>
        <label>
          <FieldLabel label="Profissional" help="Profissionais ativos vêm do painel. A intranet salva apenas esta observação interna." />
          <select className={inputClassName} value={professionalId} onChange={(event) => onProfessionalChange(event.target.value)}>
            {professionals.map((professional) => <option key={professional.professionalId} value={professional.professionalId}>{professional.displayName}</option>)}
          </select>
        </label>
        <TextArea label="Observação interna" help="Informação pontual para orientar atendimento. Não substitui o cadastro oficial do painel." value={professionalNote} onChange={onProfessionalNoteChange} className="mt-4" />
      </FormShell>

      <FormShell title="Observação da especialidade" onSave={onSaveSpecialty} saving={saving} canEdit={canEdit}>
        <label>
          <FieldLabel label="Especialidade" help="Especialidades são geradas a partir do cadastro dos profissionais ativos no painel." />
          <select className={inputClassName} value={specialtySlug} onChange={(event) => onSpecialtyChange(event.target.value)}>
            {specialties.map((specialty) => <option key={specialty.slug} value={specialty.slug}>{specialty.displayName}</option>)}
          </select>
        </label>
        <TextArea label="Observação interna" help="Orientação pontual exibida na página da especialidade dentro da intranet." value={specialtyNote} onChange={onSpecialtyNoteChange} className="mt-4" />
      </FormShell>
    </div>
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
            <p className="mt-1 text-sm leading-6 text-slate-600">Use este módulo para padronizar procedimentos, exames e observações internas de atendimento.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[
            ['Médicos', 'Nome, foto, especialidades, unidades e status vêm do painel. Altere esses dados no painel.'],
            ['Observações', 'A intranet salva apenas notas internas pontuais para orientar o atendimento.'],
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
