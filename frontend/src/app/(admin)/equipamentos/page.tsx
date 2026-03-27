'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ShieldCheck, Wrench } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type { EquipmentListItem, EquipmentListSummary } from '@/lib/equipamentos/types';
import { EquipmentFiltersBar } from './components/EquipmentFiltersBar';
import { EquipmentFormModal } from './components/EquipmentFormModal';
import { EquipmentSummaryCards } from './components/EquipmentSummaryCards';
import { EquipmentTable } from './components/EquipmentTable';

type SelectOption = { value: string; label: string };

type EquipmentOptionsPayload = {
  units: SelectOption[];
  operationalStatuses: SelectOption[];
  calibrationStatuses: SelectOption[];
  eventTypes: SelectOption[];
  eventStatuses: SelectOption[];
  fileTypes: SelectOption[];
  categories: string[];
  responsibles: string[];
  manufacturers: string[];
  locations: string[];
  defaultPageSize: number;
  maxPageSize: number;
};

type FiltersState = {
  search: string;
  unit: string;
  calibrationStatus: string;
  operationalStatus: string;
};

const emptySummary: EquipmentListSummary = {
  total: 0,
  calibrationOk: 0,
  calibrationDueSoon: 0,
  calibrationOverdue: 0,
  calibrationNoSchedule: 0,
  maintenanceCount: 0,
};

const emptyOptions: EquipmentOptionsPayload = {
  units: [],
  operationalStatuses: [],
  calibrationStatuses: [],
  eventTypes: [],
  eventStatuses: [],
  fileTypes: [],
  categories: [],
  responsibles: [],
  manufacturers: [],
  locations: [],
  defaultPageSize: 20,
  maxPageSize: 100,
};

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

export default function EquipamentosPage() {
  const { data: session } = useSession();
  const [options, setOptions] = useState<EquipmentOptionsPayload>(emptyOptions);
  const [items, setItems] = useState<EquipmentListItem[]>([]);
  const [summary, setSummary] = useState<EquipmentListSummary>(emptySummary);
  const [filters, setFilters] = useState<FiltersState>({
    search: '',
    unit: 'all',
    calibrationStatus: 'all',
    operationalStatus: 'all',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<EquipmentListItem | null>(null);

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canView = hasPermission(permissions, 'equipamentos', 'view', role);
  const canEdit = hasPermission(permissions, 'equipamentos', 'edit', role);
  const canRefresh = hasPermission(permissions, 'equipamentos', 'refresh', role);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/equipamentos/options?refresh=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const nextOptions = (json?.data || emptyOptions) as EquipmentOptionsPayload;
      setOptions(nextOptions);
      setPageSize(nextOptions.defaultPageSize || 20);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }, []);

  const loadItems = useCallback(
    async (force = false) => {
      try {
        setError(null);
        if (!force) setLoading(true);
        if (force) setRefreshing(true);
        const query = new URLSearchParams({
          search: filters.search,
          unit: filters.unit,
          calibrationStatus: filters.calibrationStatus,
          operationalStatus: filters.operationalStatus,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (force) query.set('refresh', String(Date.now()));
        const res = await fetch(`/api/admin/equipamentos?${query.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        const data = json?.data;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setSummary(data?.summary || emptySummary);
        setTotal(Number(data?.total || 0));
        setTotalPages(Number(data?.totalPages || 1));
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, page, pageSize],
  );

  useEffect(() => {
    if (!canView) return;
    loadOptions();
  }, [canView, loadOptions]);

  useEffect(() => {
    if (!canView) return;
    loadItems();
  }, [canView, loadItems]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const openCreate = () => {
    setModalMode('create');
    setSelectedItem(null);
    setModalOpen(true);
  };

  const openEdit = (item: EquipmentListItem) => {
    setModalMode('edit');
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleSaved = (item: EquipmentListItem) => {
    setSelectedItem(item);
    setItems((current) => {
      const exists = current.some((entry) => entry.id === item.id);
      if (exists) return current.map((entry) => (entry.id === item.id ? item : entry));
      return [item, ...current];
    });
    loadItems(true);
  };

  const onExport = () => {
    const query = new URLSearchParams({
      search: filters.search,
      unit: filters.unit,
      calibrationStatus: filters.calibrationStatus,
      operationalStatus: filters.operationalStatus,
    });
    window.open(`/api/admin/equipamentos/export?${query.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const paginationLabel = useMemo(() => {
    if (total === 0) return 'Nenhum registro';
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(total, start + items.length - 1);
    return `Mostrando ${start}–${end} de ${total}`;
  }, [items.length, page, pageSize, total]);

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Você não possui permissão para acessar o módulo de equipamentos.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#17407E] p-4 text-white shadow-lg shadow-[#17407E]/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Qualidade / Equipamentos</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Controle centralizado dos equipamentos da clínica, com calibração, manutenção e anexos em um único lugar.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-900">
              <Wrench size={16} />
              Visão gerencial
            </div>
            <p className="mt-2">Acompanhe vencimentos, manutenção e evidências documentais sem depender da planilha manual.</p>
          </div>
        </div>
      </section>

      <EquipmentFiltersBar
        filters={filters}
        units={options.units}
        calibrationStatuses={options.calibrationStatuses}
        operationalStatuses={options.operationalStatuses}
        canEdit={canEdit}
        canRefresh={canRefresh}
        loading={loading}
        refreshing={refreshing}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onRefresh={() => loadItems(true)}
        onExport={onExport}
        onCreate={openCreate}
      />

      <EquipmentSummaryCards summary={summary} />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <EquipmentTable items={items} loading={loading} canEdit={canEdit} onEdit={openEdit} />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">{paginationLabel}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-500">Página {page} de {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Próxima
          </button>
        </div>
      </div>

      <EquipmentFormModal
        open={modalOpen}
        mode={modalMode}
        equipment={selectedItem}
        options={options}
        canEdit={canEdit}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
