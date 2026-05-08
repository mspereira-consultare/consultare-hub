'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ExecutiveSnapshot } from '@/lib/dashboard_executive/types';
import { ExecutiveAreasSection } from './components/ExecutiveAreasSection';
import { ExecutiveHeaderSection } from './components/ExecutiveHeaderSection';
import { ExecutiveLiveSection } from './components/ExecutiveLiveSection';
import { ExecutivePrioritiesSection } from './components/ExecutivePrioritiesSection';

type ExecutiveApiResponse = {
  status: 'success';
  data: ExecutiveSnapshot;
};

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ExecutiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutiveDashboard = useCallback(async () => {
    setError(null);
    const response = await fetch('/api/admin/dashboard/executive', { cache: 'no-store' });
    const payload = (await response.json()) as ExecutiveApiResponse | { error?: string };
    if (!response.ok || !('data' in payload)) {
      throw new Error((payload as { error?: string }).error || 'Falha ao carregar o painel executivo.');
    }
    setSnapshot(payload.data);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchExecutiveDashboard()
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar o painel executivo.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [fetchExecutiveDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/dashboard/executive/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao atualizar o painel executivo.');
      }
      await fetchExecutiveDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o painel executivo.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchExecutiveDashboard]);

  const areas = snapshot?.metrics.areas || [];
  const priorities = snapshot?.metrics.topPriorities || [];
  const heartbeats = snapshot?.metrics.liveOperations.heartbeats || [];

  const overviewCards = useMemo(() => {
    const liveOperations = snapshot?.metrics.liveOperations;
    if (!liveOperations) return [];

    return [
      {
        label: 'Fila médica',
        value: liveOperations.medicQueue,
        helper: `${liveOperations.attendedToday} atendimento(s) hoje`,
      },
      {
        label: 'Fila recepção',
        value: liveOperations.receptionQueue,
        helper: `${liveOperations.averageReceptionWaitMinutes} min em média`,
      },
      {
        label: 'WhatsApp digital',
        value: liveOperations.whatsappQueue,
        helper: 'Pacientes ativos no hub',
      },
      {
        label: 'Espera crítica',
        value: liveOperations.criticalWaitCount,
        helper: 'Pacientes com espera acima do limite',
      },
    ];
  }, [snapshot]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-700" size={34} />
          <p className="text-sm font-medium text-slate-500">Carregando o painel executivo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <ExecutiveHeaderSection
          snapshot={snapshot}
          overviewCards={overviewCards}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!snapshot ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            Nenhum snapshot executivo foi encontrado para este usuário.
          </div>
        ) : (
          <>
            <ExecutivePrioritiesSection priorities={priorities} />
            <ExecutiveAreasSection areas={areas} />
            <ExecutiveLiveSection heartbeats={heartbeats} />
          </>
        )}
      </div>
    </div>
  );
}
