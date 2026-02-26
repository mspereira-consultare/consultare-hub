'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CalendarPlus2, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type { QmsTraining, QmsTrainingPlan } from '@/lib/qms/types';
import { TrainingPlanTable } from './components/TrainingPlanTable';
import { TrainingExecutionTable } from './components/TrainingExecutionTable';
import { TrainingPlanModal, type TrainingPlanPayload } from './components/TrainingPlanModal';
import {
  TrainingExecutionModal,
  type TrainingExecutionPayload,
} from './components/TrainingExecutionModal';
import { QmsStatusStrip } from '../components/QmsStatusStrip';

type TabKey = 'cronograma' | 'realizacoes';

type DocumentOption = {
  id: string;
  code: string;
  name: string;
  sector: string;
};

type PlanOption = {
  id: string;
  code: string;
  theme: string;
  status: string;
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

const buildPlanPayload = (form: TrainingPlanPayload) => ({
  code: form.code || null,
  theme: form.theme,
  sector: form.sector || null,
  trainingType: form.trainingType,
  objective: form.objective || null,
  instructor: form.instructor || null,
  targetAudience: form.targetAudience || null,
  workloadHours: form.workloadHours ? Number(form.workloadHours) : null,
  plannedDate: form.plannedDate || null,
  expirationDate: form.expirationDate || null,
  evaluationApplied: form.evaluationApplied,
  evaluationType: form.evaluationType || null,
  targetIndicator: form.targetIndicator || null,
  expectedGoal: form.expectedGoal || null,
  status: form.status,
  notes: form.notes || null,
  linkedDocumentIds: form.linkedDocumentIds || [],
});

const buildExecutionPayload = (form: TrainingExecutionPayload) => ({
  code: form.code || null,
  planId: form.planId || null,
  name: form.name,
  sector: form.sector || null,
  trainingType: form.trainingType,
  instructor: form.instructor || null,
  targetAudience: form.targetAudience || null,
  performedAt: form.performedAt || null,
  workloadHours: form.workloadHours ? Number(form.workloadHours) : null,
  evaluationApplied: form.evaluationApplied,
  averageScore: form.averageScore ? Number(form.averageScore) : null,
  nextTrainingDate: form.nextTrainingDate || null,
  status: form.status,
  participantsPlanned: form.participantsPlanned ? Number(form.participantsPlanned) : null,
  participantsActual: form.participantsActual ? Number(form.participantsActual) : null,
  resultPostTraining: form.resultPostTraining || null,
  notes: form.notes || null,
});

export default function QualidadeTreinamentosPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<TabKey>('cronograma');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState('all');
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  const [plans, setPlans] = useState<QmsTrainingPlan[]>([]);
  const [executions, setExecutions] = useState<QmsTraining[]>([]);
  const [documentOptions, setDocumentOptions] = useState<DocumentOption[]>([]);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planModalMode, setPlanModalMode] = useState<'create' | 'edit'>('create');
  const [selectedPlan, setSelectedPlan] = useState<QmsTrainingPlan | null>(null);

  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionModalMode, setExecutionModalMode] = useState<'create' | 'edit'>('create');
  const [selectedExecution, setSelectedExecution] = useState<QmsTraining | null>(null);

  const role = String((session?.user as any)?.role || 'OPERADOR');
  const permissions = (session?.user as any)?.permissions;
  const canEdit = hasPermission(permissions, 'qualidade_treinamentos', 'edit', role);
  const canRefresh = hasPermission(permissions, 'qualidade_treinamentos', 'refresh', role);

  const loadServiceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status?refresh=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const row = (json as ServiceStatus[]).find(
        (item) => String(item.service_name || '').trim().toLowerCase() === 'qms_treinamentos'
      );
      setServiceStatus(row || null);
    } catch {
      setServiceStatus(null);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    const res = await fetch(`/api/admin/qms/treinamentos/opcoes?refresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(await normalizeError(res));
    const json = await res.json();
    const documents = Array.isArray(json?.data?.documents) ? json.data.documents : [];
    const plansList = Array.isArray(json?.data?.plans) ? json.data.plans : [];
    setDocumentOptions(documents);
    setPlanOptions(plansList);
  }, []);

  const loadData = useCallback(
    async (force = false) => {
      setError(null);
      if (!force) setLoading(true);
      try {
        const query = new URLSearchParams();
        if (search.trim()) query.set('search', search.trim());
        if (sector.trim()) query.set('sector', sector.trim());
        if (status !== 'all') query.set('status', status);
        if (force) query.set('refresh', String(Date.now()));
        const suffix = query.toString() ? `?${query.toString()}` : '';

        const [planRes, execRes] = await Promise.all([
          fetch(`/api/admin/qms/treinamentos/planos${suffix}`, { cache: 'no-store' }),
          fetch(`/api/admin/qms/treinamentos/realizacoes${suffix}`, { cache: 'no-store' }),
        ]);
        if (!planRes.ok) throw new Error(await normalizeError(planRes));
        if (!execRes.ok) throw new Error(await normalizeError(execRes));

        const [planJson, execJson] = await Promise.all([planRes.json(), execRes.json()]);
        setPlans(Array.isArray(planJson?.data) ? planJson.data : []);
        setExecutions(Array.isArray(execJson?.data) ? execJson.data : []);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    },
    [search, sector, status]
  );

  useEffect(() => {
    (async () => {
      await Promise.all([loadOptions(), loadData(), loadServiceStatus()]);
    })();
  }, [loadData, loadOptions, loadServiceStatus]);

  const sectors = useMemo(() => {
    const fromPlans = plans.map((item) => String(item.sector || '').trim());
    const fromExec = executions.map((item) => String(item.sector || '').trim());
    return Array.from(new Set([...fromPlans, ...fromExec].filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
  }, [plans, executions]);

  const openCreatePlanModal = () => {
    setPlanModalMode('create');
    setSelectedPlan(null);
    setPlanModalOpen(true);
  };

  const openEditPlanModal = async (plan: QmsTrainingPlan) => {
    try {
      setBusyId(plan.id);
      const res = await fetch(`/api/admin/qms/treinamentos/planos/${encodeURIComponent(plan.id)}?refresh=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setSelectedPlan(json?.data || null);
      setPlanModalMode('edit');
      setPlanModalOpen(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const submitPlanModal = async (payload: TrainingPlanPayload) => {
    if (!canEdit) {
      setError('Sem permissao para editar treinamentos.');
      return;
    }
    try {
      setSaving(true);
      const body = buildPlanPayload(payload);
      if (!body.theme.trim()) throw new Error('Tema do treinamento e obrigatorio.');
      const url =
        planModalMode === 'create'
          ? '/api/admin/qms/treinamentos/planos'
          : `/api/admin/qms/treinamentos/planos/${encodeURIComponent(selectedPlan?.id || '')}`;
      const method = planModalMode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await normalizeError(res));

      setPlanModalOpen(false);
      setSelectedPlan(null);
      await Promise.all([loadOptions(), loadData(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (plan: QmsTrainingPlan) => {
    if (!canEdit) {
      setError('Sem permissao para excluir cronograma.');
      return;
    }
    const ok = window.confirm(`Excluir o cronograma "${plan.theme}"?`);
    if (!ok) return;
    try {
      setBusyId(plan.id);
      const res = await fetch(`/api/admin/qms/treinamentos/planos/${encodeURIComponent(plan.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([loadOptions(), loadData(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const openCreateExecutionModal = () => {
    setExecutionModalMode('create');
    setSelectedExecution(null);
    setExecutionModalOpen(true);
  };

  const openEditExecutionModal = async (item: QmsTraining) => {
    try {
      setBusyId(item.id);
      const res = await fetch(
        `/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(item.id)}?refresh=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setSelectedExecution(json?.data || null);
      setExecutionModalMode('edit');
      setExecutionModalOpen(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const submitExecutionModal = async (
    payload: TrainingExecutionPayload,
    file: File | null,
    fileType: string
  ) => {
    if (!canEdit) {
      setError('Sem permissao para editar realizacoes.');
      return;
    }
    try {
      setSaving(true);
      const body = buildExecutionPayload(payload);
      if (!body.name.trim()) throw new Error('Nome do treinamento e obrigatorio.');

      const url =
        executionModalMode === 'create'
          ? '/api/admin/qms/treinamentos/realizacoes'
          : `/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(selectedExecution?.id || '')}`;
      const method = executionModalMode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const trainingId =
        executionModalMode === 'create'
          ? String(json?.data?.id || '')
          : String(selectedExecution?.id || '');

      if (file && trainingId) {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('fileType', fileType || 'other');
        const uploadRes = await fetch(
          `/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(trainingId)}/arquivos`,
          { method: 'POST', body: formData }
        );
        if (!uploadRes.ok) throw new Error(await normalizeError(uploadRes));
      }

      setExecutionModalOpen(false);
      setSelectedExecution(null);
      await Promise.all([loadData(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const deleteExecution = async (item: QmsTraining) => {
    if (!canEdit) {
      setError('Sem permissao para excluir realizacao.');
      return;
    }
    const ok = window.confirm(`Excluir a realizacao "${item.name}"?`);
    if (!ok) return;
    try {
      setBusyId(item.id);
      const res = await fetch(`/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([loadData(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const refreshManually = async () => {
    if (!canRefresh) {
      setError('Sem permissao para atualizar esta pagina.');
      return;
    }
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/qms/treinamentos/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await normalizeError(res));
      await Promise.all([loadData(true), loadServiceStatus()]);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setRefreshing(false);
    }
  };

  const openUploadForExecution = async (item: QmsTraining) => {
    await openEditExecutionModal(item);
  };

  const openFile = async (item: QmsTraining, disposition: 'inline' | 'attachment') => {
    try {
      const res = await fetch(
        `/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(item.id)}/arquivos?refresh=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      const files = Array.isArray(json?.data) ? json.data : [];
      if (!files[0]?.id) {
        throw new Error('Nenhum arquivo encontrado para esta realizacao.');
      }
      const url = `/api/admin/qms/treinamentos/realizacoes/${encodeURIComponent(item.id)}/arquivos/${encodeURIComponent(files[0].id)}/download?disposition=${disposition}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Treinamentos</h1>
            <p className="text-sm text-slate-600 mt-1">
              Sprint 2: cronograma anual e realizacoes com anexos e vinculo com POPs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshManually}
              disabled={refreshing}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <button
              onClick={tab === 'cronograma' ? openCreatePlanModal : openCreateExecutionModal}
              disabled={!canEdit}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              <CalendarPlus2 size={16} />
              {tab === 'cronograma' ? 'Novo cronograma' : 'Nova realizacao'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg border text-sm ${tab === 'cronograma' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
            onClick={() => setTab('cronograma')}
          >
            Cronograma Anual
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg border text-sm ${tab === 'realizacoes' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
            onClick={() => setTab('realizacoes')}
          >
            Realizacoes
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por codigo, nome ou setor"
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
            <option value="planejado">Planejado</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluido">Concluido</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Aplicar filtros
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-600">
          Worker QMS Treinamentos:{' '}
          <span className="font-semibold text-slate-800">{statusLabel(serviceStatus?.status)}</span>
          {serviceStatus?.last_run ? ` | Ultima execucao: ${serviceStatus.last_run}` : ''}
        </div>
      </header>

      <QmsStatusStrip pageKey="qualidade_treinamentos" canRefresh={canRefresh} />

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Carregando treinamentos...
        </div>
      ) : tab === 'cronograma' ? (
        <TrainingPlanTable
          items={plans}
          busyId={busyId}
          onEdit={openEditPlanModal}
          onDelete={deletePlan}
        />
      ) : (
        <TrainingExecutionTable
          items={executions}
          busyId={busyId}
          onEdit={openEditExecutionModal}
          onDelete={deleteExecution}
          onUpload={openUploadForExecution}
          onViewFile={(item) => openFile(item, 'inline')}
          onDownloadFile={(item) => openFile(item, 'attachment')}
        />
      )}

      <TrainingPlanModal
        open={planModalOpen}
        mode={planModalMode}
        saving={saving}
        initialData={selectedPlan}
        documentOptions={documentOptions}
        onClose={() => {
          if (saving) return;
          setPlanModalOpen(false);
          setSelectedPlan(null);
        }}
        onSubmit={submitPlanModal}
      />

      <TrainingExecutionModal
        open={executionModalOpen}
        mode={executionModalMode}
        saving={saving}
        initialData={selectedExecution}
        plans={planOptions}
        onClose={() => {
          if (saving) return;
          setExecutionModalOpen(false);
          setSelectedExecution(null);
        }}
        onSubmit={submitExecutionModal}
      />
    </div>
  );
}
