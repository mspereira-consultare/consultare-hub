'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  ExecutiveAreaBlock,
  ExecutiveIndicator,
  ExecutiveIndicatorStatus,
  ExecutiveLiveHeartbeat,
  ExecutivePriority,
  ExecutiveSnapshot,
  ExecutiveTrend,
} from '@/lib/dashboard_executive/types';

type ExecutiveApiResponse = {
  status: 'success';
  data: ExecutiveSnapshot;
};

const statusStyles: Record<ExecutiveIndicatorStatus, string> = {
  SUCCESS: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-700',
  DANGER: 'border-rose-200 bg-rose-50 text-rose-700',
  NO_DATA: 'border-slate-200 bg-slate-100 text-slate-600',
};

const areaAccentStyles: Record<ExecutiveAreaBlock['areaKey'], string> = {
  financeiro: 'from-emerald-500 to-emerald-600',
  comercial: 'from-sky-500 to-sky-600',
  operacao: 'from-amber-500 to-orange-500',
  pessoas: 'from-indigo-500 to-indigo-600',
  qualidade: 'from-rose-500 to-pink-500',
};

const areaIcons: Record<ExecutiveAreaBlock['areaKey'], typeof Building2> = {
  financeiro: Building2,
  comercial: ArrowUpRight,
  operacao: Activity,
  pessoas: Users,
  qualidade: CheckCircle2,
};

const priorityStyles: Record<ExecutivePriority['severity'], string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
};

function formatSnapshotTimestamp(value: string | null | undefined) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function formatScopeLabel(snapshot: ExecutiveSnapshot | null) {
  if (!snapshot) return 'Escopo não carregado';
  const { units, departments, areas } = snapshot.metrics.scope;
  const fragments: string[] = [];
  if (areas.length) fragments.push(`${areas.length} área(s)`);
  if (units.length) fragments.push(`${units.length} unidade(s)`);
  if (departments.length) fragments.push(`${departments.length} departamento(s)`);
  return fragments.length ? fragments.join(' • ') : 'Escopo amplo';
}

function formatIndicatorValue(indicator: ExecutiveIndicator, value: number | null) {
  if (value == null) return '—';
  if (indicator.format === 'currency') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  }
  if (indicator.format === 'percent') return `${value.toFixed(1)}%`;
  if (indicator.format === 'minutes') return `${Math.round(value)} min`;
  return new Intl.NumberFormat('pt-BR').format(value);
}

function TrendIcon({ trend }: { trend: ExecutiveTrend }) {
  if (trend === 'up') return <ArrowUpRight size={16} className="text-emerald-600" />;
  if (trend === 'down') return <ArrowDownRight size={16} className="text-rose-600" />;
  return <ArrowRight size={16} className="text-slate-400" />;
}

function StatusBadge({ status }: { status: ExecutiveIndicatorStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusStyles[status]}`}>
      {status === 'SUCCESS' ? 'Estável' : status === 'WARNING' ? 'Atenção' : status === 'DANGER' ? 'Crítico' : 'Sem dado'}
    </span>
  );
}

function IndicatorCard({ indicator }: { indicator: ExecutiveIndicator }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{indicator.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{formatIndicatorValue(indicator, indicator.currentValue)}</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon trend={indicator.trend} />
          <StatusBadge status={indicator.status} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 lg:grid-cols-5">
        <MetricMini label="Dia" value={formatIndicatorValue(indicator, indicator.dayValue)} />
        <MetricMini label="Semana" value={formatIndicatorValue(indicator, indicator.weekValue)} />
        <MetricMini label="Mês" value={formatIndicatorValue(indicator, indicator.monthValue)} />
        <MetricMini label="Meta" value={formatIndicatorValue(indicator, indicator.targetValue)} />
        <MetricMini label="Projeção" value={formatIndicatorValue(indicator, indicator.projectionValue)} />
      </div>
      {indicator.note ? <p className="mt-3 text-sm text-slate-500">{indicator.note}</p> : null}
      <p className="mt-3 text-xs text-slate-400">Atualizado em {formatSnapshotTimestamp(indicator.sourceUpdatedAt)}</p>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function PriorityCard({ priority }: { priority: ExecutivePriority }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${priorityStyles[priority.severity]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{priority.severity === 'high' ? 'Prioridade alta' : 'Prioridade moderada'}</p>
      <p className="mt-2 font-semibold">{priority.title}</p>
      <p className="mt-1 text-sm opacity-90">{priority.description}</p>
    </div>
  );
}

function LiveHeartbeatCard({ heartbeat }: { heartbeat: ExecutiveLiveHeartbeat }) {
  const tone =
    heartbeat.status === 'COMPLETED'
      ? 'bg-emerald-500'
      : heartbeat.status === 'RUNNING'
        ? 'bg-amber-500'
        : heartbeat.status === 'ERROR'
          ? 'bg-rose-500'
          : 'bg-slate-400';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        <div>
          <p className="font-semibold text-slate-700">{heartbeat.serviceName}</p>
          <p className="text-xs uppercase tracking-wide text-slate-400">{heartbeat.status || 'UNKNOWN'}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">Última execução: {formatSnapshotTimestamp(heartbeat.lastRun)}</p>
      {heartbeat.details ? <p className="mt-2 text-sm text-slate-500">{heartbeat.details}</p> : null}
    </div>
  );
}

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
      throw new Error((payload as { error?: string }).error || 'Falha ao carregar painel executivo.');
    }
    setSnapshot(payload.data);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchExecutiveDashboard()
      .catch((err: any) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar painel executivo.');
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
        throw new Error(payload?.error || 'Falha ao atualizar o snapshot executivo.');
      }
      await fetchExecutiveDashboard();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o snapshot executivo.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchExecutiveDashboard]);

  const areas = snapshot?.metrics.areas || [];
  const liveOperations = snapshot?.metrics.liveOperations;
  const topPriorities = snapshot?.metrics.topPriorities || [];
  const overviewCards = useMemo(() => {
    if (!liveOperations) return [];
    return [
      { label: 'Fila médica', value: liveOperations.medicQueue, helper: `${liveOperations.attendedToday} atendimento(s) hoje` },
      { label: 'Fila recepção', value: liveOperations.receptionQueue, helper: `${liveOperations.averageReceptionWaitMinutes} min em média` },
      { label: 'WhatsApp digital', value: liveOperations.whatsappQueue, helper: 'Pacientes ativos no hub' },
      { label: 'Espera crítica', value: liveOperations.criticalWaitCount, helper: 'Pacientes com espera acima do limite' },
    ];
  }, [liveOperations]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_55%)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-sky-600" size={34} />
          <p className="text-sm font-medium text-slate-500">Consolidando o painel executivo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_55%)] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="bg-[linear-gradient(135deg,#0f172a,#1d4ed8_55%,#38bdf8)] px-8 py-8 text-white">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-sm font-medium text-sky-100">
                  <BrainCircuit size={18} />
                  <span>Painel Executivo Consultare</span>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">Visão consolidada para priorização da liderança</h1>
                <p className="mt-3 text-sm leading-6 text-sky-50/90">{snapshot?.metrics.executiveSummary}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-sky-100">
                  <span>Escopo: {formatScopeLabel(snapshot)}</span>
                  <span>Snapshot: {formatSnapshotTimestamp(snapshot?.completedAt || snapshot?.createdAt)}</span>
                  <span>IA: fase 2 pendente</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge status={snapshot?.metrics.overallStatus || 'NO_DATA'} />
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {refreshing ? 'Atualizando snapshot...' : 'Atualizar painel'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-100 bg-slate-50/80 px-8 py-6 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
                <p className="mt-1 text-sm text-slate-500">{card.helper}</p>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Prioridades do momento</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {topPriorities.length ? (
              topPriorities.map((priority) => <PriorityCard key={`${priority.areaKey}-${priority.title}`} priority={priority} />)
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm lg:col-span-3">
                Nenhum alerta quantitativo apareceu neste snapshot. A leitura automática com IA entra na próxima fase para aprofundar diagnóstico e planos de ação.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Blocos executivos</h2>
          </div>
          <div className="grid gap-6">
            {areas.map((area) => {
              const Icon = areaIcons[area.areaKey];
              return (
                <article key={area.areaKey} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                  <div className={`bg-gradient-to-r ${areaAccentStyles[area.areaKey]} px-6 py-5 text-white`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex items-center gap-2">
                          <Icon size={18} />
                          <h3 className="text-xl font-semibold">{area.label}</h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/90">{area.summary}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={area.status} />
                        <span className="text-sm text-white/85">Atualizado em {formatSnapshotTimestamp(area.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 p-6 xl:grid-cols-2">
                    {area.indicators.map((indicator) => (
                      <IndicatorCard key={`${area.areaKey}-${indicator.indicatorKey}`} indicator={indicator} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Operação ao vivo</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {(liveOperations?.heartbeats || []).map((heartbeat) => (
              <LiveHeartbeatCard key={`${heartbeat.serviceName}-${heartbeat.lastRun || 'never'}`} heartbeat={heartbeat} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
