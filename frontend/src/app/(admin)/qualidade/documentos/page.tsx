'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { FilePlus2, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type { QmsDocumentDetail, QmsDocumentSummary } from '@/lib/qms/types';
import { DocumentFormModal, type DocumentFormPayload } from './components/DocumentFormModal';
import { DocumentTable } from './components/DocumentTable';

type ServiceStatus = {
  service_name: string;
  status: string;
  last_run: string | null;
  details: string | null;
};

const statusLabel = (value: string | null | undefined) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'N/A';
  if (raw === 'COMPLETED') return 'COMPLETED';
  if (raw === 'RUNNING') return 'RUNNING';
  if (raw === 'PENDING') return 'PENDING';
  if (raw === 'FAILED') return 'FAILED';
  return raw;
};

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const buildPayload = (form: DocumentFormPayload) => ({
  code: form.code || null,
  sector: form.sector || null,
  name: form.name,
  objective: form.objective || null,
  periodicityDays: form.periodicityDays ? Number(form.periodicityDays) : null,
  status: form.status,
  versionLabel: form.versionLabel || null,
  elaboratedBy: form.elaboratedBy || null,
  reviewedBy: form.reviewedBy || null,
  approvedBy: form.approvedBy || null,
  creationDate: form.creationDate || null,
  lastReviewDate: form.lastReviewDate || null,
  nextReviewDate: form.nextReviewDate || null,
  linkedTrainingRef: form.linkedTrainingRef || null,
  notes: form.notes || null,
});

export default function QmsDocumentosPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<QmsDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState('all');
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedDetail, setSelectedDetail] = useState<QmsDocumentDetail | null>(null);

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canEdit = hasPermission(permissions, 'qualidade_documentos', 'edit', role);
  const canRefresh = hasPermission(permissions, 'qualidade_documentos', 'refresh', role);

  const loadServiceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status?refresh=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const row = (json as ServiceStatus[]).find(
        (item) => String(item.service_name || '').trim().toLowerCase() === 'qms_documentos'
      );
      setServiceStatus(row || null);
    } catch {
      setServiceStatus(null);
    }
  }, []);

  const loadDocuments = useCallback(
    async (force = false) => {
      setError(null);
      if (!force) setLoading(true);
      try {
        const query = new URLSearchParams();
        if (search.trim()) query.set('search', search.trim());
        if (sector.trim()) query.set('sector', sector.trim());
        if (status !== 'all') query.set('status', status);
        if (force) query.set('refresh', String(Date.now()));

        const url = `/api/admin/qms/documentos${query.toString() ? `?${query.toString()}` : ''}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        setItems(Array.isArray(json?.data) ? json.data : []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    },
    [search, sector, status]
  );

  useEffect(() => {
    loadDocuments();
    loadServiceStatus();
  }, [loadDocuments, loadServiceStatus]);

  const sectors = useMemo(
    () =>
      Array.from(new Set(items.map((item) => String(item.sector || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [items]
  );

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedDetail(null);
    setModalOpen(true);
  };

  const openEditModal = async (item: QmsDocumentSummary) => {
    try {
      setBusyId(item.id);
      const res = await fetch(`/api/admin/qms/documentos/${encodeURIComponent(item.id)}?refresh=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setSelectedDetail(json?.data || null);
      setModalMode('edit');
      setModalOpen(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const submitModal = async (form: DocumentFormPayload, file: File | null) => {
    if (!canEdit) {
      setError('Sem permissão para editar documentos.');
      return;
    }
    try {
      setSaving(true);
      setError(null);

      if (!form.name.trim()) {
        throw new Error('Nome do POP é obrigatório.');
      }

      const payload = buildPayload(form);
      let documentId = selectedDetail?.document.id || '';

      if (modalMode === 'create') {
        const res = await fetch('/api/admin/qms/documentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        documentId = String(json?.data?.document?.id || '');
      } else {
        if (!documentId) throw new Error('Documento inválido para edição.');
        const res = await fetch(`/api/admin/qms/documentos/${encodeURIComponent(documentId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await normalizeError(res));
      }

      if (file && documentId) {
        const formData = new FormData();
        formData.set('file', file);
        const currentVersionId = selectedDetail?.document?.currentVersion?.id || '';
        if (currentVersionId) formData.set('documentVersionId', currentVersionId);
        const uploadRes = await fetch(`/api/admin/qms/documentos/${encodeURIComponent(documentId)}/arquivos`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) throw new Error(await normalizeError(uploadRes));
      }

      setModalOpen(false);
      setSelectedDetail(null);
      await loadDocuments(true);
      await loadServiceStatus();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: QmsDocumentSummary) => {
    if (!canEdit) {
      setError('Sem permissão para excluir documentos.');
      return;
    }
    const ok = window.confirm(`Excluir o documento "${item.name}"? Esta ação remove versões e arquivos vinculados.`);
    if (!ok) return;
    try {
      setBusyId(item.id);
      const res = await fetch(`/api/admin/qms/documentos/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await loadDocuments(true);
      await loadServiceStatus();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateVersion = async (item: QmsDocumentSummary) => {
    if (!canEdit) {
      setError('Sem permissão para criar versões.');
      return;
    }
    const label = window.prompt('Informe o rótulo da nova versão (ex.: 1.1):', item.currentVersion?.versionLabel || '1.1');
    if (!label || !label.trim()) return;

    try {
      setBusyId(item.id);
      const res = await fetch(`/api/admin/qms/documentos/${encodeURIComponent(item.id)}/versoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionLabel: label.trim() }),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await loadDocuments(true);
      await loadServiceStatus();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const handleManualRefresh = async () => {
    if (!canRefresh) {
      setError('Sem permissão para atualizar esta página.');
      return;
    }
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch('/api/admin/qms/documentos/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await normalizeError(res));
      await loadDocuments(true);
      await loadServiceStatus();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewFile = (item: QmsDocumentSummary) => {
    if (!item.lastFile) return;
    const url = `/api/admin/qms/documentos/${encodeURIComponent(item.id)}/arquivos/${encodeURIComponent(item.lastFile.id)}/download?disposition=inline`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadFile = (item: QmsDocumentSummary) => {
    if (!item.lastFile) return;
    const url = `/api/admin/qms/documentos/${encodeURIComponent(item.id)}/arquivos/${encodeURIComponent(item.lastFile.id)}/download?disposition=attachment`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Documentos Operacionais (POPs)</h1>
            <p className="text-sm text-slate-600 mt-1">
              Sprint 1: gestão de documentos, versões, status e anexos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <button
              onClick={openCreateModal}
              disabled={!canEdit}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              <FilePlus2 size={16} />
              Novo documento
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, nome ou setor"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os setores</option>
            {sectors.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="all">Todos os status</option>
            <option value="rascunho">Rascunho</option>
            <option value="vigente">Vigente</option>
            <option value="a_vencer">A vencer</option>
            <option value="vencido">Vencido</option>
            <option value="arquivado">Arquivado</option>
          </select>
          <button
            type="button"
            onClick={() => loadDocuments(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Aplicar filtros
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-600">
          Worker QMS Documentos:{' '}
          <span className="font-semibold text-slate-800">{statusLabel(serviceStatus?.status)}</span>
          {serviceStatus?.last_run ? ` | Última execução: ${serviceStatus.last_run}` : ''}
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Carregando documentos...
        </div>
      ) : (
        <DocumentTable
          items={items}
          busyId={busyId}
          onEdit={openEditModal}
          onDelete={handleDelete}
          onCreateVersion={handleCreateVersion}
          onViewFile={handleViewFile}
          onDownloadFile={handleDownloadFile}
        />
      )}

      <DocumentFormModal
        open={modalOpen}
        mode={modalMode}
        saving={saving}
        initialData={selectedDetail}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
          setSelectedDetail(null);
        }}
        onSubmit={submitModal}
      />
    </div>
  );
}
