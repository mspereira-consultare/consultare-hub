'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Settings2 } from 'lucide-react';
import { RecruitmentIndeedPanel } from '../recrutamento/components/RecruitmentIndeedPanel';
import type {
  RecruitmentDashboard,
  RecruitmentIndeedBackfillInput,
  RecruitmentIndeedIntegrationInput,
  RecruitmentIndeedSummary,
} from '@/lib/recrutamento/types';

type DashboardResponse = { status: string; data: RecruitmentDashboard };
type IndeedResponse = { status: string; data: RecruitmentIndeedSummary };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as { error?: unknown })?.error || 'Falha ao carregar dados.'));
  return payload as T;
}

const emptyDashboard: RecruitmentDashboard = {
  jobs: [],
  candidates: [],
  summary: {
    openJobs: 0,
    totalCandidates: 0,
    activeCandidates: 0,
    approvedCandidates: 0,
    managerPendingCandidates: 0,
    convertedCandidates: 0,
  },
};

export default function RecruitmentIndeedSettingsTab() {
  const [dashboard, setDashboard] = useState<RecruitmentDashboard>(emptyDashboard);
  const [summary, setSummary] = useState<RecruitmentIndeedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboardPayload, indeedPayload] = await Promise.all([
        fetchJson<DashboardResponse>('/api/admin/recrutamento'),
        fetchJson<IndeedResponse>('/api/admin/recrutamento/integrations/indeed'),
      ]);
      setDashboard(dashboardPayload.data || emptyDashboard);
      setSummary(indeedPayload.data || null);
    } catch (fetchError: unknown) {
      setError(String(fetchError instanceof Error ? fetchError.message : fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const saveIndeedIntegration = async (payload: RecruitmentIndeedIntegrationInput) => {
    setSaving('indeed-integration');
    setError('');
    try {
      const response = await fetchJson<IndeedResponse>('/api/admin/recrutamento/integrations/indeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSummary(response.data);
      await loadData();
    } catch (fetchError: unknown) {
      setError(String(fetchError instanceof Error ? fetchError.message : fetchError));
    } finally {
      setSaving('');
    }
  };

  const runIndeedBackfill = async (payload: RecruitmentIndeedBackfillInput) => {
    const actionSavingKey =
      payload.action === 'ASSOCIAR_VAGA'
        ? 'indeed-backfill'
        : payload.action === 'PUBLICAR_VAGA'
          ? 'indeed-publish-job'
          : 'indeed-publish-pending';
    setSaving(actionSavingKey);
    setError('');
    try {
      const response = await fetchJson<IndeedResponse>('/api/admin/recrutamento/indeed/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSummary(response.data);
      await loadData();
    } catch (fetchError: unknown) {
      setError(String(fetchError instanceof Error ? fetchError.message : fetchError));
    } finally {
      setSaving('');
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configurações da Indeed...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white p-2 text-slate-700 shadow-sm">
            <Settings2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Integração Indeed</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Centralize aqui a configuração, o backfill assistido e a publicação operacional da Indeed. A página de recrutamento fica focada no funil e na triagem.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <RecruitmentIndeedPanel
        summary={summary}
        jobs={dashboard.jobs}
        canEdit
        saving={saving}
        onSaveIntegration={saveIndeedIntegration}
        onRunBackfill={runIndeedBackfill}
      />
    </div>
  );
}
