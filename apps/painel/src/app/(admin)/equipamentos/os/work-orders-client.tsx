'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  EquipmentOperationalStatus,
} from '@/lib/equipamentos/constants';
import type {
  EquipmentEvent,
  EquipmentWorkOrderDetail,
  EquipmentWorkOrderFile,
  EquipmentWorkOrderListItem,
  EquipmentWorkOrderResponsibleOption,
  EquipmentWorkOrderStatus,
} from '@/lib/equipamentos/types';

type AllowedProfile = { key: string; label: string };
type EquipmentOption = {
  id: string;
  description: string;
  identificationNumber: string;
  unitName: string;
  operationalStatus: string;
  activeWorkOrderId: string | null;
};

type OptionsPayload = {
  responsibleUsers: EquipmentWorkOrderResponsibleOption[];
  allowedProfiles: AllowedProfile[];
  equipments: EquipmentOption[];
};

type ListPayload = {
  items: EquipmentWorkOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ModalMode = 'create' | 'edit';

type WorkOrderFormState = {
  equipmentId: string;
  openedAt: string;
  responsibleUserId: string;
  problemDescription: string;
  status: EquipmentWorkOrderStatus;
  solutionNotes: string;
  cancellationReason: string;
  closingOperationalStatus: EquipmentOperationalStatus | '';
};

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const emptyForm = (): WorkOrderFormState => ({
  equipmentId: '',
  openedAt: '',
  responsibleUserId: '',
  problemDescription: '',
  status: 'ABERTA',
  solutionNotes: '',
  cancellationReason: '',
  closingOperationalStatus: 'ATIVO',
});

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};
const errorToMessage = (error: unknown) => String((error as { message?: string } | null)?.message || error || 'Erro inesperado.');

const statusLabelMap: Record<EquipmentWorkOrderStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const operationalStatusLabelMap: Record<string, string> = {
  ATIVO: 'Ativo',
  ENVIAR_MANUTENCAO: 'Enviar para manutenção',
  EM_MANUTENCAO: 'Em manutenção',
  INATIVO: 'Inativo',
  DESCARTADO: 'Descartado',
};

const statusToneMap: Record<EquipmentWorkOrderStatus, string> = {
  ABERTA: 'border-orange-200 bg-orange-50 text-orange-700',
  EM_ANDAMENTO: 'border-amber-200 bg-amber-50 text-amber-700',
  CONCLUIDA: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CANCELADA: 'border-slate-200 bg-slate-100 text-slate-600',
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

const workOrderToForm = (item: EquipmentWorkOrderDetail): WorkOrderFormState => ({
  equipmentId: item.equipmentId,
  openedAt: item.openedAt || '',
  responsibleUserId: item.responsibleUserId,
  problemDescription: item.problemDescription,
  status: item.status,
  solutionNotes: item.solutionNotes || '',
  cancellationReason: item.cancellationReason || '',
  closingOperationalStatus: item.closingOperationalStatus || 'ATIVO',
});

export function EquipmentWorkOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasBootstrappedRef = useRef(false);
  const initialEquipmentId = searchParams.get('equipmentId') || '';
  const requestedWorkOrderId = searchParams.get('osId') || '';

  const [options, setOptions] = useState<OptionsPayload>({
    responsibleUsers: [],
    allowedProfiles: [],
    equipments: [],
  });
  const [list, setList] = useState<ListPayload>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EquipmentWorkOrderStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [selectedItem, setSelectedItem] = useState<EquipmentWorkOrderDetail | null>(null);
  const [form, setForm] = useState<WorkOrderFormState>(emptyForm);
  const [uploadNotes, setUploadNotes] = useState('');
  const [queryHandled, setQueryHandled] = useState(false);
  const [lastMaintenanceSuggestion, setLastMaintenanceSuggestion] = useState<EquipmentEvent | null>(null);
  const visibleLastMaintenanceSuggestion =
    modalMode === 'create' && form.equipmentId ? lastMaintenanceSuggestion : null;

  const equipmentOptions = useMemo(
    () =>
      options.equipments.map((item) => ({
        ...item,
        label: `${item.identificationNumber} · ${item.description}`,
      })),
    [options.equipments],
  );

  const selectedEquipment = equipmentOptions.find((item) => item.id === form.equipmentId) || null;

  const loadList = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('pageSize', '50');
      const res = await fetch(`/api/admin/equipamentos/os?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setList(json?.data || { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
      setCanManage(Boolean(json?.meta?.canManage));
    } catch (err: unknown) {
      setError(errorToMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  const loadOptions = useCallback(async () => {
    const res = await fetch('/api/admin/equipamentos/os/options', { cache: 'no-store' });
    if (!res.ok) throw new Error(await normalizeError(res));
    const json = await res.json();
    setOptions(json?.data || { responsibleUsers: [], allowedProfiles: [], equipments: [] });
    setCanManage(Boolean(json?.meta?.canManage));
  }, []);

  const loadWorkOrderDetail = useCallback(async (workOrderId: string) => {
    const res = await fetch(`/api/admin/equipamentos/os/${encodeURIComponent(workOrderId)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await normalizeError(res));
    const json = await res.json();
    return json?.data as EquipmentWorkOrderDetail;
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void Promise.all([loadOptions(), loadList()])
        .catch((err: unknown) => setError(errorToMessage(err)))
        .finally(() => {
          hasBootstrappedRef.current = true;
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadList, loadOptions]);

  useEffect(() => {
    if (loading) return;
    if (queryHandled) return;

    const openFromQuery = async () => {
      if (requestedWorkOrderId) {
        try {
          const item = await loadWorkOrderDetail(requestedWorkOrderId);
          setSelectedItem(item);
          setForm(workOrderToForm(item));
          setModalMode('edit');
          setModalOpen(true);
        } catch (err: unknown) {
          setError(errorToMessage(err));
        } finally {
          setQueryHandled(true);
        }
        return;
      }

      if (initialEquipmentId) {
        setSelectedItem(null);
        setForm({
          ...emptyForm(),
          equipmentId: initialEquipmentId,
          openedAt: new Date().toISOString().slice(0, 10),
        });
        setModalMode('create');
        setModalOpen(true);
      }
      setQueryHandled(true);
    };

    void openFromQuery();
  }, [initialEquipmentId, loadWorkOrderDetail, loading, queryHandled, requestedWorkOrderId]);

  useEffect(() => {
    if (!hasBootstrappedRef.current) return;
    const timeoutId = window.setTimeout(() => {
      void loadList(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadList, search, statusFilter]);

  useEffect(() => {
    if (modalMode !== 'create') {
      return;
    }
    if (!form.equipmentId) {
      return;
    }

    let active = true;

    const loadSuggestion = async () => {
      try {
        const res = await fetch(`/api/admin/equipamentos/${encodeURIComponent(form.equipmentId)}/eventos`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        const events = Array.isArray(json?.data) ? (json.data as EquipmentEvent[]) : [];
        const latestMaintenance =
          events.find(
            (item) =>
              (item.eventType === 'MANUTENCAO_PREVENTIVA' || item.eventType === 'MANUTENCAO_CORRETIVA') &&
              item.status === 'CONCLUIDO',
          ) || null;
        if (active) setLastMaintenanceSuggestion(latestMaintenance);
      } catch {
        if (active) setLastMaintenanceSuggestion(null);
      }
    };

    void loadSuggestion();

    return () => {
      active = false;
    };
  }, [form.equipmentId, modalMode]);

  const openCreate = (equipmentId?: string) => {
    setNotice(null);
    setSelectedItem(null);
    setForm({
      ...emptyForm(),
      equipmentId: equipmentId || '',
      openedAt: new Date().toISOString().slice(0, 10),
    });
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = async (item: EquipmentWorkOrderListItem) => {
    try {
      setRefreshing(true);
      setError(null);
      const detail = await loadWorkOrderDetail(item.id);
      setSelectedItem(detail);
      setForm(workOrderToForm(detail));
      setModalMode('edit');
      setModalOpen(true);
    } catch (err: unknown) {
      setError(errorToMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedItem(null);
    setForm(emptyForm());
    setUploadNotes('');
    if (searchParams.get('equipmentId') || searchParams.get('osId')) {
      router.replace('/equipamentos/os');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const isCreate = modalMode === 'create';
      const url = isCreate
        ? `/api/admin/equipamentos/${encodeURIComponent(form.equipmentId)}/os`
        : `/api/admin/equipamentos/os/${encodeURIComponent(selectedItem!.id)}`;
      const method = isCreate ? 'POST' : 'PATCH';
      const payload = isCreate
        ? {
            openedAt: form.openedAt,
            responsibleUserId: form.responsibleUserId,
            problemDescription: form.problemDescription,
          }
        : {
            status: form.status,
            solutionNotes: form.solutionNotes || null,
            cancellationReason: form.cancellationReason || null,
            closingOperationalStatus: form.status === 'CONCLUIDA' ? form.closingOperationalStatus || 'ATIVO' : null,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const saved = json?.data as EquipmentWorkOrderDetail;
      setSelectedItem(saved);
      setForm(workOrderToForm(saved));
      setModalMode('edit');
      setNotice(isCreate ? 'OS criada com sucesso.' : 'OS atualizada com sucesso.');
      await loadList(true);
    } catch (err: unknown) {
      setError(errorToMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!selectedItem?.id || !files?.length) return;
    try {
      setUploading(true);
      setError(null);
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set('file', file);
        body.set('notes', uploadNotes);
        const res = await fetch(`/api/admin/equipamentos/os/${encodeURIComponent(selectedItem.id)}/files`, {
          method: 'POST',
          body,
        });
        if (!res.ok) throw new Error(await normalizeError(res));
      }
      const detail = await loadWorkOrderDetail(selectedItem.id);
      setSelectedItem(detail);
      setForm(workOrderToForm(detail));
      setUploadNotes('');
      await loadList(true);
      setNotice('Anexo(s) enviado(s) com sucesso.');
    } catch (err: unknown) {
      setError(errorToMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = (file: EquipmentWorkOrderFile) => {
    window.open(`/api/admin/equipamentos/os/files/${encodeURIComponent(file.id)}/download`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl bg-blue-900 p-3 text-white shadow-md">
                <ClipboardList size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-800">Ordens de serviço</h1>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
                  Acompanhe as OS do patrimônio com rastreabilidade da tarefa vinculada, histórico de manutenção e evidências do atendimento.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Link
                href="/equipamentos"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para equipamentos
              </Link>
              <button
                type="button"
                onClick={() => loadList(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => openCreate()}
                disabled={!canManage}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17407E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Nova OS
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              className={inputClassName}
              placeholder="Buscar por equipamento, identificação, problema, responsável ou tarefa"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className={`${inputClassName} md:max-w-[220px]`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | EquipmentWorkOrderStatus)}>
              <option value="all">Todos os status</option>
              {Object.entries(statusLabelMap).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="self-start rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#17407E]" />
            <div>
              <h2 className="text-sm font-semibold text-[#17407E]">Quem pode criar e gerir OS</h2>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                A gestão usa os perfis resolvidos pelo dashboard executivo atual. Perfis habilitados:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {options.allowedProfiles.map((profile) => (
                  <span key={profile.key} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-[#17407E]">
                    {profile.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Responsáveis elegíveis são filtrados por esses perfis, mesmo quando o usuário atua pela intranet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ordens de serviço cadastradas</h2>
            <p className="mt-1 text-sm text-slate-500">{list.total} OS encontrada(s)</p>
          </div>
          <Link href="/equipamentos" className="text-sm font-medium text-[#17407E] hover:underline">
            Voltar para equipamentos
          </Link>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Equipamento</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Tarefa</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Anexos</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Carregando OS...</td>
                </tr>
              ) : list.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Nenhuma OS encontrada com os filtros atuais.</td>
                </tr>
              ) : (
                list.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-[#17407E]">{item.id.slice(0, 8)}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.equipmentUnitName}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{item.equipmentDescription}</div>
                      <div className="mt-1 text-xs text-slate-500">Identificação: {item.equipmentIdentificationNumber}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div>{item.responsibleUserName || 'Usuário'}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.responsibleDepartment || 'Sem setor'}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.taskProtocolId || '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{formatDate(item.openedAt)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneMap[item.status]}`}>
                        {statusLabelMap[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.fileCount}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                      >
                        <ClipboardList className="h-4 w-4" />
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#17407E]">
                  {modalMode === 'create' ? 'Nova ordem de serviço' : selectedItem?.taskProtocolId || 'OS vinculada'}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {modalMode === 'create' ? 'Abrir OS para equipamento' : selectedItem?.equipmentDescription || 'Detalhes da OS'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {modalMode === 'create'
                    ? 'A abertura da OS cria automaticamente uma tarefa vinculada e muda o status do equipamento.'
                    : 'A OS segue o fluxo operacional do equipamento e sincroniza o status da tarefa vinculada.'}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 overflow-y-auto p-6">
                <div className="space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-base font-semibold text-slate-900">Dados principais</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Equipamento</span>
                        <select
                          className={inputClassName}
                          value={form.equipmentId}
                          disabled={modalMode === 'edit'}
                          onChange={(event) => setForm((current) => ({ ...current, equipmentId: event.target.value }))}
                        >
                          <option value="">Selecione</option>
                          {equipmentOptions.map((item) => (
                            <option key={item.id} value={item.id} disabled={Boolean(item.activeWorkOrderId && item.activeWorkOrderId !== selectedItem?.id)}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Data de abertura</span>
                        <input
                          type="date"
                          className={inputClassName}
                          value={form.openedAt}
                          disabled={modalMode === 'edit'}
                          onChange={(event) => setForm((current) => ({ ...current, openedAt: event.target.value }))}
                        />
                      </label>

                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Responsável</span>
                        <select
                          className={inputClassName}
                          value={form.responsibleUserId}
                          disabled={modalMode === 'edit'}
                          onChange={(event) => setForm((current) => ({ ...current, responsibleUserId: event.target.value }))}
                        >
                          <option value="">Selecione</option>
                          {options.responsibleUsers.map((item) => (
                            <option key={item.userId} value={item.userId}>
                              {item.userName} · {item.profileLabel || item.profileKey}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Problema / ocorrência</span>
                        <textarea
                          className={`${inputClassName} min-h-[140px] resize-y`}
                          value={form.problemDescription}
                          disabled={modalMode === 'edit'}
                          onChange={(event) => setForm((current) => ({ ...current, problemDescription: event.target.value }))}
                        />
                      </label>
                    </div>
                    {modalMode === 'create' ? (
                      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                        <div className="font-semibold text-[#17407E]">Última manutenção sugerida</div>
                        <p className="mt-1">
                          {visibleLastMaintenanceSuggestion
                            ? `${formatDate(visibleLastMaintenanceSuggestion?.eventDate || null)} · ${visibleLastMaintenanceSuggestion?.eventType === 'MANUTENCAO_PREVENTIVA' ? 'Manutenção preventiva' : 'Manutenção corretiva'}`
                            : 'Nenhum registro concluído de manutenção foi encontrado para sugerir a última intervenção.'}
                        </p>
                        {visibleLastMaintenanceSuggestion?.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-500">{visibleLastMaintenanceSuggestion.description}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  {modalMode === 'edit' && selectedItem ? (
                    <>
                      <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <h3 className="text-base font-semibold text-slate-900">Condução e encerramento</h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700">Status da OS</span>
                            <select
                              className={inputClassName}
                              value={form.status}
                              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EquipmentWorkOrderStatus }))}
                            >
                              {(['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as EquipmentWorkOrderStatus[]).map((status) => (
                                <option key={status} value={status}>{statusLabelMap[status]}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700">Status final do equipamento</span>
                            <select
                              className={inputClassName}
                              value={form.closingOperationalStatus}
                              onChange={(event) => setForm((current) => ({ ...current, closingOperationalStatus: event.target.value as EquipmentOperationalStatus }))}
                              disabled={form.status !== 'CONCLUIDA'}
                            >
                              {Object.entries(operationalStatusLabelMap).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-sm font-medium text-slate-700">Solução aplicada</span>
                            <textarea
                              className={`${inputClassName} min-h-[120px] resize-y`}
                              value={form.solutionNotes}
                              disabled={form.status !== 'CONCLUIDA'}
                              onChange={(event) => setForm((current) => ({ ...current, solutionNotes: event.target.value }))}
                            />
                          </label>

                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-sm font-medium text-slate-700">Motivo do cancelamento</span>
                            <textarea
                              className={`${inputClassName} min-h-[110px] resize-y`}
                              value={form.cancellationReason}
                              disabled={form.status !== 'CANCELADA'}
                              onChange={(event) => setForm((current) => ({ ...current, cancellationReason: event.target.value }))}
                            />
                          </label>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">Anexos da OS</h3>
                            <p className="mt-1 text-sm text-slate-500">Evidências específicas da ocorrência ficam separadas dos arquivos gerais do equipamento.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Incluir anexo
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(event) => void handleFilesSelected(event.target.files)}
                          />
                        </div>
                        <div className="mt-4">
                          <label className="mb-1 block text-sm font-medium text-slate-700">Observação do anexo</label>
                          <input className={inputClassName} value={uploadNotes} onChange={(event) => setUploadNotes(event.target.value)} />
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedItem.files.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                              Nenhum anexo específico da OS enviado ainda.
                            </div>
                          ) : (
                            selectedItem.files.map((file) => (
                              <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                                <div>
                                  <div className="font-medium text-slate-800">{file.originalName}</div>
                                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(file.createdAt)} · {formatFileSize(file.sizeBytes)}</div>
                                </div>
                                <button type="button" onClick={() => downloadFile(file)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                  Baixar
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </>
                  ) : null}
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-6">
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-900">Resumo rápido</h3>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      <div><span className="font-semibold text-slate-700">Equipamento:</span> {selectedEquipment?.label || 'Selecione um equipamento'}</div>
                      <div><span className="font-semibold text-slate-700">Abertura:</span> {form.openedAt ? formatDate(form.openedAt) : 'Sem data'}</div>
                      <div><span className="font-semibold text-slate-700">Responsável:</span> {options.responsibleUsers.find((item) => item.userId === form.responsibleUserId)?.userName || 'Não definido'}</div>
                      <div><span className="font-semibold text-slate-700">Status:</span> {statusLabelMap[form.status]}</div>
                      {modalMode === 'create' ? (
                        <div>
                          <span className="font-semibold text-slate-700">Última manutenção:</span>{' '}
                          {visibleLastMaintenanceSuggestion?.eventDate ? formatDate(visibleLastMaintenanceSuggestion.eventDate) : 'Sem histórico concluído'}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {selectedItem ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="font-semibold text-slate-900">Vínculo da tarefa</h3>
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">{selectedItem.taskProtocolId || 'Tarefa vinculada'}</div>
                          <div className="mt-1 text-sm text-slate-600">A tarefa segue o status principal da OS.</div>
                        </div>
                        <Link href={`/dashboard-executivo/tarefas?task=${encodeURIComponent(selectedItem.linkedTaskId)}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Abrir
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                    <div className="flex items-center gap-2 font-semibold text-[#17407E]">
                      <AlertCircle className="h-4 w-4" />
                      Regras da OS
                    </div>
                    <p className="mt-2">
                      Abrir a OS muda automaticamente o equipamento para <strong>Enviar para manutenção</strong>. Encerrar a OS conclui a tarefa vinculada e registra o evento corretivo no histórico.
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <span className="text-xs text-slate-500">
                {selectedItem ? `OS ${selectedItem.id}` : 'A tarefa vinculada será criada na primeira gravação.'}
              </span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!canManage || saving || (modalMode === 'create' && !form.equipmentId)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#123463] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {modalMode === 'create' ? 'Criar OS' : 'Salvar OS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
