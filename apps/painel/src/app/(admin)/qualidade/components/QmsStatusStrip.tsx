'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { QmsOverviewMetrics } from '@/lib/qms/types';

type PageKey = 'qualidade_documentos' | 'qualidade_treinamentos' | 'qualidade_auditorias';

type Props = {
  pageKey: PageKey;
  canRefresh: boolean;
};

const normalizeError = async (res: Response) => {
  try {
    const json = await res.json();
    return String(json?.error || `Falha HTTP ${res.status}`);
  } catch {
    return `Falha HTTP ${res.status}`;
  }
};

const statusBadge = (status: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'ONLINE') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (normalized === 'RUNNING' || normalized === 'PENDING') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (normalized === 'FAILED' || normalized === 'ERROR') {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const cardTitleByPage: Record<PageKey, string> = {
  qualidade_documentos: 'Compliance de documentos',
  qualidade_treinamentos: 'Efetividade de treinamentos',
  qualidade_auditorias: 'Conformidade de auditorias',
};

export function QmsStatusStrip({ pageKey, canRefresh }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<QmsOverviewMetrics | null>(null);

  const loadMetrics = useCallback(async () => {
    setError(null);
    if (!metrics) setLoading(true);
    try {
      const res = await fetch(`/api/admin/qms/indicadores?page=${pageKey}&refresh=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await normalizeError(res));
      const json = await res.json();
      setMetrics((json?.data || null) as QmsOverviewMetrics | null);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [pageKey, metrics]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleRefreshAll = async () => {
    if (!canRefresh) return;
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch('/api/admin/qms/indicadores/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(await normalizeError(res));
      await loadMetrics();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setRefreshing(false);
    }
  };

  const cards = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        label: 'Documentos vigentes',
        value: `${metrics.documents.vigente}/${metrics.documents.total}`,
        helper: `${metrics.documents.aVencer} a vencer | ${metrics.documents.vencido} vencidos`,
      },
      {
        label: 'Treinamentos concluidos',
        value: `${metrics.trainings.executionsConcluidas}/${metrics.trainings.executionsTotal}`,
        helper:
          metrics.trainings.executionRate === null
            ? 'Taxa de execucao: -'
            : `Taxa de execucao: ${metrics.trainings.executionRate.toFixed(1)}%`,
      },
      {
        label: cardTitleByPage[pageKey],
        value:
          metrics.audits.avgCompliance === null
            ? '-'
            : `${metrics.audits.avgCompliance.toFixed(1)}%`,
        helper: `${metrics.audits.overdueActions} acoes atrasadas`,
      },
    ];
  }, [metrics, pageKey]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Indicadores do modulo Qualidade
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Consolida documentos, treinamentos e auditorias em uma visao operacional unica.
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={!canRefresh || refreshing}
          className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60"
          title={!canRefresh ? 'Sem permissao de refresh' : 'Recalcular status do modulo'}
        >
          {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Recalcular modulo
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="text-sm text-slate-500">Carregando indicadores...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {cards.map((card) => (
              <div key={card.label} className="rounded-lg border border-slate-200 px-4 py-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{card.label}</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{card.value}</p>
                <p className="text-xs text-slate-500 mt-1">{card.helper}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(metrics?.heartbeats || []).map((item) => (
              <div
                key={item.serviceName}
                className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {item.serviceName}
                  </p>
                  <p className="text-[11px] text-slate-500">{item.lastRun || 'Sem execucao'}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${statusBadge(item.status)}`}>
                  {item.status || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
