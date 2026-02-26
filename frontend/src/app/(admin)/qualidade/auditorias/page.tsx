'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type { QmsAudit, QmsAuditDetail } from '@/lib/qms/types';
import { AuditActionsModal, type AuditActionPayload } from './components/AuditActionsModal';
import { AuditFormModal, type AuditFormPayload } from './components/AuditFormModal';
import { AuditTable } from './components/AuditTable';
import { QmsStatusStrip } from '../components/QmsStatusStrip';

type AuditOption = {
  documentId: string;
  code: string;
  name: string;
  versions: Array<{ id: string; label: string }>;
};

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

const mapAuditPayload = (form: AuditFormPayload) => ({
  code: form.code || null,
  documentId: form.documentId || null,
  documentVersionId: form.documentVersionId || null,
  responsible: form.responsible || null,
  auditDate: form.auditDate || null,
  compliancePercent: form.compliancePercent ? Number(form.compliancePercent) : null,
  nonConformity: form.nonConformity || null,
  actionPlan: form.actionPlan || null,
  correctionDeadline: form.correctionDeadline || null,
  reassessed: form.reassessed,
  effectivenessCheckDate: form.effectivenessCheckDate || null,
  criticality: form.criticality,
  status: form.status,
});

const mapActionPayload = (form: AuditActionPayload) => ({
  description: form.description,
  owner: form.owner || null,
  deadline: form.deadline || null,
  status: form.status,
  completionNote: form.completionNote || null,
});

export default function QualidadeAuditoriasPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<QmsAudit[]>([]);
  const [options, setOptions] = useState<AuditOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [criticality, setCriticality] = useState('all');
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditMode, setAuditMode] = useState<'create' | 'edit'>('create');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<QmsAuditDetail | null>(null);

  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  const [actionsDetail, setActionsDetail] = useState<QmsAuditDetail | null>(null);

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canEdit = hasPermission(permissions, 'qualidade_auditorias', 'edit', role);
  const canRefresh = hasPermission(permissions, 'qualidade_auditorias', 'refresh', role);

  const loadServiceStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/status?refresh=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const row = (json as ServiceStatus[]).find(
        (item) => String(item.service_name || '').trim().toLowerCase() === 'qms_auditorias'
      );
      setServiceStatus(row || null);
    } catch {
      setServiceStatus(null);
    }
  }, []);

  const loadAudits = useCallback(
    async (force = false) => {
      setError(null);
      if (!force) setLoading(true);
      try {
        const query = new URLSearchParams();
        query.set('includeOptions', '1');
        if (search.trim()) query.set('search', search.trim());
        if (status !== 'all') query.set('status', status);
        if (criticality !== 'all') query.set('criticality', criticality);
        if (force) query.set('refresh', String(Date.now()));
        const res = await fetch(`/api/admin/qms/auditorias?${query.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await normalizeError(res));
        const json = await res.json();
        setItems(Array.isArray(json?.data) ? json.data : []);
        setOptions(Array.isArray(json?.options) ? json.options : []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    },
    [search, status, criticality]
  );

  const loadAuditDetail = useCallback(async (auditId: string): Promise<QmsAuditDetail> => {
    const res = await fetch(`/api/admin/qms/auditorias/${encodeURIComponent(auditId)}?refresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(await normalizeError(res));
    const json = await res.json();
    return json?.data as QmsAuditDetail;
  }, []);

  const refreshAuditDetail = useCallback(
    async (auditId: string) => {
      const detail = await loadAuditDetail(auditId);
      setActionsDetail(detail);
      return detail;
    },
    [loadAuditDetail]
  );

  useEffect(() => {
    loadAudits();
    loadServiceStatus();
  }, [loadAudits, loadServiceStatus]);

  const openCreateModal = () => {
    setAuditMode('create');
    setSelectedAuditDetail(null);
    setAuditModalOpen(true);
  };

  const openEditModal = async (item: QmsAudit) => {
    try {
      setBusyId(item.id);
      const detail = await loadAuditDetail(item.id);
      setSelectedAuditDetail(detail);
      setAuditMode('edit');
      setAuditModalOpen(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const submitAuditModal = async (payload: AuditFormPayload) => {
    if (!canEdit) {
      setError('Sem permissao para editar auditorias.');
      return;
    }
    try {
      setSaving(true);
      setError(null);

      if (!payload.documentId || !payload.documentVersionId) {
        throw new Error('Selecione o POP e a versao auditada.');
      }

      const body = mapAuditPayload(payload);
      const isCreate = auditMode === 'create';
      const targetId = selectedAuditDetail?.audit?.id || '';
      const url = isCreate
        ? '/api/admin/qms/auditorias'
        : `/api/admin/qms/auditorias/${encodeURIComponent(targetId)}`;
      const method = isCreate ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await normalizeError(res));

      setAuditModalOpen(false);
      setSelectedAuditDetail(null);
      await Promise.all([loadAudits(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAudit = async (item: QmsAudit) => {
    if (!canEdit) {
      setError('Sem permissao para excluir auditorias.');
      return;
    }
    const ok = window.confirm(`Excluir a auditoria "${item.code}"?`);
    if (!ok) return;
    try {
      setBusyId(item.id);
      const res = await fetch(`/api/admin/qms/auditorias/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([loadAudits(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const openActionsModal = async (item: QmsAudit) => {
    try {
      setBusyId(item.id);
      const detail = await loadAuditDetail(item.id);
      setActionsDetail(detail);
      setActionsModalOpen(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateAction = async (payload: AuditActionPayload) => {
    if (!canEdit || !actionsDetail) {
      setError('Sem permissao para editar acoes corretivas.');
      return;
    }
    try {
      setActionSaving(true);
      const auditId = actionsDetail.audit.id;
      const res = await fetch(`/api/admin/qms/auditorias/${encodeURIComponent(auditId)}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapActionPayload(payload)),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([refreshAuditDetail(auditId), loadAudits(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setActionSaving(false);
    }
  };

  const handleUpdateAction = async (actionId: string, payload: AuditActionPayload) => {
    if (!canEdit || !actionsDetail) {
      setError('Sem permissao para editar acoes corretivas.');
      return;
    }
    try {
      setActionSaving(true);
      const auditId = actionsDetail.audit.id;
      const res = await fetch(
        `/api/admin/qms/auditorias/${encodeURIComponent(auditId)}/acoes/${encodeURIComponent(actionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapActionPayload(payload)),
        }
      );
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([refreshAuditDetail(auditId), loadAudits(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setActionSaving(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!canRefresh) {
      setError('Sem permissao para atualizar esta pagina.');
      return;
    }
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch('/api/admin/qms/auditorias/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([loadAudits(true), loadServiceStatus()]);
      if (actionsDetail?.audit.id) {
        await refreshAuditDetail(actionsDetail.audit.id);
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Conformidade e Auditorias</h1>
            <p className="text-sm text-slate-600 mt-1">
              Sprint 3: registro de auditorias internas e plano de acao corretiva.
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
              <ClipboardCheck size={16} />
              Nova auditoria
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por codigo, POP ou responsavel"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="all">Todos os status</option>
            <option value="aberta">Aberta</option>
            <option value="em_tratativa">Em tratativa</option>
            <option value="encerrada">Encerrada</option>
          </select>
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="all">Todas as criticidades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
          <button
            type="button"
            onClick={() => loadAudits(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Aplicar filtros
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-600">
          Worker QMS Auditorias:{' '}
          <span className="font-semibold text-slate-800">{statusLabel(serviceStatus?.status)}</span>
          {serviceStatus?.last_run ? ` | Ultima execucao: ${serviceStatus.last_run}` : ''}
        </div>
      </header>

      <QmsStatusStrip pageKey="qualidade_auditorias" canRefresh={canRefresh} />

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Carregando auditorias...
        </div>
      ) : (
        <AuditTable
          items={items}
          busyId={busyId}
          onEdit={openEditModal}
          onDelete={handleDeleteAudit}
          onOpenActions={openActionsModal}
        />
      )}

      <AuditFormModal
        open={auditModalOpen}
        mode={auditMode}
        saving={saving}
        initialData={selectedAuditDetail}
        options={options}
        onClose={() => {
          if (saving) return;
          setAuditModalOpen(false);
          setSelectedAuditDetail(null);
        }}
        onSubmit={submitAuditModal}
      />

      <AuditActionsModal
        open={actionsModalOpen}
        saving={actionSaving}
        detail={actionsDetail}
        onClose={() => {
          if (actionSaving) return;
          setActionsModalOpen(false);
          setActionsDetail(null);
        }}
        onCreate={handleCreateAction}
        onUpdate={handleUpdateAction}
      />
    </div>
  );
}
