'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, FileSpreadsheet, FileText, Loader2, UploadCloud } from 'lucide-react';
import type { PayrollImportFile } from '@/lib/payroll/types';
import { formatDateTimeBr, statusLabelMap } from './formatters';

type SurfaceTone = 'emerald' | 'rose' | 'blue' | 'amber' | 'slate';

const resolveImportTypeLabel = (value: string) => {
  if (value === 'POINT_PDF') return 'Ponto (PDF)';
  if (value === 'REFERENCE_XLSX') return 'Base legada (XLSX)';
  return value;
};

type ImportsPanelState = {
  latestAttempt: PayrollImportFile | null;
  activeImport: PayrollImportFile | null;
  previousAttempts: PayrollImportFile[];
  failedCount: number;
  totalCount: number;
  inProgress: PayrollImportFile | null;
};

const buildPanelState = (imports: PayrollImportFile[]): ImportsPanelState => {
  const latestAttempt = imports[0] || null;
  const activeImport = imports.find((item) => item.processingStatus === 'COMPLETED') || null;
  const inProgress = imports.find((item) => ['PENDING', 'PROCESSING'].includes(item.processingStatus)) || null;

  return {
    latestAttempt,
    activeImport,
    previousAttempts: imports.filter((item) => item.id !== latestAttempt?.id && item.id !== activeImport?.id),
    failedCount: imports.filter((item) => item.processingStatus === 'FAILED').length,
    totalCount: imports.length,
    inProgress,
  };
};

const summarizeLog = (value: string | null | undefined, maxLength = 220) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sem log disponível.';
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength).trimEnd()}...`;
};

const resolveStatusTone = (status: string) => {
  if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'PROCESSING') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const resolveSurfaceTone = (tone: SurfaceTone) => {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50/70';
  if (tone === 'rose') return 'border-rose-200 bg-rose-50/70';
  if (tone === 'blue') return 'border-blue-200 bg-blue-50/70';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50/70';
  return 'border-slate-200 bg-white';
};

const resolveLatestAttemptTone = (status: string | null | undefined): SurfaceTone => {
  if (status === 'FAILED') return 'rose';
  if (status === 'COMPLETED') return 'emerald';
  if (status === 'PROCESSING') return 'blue';
  if (status === 'PENDING') return 'amber';
  return 'slate';
};

const resolveHighlightState = (state: ImportsPanelState) => {
  if (state.inProgress) {
    const isPending = state.inProgress.processingStatus === 'PENDING';
    return {
      kind: isPending ? 'pending' : 'processing',
      title: isPending ? 'Última tentativa aguardando processamento' : 'Última tentativa em processamento',
      description: isPending
        ? 'O arquivo mais recente desta competência foi recebido e está na fila do worker. A base ativa só será substituída depois que o processamento terminar.'
        : 'O worker está processando o arquivo mais recente desta competência. A base ativa só será substituída após a conclusão do processamento.',
      item: state.inProgress,
      tone: isPending ? 'amber' : 'blue',
      actionLabel: 'Enviar novo PDF',
    };
  }

  if (state.activeImport) {
    const latestFailed = state.latestAttempt && state.activeImport.id !== state.latestAttempt.id && state.latestAttempt.processingStatus === 'FAILED';
    return {
      kind: latestFailed ? 'preserved' : 'active',
      title: latestFailed ? 'Base ativa preservada' : 'Base ativa da competência',
      description: latestFailed
        ? 'A tentativa mais recente falhou, então o sistema continua usando o último arquivo concluído como base ativa desta competência.'
        : 'Este é o último arquivo concluído e atualmente usado como base do período selecionado.',
      item: state.activeImport,
      tone: 'emerald',
      actionLabel: 'Substituir com novo PDF',
    };
  }

  if (state.latestAttempt) {
    return {
      kind: state.latestAttempt.processingStatus === 'FAILED' ? 'failed' : 'latest',
      title: state.latestAttempt.processingStatus === 'FAILED' ? 'Última tentativa falhou' : 'Última tentativa registrada',
      description: state.latestAttempt.processingStatus === 'FAILED'
        ? 'Ainda não existe uma base ativa concluída para esta competência. Envie um novo arquivo para tentar novamente.'
        : 'Há uma tentativa registrada para esta competência, mas ainda não existe uma base ativa concluída.',
      item: state.latestAttempt,
      tone: state.latestAttempt.processingStatus === 'FAILED' ? 'rose' : 'slate',
      actionLabel: 'Enviar novo PDF',
    };
  }

  return {
    kind: 'empty',
    title: 'Nenhum arquivo enviado nesta competência',
    description: 'Envie o relatório de ponto do período selecionado. O histórico mostrado aqui é sempre da competência atual.',
    item: null,
    tone: 'slate',
    actionLabel: 'Enviar primeiro PDF',
  };
};

export function PayrollImportsPanel({
  imports,
  uploadingPoint,
  onUploadPoint,
}: {
  imports: PayrollImportFile[];
  uploadingPoint: boolean;
  onUploadPoint: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [expandedAttemptsKey, setExpandedAttemptsKey] = useState<string | null>(null);

  const panelState = useMemo(() => buildPanelState(imports), [imports]);
  const highlight = useMemo(() => resolveHighlightState(panelState), [panelState]);
  const previousAttemptsKey = useMemo(() => panelState.previousAttempts.map((item) => item.id).join('|'), [panelState.previousAttempts]);
  const showPreviousAttempts = Boolean(previousAttemptsKey) && expandedAttemptsKey === previousAttemptsKey;

  const openFilePicker = () => {
    if (uploadingPoint) return;
    inputRef.current?.click();
  };

  const togglePreviousAttempts = () => {
    if (!previousAttemptsKey) return;
    setExpandedAttemptsKey((current) => (current === previousAttemptsKey ? null : previousAttemptsKey));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUploadPoint(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="space-y-4">
        <UploadCard
          title="Relatório de ponto (PDF)"
          description="Importe o relatório do período no layout atual do RH. Se houver nova tentativa, ela entra no histórico desta competência."
          buttonLabel="Enviar PDF"
          loading={uploadingPoint}
          onPick={openFilePicker}
          icon={FileText}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-600 shadow-sm">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Planilha padrão do RH</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">Geração automática no layout operacional</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                A planilha operacional é gerada automaticamente. Esta aba mostra apenas os arquivos enviados para a competência selecionada e mantém as tentativas anteriores para auditoria.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Histórico de importações</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Este histórico mostra apenas os envios da competência selecionada. Um novo arquivo pode substituir a base ativa, mas as tentativas anteriores continuam registradas.
          </p>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard
              title="Base ativa"
              value={panelState.activeImport ? panelState.activeImport.fileName : 'Nenhuma base ativa'}
              helper={panelState.activeImport ? `Processado em ${formatDateTimeBr(panelState.activeImport.processedAt)}` : 'Ainda não há importação concluída nesta competência.'}
              icon={CheckCircle2}
              tone={panelState.activeImport ? 'emerald' : 'slate'}
              badge={panelState.activeImport ? 'Ativa' : null}
            />
            <SummaryCard
              title="Última tentativa"
              value={panelState.latestAttempt ? panelState.latestAttempt.fileName : 'Nenhum envio registrado'}
              helper={panelState.latestAttempt ? `Enviado em ${formatDateTimeBr(panelState.latestAttempt.createdAt)}` : 'O próximo envio aparecerá aqui.'}
              icon={Clock3}
              tone={resolveLatestAttemptTone(panelState.latestAttempt?.processingStatus)}
              badge={panelState.latestAttempt ? statusLabelMap[panelState.latestAttempt.processingStatus] || panelState.latestAttempt.processingStatus : null}
            />
            <SummaryCard
              title="Tentativas no período"
              value={`${panelState.totalCount} envio(s)`}
              helper={
                panelState.failedCount > 0
                  ? `${panelState.failedCount} falha(s) registrada(s) nesta competência.`
                  : panelState.totalCount > 0
                    ? 'Sem falhas registradas nesta competência.'
                    : 'Nenhuma tentativa registrada ainda.'
              }
              icon={AlertTriangle}
              tone={panelState.failedCount > 0 ? 'rose' : 'slate'}
              badge={panelState.failedCount > 0 ? `${panelState.failedCount} falha(s)` : null}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`rounded-full border p-2 text-slate-600 ${resolveSurfaceTone(highlight.tone)}`}>
                    <HighlightStateIcon kind={highlight.kind} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Estado atual da competência</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{highlight.title}</div>
                  </div>
                  {highlight.item ? <StatusBadge status={highlight.item.processingStatus} /> : null}
                </div>
                <p className="text-sm leading-6 text-slate-600">{highlight.description}</p>

                {highlight.item ? (
                  <div className={`rounded-xl border p-4 ${resolveSurfaceTone(highlight.tone)}`}>
                    <div className="text-sm font-semibold text-slate-800">{highlight.item.fileName}</div>
                    <div className="mt-1 text-xs text-slate-500">{resolveImportTypeLabel(String(highlight.item.fileType || ''))}</div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <div>
                        <span className="font-semibold text-slate-700">Enviado em:</span> {formatDateTimeBr(highlight.item.createdAt)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Processado em:</span>{' '}
                        {highlight.item.processedAt ? formatDateTimeBr(highlight.item.processedAt) : 'Aguardando processamento'}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      <span className="font-semibold text-slate-700">Log resumido:</span> {summarizeLog(highlight.item.processingLog)}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    Nenhum arquivo foi enviado para esta competência até o momento.
                  </div>
                )}
              </div>

              <div className="flex shrink-0">
                <UploadActionButton
                  label={highlight.actionLabel}
                  loading={uploadingPoint}
                  onClick={openFilePicker}
                  tone={highlight.item ? 'secondary' : 'primary'}
                />
              </div>
            </div>
          </div>

          {panelState.previousAttempts.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={togglePreviousAttempts}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Tentativas anteriores ({panelState.previousAttempts.length})</div>
                  <div className="mt-1 text-xs text-slate-500">As execuções mais antigas ficam recolhidas por padrão para manter a leitura da competência mais objetiva.</div>
                </div>
                <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${showPreviousAttempts ? 'rotate-180' : ''}`} />
              </button>

              {showPreviousAttempts ? (
                <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                  {panelState.previousAttempts.map((item) => (
                    <details key={item.id} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                      <summary className="cursor-pointer list-none px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-slate-800">{item.fileName}</div>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge status={item.processingStatus} />
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
                                {resolveImportTypeLabel(String(item.fileType || ''))}
                              </span>
                            </div>
                            <div className="grid gap-1 text-xs text-slate-500 md:grid-cols-2">
                              <div>Enviado em {formatDateTimeBr(item.createdAt)}</div>
                              <div>{item.processedAt ? `Processado em ${formatDateTimeBr(item.processedAt)}` : 'Sem processamento concluído'}</div>
                            </div>
                          </div>
                          <ChevronDown size={16} className="mt-1 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                        </div>
                      </summary>

                      <div className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-600">
                        <span className="font-semibold text-slate-700">Log completo:</span> {item.processingLog || 'Sem log disponível.'}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          ) : imports.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              Não há tentativas anteriores nesta competência. A leitura permanece focada apenas no envio mais relevante do período.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  icon: Icon,
  tone,
  badge,
}: {
  title: string;
  value: string;
  helper: string;
  icon: typeof FileText;
  tone: SurfaceTone;
  badge: string | null;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${resolveSurfaceTone(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-full border border-white/70 bg-white/90 p-3 text-slate-600 shadow-sm">
          <Icon size={16} />
        </div>
        {badge ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{badge}</span> : null}
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</div>
      <div className="mt-3 text-xl font-bold leading-7 text-slate-900">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${resolveStatusTone(status)}`}>
      <StatusBadgeIcon status={status} />
      {statusLabelMap[status] || status}
    </span>
  );
}

function StatusBadgeIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle2 size={12} />;
  if (status === 'FAILED') return <AlertTriangle size={12} />;
  if (status === 'PROCESSING') return <Loader2 size={12} className="animate-spin" />;
  if (status === 'PENDING') return <Clock3 size={12} />;
  return <FileText size={12} />;
}

function HighlightStateIcon({ kind }: { kind: string }) {
  if (kind === 'active' || kind === 'preserved') return <CheckCircle2 size={16} />;
  if (kind === 'failed') return <AlertTriangle size={16} />;
  if (kind === 'processing') return <Loader2 size={16} className="animate-spin" />;
  if (kind === 'pending') return <Clock3 size={16} />;
  return <FileText size={16} />;
}

function UploadActionButton({
  label,
  loading,
  onClick,
  tone,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  tone: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={[
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
        tone === 'primary'
          ? 'bg-[#17407E] text-white hover:bg-[#14376c]'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        loading ? 'cursor-not-allowed opacity-75' : '',
      ].join(' ')}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
      {label}
    </button>
  );
}

function UploadCard({
  title,
  description,
  buttonLabel,
  loading,
  onPick,
  icon: Icon,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  loading: boolean;
  onPick: () => void;
  icon: typeof UploadCloud;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-600 shadow-sm">
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Envio manual</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
          <div className="mt-4">
            <UploadActionButton label={buttonLabel} loading={loading} onClick={onPick} tone="secondary" />
          </div>
        </div>
      </div>
    </div>
  );
}
