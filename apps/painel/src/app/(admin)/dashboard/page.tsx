'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ExecutiveSnapshot } from '@/lib/dashboard_executive/types';
import { ExecutiveAiInsightsSection } from './components/ExecutiveAiInsightsSection';
import { ExecutiveHeaderSection } from './components/ExecutiveHeaderSection';
import { ExecutiveLiveSection } from './components/ExecutiveLiveSection';
import { ExecutivePrioritiesSection, type DashboardPriorityItem } from './components/ExecutivePrioritiesSection';
import { ExecutiveWidgetsSection } from './components/ExecutiveWidgetsSection';
import { formatProfileLabel } from './components/dashboardExecutiveUtils';

type ExecutiveApiResponse = {
  status: 'success';
  data: ExecutiveSnapshot;
};

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ExecutiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutiveDashboard = useCallback(async () => {
    const response = await fetch('/api/admin/dashboard/executive', { cache: 'no-store' });
    const payload = (await response.json()) as ExecutiveApiResponse | { error?: string };
    if (!response.ok || !('data' in payload)) {
      throw new Error((payload as { error?: string }).error || 'Falha ao carregar o painel executivo.');
    }
    return payload.data;
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadInitialSnapshot = async () => {
      try {
        const data = await fetchExecutiveDashboard();
        if (!mounted) return;
        setError(null);
        setSnapshot(data);
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar o painel executivo.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadInitialSnapshot();

    return () => {
      mounted = false;
    };
  }, [fetchExecutiveDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      setError(null);
      const response = await fetch('/api/admin/dashboard/executive/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao atualizar o painel executivo.');
      }
      const data = await fetchExecutiveDashboard();
      setSnapshot(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o painel executivo.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchExecutiveDashboard]);

  const handleExportPdf = useCallback(async () => {
    if (!snapshot?.id) return;
    setExportingPdf(true);

    try {
      setError(null);
      const response = await fetch(`/api/admin/dashboard/executive/export?snapshotId=${encodeURIComponent(snapshot.id)}`, {
        method: 'GET',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Falha ao exportar o dashboard executivo em PDF.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `painel-executivo-${snapshot.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar o dashboard executivo em PDF.');
    } finally {
      setExportingPdf(false);
    }
  }, [snapshot]);

  const priorities = useMemo<DashboardPriorityItem[]>(() => {
    if (!snapshot) return [];

    if (snapshot.aiSummary?.topPriorities?.length) {
      return snapshot.aiSummary.topPriorities.map((priority) => ({
        key: `${priority.areaKey || 'geral'}-${priority.title}`,
        title: priority.title,
        description: priority.description,
        severity: priority.severity,
        helper: priority.rationale,
      }));
    }

    return (snapshot.metrics.topPriorities || []).map((priority) => ({
      key: `${priority.areaKey}-${priority.title}`,
      title: priority.title,
      description: priority.description,
      severity: priority.severity,
      helper: null,
    }));
  }, [snapshot]);
  const heartbeats = snapshot?.metrics.liveOperations.heartbeats || [];
  const needsConfiguration = Boolean(snapshot && !snapshot.metrics.profile.profileKey);
  const priorityHighlights = useMemo(() => {
    return priorities.slice(0, 3).map((priority) => ({
      key: priority.key,
      label: priority.title,
      tone:
        priority.severity === 'critical' || priority.severity === 'high'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : priority.severity === 'medium'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-slate-200 bg-slate-100 text-slate-700',
    }));
  }, [priorities]);

  const overviewCards = useMemo(() => {
    if (!snapshot) return [];
    const activeAreas = new Set(snapshot.metrics.widgets.map((widget) => widget.areaKey));

    return [
      {
        label: 'Perfil executivo',
        value: formatProfileLabel(snapshot.metrics.profile.profileKey),
        helper: snapshot.metrics.profile.matchedGroupLabel || 'Perfil resolvido pela governança atual',
      },
      {
        label: 'Widgets ativos',
        value: String(snapshot.metrics.widgets.length),
        helper: `${snapshot.metrics.profile.visibleWidgetKeys.length} widgets visíveis para o perfil`,
      },
      {
        label: 'Áreas cobertas',
        value: String(activeAreas.size),
        helper: 'Eixos com indicadores já consolidados neste snapshot',
      },
      {
        label: 'IA executiva',
        value:
          snapshot.metrics.aiStatus === 'READY'
            ? 'Disponível'
            : snapshot.metrics.aiStatus === 'FAILED'
              ? 'Indisponível'
              : 'Aguardando',
        helper: snapshot.metrics.aiMessage || 'Leitura interpretativa conforme disponibilidade do snapshot',
      },
    ];
  }, [snapshot]);

  const liveMetrics = useMemo(() => {
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
          priorityHighlights={priorityHighlights}
          refreshing={refreshing}
          exportingPdf={exportingPdf}
          onRefresh={handleRefresh}
          onExportPdf={handleExportPdf}
        />

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <p className="font-medium">O painel executivo encontrou um problema nesta ação.</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {!snapshot ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            Nenhum snapshot executivo válido foi encontrado para este usuário. Tente atualizar o painel para gerar uma nova leitura consolidada.
          </div>
        ) : needsConfiguration ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 shadow-sm">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-lg font-semibold text-amber-900">Visão executiva em configuração</h2>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                Este acesso ainda não está vinculado a um perfil de visualização. Assim que a configuração for concluída,
                o dashboard passará a mostrar apenas os indicadores permitidos para este cargo e setor.
              </p>
              <p className="mt-3 text-sm leading-6 text-amber-800">
                Enquanto isso, a leitura de IA e a exportação executiva permanecem restritas ao snapshot seguro sem escopo amplo por fallback.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <ExecutivePrioritiesSection priorities={priorities} />
              <ExecutiveAiInsightsSection snapshot={snapshot} />
            </div>
            <ExecutiveWidgetsSection snapshot={snapshot} />
            <ExecutiveLiveSection heartbeats={heartbeats} metrics={liveMetrics} />
          </>
        )}
      </div>
    </div>
  );
}
