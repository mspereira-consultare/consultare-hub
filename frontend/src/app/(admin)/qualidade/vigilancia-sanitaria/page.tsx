'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { Download, FilePlus2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import {
  SURVEILLANCE_DOCUMENT_TYPES,
  SURVEILLANCE_EXPIRATION_STATUSES,
  SURVEILLANCE_RENEWAL_STATUSES,
  SURVEILLANCE_UNIT_LABELS,
  SURVEILLANCE_UNITS,
} from '@/lib/vigilancia_sanitaria/constants';
import type { SurveillanceDocument, SurveillanceLicense, SurveillanceSummary } from '@/lib/vigilancia_sanitaria/types';
import { SurveillanceDocumentTable } from './components/SurveillanceDocumentTable';
import { SurveillanceFormModal } from './components/SurveillanceFormModal';
import { SurveillanceLicenseTable } from './components/SurveillanceLicenseTable';
import { SurveillanceSearchableSelect } from './components/SurveillanceSearchableSelect';
import { SurveillanceSummaryView } from './components/SurveillanceSummaryView';
import { SurveillanceTabNav } from './components/SurveillanceTabNav';

type TabKey = 'gerencial' | 'licenses' | 'documents';

type Filters = {
  search: string;
  unit: string;
  expirationStatus: string;
  validFrom: string;
  validTo: string;
  renewalStatus: string;
  documentType: string;
  licenseId: string;
};

type LicenseOption = { id: string; unitName: string; licenseName: string };

const defaultFilters: Filters = {
  search: '',
  unit: 'all',
  expirationStatus: 'all',
  validFrom: '',
  validTo: '',
  renewalStatus: 'all',
  documentType: 'all',
  licenseId: 'all',
};

const emptyList = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };

const filterControlClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const buildBaseQuery = (filters: Filters, page = 1) => {
  const query = new URLSearchParams({
    search: filters.search,
    unit: filters.unit,
    expirationStatus: filters.expirationStatus,
    validFrom: filters.validFrom,
    validTo: filters.validTo,
    page: String(page),
    pageSize: '20',
  });
  return query;
};

export default function VigilanciaSanitariaPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'vigilancia_sanitaria', 'view', role);
  const canEdit = hasPermission(permissions, 'vigilancia_sanitaria', 'edit', role);

  const [activeTab, setActiveTab] = useState<TabKey>('gerencial');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [summary, setSummary] = useState<SurveillanceSummary | null>(null);
  const [licenses, setLicenses] = useState<{ items: SurveillanceLicense[]; total: number; page: number; pageSize: number; totalPages: number }>(emptyList);
  const [documents, setDocuments] = useState<{ items: SurveillanceDocument[]; total: number; page: number; pageSize: number; totalPages: number }>(emptyList);
  const [licenseOptions, setLicenseOptions] = useState<LicenseOption[]>([]);
  const [licensePage, setLicensePage] = useState(1);
  const [documentPage, setDocumentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'license' | 'document'>('license');
  const [selectedItem, setSelectedItem] = useState<SurveillanceLicense | SurveillanceDocument | null>(null);

  const filteredLicenseOptions = useMemo(() => {
    return licenseOptions.filter((item) => filters.unit === 'all' || item.unitName === filters.unit);
  }, [filters.unit, licenseOptions]);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const summaryQuery = buildBaseQuery(filters);
      summaryQuery.delete('page');
      summaryQuery.delete('pageSize');
      summaryQuery.set('itemType', 'all');

      const licenseQuery = buildBaseQuery(filters, licensePage);
      licenseQuery.set('renewalStatus', filters.renewalStatus);

      const documentQuery = buildBaseQuery(filters, documentPage);
      documentQuery.set('documentType', filters.documentType);
      documentQuery.set('licenseId', filters.licenseId);

      const optionQuery = new URLSearchParams({ pageSize: '100', page: '1' });

      const [summaryRes, licensesRes, documentsRes, optionsRes] = await Promise.all([
        fetch(`/api/admin/vigilancia-sanitaria/summary?${summaryQuery.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/vigilancia-sanitaria/licenses?${licenseQuery.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/vigilancia-sanitaria/documents?${documentQuery.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/vigilancia-sanitaria/licenses?${optionQuery.toString()}`, { cache: 'no-store' }),
      ]);

      if (!summaryRes.ok) throw new Error(await normalizeError(summaryRes));
      if (!licensesRes.ok) throw new Error(await normalizeError(licensesRes));
      if (!documentsRes.ok) throw new Error(await normalizeError(documentsRes));
      if (!optionsRes.ok) throw new Error(await normalizeError(optionsRes));

      const [summaryJson, licensesJson, documentsJson, optionsJson] = await Promise.all([
        summaryRes.json(),
        licensesRes.json(),
        documentsRes.json(),
        optionsRes.json(),
      ]);

      setSummary(summaryJson?.data || null);
      setLicenses(licensesJson?.data || emptyList);
      setDocuments(documentsJson?.data || emptyList);
      setLicenseOptions((optionsJson?.data?.items || []).map((item: SurveillanceLicense) => ({
        id: item.id,
        unitName: item.unitName,
        licenseName: item.licenseName,
      })));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [canView, documentPage, filters, licensePage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setLicensePage(1);
    setDocumentPage(1);
  };

  const openCreate = (kind: 'license' | 'document') => {
    setModalKind(kind);
    setSelectedItem(null);
    setModalOpen(true);
  };

  const openEdit = (kind: 'license' | 'document', item: SurveillanceLicense | SurveillanceDocument) => {
    setModalKind(kind);
    setSelectedItem(item);
    setModalOpen(true);
  };

  const deleteItem = async (kind: 'license' | 'document', item: SurveillanceLicense | SurveillanceDocument) => {
    if (!canEdit) return;
    const name = kind === 'license' ? (item as SurveillanceLicense).licenseName : (item as SurveillanceDocument).documentName;
    const ok = window.confirm(`Excluir "${name}"? Esta ação remove o item da listagem, mas mantém o histórico no banco.`);
    if (!ok) return;
    try {
      const path = kind === 'license' ? 'licenses' : 'documents';
      const res = await fetch(`/api/admin/vigilancia-sanitaria/${path}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await normalizeError(res));
      await loadData();
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  const onExport = () => {
    const query = buildBaseQuery(filters);
    query.delete('page');
    query.delete('pageSize');
    query.set('type', activeTab === 'licenses' ? 'licenses' : activeTab === 'documents' ? 'documents' : 'all');
    window.open(`/api/admin/vigilancia-sanitaria/export?${query.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (!canView) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Você não possui permissão para acessar Vigilância Sanitária.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/40 shadow-sm">
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md"><ShieldCheck size={20} /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Vigilância Sanitária</h1>
              <p className="mt-1 max-w-4xl text-xs text-slate-500">
                Controle de licenças, documentos regulatórios, anexos e vencimentos por unidade.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download size={16} /> Exportar XLSX
            </button>
            {canEdit ? (
              <>
                <button type="button" onClick={() => openCreate('license')} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white">
                  <FilePlus2 size={16} /> Nova licença
                </button>
                <button type="button" onClick={() => openCreate('document')} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#17407E]">
                  <FilePlus2 size={16} /> Novo documento
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 border-t border-blue-100 bg-slate-50/70 p-6 md:grid-cols-2 xl:grid-cols-6">
          <FilterField label="Busca" className="xl:col-span-2">
            <input value={filters.search} onChange={(e) => updateFilters({ search: e.target.value })} placeholder="Nome, CNAE ou responsável" className={filterControlClassName} />
          </FilterField>
          <FilterField label="Unidade">
            <select value={filters.unit} onChange={(e) => updateFilters({ unit: e.target.value, licenseId: 'all' })} className={filterControlClassName}>
              <option value="all">Todas as unidades</option>
              {SURVEILLANCE_UNITS.map((unit) => <option key={unit} value={unit}>{SURVEILLANCE_UNIT_LABELS[unit]}</option>)}
            </select>
          </FilterField>
          <FilterField label="Vencimento">
            <select value={filters.expirationStatus} onChange={(e) => updateFilters({ expirationStatus: e.target.value })} className={filterControlClassName}>
              <option value="all">Todos os vencimentos</option>
              {SURVEILLANCE_EXPIRATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Validade inicial">
            <input type="date" value={filters.validFrom} onChange={(e) => updateFilters({ validFrom: e.target.value })} className={filterControlClassName} />
          </FilterField>
          <FilterField label="Validade final">
            <input type="date" value={filters.validTo} onChange={(e) => updateFilters({ validTo: e.target.value })} className={filterControlClassName} />
          </FilterField>
        </div>
      </section>

      <SurveillanceTabNav activeTab={activeTab} onChange={setActiveTab} />

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {activeTab === 'gerencial' ? <SurveillanceSummaryView summary={summary} /> : null}

      {activeTab === 'licenses' ? (
        <div className="space-y-4">
          <TabFilterShell
            title="Filtros de licenças"
            description="Refine a listagem por status de renovação, mantendo os filtros gerais do cabeçalho."
            loading={loading}
            onRefresh={loadData}
          >
            <FilterField label="Status de renovação">
              <select value={filters.renewalStatus} onChange={(e) => updateFilters({ renewalStatus: e.target.value })} className={filterControlClassName}>
                <option value="all">Todos os status de renovação</option>
                {SURVEILLANCE_RENEWAL_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </FilterField>
          </TabFilterShell>
          <SurveillanceLicenseTable items={licenses.items} loading={loading} canEdit={canEdit} onEdit={(item) => openEdit('license', item)} onDelete={(item) => deleteItem('license', item)} />
          <Pagination page={licenses.page} totalPages={licenses.totalPages} total={licenses.total} onPrev={() => setLicensePage((p) => Math.max(1, p - 1))} onNext={() => setLicensePage((p) => Math.min(licenses.totalPages, p + 1))} />
        </div>
      ) : null}

      {activeTab === 'documents' ? (
        <div className="space-y-4">
          <TabFilterShell
            title="Filtros de documentos"
            description="Refine a listagem por tipo de documento e vínculo com licenças cadastradas."
            loading={loading}
            onRefresh={loadData}
          >
            <FilterField label="Tipo de documento">
              <select value={filters.documentType} onChange={(e) => updateFilters({ documentType: e.target.value })} className={filterControlClassName}>
                <option value="all">Todos os tipos</option>
                {SURVEILLANCE_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </FilterField>
            <FilterField label="Licença vinculada">
              <SurveillanceSearchableSelect
                value={filters.licenseId}
                onChange={(value) => updateFilters({ licenseId: value })}
                options={filteredLicenseOptions.map((license) => ({ value: license.id, label: license.licenseName }))}
                placeholder="Selecione uma licença"
                allLabel="Todas as licenças"
              />
            </FilterField>
          </TabFilterShell>
          <SurveillanceDocumentTable items={documents.items} loading={loading} canEdit={canEdit} onEdit={(item) => openEdit('document', item)} onDelete={(item) => deleteItem('document', item)} />
          <Pagination page={documents.page} totalPages={documents.totalPages} total={documents.total} onPrev={() => setDocumentPage((p) => Math.max(1, p - 1))} onNext={() => setDocumentPage((p) => Math.min(documents.totalPages, p + 1))} />
        </div>
      ) : null}

      <SurveillanceFormModal
        open={modalOpen}
        kind={modalKind}
        item={selectedItem}
        canEdit={canEdit}
        licenseOptions={licenseOptions}
        onClose={() => setModalOpen(false)}
        onSaved={loadData}
      />
    </div>
  );
}

function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className || ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TabFilterShell({
  title,
  description,
  loading,
  onRefresh,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/50 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <button type="button" onClick={onRefresh} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar tela
        </button>
      </div>
      <div className="grid gap-3 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

function Pagination({ page, totalPages, total, onPrev, onNext }: { page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <span>{total === 0 ? 'Nenhum registro' : `${total} registro(s) encontrado(s)`}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 disabled:opacity-50">Anterior</button>
        <span>Página {page} de {totalPages}</span>
        <button type="button" onClick={onNext} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 disabled:opacity-50">Próxima</button>
      </div>
    </div>
  );
}
