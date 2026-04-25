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
  description: string | null;
  serviceGuidance: string | null;
  displayOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
  updatedAt: string | null;
};

type Professional = {
  professionalId: string;
  slug: string;
  displayName: string;
  shortBio: string | null;
  longBio: string | null;
  photoAssetId: string | null;
  cardHighlight: string | null;
  specialties: string[];
  serviceUnits: string[];
  contactNotes: string | null;
  displayOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
  updatedAt: string | null;
};

type CatalogItem = {
  procedimentoId: number;
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

type ProfessionalSpecialty = {
  professionalId: string;
  specialtyId: string;
};

type ProfessionalProcedure = {
  id: string;
  professionalId: string;
  procedimentoId: number;
  notes: string | null;
  displayOrder: number;
  isPublished: boolean;
};

type CatalogAdminProps = {
  canEdit: boolean;
};

type TabKey = 'specialties' | 'professionals' | 'items' | 'links';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'specialties', label: 'Especialidades' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'items', label: 'Procedimentos e exames' },
  { key: 'links', label: 'Vínculos' },
];

const catalogTypes = [
  { value: 'consultation', label: 'Consulta' },
  { value: 'procedure', label: 'Procedimento' },
  { value: 'exam', label: 'Exame' },
] as const;

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const splitLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const joinLines = (value: string[] | null | undefined) => (Array.isArray(value) ? value.join('\n') : '');

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const typeLabel = (value: string) => catalogTypes.find((item) => item.value === value)?.label || value;

const blankSpecialty = (): Specialty => ({
  id: '',
  slug: '',
  displayName: '',
  shortDescription: '',
  description: '',
  serviceGuidance: '',
  displayOrder: 0,
  isFeatured: false,
  isPublished: false,
  updatedAt: null,
});

export function CatalogAdmin({ canEdit }: CatalogAdminProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('specialties');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [professionalSpecialties, setProfessionalSpecialties] = useState<ProfessionalSpecialty[]>([]);
  const [professionalProcedures, setProfessionalProcedures] = useState<ProfessionalProcedure[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty>(() => blankSpecialty());
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedLinkProfessionalId, setSelectedLinkProfessionalId] = useState('');
  const [selectedLinkProcedureId, setSelectedLinkProcedureId] = useState<number | null>(null);
  const [linkNotes, setLinkNotes] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProfessional = useMemo(
    () => professionals.find((item) => item.professionalId === selectedProfessionalId) || professionals[0] || null,
    [professionals, selectedProfessionalId]
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.procedimentoId === selectedItemId) || items[0] || null,
    [items, selectedItemId]
  );

  const selectedProfessionalSpecialtyIds = useMemo(
    () => professionalSpecialties
      .filter((item) => item.professionalId === selectedProfessional?.professionalId)
      .map((item) => item.specialtyId),
    [professionalSpecialties, selectedProfessional?.professionalId]
  );

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [specialtiesRes, professionalsRes, itemsRes, profSpecialtiesRes, profProceduresRes] = await Promise.all([
        fetch('/api/admin/intranet/catalog/specialties?limit=200', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professionals?limit=200', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/procedures?limit=200', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professional-specialties', { cache: 'no-store' }),
        fetch('/api/admin/intranet/catalog/professional-procedures', { cache: 'no-store' }),
      ]);
      for (const res of [specialtiesRes, professionalsRes, itemsRes, profSpecialtiesRes, profProceduresRes]) {
        if (!res.ok) throw new Error(await normalizeError(res));
      }
      const [specialtiesJson, professionalsJson, itemsJson, profSpecialtiesJson, profProceduresJson] = await Promise.all([
        specialtiesRes.json(),
        professionalsRes.json(),
        itemsRes.json(),
        profSpecialtiesRes.json(),
        profProceduresRes.json(),
      ]);
      const nextSpecialties = Array.isArray(specialtiesJson?.data) ? specialtiesJson.data : [];
      const nextProfessionals = Array.isArray(professionalsJson?.data) ? professionalsJson.data : [];
      const nextItems = Array.isArray(itemsJson?.data) ? itemsJson.data : [];
      setSpecialties(nextSpecialties);
      setProfessionals(nextProfessionals);
      setItems(nextItems);
      setProfessionalSpecialties(Array.isArray(profSpecialtiesJson?.data) ? profSpecialtiesJson.data : []);
      setProfessionalProcedures(Array.isArray(profProceduresJson?.data) ? profProceduresJson.data : []);
      setSelectedSpecialty((current) => current.id ? current : nextSpecialties[0] || blankSpecialty());
      setSelectedProfessionalId((current) => current || nextProfessionals[0]?.professionalId || '');
      setSelectedItemId((current) => current || nextItems[0]?.procedimentoId || null);
      setSelectedLinkProfessionalId((current) => current || nextProfessionals[0]?.professionalId || '');
      setSelectedLinkProcedureId((current) => current || nextItems[0]?.procedimentoId || null);
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
  const filteredProfessionals = useMemo(() => filterBySearch(professionals, search, (item) => `${item.displayName} ${item.cardHighlight || ''} ${item.specialties.join(' ')}`), [professionals, search]);
  const filteredItems = useMemo(() => filterBySearch(items, search, (item) => `${item.displayName} ${item.category || ''} ${item.summary || ''}`), [items, search]);

  const saveSpecialty = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/specialties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedSpecialty,
          slug: selectedSpecialty.slug || slugify(selectedSpecialty.displayName),
        }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Especialidade salva.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar especialidade.');
    } finally {
      setSaving(false);
    }
  };

  const saveProfessional = async () => {
    if (!canEdit || saving || !selectedProfessional) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/professionals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedProfessional),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const linkRes = await fetch('/api/admin/intranet/catalog/professional-specialties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId: selectedProfessional.professionalId, specialtyIds: selectedProfessionalSpecialtyIds }),
      });
      if (!linkRes.ok) throw new Error(await normalizeError(linkRes));
      setNotice('Profissional salvo.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar profissional.');
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    if (!canEdit || saving || !selectedItem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedItem),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      setNotice('Item de catálogo salvo.');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const saveProcedureLink = async () => {
    if (!canEdit || saving || !selectedLinkProfessionalId || !selectedLinkProcedureId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intranet/catalog/professional-procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId: selectedLinkProfessionalId,
          procedimentoId: selectedLinkProcedureId,
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

  const updateProfessional = <K extends keyof Professional>(key: K, value: Professional[K]) => {
    if (!selectedProfessional) return;
    const updated = { ...selectedProfessional, [key]: value };
    setProfessionals((current) => current.map((item) => item.professionalId === updated.professionalId ? updated : item));
  };

  const updateItem = <K extends keyof CatalogItem>(key: K, value: CatalogItem[K]) => {
    if (!selectedItem) return;
    const updated = { ...selectedItem, [key]: value };
    setItems((current) => current.map((item) => item.procedimentoId === updated.procedimentoId ? updated : item));
  };

  const toggleProfessionalSpecialty = (specialtyId: string) => {
    if (!selectedProfessional) return;
    setProfessionalSpecialties((current) => {
      const exists = current.some((item) => item.professionalId === selectedProfessional.professionalId && item.specialtyId === specialtyId);
      if (exists) {
        return current.filter((item) => !(item.professionalId === selectedProfessional.professionalId && item.specialtyId === specialtyId));
      }
      return [...current, { professionalId: selectedProfessional.professionalId, specialtyId }];
    });
  };

  return (
    <AdminModuleShell
      icon={Stethoscope}
      title="Catálogo"
      description="Padronize especialidades, profissionais, procedimentos e exames para orientar o atendimento."
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
              <CatalogList
                title="Especialidades"
                count={filteredSpecialties.length}
                actionLabel="Nova"
                onAction={() => setSelectedSpecialty(blankSpecialty())}
              >
                {filteredSpecialties.map((specialty) => (
                  <ListButton key={specialty.id} active={selectedSpecialty.id === specialty.id} onClick={() => setSelectedSpecialty(specialty)} title={specialty.displayName} meta={specialty.isPublished ? 'Publicado' : 'Rascunho'} />
                ))}
              </CatalogList>
            ) : null}

            {activeTab === 'professionals' ? (
              <CatalogList title="Profissionais" count={filteredProfessionals.length}>
                {filteredProfessionals.map((professional) => (
                  <ListButton key={professional.professionalId} active={selectedProfessional?.professionalId === professional.professionalId} onClick={() => setSelectedProfessionalId(professional.professionalId)} title={professional.displayName} meta={professional.isPublished ? 'Publicado' : 'Não publicado'} />
                ))}
              </CatalogList>
            ) : null}

            {activeTab === 'items' ? (
              <CatalogList title="Procedimentos e exames" count={filteredItems.length}>
                {filteredItems.map((item) => (
                  <ListButton key={item.procedimentoId} active={selectedItem?.procedimentoId === item.procedimentoId} onClick={() => setSelectedItemId(item.procedimentoId)} title={item.displayName} meta={`${typeLabel(item.catalogType)} • ${item.isPublished ? 'Publicado' : 'Não publicado'}`} />
                ))}
              </CatalogList>
            ) : null}

            {activeTab === 'links' ? (
              <CatalogList title="Vínculos publicados" count={professionalProcedures.length}>
                {professionalProcedures.map((link) => {
                  const professional = professionals.find((item) => item.professionalId === link.professionalId);
                  const item = items.find((entry) => entry.procedimentoId === link.procedimentoId);
                  return (
                    <div key={link.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-semibold text-slate-900">{professional?.displayName || link.professionalId}</p>
                      <p className="mt-1 text-xs text-slate-500">{item?.displayName || link.procedimentoId}</p>
                    </div>
                  );
                })}
              </CatalogList>
            ) : null}
          </section>

          <section className="p-5">
            {activeTab === 'specialties' ? <SpecialtyForm value={selectedSpecialty} onChange={setSelectedSpecialty} onSave={saveSpecialty} saving={saving} canEdit={canEdit} /> : null}
            {activeTab === 'professionals' && selectedProfessional ? (
              <ProfessionalForm
                value={selectedProfessional}
                specialties={specialties}
                selectedSpecialtyIds={selectedProfessionalSpecialtyIds}
                onChange={updateProfessional}
                onToggleSpecialty={toggleProfessionalSpecialty}
                onSave={saveProfessional}
                saving={saving}
                canEdit={canEdit}
              />
            ) : null}
            {activeTab === 'items' && selectedItem ? <CatalogItemForm value={selectedItem} onChange={updateItem} onSave={saveItem} saving={saving} canEdit={canEdit} /> : null}
            {activeTab === 'links' ? (
              <LinkForm
                professionals={professionals.filter((item) => item.isPublished)}
                items={items.filter((item) => item.isPublished)}
                professionalId={selectedLinkProfessionalId}
                procedimentoId={selectedLinkProcedureId}
                notes={linkNotes}
                onProfessionalChange={setSelectedLinkProfessionalId}
                onProcedureChange={setSelectedLinkProcedureId}
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
      <div className="space-y-2">{children}</div>
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

function SpecialtyForm({ value, onChange, onSave, saving, canEdit }: { value: Specialty; onChange: (value: Specialty) => void; onSave: () => void; saving: boolean; canEdit: boolean }) {
  const update = <K extends keyof Specialty>(key: K, next: Specialty[K]) => onChange({ ...value, [key]: next });
  return (
    <FormShell title={value.id ? 'Editar especialidade' : 'Nova especialidade'} onSave={onSave} saving={saving} canEdit={canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nome" help="Nome exibido na página pública de consultas." value={value.displayName} onChange={(next) => update('displayName', next)} />
        <TextField label="Slug" help="Parte final da URL pública da especialidade." value={value.slug} onChange={(next) => update('slug', next)} placeholder={slugify(value.displayName)} />
        <TextField label="Descrição curta" help="Resumo mostrado no índice de consultas." value={value.shortDescription || ''} onChange={(next) => update('shortDescription', next)} className="md:col-span-2" />
        <TextArea label="Descrição completa" help="Explicação do que a especialidade atende." value={value.description || ''} onChange={(next) => update('description', next)} />
        <TextArea label="Orientações para atendimento" help="Regras úteis para orientar pacientes e equipe." value={value.serviceGuidance || ''} onChange={(next) => update('serviceGuidance', next)} />
        <TextField label="Ordem" help="Ordenação nas listas públicas." type="number" value={String(value.displayOrder)} onChange={(next) => update('displayOrder', Number(next || 0))} />
        <CheckField label="Publicado" help="Quando ativo, aparece em /servicos/consultas." checked={value.isPublished} onChange={(next) => update('isPublished', next)} />
        <CheckField label="Destaque" help="Prioriza a especialidade nas listagens." checked={value.isFeatured} onChange={(next) => update('isFeatured', next)} />
      </div>
    </FormShell>
  );
}

function ProfessionalForm({ value, specialties, selectedSpecialtyIds, onChange, onToggleSpecialty, onSave, saving, canEdit }: {
  value: Professional;
  specialties: Specialty[];
  selectedSpecialtyIds: string[];
  onChange: <K extends keyof Professional>(key: K, value: Professional[K]) => void;
  onToggleSpecialty: (specialtyId: string) => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
}) {
  return (
    <FormShell title="Curadoria do profissional" onSave={onSave} saving={saving} canEdit={canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nome público" help="Nome exibido nos cards e páginas públicas." value={value.displayName} onChange={(next) => onChange('displayName', next)} />
        <TextField label="Slug" help="Identificador técnico para uso futuro." value={value.slug} onChange={(next) => onChange('slug', next)} />
        <TextField label="Destaque do card" help="Frase curta, como especialidade principal ou diferencial." value={value.cardHighlight || ''} onChange={(next) => onChange('cardHighlight', next)} className="md:col-span-2" />
        <TextArea label="Bio curta" help="Resumo objetivo para o atendimento consultar rapidamente." value={value.shortBio || ''} onChange={(next) => onChange('shortBio', next)} />
        <TextArea label="Observações de atendimento" help="Instruções úteis de agenda, unidade ou restrições." value={value.contactNotes || ''} onChange={(next) => onChange('contactNotes', next)} />
        <TextArea label="Unidades" help="Uma unidade por linha. Se vazio, usa a base operacional quando disponível." value={joinLines(value.serviceUnits)} onChange={(next) => onChange('serviceUnits', splitLines(next))} />
        <TextArea label="Especialidades livres" help="Uma especialidade por linha para exibição no card." value={joinLines(value.specialties)} onChange={(next) => onChange('specialties', splitLines(next))} />
        <TextField label="Ordem" help="Ordenação nas listas públicas." type="number" value={String(value.displayOrder)} onChange={(next) => onChange('displayOrder', Number(next || 0))} />
        <CheckField label="Publicado" help="Quando ativo, o profissional pode aparecer em páginas públicas." checked={value.isPublished} onChange={(next) => onChange('isPublished', next)} />
        <CheckField label="Destaque" help="Prioriza o profissional em listas." checked={value.isFeatured} onChange={(next) => onChange('isFeatured', next)} />
      </div>
      <section className="mt-5 rounded-lg border border-slate-200 p-4">
        <FieldLabel label="Especialidades vinculadas" help="Define em quais páginas de especialidade este profissional aparece." />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {specialties.map((specialty) => (
            <label key={specialty.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <input type="checkbox" checked={selectedSpecialtyIds.includes(specialty.id)} onChange={() => onToggleSpecialty(specialty.id)} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
              <span>{specialty.displayName}</span>
            </label>
          ))}
        </div>
      </section>
    </FormShell>
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
        <TextField label="Slug" help="Parte final da URL pública." value={value.slug} onChange={(next) => onChange('slug', next)} />
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

function LinkForm({ professionals, items, professionalId, procedimentoId, notes, onProfessionalChange, onProcedureChange, onNotesChange, onSave, saving, canEdit }: {
  professionals: Professional[];
  items: CatalogItem[];
  professionalId: string;
  procedimentoId: number | null;
  notes: string;
  onProfessionalChange: (value: string) => void;
  onProcedureChange: (value: number | null) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
}) {
  return (
    <FormShell title="Vincular profissional a procedimento/exame" onSave={onSave} saving={saving} canEdit={canEdit} saveLabel="Salvar vínculo">
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <FieldLabel label="Profissional" help="Profissional publicado que executa ou orienta o item." />
          <select className={inputClassName} value={professionalId} onChange={(event) => onProfessionalChange(event.target.value)}>
            {professionals.map((professional) => <option key={professional.professionalId} value={professional.professionalId}>{professional.displayName}</option>)}
          </select>
        </label>
        <label>
          <FieldLabel label="Procedimento ou exame" help="Item publicado relacionado ao profissional." />
          <select className={inputClassName} value={procedimentoId || ''} onChange={(event) => onProcedureChange(event.target.value ? Number(event.target.value) : null)}>
            {items.map((item) => <option key={item.procedimentoId} value={item.procedimentoId}>{item.displayName} • {typeLabel(item.catalogType)}</option>)}
          </select>
        </label>
        <TextArea label="Observações do vínculo" help="Use para regras específicas desse profissional no item selecionado." value={notes} onChange={onNotesChange} className="md:col-span-2" />
      </div>
      <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#17407E]">
        <Link2 size={16} className="mb-2" />
        Especialidades são vinculadas diretamente no formulário do profissional. Esta aba cuida dos vínculos com procedimentos e exames.
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
            <p className="mt-1 text-sm leading-6 text-slate-600">Use este módulo para publicar informações oficiais que o atendimento usa para orientar pacientes.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[
            ['Especialidades', 'Criam páginas de consulta com descrição e profissionais vinculados.'],
            ['Profissionais', 'A base vem do painel, mas a intranet define publicação, textos, unidades e vínculos.'],
            ['Procedimentos e exames', 'Use tipo fixo para separar páginas públicas. Exames devem deixar preparo claro.'],
            ['Vínculos', 'Relacione profissionais aos itens que executam ou orientam.'],
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
