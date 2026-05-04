'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Globe, Link2, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import type {
  RecruitmentIndeedBackfillInput,
  RecruitmentIndeedIntegrationInput,
  RecruitmentIndeedSummary,
  RecruitmentJob,
} from '@/lib/recrutamento/types';
import {
  Field,
  fieldClassName,
  StatusBadge,
  syncStatusLabel,
  syncStatusToneMap,
  textareaClassName,
} from './recruitment-ui';

type Props = {
  summary: RecruitmentIndeedSummary | null;
  jobs: RecruitmentJob[];
  canEdit: boolean;
  saving: string;
  onSaveIntegration: (payload: RecruitmentIndeedIntegrationInput) => Promise<void>;
  onRunBackfill: (payload: RecruitmentIndeedBackfillInput) => Promise<void>;
};

type IntegrationFormState = {
  integrationMode: 'EMPREGADOR_DIRETO_XML' | 'ATS_PARCEIRO_JOB_SYNC';
  companyName: string;
  clientId: string;
  clientSecret: string;
  sourceName: string;
  publisherName: string;
  publisherUrl: string;
  postUrl: string;
  publicBaseUrl: string;
  notes: string;
};

type BackfillFormState = {
  jobId: string;
  externalJobId: string;
  externalJobKey: string;
  notes: string;
};

const initialIntegrationForm: IntegrationFormState = {
  integrationMode: 'EMPREGADOR_DIRETO_XML',
  companyName: '',
  clientId: '',
  clientSecret: '',
  sourceName: '',
  publisherName: '',
  publisherUrl: '',
  postUrl: '',
  publicBaseUrl: '',
  notes: '',
};

const initialBackfillForm: BackfillFormState = {
  jobId: '',
  externalJobId: '',
  externalJobKey: '',
  notes: '',
};

const integrationStatusToneMap: Record<string, string> = {
  INATIVA: 'border-slate-200 bg-slate-50 text-slate-700',
  CONFIGURACAO_PENDENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  ATIVA: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ERRO: 'border-rose-200 bg-rose-50 text-rose-700',
};

const integrationStatusLabel = (value: string) => {
  switch (value) {
    case 'INATIVA':
      return 'Inativa';
    case 'CONFIGURACAO_PENDENTE':
      return 'Configuração pendente';
    case 'ATIVA':
      return 'Ativa';
    case 'ERRO':
      return 'Com erro';
    default:
      return value;
  }
};

const integrationModeLabel = (value: string) => {
  switch (value) {
    case 'EMPREGADOR_DIRETO_XML':
      return 'Empregador direto com XML';
    case 'ATS_PARCEIRO_JOB_SYNC':
      return 'ATS/parceiro com Job Sync';
    default:
      return value;
  }
};

export function RecruitmentIndeedPanel({ summary, jobs, canEdit, saving, onSaveIntegration, onRunBackfill }: Props) {
  const [integrationForm, setIntegrationForm] = useState<IntegrationFormState>(initialIntegrationForm);
  const [backfillForm, setBackfillForm] = useState<BackfillFormState>(initialBackfillForm);

  useEffect(() => {
    if (!summary?.integration) return;
    setIntegrationForm({
      integrationMode: summary.integration.integrationMode,
      companyName: summary.integration.companyName || '',
      clientId: summary.integration.clientId || '',
      clientSecret: '',
      sourceName: summary.integration.sourceName || '',
      publisherName: summary.integration.publisherName || '',
      publisherUrl: summary.integration.publisherUrl || '',
      postUrl: summary.integration.postUrl || '',
      publicBaseUrl: summary.integration.publicBaseUrl || '',
      notes: summary.integration.notes || '',
    });
  }, [summary?.integration]);

  const defaultJobId = jobs[0]?.id || '';
  useEffect(() => {
    if (!defaultJobId) return;
    setBackfillForm((current) => ({ ...current, jobId: current.jobId || defaultJobId }));
  }, [defaultJobId]);

  const recentMappings = useMemo(() => summary?.mappings.slice(0, 5) || [], [summary?.mappings]);

  const submitIntegration = async (event: FormEvent) => {
    event.preventDefault();
    await onSaveIntegration(integrationForm);
  };

  const associateJob = async () => {
    await onRunBackfill({
      action: 'ASSOCIAR_VAGA',
      jobId: backfillForm.jobId,
      externalJobId: backfillForm.externalJobId,
      externalJobKey: backfillForm.externalJobKey,
      notes: backfillForm.notes,
    });
  };

  const publishSelectedJob = async () => {
    await onRunBackfill({
      action: 'PUBLICAR_VAGA',
      jobId: backfillForm.jobId,
      notes: backfillForm.notes,
    });
  };

  const publishPendingJobs = async () => {
    await onRunBackfill({ action: 'PUBLICAR_VAGAS_PENDENTES' });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Integração com a Indeed</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nesta fase, o painel publica vagas, registra o backfill assistido e já recebe candidaturas oficiais da Indeed no endpoint público configurado.
          </p>
        </div>
        {summary?.integration ? (
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={integrationStatusToneMap[summary.integration.status] || integrationStatusToneMap.CONFIGURACAO_PENDENTE}>
              {integrationStatusLabel(summary.integration.status)}
            </StatusBadge>
            <StatusBadge tone="border-slate-200 bg-slate-50 text-slate-700">{integrationModeLabel(summary.integration.integrationMode)}</StatusBadge>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <form onSubmit={submitIntegration} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Modo da integração">
              <select
                value={integrationForm.integrationMode}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, integrationMode: event.target.value as IntegrationFormState['integrationMode'] }))}
                className={fieldClassName}
                disabled={!canEdit}
              >
                <option value="EMPREGADOR_DIRETO_XML">Empregador direto com XML</option>
                <option value="ATS_PARCEIRO_JOB_SYNC">ATS/parceiro com Job Sync</option>
              </select>
            </Field>
            <Field label="Empresa">
              <input
                value={integrationForm.companyName}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, companyName: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="Nome exibido na vaga"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Publisher">
              <input
                value={integrationForm.publisherName}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, publisherName: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="Nome do publicador/ATS"
              />
            </Field>
            <Field label="URL do publisher">
              <input
                value={integrationForm.publisherUrl}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, publisherUrl: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="https://..."
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Base pública do painel">
              <input
                value={integrationForm.publicBaseUrl}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, publicBaseUrl: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="https://painel.seudominio.com"
              />
            </Field>
            <Field label="Post URL da candidatura">
              <input
                value={integrationForm.postUrl}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, postUrl: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="Se ficar em branco, o painel usa o endpoint público padrão"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Client ID / token">
              <input
                value={integrationForm.clientId}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, clientId: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="Credencial oficial"
              />
            </Field>
            <Field label="Client secret">
              <input
                type="password"
                value={integrationForm.clientSecret}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, clientSecret: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder={summary?.integration?.clientSecretConfigured ? 'Já configurado' : 'Informe o segredo'}
              />
            </Field>
          </div>

          {integrationForm.integrationMode === 'ATS_PARCEIRO_JOB_SYNC' ? (
            <Field label="sourceName do Job Sync">
              <input
                value={integrationForm.sourceName}
                onChange={(event) => setIntegrationForm((current) => ({ ...current, sourceName: event.target.value }))}
                className={fieldClassName}
                disabled={!canEdit}
                placeholder="Identificador homologado pela Indeed"
              />
            </Field>
          ) : null}

          <Field label="Observações">
            <textarea
              value={integrationForm.notes}
              onChange={(event) => setIntegrationForm((current) => ({ ...current, notes: event.target.value }))}
              className={textareaClassName}
              disabled={!canEdit}
              placeholder="Ex.: conta principal, pendências de homologação, observações operacionais."
            />
          </Field>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs leading-5 text-slate-500">
            O modo XML de empregador direto já fica operacional nesta fase. O modo ATS/parceiro já fica estruturado, mas a publicação efetiva depende da homologação completa da conta na Indeed.
          </div>

          {canEdit ? (
            <button
              type="submit"
              disabled={saving === 'indeed-integration'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === 'indeed-integration' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Salvar integração
            </button>
          ) : null}
        </form>

        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Resumo operacional</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vagas elegíveis</p>
                <p className="mt-2 text-xl font-bold text-slate-800">{summary?.jobsEligible || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pendentes</p>
                <p className="mt-2 text-xl font-bold text-slate-800">{summary?.pendingJobs || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sincronizadas</p>
                <p className="mt-2 text-xl font-bold text-slate-800">{summary?.synchronizedJobs || 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mappings</p>
                <p className="mt-2 text-xl font-bold text-slate-800">{summary?.mappings.length || 0}</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Feed pública</p>
              <p className="mt-1 break-all">{summary?.publicFeedUrl || 'Será gerada automaticamente após salvar a integração.'}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Backfill assistido e publicação</h3>
            <div className="mt-4 space-y-3">
              <Field label="Vaga local">
                <select
                  value={backfillForm.jobId}
                  onChange={(event) => setBackfillForm((current) => ({ ...current, jobId: event.target.value }))}
                  className={fieldClassName}
                  disabled={!canEdit || !jobs.length}
                >
                  <option value="">Selecione</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="External job ID">
                  <input
                    value={backfillForm.externalJobId}
                    onChange={(event) => setBackfillForm((current) => ({ ...current, externalJobId: event.target.value }))}
                    className={fieldClassName}
                    disabled={!canEdit}
                    placeholder="ID já existente na Indeed"
                  />
                </Field>
                <Field label="External job key">
                  <input
                    value={backfillForm.externalJobKey}
                    onChange={(event) => setBackfillForm((current) => ({ ...current, externalJobKey: event.target.value }))}
                    className={fieldClassName}
                    disabled={!canEdit}
                    placeholder="Opcional"
                  />
                </Field>
              </div>

              <Field label="Observações do backfill">
                <textarea
                  value={backfillForm.notes}
                  onChange={(event) => setBackfillForm((current) => ({ ...current, notes: event.target.value }))}
                  className={textareaClassName}
                  disabled={!canEdit}
                  placeholder="Ex.: vaga já existente na Indeed, ajuste manual de IDs, publicação inicial."
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={associateJob}
                  disabled={!canEdit || !backfillForm.jobId || saving === 'indeed-backfill'}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving === 'indeed-backfill' ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                  Associar vaga
                </button>
                <button
                  type="button"
                  onClick={publishSelectedJob}
                  disabled={!canEdit || !backfillForm.jobId || saving === 'indeed-publish-job'}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving === 'indeed-publish-job' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Publicar vaga
                </button>
                <button
                  type="button"
                  onClick={publishPendingJobs}
                  disabled={!canEdit || saving === 'indeed-publish-pending'}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving === 'indeed-publish-pending' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Publicar pendentes
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Últimos mappings</h3>
            <div className="mt-4 space-y-3">
              {recentMappings.length ? (
                recentMappings.map((mapping) => (
                  <div key={mapping.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{mapping.jobTitle}</p>
                      <StatusBadge tone={syncStatusToneMap[mapping.syncStatus]}>{syncStatusLabel(mapping.syncStatus)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">External job ID: {mapping.externalJobId || 'Não informado'}</p>
                    <p className="mt-1 text-xs text-slate-500">External job key: {mapping.externalJobKey || 'Não informado'}</p>
                    <p className="mt-1 text-xs text-slate-500">Última sincronização: {mapping.lastSyncedAt ? new Date(mapping.lastSyncedAt).toLocaleString('pt-BR') : 'Não realizada'}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  Nenhum mapping registrado ainda.
                </div>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs leading-5 text-slate-500">
              O XML fica disponível pela feed pública. O endpoint de recebimento de candidaturas da Indeed será liberado na fase 3, junto com validação de assinatura e ingestão automática de anexos.
            </div>
            {summary?.publicFeedUrl ? (
              <a
                href={summary.publicFeedUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#17407E] hover:underline"
              >
                <Globe size={16} />
                Abrir feed XML atual
              </a>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
