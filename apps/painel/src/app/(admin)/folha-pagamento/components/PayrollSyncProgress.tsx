'use client';

import { useEffect, useMemo, useState } from 'react';

type SyncProgressLike = {
  status: string;
  totalEmployees?: number | null;
  processedEmployees?: number | null;
  processedDays?: number | null;
  currentStage?: string | null;
  progressPercent?: number | null;
  lastProgressAt?: string | null;
  estimatedRemainingSeconds?: number | null;
  details?: string | null;
  synchronizedEmployees?: number | null;
  synchronizedDays?: number | null;
  unmatchedEmployees?: number | null;
  pendingAdjustments?: number | null;
  pendingSignatures?: number | null;
};

const stageLabelMap: Record<string, string> = {
  DISCOVERING_EMPLOYEES: 'Carregando colaboradores e vínculos',
  SYNCING_DAILY_ACTIVITY: 'Sincronizando ponto diário',
  SYNCING_BALANCES_AND_SIGNATURES: 'Consolidando banco de horas e assinaturas',
  PERSISTING_DATA: 'Persistindo dados no painel',
  FINALIZING: 'Finalizando sincronização',
};

export const getSyncStageLabel = (stage: string | null | undefined) =>
  stage ? stageLabelMap[stage] || stage : 'Aguardando processamento';

export const resolveSyncProgressPercent = (run: SyncProgressLike | null | undefined) => {
  if (!run) return 0;
  if (typeof run.progressPercent === 'number' && Number.isFinite(run.progressPercent)) {
    return Math.max(0, Math.min(100, run.progressPercent));
  }
  const total = Number(run.totalEmployees || 0);
  const processed = Number(run.processedEmployees || 0);
  if (total > 0) return Math.max(0, Math.min(100, (processed / total) * 100));
  return String(run.status || '').toUpperCase() === 'COMPLETED' ? 100 : 0;
};

export const formatSyncEstimatedTime = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined || seconds <= 0) return null;
  if (seconds < 60) return `~${seconds}s restantes`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `~${minutes}min ${restSeconds}s restantes` : `~${minutes}min restantes`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `~${hours}h ${restMinutes}min restantes` : `~${hours}h restantes`;
};

export const resolveSyncEstimatedSeconds = (run: SyncProgressLike | null | undefined, nowMs = Date.now()) => {
  if (!run) return null;
  const estimated = typeof run.estimatedRemainingSeconds === 'number' && Number.isFinite(run.estimatedRemainingSeconds)
    ? Math.max(0, Math.round(run.estimatedRemainingSeconds))
    : null;
  if (estimated === null) return null;
  const lastProgressAtMs = run.lastProgressAt ? new Date(run.lastProgressAt).getTime() : Number.NaN;
  if (!Number.isFinite(lastProgressAtMs)) return estimated;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - lastProgressAtMs) / 1000));
  return Math.max(0, estimated - elapsedSeconds);
};

export const useSyncEstimatedLabel = (run: SyncProgressLike | null | undefined) => {
  const shouldTick =
    Boolean(run) &&
    ['PENDING', 'RUNNING'].includes(String(run?.status || '').toUpperCase()) &&
    typeof run?.estimatedRemainingSeconds === 'number' &&
    Number.isFinite(run.estimatedRemainingSeconds);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!shouldTick) return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [shouldTick, run?.lastProgressAt, run?.estimatedRemainingSeconds]);

  return useMemo(
    () => formatSyncEstimatedTime(resolveSyncEstimatedSeconds(run, nowMs)),
    [nowMs, run],
  );
};

export const buildSyncProgressMeta = (run: SyncProgressLike | null | undefined) => {
  if (!run) return null;
  const total = Number(run.totalEmployees || 0);
  const processed = Number(run.processedEmployees || 0);
  const processedDays = Number(run.processedDays || 0);
  const parts: string[] = [];
  if (total > 0) {
    parts.push(`${Math.min(processed, total)} de ${total} colaborador(es)`);
  }
  if (processedDays > 0) {
    parts.push(`${processedDays} registro(s) diário(s)`);
  }
  return parts.join(' · ') || null;
};

export function PayrollSyncProgress({
  run,
  scopeLabel,
  className = '',
}: {
  run: SyncProgressLike;
  scopeLabel: string;
  className?: string;
}) {
  const normalizedStatus = String(run.status || '').toUpperCase();
  const progressPercent = resolveSyncProgressPercent(run);
  const stageLabel = getSyncStageLabel(run.currentStage);
  const metaLabel = buildSyncProgressMeta(run);
  const estimatedLabel = useSyncEstimatedLabel(run);
  const toneClass =
    normalizedStatus === 'FAILED'
      ? 'border-rose-200 bg-rose-50'
      : normalizedStatus === 'COMPLETED'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-blue-200 bg-blue-50/70';
  const barClass =
    normalizedStatus === 'FAILED'
      ? 'bg-rose-500'
      : normalizedStatus === 'COMPLETED'
        ? 'bg-emerald-500'
        : 'bg-[#17407E]';

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass} ${className}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Sincronização da Sólides
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-800">
            {normalizedStatus === 'FAILED' ? 'Falha ao atualizar dados' : stageLabel}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {normalizedStatus === 'FAILED'
              ? run.details || `A sincronização de ${scopeLabel} falhou.`
              : `Atualizando os dados de ${scopeLabel} em segundo plano.`}
          </div>
        </div>

        <div className="text-left lg:text-right">
          <div className="text-sm font-semibold text-slate-800">{progressPercent.toFixed(0)}%</div>
          {metaLabel ? <div className="mt-0.5 text-xs text-slate-500">{metaLabel}</div> : null}
          {estimatedLabel ? <div className="mt-0.5 text-xs text-slate-500">{estimatedLabel}</div> : null}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
        <div className={`h-full rounded-full transition-[width] duration-500 ${barClass}`} style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
