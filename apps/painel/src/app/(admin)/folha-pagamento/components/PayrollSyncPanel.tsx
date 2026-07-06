'use client';

import { CheckCircle2, Clock3, DownloadCloud, Loader2, RefreshCw } from 'lucide-react';
import type { PayrollImportFile, PayrollPointSyncRun } from '@/lib/payroll/types';
import { formatDateTimeBr, statusLabelMap } from './formatters';
import { PayrollSourceBadge } from './PayrollSourceBadge';

const normalizeFrontendSourceLabel = (value: string | null | undefined) =>
  String(value || 'API Sólides').replace(/Sólides\/Tangerino/g, 'Sólides').replace(/Tangerino/g, 'Sólides');

const syncStatusTone = (status: string) => {
  if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'RUNNING') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export function PayrollSyncPanel({
  imports,
  syncRuns,
  syncingPoint,
  onSyncPoint,
  canSync = true,
  importDownloadBasePath = '/api/admin/ponto/imports',
}: {
  imports: PayrollImportFile[];
  syncRuns: PayrollPointSyncRun[];
  syncingPoint: boolean;
  onSyncPoint: () => void;
  canSync?: boolean;
  importDownloadBasePath?: string;
}) {
  const latestRun = syncRuns[0] || null;
  const latestTimesheet = imports.find((item) => item.fileType === 'SYNC_TIMESHEET') || null;
  const legacyImports = imports.filter((item) => item.fileType !== 'SYNC_TIMESHEET');
  const latestImport = legacyImports[0] || null;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-600 shadow-sm">
              <RefreshCw size={18} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Fonte oficial</div>
              <div className="mt-2"><PayrollSourceBadge source="SOLIDES" /></div>
              <div className="mt-1 text-xs leading-5 text-slate-600">
                A competência passa a usar a base sincronizada da API para ponto, banco de horas, férias e assinaturas. O fluxo por PDF continua visível apenas para histórico legado.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSyncPoint}
            disabled={syncingPoint || !canSync}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncingPoint ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sincronizar competência
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Espelho oficial</div>
          <div className="mt-2"><PayrollSourceBadge source="SOLIDES" /></div>
          <div className="mt-1 text-xs leading-5 text-slate-600">
            {latestTimesheet
              ? `Último espelho disponível: ${latestTimesheet.fileName}.`
              : 'Nenhum espelho oficial foi anexado nesta competência até o momento.'}
          </div>
          {latestTimesheet ? (
            <button
              type="button"
              onClick={() => window.open(`${importDownloadBasePath}/${encodeURIComponent(latestTimesheet.id)}/download`, '_blank', 'noopener,noreferrer')}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <DownloadCloud size={16} /> Baixar espelho
            </button>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
              A indisponibilidade do espelho não bloqueia a sincronização nem o fechamento.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Artefatos legados</div>
          <div className="mt-2"><PayrollSourceBadge source="LEGADO" /></div>
          <div className="mt-1 text-xs leading-5 text-slate-600">
            {latestImport
              ? `Último arquivo legado: ${latestImport.fileName}.`
              : 'Nenhum PDF legado registrado nesta competência.'}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Última sincronização</h3>
              <p className="mt-1 text-xs text-slate-500">Status do worker, volume sincronizado e alertas do período.</p>
            </div>
            {latestRun ? (
              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${syncStatusTone(latestRun.status)}`}>
                {statusLabelMap[latestRun.status] || latestRun.status}
              </span>
            ) : null}
          </div>

          {latestRun ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard label="Início" value={formatDateTimeBr(latestRun.startedAt || latestRun.createdAt)} />
              <InfoCard label="Fim" value={formatDateTimeBr(latestRun.finishedAt)} />
              <InfoCard label="Fonte" value={normalizeFrontendSourceLabel(latestRun.sourceLabel || 'API Sólides')} />
              <InfoCard label="Colaboradores" value={String(latestRun.synchronizedEmployees || 0)} />
              <InfoCard label="Registros diários" value={String(latestRun.synchronizedDays || 0)} />
              <InfoCard label="Não vinculados" value={String(latestRun.unmatchedEmployees || 0)} />
              <InfoCard label="Ajustes pendentes" value={String(latestRun.pendingAdjustments || 0)} />
              <InfoCard label="Assinaturas pendentes" value={String(latestRun.pendingSignatures || 0)} />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Nenhuma sincronização executada nesta competência até o momento.
            </div>
          )}

          {latestRun?.details ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{latestRun.details}</div>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Histórico</h3>
          <div className="mt-3 space-y-3">
            {syncRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                O histórico aparecerá após a primeira execução do worker.
              </div>
            ) : (
              syncRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">{formatDateTimeBr(run.createdAt)}</div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${syncStatusTone(run.status)}`}>
                      {statusLabelMap[run.status] || run.status}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                    <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> {run.synchronizedEmployees} colaborador(es)</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {run.synchronizedDays} dia(s)</span>
                    <span>{run.pendingAdjustments} ajuste(s) pendente(s)</span>
                    <span>{run.pendingSignatures} assinatura(s) pendente(s)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Artefatos da competência</h3>
          <div className="mt-3 space-y-3">
            {imports.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhum artefato registrado nesta competência.
              </div>
            ) : (
              imports.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.fileName}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTimeBr(item.createdAt)}</div>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${syncStatusTone(item.processingStatus)}`}>
                      {statusLabelMap[item.processingStatus] || item.processingStatus}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <DownloadCloud size={12} />
                    {item.fileType === 'SYNC_TIMESHEET' ? 'Espelho oficial da Sólides' : 'Arquivo legado da competência'}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-800">{value || '-'}</div>
    </div>
  );
}
