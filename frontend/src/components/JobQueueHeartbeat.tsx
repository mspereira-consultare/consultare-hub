'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type QueueServiceName = 'faturamento' | 'repasses' | 'repasse_consolidacao';

type QueueServiceItem = {
  serviceName: QueueServiceName;
  status: string;
  lastRun: string | null;
  details: string;
  position: number | null;
  queueSize: number;
  isRunning: boolean;
  isQueued: boolean;
};

type QueueApiResponse = {
  status: 'success';
  data: {
    global: {
      queueSize: number;
      active: boolean;
      orderedServices: QueueServiceName[];
    };
    services: QueueServiceItem[];
  };
};

type JobQueueHeartbeatProps = {
  services: QueueServiceName[];
  fallbackLastSyncAt?: string | null;
  label?: string;
  className?: string;
  pollMs?: number;
};

const SERVICE_LABEL: Record<QueueServiceName, string> = {
  faturamento: 'Faturamento',
  repasses: 'Repasses',
  repasse_consolidacao: 'Consolidação',
};

const statusBadgeClass = (running: boolean, queued: boolean) => {
  if (running) return 'bg-emerald-100 text-emerald-700';
  if (queued) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

const toBrDateTime = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sem sincronização registrada';
  const isoLike = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('pt-BR');
};

export function JobQueueHeartbeat({
  services,
  fallbackLastSyncAt = null,
  label = 'Sincronização',
  className = '',
  pollMs = 8_000,
}: JobQueueHeartbeatProps) {
  const [items, setItems] = useState<QueueServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const serviceParam = useMemo(
    () => Array.from(new Set(services.map((s) => String(s).trim()).filter(Boolean))).join(','),
    [services]
  );

  const loadQueue = useCallback(async () => {
    if (!serviceParam) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/jobs/serial-queue-status?services=${encodeURIComponent(serviceParam)}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as QueueApiResponse | { error?: string };
      if (!res.ok) throw new Error((json as any)?.error || `Falha HTTP ${res.status}`);
      const nextItems = Array.isArray((json as QueueApiResponse)?.data?.services)
        ? (json as QueueApiResponse).data.services
        : [];
      setItems(nextItems);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [serviceParam]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await loadQueue();
    };
    run();
    const timer = window.setInterval(run, Math.max(4_000, pollMs));
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadQueue, pollMs]);

  const activeItems = useMemo(
    () =>
      items
        .filter((item) => item.isRunning || item.isQueued)
        .sort((a, b) => {
          const ap = a.position ?? Number.MAX_SAFE_INTEGER;
          const bp = b.position ?? Number.MAX_SAFE_INTEGER;
          return ap - bp;
        }),
    [items]
  );

  const primaryItem = activeItems[0] || null;
  const fallbackFromItems = useMemo(() => {
    const dates = items
      .map((item) => item.lastRun)
      .filter(Boolean)
      .map((raw) => ({ raw: String(raw), ts: new Date(String(raw).replace(' ', 'T')).getTime() }))
      .filter((item) => Number.isFinite(item.ts))
      .sort((a, b) => b.ts - a.ts);
    return dates[0]?.raw || null;
  }, [items]);

  const finalFallback = fallbackLastSyncAt || fallbackFromItems || null;

  if (!serviceParam) return null;

  if (!primaryItem || failed) {
    return (
      <div className={`flex flex-col text-xs ${className}`.trim()}>
        <span className="font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="font-medium text-slate-600">
          Última sincronização: {toBrDateTime(finalFallback)}
        </span>
      </div>
    );
  }

  const message = primaryItem.isRunning
    ? `Processando agora (posição ${primaryItem.position || 1} de ${primaryItem.queueSize || 1})`
    : `Na fila (posição ${primaryItem.position || '-'} de ${primaryItem.queueSize || '-'})`;

  return (
    <div className={`flex flex-col text-xs ${className}`.trim()}>
      <span className="font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(
            primaryItem.isRunning,
            primaryItem.isQueued
          )}`}
        >
          {SERVICE_LABEL[primaryItem.serviceName] || primaryItem.serviceName}
        </span>
        <span className="font-medium text-slate-700">{message}</span>
      </div>
      <span className="text-[11px] text-slate-500">
        Última atualização: {toBrDateTime(primaryItem.lastRun || finalFallback)}
        {loading ? ' • atualizando...' : ''}
      </span>
    </div>
  );
}

