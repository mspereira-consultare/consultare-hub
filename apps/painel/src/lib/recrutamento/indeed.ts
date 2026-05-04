import { createHmac, timingSafeEqual } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { EMPLOYEE_UNIT_LABELS } from '@/lib/colaboradores/constants';
import {
  finalizeRecruitmentIndeedApplication,
  getRecruitmentIndeedIntegrationForProvider,
  getRecruitmentIndeedSummary,
  ingestRecruitmentIndeedApplication,
  listRecruitmentDashboard,
  listRecruitmentJobsForIndeedFeed,
  saveRecruitmentIndeedIntegration,
  updateRecruitmentIndeedIntegrationHealth,
  updateRecruitmentJobIndeedSyncResult,
} from '@/lib/recrutamento/repository';
import { storeRecruitmentCandidateFile } from '@/lib/recrutamento/files';
import type {
  RecruitmentIndeedBackfillInput,
  RecruitmentIndeedIntegrationInput,
  RecruitmentIndeedIntegrationMode,
  RecruitmentIndeedIntegrationStatus,
  RecruitmentJob,
} from '@/lib/recrutamento/types';
import { RecruitmentValidationError } from '@/lib/recrutamento/repository';

const DEFAULT_GRAPHQL_ENDPOINT = 'https://apis.indeed.com/graphql';
const DEFAULT_TOKEN_ENDPOINT = 'https://apis.indeed.com/oauth/v2/tokens';

const clean = (value: unknown) => String(value ?? '').trim();

const resolveDefaultPublicBaseUrl = () => clean(process.env.NEXTAUTH_URL || process.env.AUTH_URL || '') || null;
const buildDefaultIndeedApplicationsUrl = (baseUrl: string | null) => {
  if (!baseUrl) return null;
  try {
    return new URL('/api/recrutamento/indeed/applications', baseUrl).toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}/api/recrutamento/indeed/applications`;
  }
};

const computeIntegrationStatus = (mode: RecruitmentIndeedIntegrationMode, payload: RecruitmentIndeedIntegrationInput) => {
  if (payload.status === 'INATIVA') return 'INATIVA' as RecruitmentIndeedIntegrationStatus;

  if (mode === 'EMPREGADOR_DIRETO_XML') {
    const ready = Boolean(clean(payload.companyName) && clean(payload.publisherName || payload.companyName) && clean(payload.publicBaseUrl));
    return ready ? 'ATIVA' : 'CONFIGURACAO_PENDENTE';
  }

  const ready = Boolean(
    clean(payload.companyName) &&
      clean(payload.clientId) &&
      clean((payload as { clientSecret?: unknown }).clientSecret) &&
      clean(payload.sourceName) &&
      clean(payload.publicBaseUrl)
  );
  return ready ? 'ATIVA' : 'CONFIGURACAO_PENDENTE';
};

export const saveRecruitmentIndeedIntegrationSetup = async (db: DbInterface, payload: RecruitmentIndeedIntegrationInput) => {
  const mode = (payload.integrationMode || 'EMPREGADOR_DIRETO_XML') as RecruitmentIndeedIntegrationMode;
  const normalizedPayload: RecruitmentIndeedIntegrationInput = {
    ...payload,
    integrationMode: mode,
    publicBaseUrl: payload.publicBaseUrl || resolveDefaultPublicBaseUrl(),
    postUrl: payload.postUrl || buildDefaultIndeedApplicationsUrl(payload.publicBaseUrl || resolveDefaultPublicBaseUrl()),
    graphqlEndpoint: payload.graphqlEndpoint || DEFAULT_GRAPHQL_ENDPOINT,
    tokenEndpoint: payload.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT,
  };
  normalizedPayload.status = computeIntegrationStatus(mode, normalizedPayload);
  const integration = await saveRecruitmentIndeedIntegration(db, normalizedPayload);
  await updateRecruitmentIndeedIntegrationHealth(db, {
    status: integration.status,
    lastError: integration.status === 'ATIVA' ? null : 'Configuração incompleta para publicação na Indeed.',
  });
  return getRecruitmentIndeedSummary(db);
};

const getUnitLocation = (job: RecruitmentJob) => {
  const unit = clean(job.unitName);
  const label = unit ? EMPLOYEE_UNIT_LABELS[unit as keyof typeof EMPLOYEE_UNIT_LABELS] || unit : '';
  if (unit === 'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS') {
    return { city: 'Campinas', state: 'SP', country: 'BR', postalCode: '' };
  }
  if (unit) {
    return { city: 'Campinas', state: 'SP', country: 'BR', postalCode: '' };
  }
  return { city: label || 'Campinas', state: 'SP', country: 'BR', postalCode: '' };
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const wrapCdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const buildJobUrl = (job: RecruitmentJob, publicBaseUrl: string | null) => {
  const base = publicBaseUrl || resolveDefaultPublicBaseUrl() || '';
  if (!base) return '';
  try {
    return new URL(`/recrutamento?jobId=${encodeURIComponent(job.id)}`, base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}/recrutamento?jobId=${encodeURIComponent(job.id)}`;
  }
};

const buildJobDescriptionHtml = (job: RecruitmentJob) => {
  const sections: string[] = [];
  if (clean(job.descriptionHtml)) return job.descriptionHtml!;
  if (clean(job.descriptionText)) sections.push(`<p>${escapeXml(job.descriptionText!)}</p>`);
  if (clean(job.requirementsText)) sections.push(`<h2>Requisitos</h2><p>${escapeXml(job.requirementsText!)}</p>`);
  if (clean(job.benefitsText)) sections.push(`<h2>Benefícios</h2><p>${escapeXml(job.benefitsText!)}</p>`);
  if (clean(job.notes)) sections.push(`<h2>Observações</h2><p>${escapeXml(job.notes!)}</p>`);
  return sections.join('');
};

export const buildRecruitmentIndeedFeedXml = async (db: DbInterface) => {
  const integration = await getRecruitmentIndeedIntegrationForProvider(db);
  if (!integration) throw new RecruitmentValidationError('Integração Indeed não configurada.');
  const jobs = await listRecruitmentJobsForIndeedFeed(db);

  const publisherName = clean(integration.publisherName) || clean(integration.companyName) || 'Consultare';
  const publisherUrl = clean(integration.publisherUrl) || clean(integration.publicBaseUrl) || '';

  const jobNodes = jobs
    .map((job) => {
      const location = getUnitLocation(job);
      const referenceNumber = clean(job.sourceExternalId) || job.id;
      const requisitionId = clean(job.sourceExternalId) || job.id;
      const jobUrl = buildJobUrl(job, integration.publicBaseUrl);
      const description = buildJobDescriptionHtml(job);
      const indeedApplyToken = clean(integration.clientId);
      const indeedApplyPostUrl = clean(integration.postUrl);
      const applyBlock =
        indeedApplyToken && indeedApplyPostUrl
          ? `
    <indeed-apply-data><![CDATA[
      indeed-apply-jobTitle=${encodeURIComponent(job.title)}&
      indeed-apply-jobId=${encodeURIComponent(referenceNumber)}&
      indeed-apply-apiToken=${encodeURIComponent(indeedApplyToken)}&
      indeed-apply-postUrl=${encodeURIComponent(indeedApplyPostUrl)}
    ]]></indeed-apply-data>`
              .replace(/\n\s+/g, '')
          : '';

      return `
  <job>
    <title>${wrapCdata(job.title)}</title>
    <date>${wrapCdata(new Date(job.openedAt || job.createdAt).toISOString())}</date>
    <referencenumber>${wrapCdata(referenceNumber)}</referencenumber>
    <requisitionid>${wrapCdata(requisitionId)}</requisitionid>
    <company>${wrapCdata(clean(integration.companyName) || 'Consultare')}</company>
    <city>${wrapCdata(location.city)}</city>
    <state>${wrapCdata(location.state)}</state>
    <country>${wrapCdata(location.country)}</country>
    <postalcode>${wrapCdata(location.postalCode)}</postalcode>
    <url>${wrapCdata(jobUrl)}</url>
    <email>${wrapCdata('recrutamento@consultare.com.br')}</email>
    <description>${wrapCdata(description || `<p>${escapeXml(job.title)}</p>`)}</description>
    <jobtype>${wrapCdata(job.employmentRegime)}</jobtype>
    <category>${wrapCdata(clean(job.department) || 'Recrutamento')}</category>${applyBlock}
  </job>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${wrapCdata(publisherName)}</publisher>
  <publisherurl>${wrapCdata(publisherUrl)}</publisherurl>
${jobNodes}
</source>`;
};

const publishDirectEmployerXmlJob = async (db: DbInterface, job: RecruitmentJob) => {
  const integration = await getRecruitmentIndeedIntegrationForProvider(db);
  if (!integration) throw new RecruitmentValidationError('Integração Indeed não configurada.');
  if (integration.status !== 'ATIVA') {
    throw new RecruitmentValidationError('Conclua a configuração da integração Indeed antes de publicar vagas.');
  }
  const payload = JSON.stringify({
    provider: 'INDEED',
    mode: integration.integrationMode,
    feedUrl: integration.publicFeedUrl,
    job: {
      id: job.id,
      title: job.title,
      unitName: job.unitName,
      department: job.department,
      status: job.status,
      descriptionText: job.descriptionText,
      requirementsText: job.requirementsText,
      benefitsText: job.benefitsText,
    },
  });
  await updateRecruitmentJobIndeedSyncResult(db, {
    jobId: job.id,
    externalJobId: clean(job.sourceExternalId) || job.id,
    externalJobKey: clean(job.sourceExternalId) || null,
    publicationMode: 'EMPREGADOR_DIRETO_XML',
    syncStatus: 'SINCRONIZADO',
    lastPayloadJson: payload,
    lastError: null,
  });
};

export const executeRecruitmentIndeedBackfillAction = async (db: DbInterface, payload: RecruitmentIndeedBackfillInput) => {
  const integration = await getRecruitmentIndeedIntegrationForProvider(db);
  if (!integration) throw new RecruitmentValidationError('Cadastre a integração da Indeed antes de executar esta ação.');

  const action = clean(payload.action).toUpperCase() as RecruitmentIndeedBackfillInput['action'];
  const dashboard = await listRecruitmentDashboard(db);
  const findJob = (jobId: string) => dashboard.jobs.find((job) => job.id === jobId) || null;

  if (action === 'ASSOCIAR_VAGA') {
    const jobId = clean(payload.jobId);
    if (!jobId) throw new RecruitmentValidationError('Selecione a vaga local para associar.');
    const job = findJob(jobId);
    if (!job) throw new RecruitmentValidationError('Vaga local não encontrada.', 404);
    await updateRecruitmentJobIndeedSyncResult(db, {
      jobId: job.id,
      externalJobId: clean(payload.externalJobId) || job.id,
      externalJobKey: clean(payload.externalJobKey) || null,
      publicationMode: integration.integrationMode,
      syncStatus: 'SINCRONIZADO',
      lastPayloadJson: JSON.stringify({
        action,
        externalJobId: clean(payload.externalJobId) || job.id,
        externalJobKey: clean(payload.externalJobKey) || null,
        notes: clean(payload.notes) || null,
      }),
      lastError: null,
    });
    return getRecruitmentIndeedSummary(db);
  }

  if (integration.integrationMode !== 'EMPREGADOR_DIRETO_XML') {
    throw new RecruitmentValidationError(
      'Nesta fase, a publicação operacional está habilitada para o modo XML de empregador direto. O modo ATS/parceiro ficou estruturado para evolução posterior.'
    );
  }

  if (action === 'PUBLICAR_VAGA') {
    const jobId = clean(payload.jobId);
    if (!jobId) throw new RecruitmentValidationError('Selecione a vaga que será publicada.');
    const job = findJob(jobId);
    if (!job) throw new RecruitmentValidationError('Vaga não encontrada.', 404);
    await publishDirectEmployerXmlJob(db, job);
    return getRecruitmentIndeedSummary(db);
  }

  if (action === 'PUBLICAR_VAGAS_PENDENTES') {
    const pendingJobs = dashboard.jobs.filter((job) => job.syncStatus === 'PENDENTE' || job.syncStatus === 'NAO_CONFIGURADO');
    for (const job of pendingJobs) {
      await publishDirectEmployerXmlJob(db, job);
    }
    return getRecruitmentIndeedSummary(db);
  }

  throw new RecruitmentValidationError('Ação de backfill/publicação da Indeed inválida.');
};

export const verifyRecruitmentIndeedSignature = (rawBody: string, xIndeedSignature: string, sharedSecret: string) => {
  const computed = createHmac('sha1', Buffer.from(sharedSecret, 'utf8')).update(Buffer.from(rawBody, 'utf8')).digest('base64');
  const receivedBuffer = Buffer.from(xIndeedSignature, 'utf8');
  const computedBuffer = Buffer.from(computed, 'utf8');
  if (receivedBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, computedBuffer);
};

export const processRecruitmentIndeedApplication = async (db: DbInterface, rawBody: string, signature: string | null) => {
  const integration = await getRecruitmentIndeedIntegrationForProvider(db);
  if (!integration) {
    throw new RecruitmentValidationError('Integração Indeed não configurada.', 404);
  }
  if (!integration.clientSecret) {
    throw new RecruitmentValidationError('Segredo da integração Indeed não configurado.', 401);
  }
  if (!signature || !verifyRecruitmentIndeedSignature(rawBody, signature, integration.clientSecret)) {
    throw new RecruitmentValidationError('Missing or Invalid X-Indeed-Signature value.', 401);
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    throw new RecruitmentValidationError('Payload da Indeed inválido.', 400);
  }

  const result = await ingestRecruitmentIndeedApplication(
    db,
    rawBody,
    parsedPayload as Parameters<typeof ingestRecruitmentIndeedApplication>[2],
    signature,
  );

  try {
    if (result.resumeFile) {
      const content = Buffer.from(result.resumeFile.dataBase64, 'base64');
      await storeRecruitmentCandidateFile(
        db,
        {
          candidateId: result.candidateId,
          originalName: result.resumeFile.originalName,
          mimeType: result.resumeFile.mimeType,
          sizeBytes: content.byteLength,
          content,
          uploadedBy: 'indeed-system',
        },
        'indeed-system',
      );
    }
    await finalizeRecruitmentIndeedApplication(db, {
      applicationRecordId: result.applicationRecordId,
      candidateId: result.candidateId,
      success: true,
    });
  } catch (error) {
    await finalizeRecruitmentIndeedApplication(db, {
      applicationRecordId: result.applicationRecordId,
      candidateId: result.candidateId,
      success: false,
      lastError: error instanceof Error ? error.message : 'Falha ao persistir anexos da candidatura Indeed.',
    });
    throw error;
  }

  return {
    integrationMode: integration.integrationMode,
    candidateId: result.candidateId,
  };
};
