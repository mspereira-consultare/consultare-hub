import { createHash, randomUUID } from 'crypto';
import { runInTransaction, type DbInterface } from '@/lib/db';
import { EMPLOYEE_UNITS, type EmploymentRegime } from '@/lib/colaboradores/constants';
import { createEmployee } from '@/lib/colaboradores/repository';
import type {
  RecruitmentAiAnalysis,
  RecruitmentAiAnalysisJob,
  RecruitmentAiAnalysisJobStatus,
  RecruitmentAiStatus,
  RecruitmentCandidate,
  RecruitmentCandidateAnalysisDetails,
  RecruitmentCandidateFile,
  RecruitmentCandidateHistory,
  RecruitmentCandidateInput,
  RecruitmentIndeedBackfillInput,
  RecruitmentIndeedIntegration,
  RecruitmentIndeedIntegrationInput,
  RecruitmentIndeedIntegrationMode,
  RecruitmentIndeedIntegrationStatus,
  RecruitmentIndeedJobMapping,
  RecruitmentIndeedSummary,
  RecruitmentManagerReviewStatus,
  RecruitmentCandidateStage,
  RecruitmentDashboard,
  RecruitmentJob,
  RecruitmentJobStatus,
  RecruitmentResumeExtraction,
  RecruitmentResumeExtractionStatus,
  RecruitmentSourceSystem,
  RecruitmentSyncStatus,
} from '@/lib/recrutamento/types';

type DbRow = Record<string, unknown>;
type Payload = Record<string, unknown>;

export class RecruitmentValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const NOW = () => new Date().toISOString();
const TODAY_SAO_PAULO = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const normalizeCpf = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizePhone = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizeEmail = (value: unknown) => {
  const email = clean(value).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RecruitmentValidationError('E-mail inválido.');
  }
  return email;
};

const parseDate = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const jobStatuses = new Set<RecruitmentJobStatus>(['OPEN', 'PAUSED', 'CLOSED']);
const stages = new Set<RecruitmentCandidateStage>(['RECEBIDO', 'TRIAGEM', 'ENTREVISTA', 'GERENCIA', 'BANCO', 'APROVADO', 'RECUSADO', 'CONTRATADO']);
const sourceSystems = new Set<RecruitmentSourceSystem>(['INTERNO', 'INDEED']);
const syncStatuses = new Set<RecruitmentSyncStatus>(['NAO_CONFIGURADO', 'PENDENTE', 'SINCRONIZADO', 'ERRO']);
const aiStatuses = new Set<RecruitmentAiStatus>(['NAO_ANALISADO', 'PENDENTE', 'ANALISANDO', 'CONCLUIDO', 'ERRO', 'NAO_SUPORTADO']);
const aiAnalysisJobStatuses = new Set<RecruitmentAiAnalysisJobStatus>(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED']);
const resumeExtractionStatuses = new Set<RecruitmentResumeExtractionStatus>(['PENDING', 'EXTRAIDO', 'ERRO', 'NAO_SUPORTADO']);
const managerReviewStatuses = new Set<RecruitmentManagerReviewStatus>(['NAO_ENVIADO', 'PENDENTE', 'APROVADO', 'DEVOLVIDO']);
const indeedIntegrationModes = new Set<RecruitmentIndeedIntegrationMode>(['EMPREGADOR_DIRETO_XML', 'ATS_PARCEIRO_JOB_SYNC']);
const indeedIntegrationStatuses = new Set<RecruitmentIndeedIntegrationStatus>(['INATIVA', 'CONFIGURACAO_PENDENTE', 'ATIVA', 'ERRO']);
const regimes = new Set<EmploymentRegime>(['CLT', 'PJ', 'ESTAGIO']);
const allowedUnits = new Set<string>(EMPLOYEE_UNITS as unknown as string[]);

const normalizeJobStatus = (value: unknown): RecruitmentJobStatus => {
  const normalized = upper(value || 'OPEN') as RecruitmentJobStatus;
  if (!jobStatuses.has(normalized)) throw new RecruitmentValidationError('Status da vaga inválido.');
  return normalized;
};

const normalizeStage = (value: unknown): RecruitmentCandidateStage => {
  const normalized = upper(value || 'RECEBIDO') as RecruitmentCandidateStage;
  if (!stages.has(normalized)) throw new RecruitmentValidationError('Etapa do candidato inválida.');
  return normalized;
};

const normalizeSourceSystem = (value: unknown): RecruitmentSourceSystem => {
  const normalized = upper(value || 'INTERNO') as RecruitmentSourceSystem;
  if (!sourceSystems.has(normalized)) throw new RecruitmentValidationError('Origem sistêmica inválida.');
  return normalized;
};

const normalizeSyncStatus = (value: unknown): RecruitmentSyncStatus => {
  const normalized = upper(value || 'NAO_CONFIGURADO') as RecruitmentSyncStatus;
  if (!syncStatuses.has(normalized)) throw new RecruitmentValidationError('Status de sincronização inválido.');
  return normalized;
};

const normalizeAiStatus = (value: unknown): RecruitmentAiStatus => {
  const normalized = upper(value || 'NAO_ANALISADO') as RecruitmentAiStatus;
  if (!aiStatuses.has(normalized)) throw new RecruitmentValidationError('Status da análise de IA inválido.');
  return normalized;
};

const normalizeAiAnalysisJobStatus = (value: unknown): RecruitmentAiAnalysisJobStatus => {
  const normalized = upper(value || 'PENDING') as RecruitmentAiAnalysisJobStatus;
  if (!aiAnalysisJobStatuses.has(normalized)) throw new RecruitmentValidationError('Status do job de IA inválido.');
  return normalized;
};

const normalizeResumeExtractionStatus = (value: unknown): RecruitmentResumeExtractionStatus => {
  const normalized = upper(value || 'PENDING') as RecruitmentResumeExtractionStatus;
  if (!resumeExtractionStatuses.has(normalized)) throw new RecruitmentValidationError('Status da extração do currículo inválido.');
  return normalized;
};

const normalizeManagerReviewStatus = (value: unknown): RecruitmentManagerReviewStatus => {
  const normalized = upper(value || 'NAO_ENVIADO') as RecruitmentManagerReviewStatus;
  if (!managerReviewStatuses.has(normalized)) throw new RecruitmentValidationError('Status da etapa com a gerência inválido.');
  return normalized;
};

const normalizeIndeedIntegrationMode = (value: unknown): RecruitmentIndeedIntegrationMode => {
  const normalized = upper(value || 'EMPREGADOR_DIRETO_XML') as RecruitmentIndeedIntegrationMode;
  if (!indeedIntegrationModes.has(normalized)) throw new RecruitmentValidationError('Modo de integração da Indeed inválido.');
  return normalized;
};

const normalizeIndeedIntegrationStatus = (value: unknown): RecruitmentIndeedIntegrationStatus => {
  const normalized = upper(value || 'CONFIGURACAO_PENDENTE') as RecruitmentIndeedIntegrationStatus;
  if (!indeedIntegrationStatuses.has(normalized)) throw new RecruitmentValidationError('Status da integração da Indeed inválido.');
  return normalized;
};

const normalizeRegime = (value: unknown): EmploymentRegime => {
  const normalized = upper(value || 'CLT') as EmploymentRegime;
  if (!regimes.has(normalized)) throw new RecruitmentValidationError('Regime da vaga inválido.');
  return normalized;
};

const normalizeUnit = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = upper(raw);
  const found = Array.from(allowedUnits).find((unit) => upper(unit) === normalized);
  if (!found) throw new RecruitmentValidationError('Unidade da vaga inválida.');
  return found;
};

const hasField = (payload: Payload | null | undefined, camelKey: string, snakeKey?: string) =>
  Object.prototype.hasOwnProperty.call(payload || {}, camelKey) ||
  Boolean(snakeKey && Object.prototype.hasOwnProperty.call(payload || {}, snakeKey));

const cleanJsonPayload = (value: unknown) => {
  const raw = clean(value);
  return raw || null;
};

const cleanUrl = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    throw new RecruitmentValidationError('URL da integração Indeed inválida.');
  }
};

const normalizeNullableScore = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new RecruitmentValidationError('Nota da análise de IA inválida.');
  const score = Math.round(parsed);
  if (score < 0 || score > 100) throw new RecruitmentValidationError('A nota da análise de IA deve ficar entre 0 e 100.');
  return score;
};

const parseJsonArray = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [] as unknown[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const hashPayload = (value: string) => createHash('sha256').update(value).digest('hex');

let tablesEnsured = false;

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const details = error as { message?: unknown; code?: unknown };
    const msg = String(details?.message || '');
    const code = String(details?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const details = error as { message?: unknown; code?: unknown };
    const msg = String(details?.message || '');
    const code = String(details?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists|Duplicate key name/i.test(msg)) return;
    throw error;
  }
};

export const ensureRecruitmentTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_jobs (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      department VARCHAR(180) NULL,
      unit_name VARCHAR(180) NULL,
      employment_regime VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      owner_name VARCHAR(180) NULL,
      opened_at DATE NULL,
      closed_at DATE NULL,
      description_html LONGTEXT NULL,
      description_text TEXT NULL,
      requirements_text TEXT NULL,
      benefits_text TEXT NULL,
      source_system VARCHAR(20) NOT NULL DEFAULT 'INTERNO',
      source_external_id VARCHAR(180) NULL,
      sync_status VARCHAR(30) NOT NULL DEFAULT 'NAO_CONFIGURADO',
      last_synced_at TEXT NULL,
      external_payload_json LONGTEXT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidates (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      full_name VARCHAR(220) NOT NULL,
      cpf VARCHAR(20) NULL,
      email VARCHAR(220) NULL,
      phone VARCHAR(40) NULL,
      stage VARCHAR(30) NOT NULL,
      source VARCHAR(120) NULL,
      source_system VARCHAR(20) NOT NULL DEFAULT 'INTERNO',
      source_external_id VARCHAR(180) NULL,
      application_external_id VARCHAR(180) NULL,
      ai_status VARCHAR(30) NOT NULL DEFAULT 'NAO_ANALISADO',
      ai_score INTEGER NULL,
      ai_last_analyzed_at TEXT NULL,
      manager_review_status VARCHAR(30) NOT NULL DEFAULT 'NAO_ENVIADO',
      manager_review_requested_at TEXT NULL,
      manager_review_requested_by VARCHAR(64) NULL,
      manager_review_decided_at TEXT NULL,
      manager_review_decided_by VARCHAR(64) NULL,
      manager_review_notes TEXT NULL,
      notes TEXT NULL,
      converted_employee_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidate_files (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(255) NULL,
      storage_key TEXT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidate_history (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      action VARCHAR(60) NOT NULL,
      from_stage VARCHAR(30) NULL,
      to_stage VARCHAR(30) NULL,
      notes TEXT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_indeed_integrations (
      id VARCHAR(64) PRIMARY KEY,
      provider VARCHAR(40) NOT NULL,
      integration_mode VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL,
      company_name VARCHAR(180) NULL,
      client_id VARCHAR(180) NULL,
      client_secret TEXT NULL,
      source_name VARCHAR(180) NULL,
      publisher_name VARCHAR(180) NULL,
      publisher_url TEXT NULL,
      post_url TEXT NULL,
      public_base_url TEXT NULL,
      feed_token VARCHAR(180) NULL,
      graphql_endpoint TEXT NULL,
      token_endpoint TEXT NULL,
      last_healthcheck_at TEXT NULL,
      last_error TEXT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_indeed_job_mappings (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      source_system VARCHAR(20) NOT NULL,
      external_job_id VARCHAR(180) NULL,
      external_job_key VARCHAR(180) NULL,
      publication_mode VARCHAR(40) NOT NULL DEFAULT 'EMPREGADOR_DIRETO_XML',
      sync_status VARCHAR(30) NOT NULL,
      last_synced_at TEXT NULL,
      last_payload_hash VARCHAR(80) NULL,
      last_error TEXT NULL,
      external_payload_json LONGTEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_indeed_applications (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NULL,
      job_id VARCHAR(64) NULL,
      application_external_id VARCHAR(180) NULL,
      dedupe_key VARCHAR(255) NULL,
      signature TEXT NULL,
      payload_json LONGTEXT NULL,
      ingest_status VARCHAR(30) NOT NULL,
      last_error TEXT NULL,
      received_at TEXT NULL,
      processed_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_resume_extractions (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      file_id VARCHAR(64) NULL,
      extraction_status VARCHAR(30) NOT NULL,
      file_format VARCHAR(30) NULL,
      extracted_text LONGTEXT NULL,
      quality_score INTEGER NULL,
      fallback_used VARCHAR(60) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_ai_analysis_jobs (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      job_id VARCHAR(64) NOT NULL,
      source_file_id VARCHAR(64) NULL,
      status VARCHAR(30) NOT NULL,
      prompt_version VARCHAR(40) NULL,
      model VARCHAR(80) NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      requested_by VARCHAR(64) NULL,
      last_error TEXT NULL,
      completed_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_ai_analyses (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      job_id VARCHAR(64) NOT NULL,
      analysis_job_id VARCHAR(64) NULL,
      source_file_id VARCHAR(64) NULL,
      model VARCHAR(80) NULL,
      schema_version VARCHAR(40) NULL,
      score INTEGER NULL,
      short_verdict TEXT NULL,
      detailed_report LONGTEXT NULL,
      strengths_json LONGTEXT NULL,
      weaknesses_json LONGTEXT NULL,
      matched_requirements_json LONGTEXT NULL,
      missing_requirements_json LONGTEXT NULL,
      risks_or_gaps_json LONGTEXT NULL,
      evidence_json LONGTEXT NULL,
      recommended_next_step TEXT NULL,
      raw_response_json LONGTEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN description_html LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN description_text TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN requirements_text TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN benefits_text TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN source_system VARCHAR(20) NOT NULL DEFAULT 'INTERNO'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN source_external_id VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN sync_status VARCHAR(30) NOT NULL DEFAULT 'NAO_CONFIGURADO'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN last_synced_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_jobs ADD COLUMN external_payload_json LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN source_system VARCHAR(20) NOT NULL DEFAULT 'INTERNO'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN source_external_id VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN application_external_id VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN ai_status VARCHAR(30) NOT NULL DEFAULT 'NAO_ANALISADO'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN ai_score INTEGER NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN ai_last_analyzed_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_status VARCHAR(30) NOT NULL DEFAULT 'NAO_ENVIADO'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_requested_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_requested_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_decided_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_decided_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_candidates ADD COLUMN manager_review_notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN client_secret TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN source_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN publisher_name VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN publisher_url TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN post_url TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN public_base_url TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN feed_token VARCHAR(180) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN graphql_endpoint TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN token_endpoint TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_integrations ADD COLUMN last_error TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_job_mappings ADD COLUMN publication_mode VARCHAR(40) NOT NULL DEFAULT 'EMPREGADOR_DIRETO_XML'`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_job_mappings ADD COLUMN last_payload_hash VARCHAR(80) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_job_mappings ADD COLUMN last_error TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_applications ADD COLUMN dedupe_key VARCHAR(255) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_indeed_applications ADD COLUMN last_error TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_ai_analysis_jobs ADD COLUMN source_file_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recruitment_ai_analyses ADD COLUMN source_file_id VARCHAR(64) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_jobs_status ON recruitment_jobs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_job ON recruitment_candidates (job_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_stage ON recruitment_candidates (stage)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_files_candidate ON recruitment_candidate_files (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_history_candidate ON recruitment_candidate_history (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_jobs_sync_status ON recruitment_jobs (sync_status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_ai_status ON recruitment_candidates (ai_status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_manager_status ON recruitment_candidates (manager_review_status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_integrations_status ON recruitment_indeed_integrations (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_job_mappings_job ON recruitment_indeed_job_mappings (job_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_job_mappings_sync_status ON recruitment_indeed_job_mappings (sync_status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_applications_job ON recruitment_indeed_applications (job_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_applications_external_id ON recruitment_indeed_applications (application_external_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_indeed_applications_dedupe_key ON recruitment_indeed_applications (dedupe_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_resume_extractions_candidate ON recruitment_resume_extractions (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_ai_analysis_jobs_candidate ON recruitment_ai_analysis_jobs (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_ai_analysis_jobs_status ON recruitment_ai_analysis_jobs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_ai_analysis_jobs_file ON recruitment_ai_analysis_jobs (source_file_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_ai_analyses_candidate ON recruitment_ai_analyses (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_ai_analyses_job ON recruitment_ai_analyses (analysis_job_id)`);

  tablesEnsured = true;
};

const mapJob = (row: DbRow, counts = new Map<string, { total: number; active: number }>()): RecruitmentJob => {
  const id = clean(row.id);
  const count = counts.get(id) || { total: 0, active: 0 };
  return {
    id,
    title: clean(row.title),
    department: clean(row.department) || null,
    unitName: clean(row.unit_name) || null,
    employmentRegime: upper(row.employment_regime || 'CLT') as EmploymentRegime,
    status: upper(row.status || 'OPEN') as RecruitmentJobStatus,
    ownerName: clean(row.owner_name) || null,
    openedAt: parseDate(row.opened_at),
    closedAt: parseDate(row.closed_at),
    descriptionHtml: clean(row.description_html) || null,
    descriptionText: clean(row.description_text) || null,
    requirementsText: clean(row.requirements_text) || null,
    benefitsText: clean(row.benefits_text) || null,
    sourceSystem: normalizeSourceSystem(row.source_system),
    sourceExternalId: clean(row.source_external_id) || null,
    syncStatus: normalizeSyncStatus(row.sync_status),
    lastSyncedAt: clean(row.last_synced_at) || null,
    externalPayloadJson: cleanJsonPayload(row.external_payload_json),
    notes: clean(row.notes) || null,
    totalCandidates: count.total,
    activeCandidates: count.active,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const mapFile = (row: DbRow): RecruitmentCandidateFile => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type) || 'application/octet-stream',
  sizeBytes: Number(row.size_bytes || 0),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapHistory = (row: DbRow): RecruitmentCandidateHistory => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  action: clean(row.action),
  fromStage: clean(row.from_stage) ? (upper(row.from_stage) as RecruitmentCandidateStage) : null,
  toStage: clean(row.to_stage) ? (upper(row.to_stage) as RecruitmentCandidateStage) : null,
  notes: clean(row.notes) || null,
  actorUserId: clean(row.actor_user_id),
  createdAt: clean(row.created_at),
});

const mapResumeExtraction = (row: DbRow): RecruitmentResumeExtraction => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  fileId: clean(row.file_id) || null,
  extractionStatus: normalizeResumeExtractionStatus(row.extraction_status),
  fileFormat: clean(row.file_format) || null,
  extractedText: clean(row.extracted_text) || null,
  qualityScore: row.quality_score === null || row.quality_score === undefined || String(row.quality_score).trim() === '' ? null : Number(row.quality_score),
  fallbackUsed: clean(row.fallback_used) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapAiAnalysisJob = (row: DbRow): RecruitmentAiAnalysisJob => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  jobId: clean(row.job_id),
  sourceFileId: clean(row.source_file_id) || null,
  status: normalizeAiAnalysisJobStatus(row.status),
  promptVersion: clean(row.prompt_version) || null,
  model: clean(row.model) || null,
  attempts: Number(row.attempts || 0),
  requestedBy: clean(row.requested_by) || null,
  lastError: clean(row.last_error) || null,
  completedAt: clean(row.completed_at) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapAiAnalysis = (row: DbRow): RecruitmentAiAnalysis => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  jobId: clean(row.job_id),
  analysisJobId: clean(row.analysis_job_id) || null,
  sourceFileId: clean(row.source_file_id) || null,
  model: clean(row.model) || null,
  schemaVersion: clean(row.schema_version) || null,
  score: row.score === null || row.score === undefined || String(row.score).trim() === '' ? null : Number(row.score),
  shortVerdict: clean(row.short_verdict) || null,
  detailedReport: clean(row.detailed_report) || null,
  strengths: parseJsonArray(row.strengths_json).map((item) => clean(item)).filter(Boolean),
  weaknesses: parseJsonArray(row.weaknesses_json).map((item) => clean(item)).filter(Boolean),
  matchedRequirements: parseJsonArray(row.matched_requirements_json).map((item) => clean(item)).filter(Boolean),
  missingRequirements: parseJsonArray(row.missing_requirements_json).map((item) => clean(item)).filter(Boolean),
  risksOrGaps: parseJsonArray(row.risks_or_gaps_json).map((item) => clean(item)).filter(Boolean),
  evidence: parseJsonArray(row.evidence_json)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const payload = item as Record<string, unknown>;
      const title = clean(payload.title);
      const details = clean(payload.details);
      if (!title && !details) return null;
      return {
        title: title || 'Evidência',
        details: details || title,
      };
    })
    .filter(Boolean) as RecruitmentAiAnalysis['evidence'],
  recommendedNextStep: clean(row.recommended_next_step) || null,
  rawResponseJson: cleanJsonPayload(row.raw_response_json),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapCandidate = (
  row: DbRow,
  filesByCandidate = new Map<string, RecruitmentCandidateFile[]>(),
  historyByCandidate = new Map<string, RecruitmentCandidateHistory[]>(),
): RecruitmentCandidate => {
  const id = clean(row.id);
  return {
    id,
    jobId: clean(row.job_id),
    jobTitle: clean(row.job_title),
    fullName: clean(row.full_name),
    cpf: clean(row.cpf) || null,
    email: clean(row.email) || null,
    phone: clean(row.phone) || null,
    stage: upper(row.stage || 'RECEBIDO') as RecruitmentCandidateStage,
    source: clean(row.source) || null,
    sourceSystem: normalizeSourceSystem(row.source_system),
    sourceExternalId: clean(row.source_external_id) || null,
    applicationExternalId: clean(row.application_external_id) || null,
    aiStatus: normalizeAiStatus(row.ai_status),
    aiScore: row.ai_score === null || row.ai_score === undefined || String(row.ai_score) === '' ? null : Number(row.ai_score),
    aiLastAnalyzedAt: clean(row.ai_last_analyzed_at) || null,
    managerReviewStatus: normalizeManagerReviewStatus(row.manager_review_status),
    managerReviewRequestedAt: clean(row.manager_review_requested_at) || null,
    managerReviewRequestedBy: clean(row.manager_review_requested_by) || null,
    managerReviewDecidedAt: clean(row.manager_review_decided_at) || null,
    managerReviewDecidedBy: clean(row.manager_review_decided_by) || null,
    managerReviewNotes: clean(row.manager_review_notes) || null,
    notes: clean(row.notes) || null,
    convertedEmployeeId: clean(row.converted_employee_id) || null,
    files: filesByCandidate.get(id) || [],
    history: historyByCandidate.get(id) || [],
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const buildIndeedPublicFeedUrl = (baseUrl: string | null, feedToken: string | null) => {
  if (!feedToken) return null;
  const path = `/api/recrutamento/indeed/feed.xml?token=${encodeURIComponent(feedToken)}`;
  if (!baseUrl) return path;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
};

const mapIndeedIntegration = (row: DbRow): RecruitmentIndeedIntegration => {
  const publicBaseUrl = clean(row.public_base_url) || null;
  const feedToken = clean(row.feed_token) || null;
  return {
    id: clean(row.id),
    provider: 'INDEED',
    integrationMode: normalizeIndeedIntegrationMode(row.integration_mode),
    status: normalizeIndeedIntegrationStatus(row.status),
    companyName: clean(row.company_name) || null,
    clientId: clean(row.client_id) || null,
    clientSecretConfigured: Boolean(clean(row.client_secret)),
    sourceName: clean(row.source_name) || null,
    publisherName: clean(row.publisher_name) || null,
    publisherUrl: clean(row.publisher_url) || null,
    postUrl: clean(row.post_url) || null,
    publicBaseUrl,
    publicFeedUrl: buildIndeedPublicFeedUrl(publicBaseUrl, feedToken),
    feedTokenConfigured: Boolean(feedToken),
    graphqlEndpoint: clean(row.graphql_endpoint) || null,
    tokenEndpoint: clean(row.token_endpoint) || null,
    lastHealthcheckAt: clean(row.last_healthcheck_at) || null,
    lastError: clean(row.last_error) || null,
    notes: clean(row.notes) || null,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const mapIndeedJobMapping = (row: DbRow): RecruitmentIndeedJobMapping => ({
  id: clean(row.id),
  jobId: clean(row.job_id),
  jobTitle: clean(row.job_title),
  sourceSystem: normalizeSourceSystem(row.source_system),
  externalJobId: clean(row.external_job_id) || null,
  externalJobKey: clean(row.external_job_key) || null,
  publicationMode: normalizeIndeedIntegrationMode(row.publication_mode),
  syncStatus: normalizeSyncStatus(row.sync_status),
  lastSyncedAt: clean(row.last_synced_at) || null,
  lastPayloadHash: clean(row.last_payload_hash) || null,
  lastError: clean(row.last_error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const insertHistory = async (
  db: DbInterface,
  candidateId: string,
  action: string,
  actorUserId: string,
  fromStage: RecruitmentCandidateStage | null,
  toStage: RecruitmentCandidateStage | null,
  notes?: string | null,
) => {
  await db.execute(
    `
    INSERT INTO recruitment_candidate_history (
      id, candidate_id, action, from_stage, to_stage, notes, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), candidateId, action, fromStage, toStage, clean(notes) || null, actorUserId, NOW()],
  );
};

const ensureJobExists = async (db: DbInterface, jobId: string) => {
  const rows = await db.query(`SELECT id FROM recruitment_jobs WHERE id = ? LIMIT 1`, [jobId]);
  if (!rows[0]) throw new RecruitmentValidationError('Vaga não encontrada.', 404);
};

const ensureNoDuplicatePerson = async (db: DbInterface, cpf: string | null, email: string | null, ignoredCandidateId?: string) => {
  if (!cpf && !email) return;

  if (cpf) {
    const employees = await db.query(`SELECT id FROM employees WHERE cpf = ? LIMIT 1`, [cpf]);
    if (employees[0]) throw new RecruitmentValidationError('Já existe colaborador cadastrado com este CPF.');
  }

  if (email) {
    const employees = await db.query(`SELECT id FROM employees WHERE LOWER(COALESCE(email, '')) = ? LIMIT 1`, [email.toLowerCase()]);
    if (employees[0]) throw new RecruitmentValidationError('Já existe colaborador cadastrado com este e-mail.');
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (cpf) {
    where.push(`cpf = ?`);
    params.push(cpf);
  }
  if (email) {
    where.push(`LOWER(COALESCE(email, '')) = ?`);
    params.push(email.toLowerCase());
  }
  if (!where.length) return;
  if (ignoredCandidateId) params.push(ignoredCandidateId);

  const rows = await db.query(
    `
    SELECT id FROM recruitment_candidates
    WHERE (${where.join(' OR ')})
      ${ignoredCandidateId ? 'AND id <> ?' : ''}
    LIMIT 1
    `,
    params,
  );
  if (rows[0]) throw new RecruitmentValidationError('Já existe candidato cadastrado com este CPF ou e-mail.');
};

const getIndeedIntegrationRow = async (db: DbInterface) => {
  const rows = await db.query(
    `SELECT * FROM recruitment_indeed_integrations WHERE provider = 'INDEED' ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0] || null;
};

const resolveAutomaticJobSyncStatus = async (db: DbInterface, payload: Payload, existing?: DbRow | null): Promise<RecruitmentSyncStatus> => {
  if (hasField(payload, 'syncStatus', 'sync_status')) {
    return normalizeSyncStatus(payload?.syncStatus ?? payload?.sync_status);
  }
  const integrationRow = await getIndeedIntegrationRow(db);
  if (!integrationRow) return existing ? normalizeSyncStatus(existing.sync_status || 'NAO_CONFIGURADO') : 'NAO_CONFIGURADO';
  const integrationStatus = normalizeIndeedIntegrationStatus(integrationRow.status);
  if (integrationStatus !== 'ATIVA') return existing ? normalizeSyncStatus(existing.sync_status || 'NAO_CONFIGURADO') : 'NAO_CONFIGURADO';
  return 'PENDENTE';
};

const getFileExtension = (value: string | null) => {
  const raw = clean(value);
  if (!raw.includes('.')) return '';
  return raw.split('.').pop()?.toLowerCase() || '';
};

const resolveAiFileSupport = (file: { originalName?: string | null; mimeType?: string | null }) => {
  const extension = getFileExtension(file.originalName || null);
  const mimeType = clean(file.mimeType).toLowerCase();
  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return { supported: true, fileFormat: 'PDF' };
  }
  if (
    extension === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { supported: true, fileFormat: 'DOCX' };
  }
  if (extension === 'doc' || mimeType === 'application/msword') {
    return { supported: false, fileFormat: 'DOC' };
  }
  return { supported: false, fileFormat: extension ? extension.toUpperCase() : 'DESCONHECIDO' };
};

const upsertIndeedJobMappingRow = async (
  db: DbInterface,
  payload: {
    jobId: string;
    sourceSystem?: RecruitmentSourceSystem;
    externalJobId?: string | null;
    externalJobKey?: string | null;
    publicationMode?: RecruitmentIndeedIntegrationMode;
    syncStatus: RecruitmentSyncStatus;
    lastSyncedAt?: string | null;
    lastPayloadHash?: string | null;
    lastError?: string | null;
    externalPayloadJson?: string | null;
  },
) => {
  const rows = await db.query(`SELECT * FROM recruitment_indeed_job_mappings WHERE job_id = ? LIMIT 1`, [payload.jobId]);
  const existing = rows[0];
  const now = NOW();
  if (existing) {
    await db.execute(
      `
      UPDATE recruitment_indeed_job_mappings
      SET source_system = ?, external_job_id = ?, external_job_key = ?, publication_mode = ?, sync_status = ?, last_synced_at = ?, last_payload_hash = ?, last_error = ?, external_payload_json = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        payload.sourceSystem || normalizeSourceSystem(existing.source_system),
        payload.externalJobId ?? (clean(existing.external_job_id) || null),
        payload.externalJobKey ?? (clean(existing.external_job_key) || null),
        payload.publicationMode || normalizeIndeedIntegrationMode(existing.publication_mode),
        payload.syncStatus,
        payload.lastSyncedAt || null,
        payload.lastPayloadHash || null,
        payload.lastError || null,
        payload.externalPayloadJson || null,
        now,
        clean(existing.id),
      ],
    );
    return clean(existing.id);
  }

  const mappingId = randomUUID();
  await db.execute(
    `
    INSERT INTO recruitment_indeed_job_mappings (
      id, job_id, source_system, external_job_id, external_job_key, publication_mode, sync_status, last_synced_at, last_payload_hash, last_error, external_payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      mappingId,
      payload.jobId,
      payload.sourceSystem || 'INDEED',
      payload.externalJobId || null,
      payload.externalJobKey || null,
      payload.publicationMode || 'EMPREGADOR_DIRETO_XML',
      payload.syncStatus,
      payload.lastSyncedAt || null,
      payload.lastPayloadHash || null,
      payload.lastError || null,
      payload.externalPayloadJson || null,
      now,
      now,
    ],
  );
  return mappingId;
};

const isoMillisToDateTime = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildIndeedDuplicateKey = (jobId: string, email: string | null) => {
  if (!email) return null;
  return `${jobId}::${email.toLowerCase()}`;
};

const nowMinusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

export const listRecruitmentDashboard = async (db: DbInterface): Promise<RecruitmentDashboard> => {
  await ensureRecruitmentTables(db);
  const [jobRows, candidateRows, fileRows, historyRows] = await Promise.all([
    db.query(`SELECT * FROM recruitment_jobs ORDER BY status ASC, opened_at DESC, created_at DESC`),
    db.query(`
      SELECT c.*, j.title AS job_title
      FROM recruitment_candidates c
      INNER JOIN recruitment_jobs j ON j.id = c.job_id
      ORDER BY c.updated_at DESC
    `),
    db.query(`SELECT * FROM recruitment_candidate_files ORDER BY created_at DESC`),
    db.query(`SELECT * FROM recruitment_candidate_history ORDER BY created_at DESC`),
  ]);

  const filesByCandidate = new Map<string, RecruitmentCandidateFile[]>();
  for (const row of fileRows) {
    const file = mapFile(row);
    filesByCandidate.set(file.candidateId, [...(filesByCandidate.get(file.candidateId) || []), file]);
  }

  const historyByCandidate = new Map<string, RecruitmentCandidateHistory[]>();
  for (const row of historyRows) {
    const history = mapHistory(row);
    historyByCandidate.set(history.candidateId, [...(historyByCandidate.get(history.candidateId) || []), history]);
  }

  const candidates = candidateRows.map((row: DbRow) => mapCandidate(row, filesByCandidate, historyByCandidate));
  const counts = new Map<string, { total: number; active: number }>();
  for (const candidate of candidates) {
    const current = counts.get(candidate.jobId) || { total: 0, active: 0 };
    current.total += 1;
    if (candidate.stage !== 'RECUSADO' && candidate.stage !== 'CONTRATADO') current.active += 1;
    counts.set(candidate.jobId, current);
  }

  const jobs = jobRows.map((row: DbRow) => mapJob(row, counts));
  return {
    jobs,
    candidates,
    summary: {
      openJobs: jobs.filter((job) => job.status === 'OPEN').length,
      totalCandidates: candidates.length,
      activeCandidates: candidates.filter((candidate) => candidate.stage !== 'RECUSADO' && candidate.stage !== 'CONTRATADO').length,
      approvedCandidates: candidates.filter((candidate) => candidate.stage === 'APROVADO').length,
      managerPendingCandidates: candidates.filter((candidate) => candidate.stage === 'GERENCIA').length,
      convertedCandidates: candidates.filter((candidate) => candidate.convertedEmployeeId).length,
    },
  };
};

type IndeedIntegrationSecrets = {
  id: string;
  provider: 'INDEED';
  integrationMode: RecruitmentIndeedIntegrationMode;
  status: RecruitmentIndeedIntegrationStatus;
  companyName: string | null;
  clientId: string | null;
  clientSecret: string | null;
  sourceName: string | null;
  publisherName: string | null;
  publisherUrl: string | null;
  postUrl: string | null;
  publicBaseUrl: string | null;
  publicFeedUrl: string | null;
  feedToken: string | null;
  graphqlEndpoint: string | null;
  tokenEndpoint: string | null;
  lastHealthcheckAt: string | null;
  lastError: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const getRecruitmentIndeedIntegration = async (db: DbInterface): Promise<RecruitmentIndeedIntegration | null> => {
  await ensureRecruitmentTables(db);
  const row = await getIndeedIntegrationRow(db);
  return row ? mapIndeedIntegration(row) : null;
};

export const getRecruitmentIndeedIntegrationForProvider = async (db: DbInterface): Promise<IndeedIntegrationSecrets | null> => {
  await ensureRecruitmentTables(db);
  const row = await getIndeedIntegrationRow(db);
  if (!row) return null;
  const mapped = mapIndeedIntegration(row);
  const feedToken = clean(row.feed_token) || null;
  return {
    ...mapped,
    clientSecret: clean(row.client_secret) || null,
    feedToken,
    publicFeedUrl: buildIndeedPublicFeedUrl(mapped.publicBaseUrl, feedToken),
  };
};

export const saveRecruitmentIndeedIntegration = async (
  db: DbInterface,
  payload: RecruitmentIndeedIntegrationInput,
): Promise<RecruitmentIndeedIntegration> => {
  await ensureRecruitmentTables(db);
  const existing = await getIndeedIntegrationRow(db);
  const now = NOW();
  const integrationMode = normalizeIndeedIntegrationMode(payload.integrationMode || existing?.integration_mode);
  const status = normalizeIndeedIntegrationStatus(payload.status || existing?.status || 'CONFIGURACAO_PENDENTE');
  const clientSecret = clean((payload as { clientSecret?: unknown }).clientSecret) || clean(existing?.client_secret) || null;
  const sourceName = clean(payload.sourceName) || clean(existing?.source_name) || null;
  const postUrl = cleanUrl(payload.postUrl ?? existing?.post_url);
  const publicBaseUrl = cleanUrl(payload.publicBaseUrl ?? existing?.public_base_url);
  const graphqlEndpoint =
    cleanUrl(payload.graphqlEndpoint ?? existing?.graphql_endpoint) ||
    (integrationMode === 'ATS_PARCEIRO_JOB_SYNC' ? 'https://apis.indeed.com/graphql' : null);
  const tokenEndpoint =
    cleanUrl(payload.tokenEndpoint ?? existing?.token_endpoint) ||
    (integrationMode === 'ATS_PARCEIRO_JOB_SYNC' ? 'https://apis.indeed.com/oauth/v2/tokens' : null);
  const feedToken = clean(existing?.feed_token) || randomUUID();
  const nextId = clean(existing?.id) || randomUUID();

  if (integrationMode === 'ATS_PARCEIRO_JOB_SYNC' && !sourceName) {
    throw new RecruitmentValidationError('Informe o sourceName da integração ATS/parceiro.');
  }

  if (existing) {
    await db.execute(
      `
      UPDATE recruitment_indeed_integrations
      SET provider = 'INDEED', integration_mode = ?, status = ?, company_name = ?, client_id = ?, client_secret = ?,
          source_name = ?, publisher_name = ?, publisher_url = ?, post_url = ?, public_base_url = ?, feed_token = ?,
          graphql_endpoint = ?, token_endpoint = ?, notes = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        integrationMode,
        status,
        clean(payload.companyName) || clean(existing.company_name) || null,
        clean(payload.clientId) || clean(existing.client_id) || null,
        clientSecret,
        sourceName,
        clean(payload.publisherName) || clean(existing.publisher_name) || null,
        cleanUrl(payload.publisherUrl ?? existing.publisher_url),
        postUrl,
        publicBaseUrl,
        feedToken,
        graphqlEndpoint,
        tokenEndpoint,
        clean(payload.notes) || clean(existing.notes) || null,
        now,
        nextId,
      ],
    );
  } else {
    await db.execute(
      `
      INSERT INTO recruitment_indeed_integrations (
        id, provider, integration_mode, status, company_name, client_id, client_secret, source_name, publisher_name, publisher_url,
        post_url, public_base_url, feed_token, graphql_endpoint, token_endpoint, last_healthcheck_at, last_error, notes, created_at, updated_at
      ) VALUES (?, 'INDEED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nextId,
        integrationMode,
        status,
        clean(payload.companyName) || null,
        clean(payload.clientId) || null,
        clientSecret,
        sourceName,
        clean(payload.publisherName) || null,
        cleanUrl(payload.publisherUrl),
        postUrl,
        publicBaseUrl,
        feedToken,
        graphqlEndpoint,
        tokenEndpoint,
        null,
        null,
        clean(payload.notes) || null,
        now,
        now,
      ],
    );
  }

  const integration = await getRecruitmentIndeedIntegration(db);
  if (!integration) throw new RecruitmentValidationError('Não foi possível salvar a integração Indeed.', 500);
  return integration;
};

export const updateRecruitmentIndeedIntegrationHealth = async (
  db: DbInterface,
  payload: { status: RecruitmentIndeedIntegrationStatus; lastError?: string | null },
) => {
  await ensureRecruitmentTables(db);
  const existing = await getIndeedIntegrationRow(db);
  if (!existing) throw new RecruitmentValidationError('Integração Indeed não encontrada.', 404);
  await db.execute(
    `
    UPDATE recruitment_indeed_integrations
    SET status = ?, last_healthcheck_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
    `,
    [payload.status, NOW(), clean(payload.lastError) || null, NOW(), clean(existing.id)],
  );
};

export const listRecruitmentIndeedJobMappings = async (db: DbInterface): Promise<RecruitmentIndeedJobMapping[]> => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(
    `
    SELECT m.*, j.title AS job_title
    FROM recruitment_indeed_job_mappings m
    INNER JOIN recruitment_jobs j ON j.id = m.job_id
    ORDER BY m.updated_at DESC
    `,
  );
  return rows.map((row) => mapIndeedJobMapping(row));
};

export const getRecruitmentIndeedSummary = async (db: DbInterface): Promise<RecruitmentIndeedSummary> => {
  await ensureRecruitmentTables(db);
  const [integration, mappings, jobs] = await Promise.all([
    getRecruitmentIndeedIntegration(db),
    listRecruitmentIndeedJobMappings(db),
    db.query(`SELECT id, sync_status FROM recruitment_jobs ORDER BY updated_at DESC`),
  ]);
  const jobsEligible = jobs.length;
  const pendingJobs = jobs.filter((row) => normalizeSyncStatus(row.sync_status || 'NAO_CONFIGURADO') === 'PENDENTE').length;
  const synchronizedJobs = jobs.filter((row) => normalizeSyncStatus(row.sync_status || 'NAO_CONFIGURADO') === 'SINCRONIZADO').length;
  return {
    integration,
    mappings,
    jobsEligible,
    pendingJobs,
    synchronizedJobs,
    publicFeedUrl: integration?.publicFeedUrl || null,
  };
};

export const updateRecruitmentJobIndeedSyncResult = async (
  db: DbInterface,
  payload: {
    jobId: string;
    externalJobId?: string | null;
    externalJobKey?: string | null;
    publicationMode: RecruitmentIndeedIntegrationMode;
    syncStatus: RecruitmentSyncStatus;
    lastPayloadJson?: string | null;
    lastError?: string | null;
  },
) => {
  await ensureRecruitmentTables(db);
  const now = NOW();
  const payloadHash = payload.lastPayloadJson ? hashPayload(payload.lastPayloadJson) : null;
  await db.execute(
    `
    UPDATE recruitment_jobs
    SET source_system = 'INDEED', source_external_id = ?, sync_status = ?, last_synced_at = ?, external_payload_json = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      payload.externalJobId || null,
      payload.syncStatus,
      payload.syncStatus === 'SINCRONIZADO' ? now : null,
      payload.lastPayloadJson || null,
      now,
      payload.jobId,
    ],
  );
  await upsertIndeedJobMappingRow(db, {
    jobId: payload.jobId,
    sourceSystem: 'INDEED',
    externalJobId: payload.externalJobId || null,
    externalJobKey: payload.externalJobKey || null,
    publicationMode: payload.publicationMode,
    syncStatus: payload.syncStatus,
    lastSyncedAt: payload.syncStatus === 'SINCRONIZADO' ? now : null,
    lastPayloadHash: payloadHash,
    lastError: payload.lastError || null,
    externalPayloadJson: payload.lastPayloadJson || null,
  });
};

export const createRecruitmentIndeedBackfill = async (db: DbInterface, payload: RecruitmentIndeedBackfillInput) => {
  await ensureRecruitmentTables(db);
  const action = upper(payload.action) as RecruitmentIndeedBackfillInput['action'];
  if (action !== 'ASSOCIAR_VAGA') {
    throw new RecruitmentValidationError('Ação de backfill inválida para este método.');
  }
  const jobId = clean(payload.jobId);
  if (!jobId) throw new RecruitmentValidationError('Selecione a vaga local para associar.');
  await ensureJobExists(db, jobId);
  await updateRecruitmentJobIndeedSyncResult(db, {
    jobId,
    externalJobId: clean(payload.externalJobId) || jobId,
    externalJobKey: clean(payload.externalJobKey) || null,
    publicationMode: 'EMPREGADOR_DIRETO_XML',
    syncStatus: 'SINCRONIZADO',
    lastPayloadJson: cleanJsonPayload(JSON.stringify({ action, notes: clean(payload.notes) || null })) || null,
  });
  return getRecruitmentIndeedSummary(db);
};

export const listRecruitmentJobsForIndeedFeed = async (db: DbInterface) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM recruitment_jobs
    WHERE status IN ('OPEN', 'PAUSED')
    ORDER BY opened_at DESC, created_at DESC
    `,
  );
  return rows.map((row) => mapJob(row));
};

export const getRecruitmentIndeedFeedSnapshot = async (db: DbInterface, token: string) => {
  await ensureRecruitmentTables(db);
  const integration = await getRecruitmentIndeedIntegrationForProvider(db);
  if (!integration || !integration.feedToken || integration.feedToken !== token) {
    return null;
  }
  const jobs = await listRecruitmentJobsForIndeedFeed(db);
  return { integration, jobs };
};

type RecruitmentIndeedApplicationPayload = {
  id?: unknown;
  job?: {
    jobId?: unknown;
    jobKey?: unknown;
    jobTitle?: unknown;
    jobUrl?: unknown;
    jobMeta?: unknown;
  } | null;
  applicant?: {
    fullName?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    phoneNumber?: unknown;
    coverletter?: unknown;
    resume?: {
      file?: {
        id?: unknown;
        fileName?: unknown;
        contentType?: unknown;
        data?: unknown;
      } | null;
    } | null;
  } | null;
  analytics?: {
    referer?: unknown;
    userAgent?: unknown;
    device?: unknown;
  } | null;
  appliedOnMillis?: unknown;
};

type RecruitmentIndeedApplicationIngestResult = {
  applicationRecordId: string;
  candidateId: string;
  duplicate: boolean;
  resumeFile:
    | {
        originalName: string;
        mimeType: string;
        dataBase64: string;
      }
    | null;
};

const buildIndeedCandidateNotes = (payload: RecruitmentIndeedApplicationPayload) => {
  const blocks: string[] = [];
  const coverLetter = clean(payload.applicant?.coverletter);
  const referer = clean(payload.analytics?.referer);
  const device = clean(payload.analytics?.device);
  const appliedAt = isoMillisToDateTime(payload.appliedOnMillis);

  if (coverLetter) {
    blocks.push(`Cover letter Indeed:\n${coverLetter}`);
  }
  if (referer || device || appliedAt) {
    blocks.push(
      [
        'Origem Indeed Apply:',
        referer ? `referer=${referer}` : null,
        device ? `device=${device}` : null,
        appliedAt ? `aplicado_em=${appliedAt}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  return blocks.join('\n\n') || null;
};

const resolveIndeedCandidateName = (payload: RecruitmentIndeedApplicationPayload) => {
  const fullName = clean(payload.applicant?.fullName);
  if (fullName) return fullName;
  const firstName = clean(payload.applicant?.firstName);
  const lastName = clean(payload.applicant?.lastName);
  return `${firstName} ${lastName}`.trim();
};

const findRecruitmentJobByIndeedReference = async (db: DbInterface, jobIdRaw: string, jobKeyRaw: string) => {
  const jobId = clean(jobIdRaw);
  const jobKey = clean(jobKeyRaw);
  const rows = await db.query(
    `
    SELECT j.*
    FROM recruitment_jobs j
    LEFT JOIN recruitment_indeed_job_mappings m ON m.job_id = j.id
    WHERE j.id = ?
       OR COALESCE(j.source_external_id, '') = ?
       OR COALESCE(m.external_job_id, '') = ?
       OR COALESCE(m.external_job_key, '') = ?
    ORDER BY j.updated_at DESC
    LIMIT 1
    `,
    [jobId, jobId, jobId, jobKey],
  );
  return rows[0] ? mapJob(rows[0]) : null;
};

const createIndeedApplicationRecord = async (
  db: DbInterface,
  payload: {
    candidateId?: string | null;
    jobId?: string | null;
    applicationExternalId: string;
    dedupeKey?: string | null;
    signature: string | null;
    payloadJson: string;
    ingestStatus: string;
    lastError?: string | null;
    receivedAt?: string | null;
    processedAt?: string | null;
  },
) => {
  const id = randomUUID();
  const now = NOW();
  await db.execute(
    `
    INSERT INTO recruitment_indeed_applications (
      id, candidate_id, job_id, application_external_id, dedupe_key, signature, payload_json, ingest_status, last_error, received_at, processed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      payload.candidateId || null,
      payload.jobId || null,
      payload.applicationExternalId,
      payload.dedupeKey || null,
      payload.signature,
      payload.payloadJson,
      payload.ingestStatus,
      payload.lastError || null,
      payload.receivedAt || now,
      payload.processedAt || null,
      now,
      now,
    ],
  );
  return id;
};

export const ingestRecruitmentIndeedApplication = async (
  db: DbInterface,
  payloadRaw: string,
  payload: RecruitmentIndeedApplicationPayload,
  signature: string | null,
): Promise<RecruitmentIndeedApplicationIngestResult> => {
  await ensureRecruitmentTables(db);

  const applicationExternalId = clean(payload.id);
  const jobReferenceId = clean(payload.job?.jobId);
  const jobReferenceKey = clean(payload.job?.jobKey);
  const fullName = resolveIndeedCandidateName(payload);
  const email = normalizeEmail(payload.applicant?.email);
  const phone = normalizePhone(payload.applicant?.phoneNumber);

  if (!applicationExternalId) {
    throw new RecruitmentValidationError('Payload da Indeed sem identificador da candidatura.', 400);
  }
  if (!jobReferenceId && !jobReferenceKey) {
    throw new RecruitmentValidationError('Payload da Indeed sem referência da vaga.', 400);
  }
  if (!fullName) {
    throw new RecruitmentValidationError('Payload da Indeed sem nome do candidato.', 400);
  }

  return runInTransaction(db, async (txDb) => {
    const job = await findRecruitmentJobByIndeedReference(txDb, jobReferenceId, jobReferenceKey);
    const dedupeKey = buildIndeedDuplicateKey(job?.id || jobReferenceId || jobReferenceKey, email);
    if (!job) {
      await createIndeedApplicationRecord(txDb, {
        applicationExternalId,
        dedupeKey,
        signature,
        payloadJson: payloadRaw,
        ingestStatus: 'JOB_INVALIDO',
        lastError: 'Vaga não encontrada para a referência informada pela Indeed.',
      });
      throw new RecruitmentValidationError('Job is invalid, does not exist.', 404);
    }

    if (job.status === 'CLOSED') {
      await createIndeedApplicationRecord(txDb, {
        jobId: job.id,
        applicationExternalId,
        dedupeKey,
        signature,
        payloadJson: payloadRaw,
        ingestStatus: 'JOB_EXPIRADO',
        lastError: 'Vaga encerrada no painel.',
      });
      throw new RecruitmentValidationError('The job is expired or no longer available.', 410);
    }

    const duplicateRows = await txDb.query(
      `
      SELECT id
      FROM recruitment_indeed_applications
      WHERE application_external_id = ?
         OR (dedupe_key = ? AND created_at >= ?)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [applicationExternalId, dedupeKey, nowMinusDays(120)],
    );
    if (duplicateRows[0]) {
      await createIndeedApplicationRecord(txDb, {
        jobId: job.id,
        applicationExternalId,
        dedupeKey,
        signature,
        payloadJson: payloadRaw,
        ingestStatus: 'DUPLICADO',
        lastError: 'Candidatura Indeed duplicada para a mesma vaga/e-mail.',
      });
      throw new RecruitmentValidationError('Duplicate Application already in the system.', 409);
    }

    const resumeFile = payload.applicant?.resume?.file;
    const resumePayload =
      clean(resumeFile?.data) && clean(resumeFile?.fileName)
        ? {
            originalName: clean(resumeFile?.fileName) || 'curriculo-indeed.bin',
            mimeType: clean(resumeFile?.contentType) || 'application/octet-stream',
            dataBase64: clean(resumeFile?.data),
          }
        : null;

    const existingCandidateSql = email
      ? `
        SELECT *
        FROM recruitment_candidates
        WHERE (application_external_id = ?)
           OR (job_id = ? AND LOWER(COALESCE(email, '')) = ?)
        ORDER BY updated_at DESC
        LIMIT 1
      `
      : `
        SELECT *
        FROM recruitment_candidates
        WHERE application_external_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `;
    const existingCandidateParams = email ? [applicationExternalId, job.id, email.toLowerCase()] : [applicationExternalId];
    const existingCandidateRows = await txDb.query(existingCandidateSql, existingCandidateParams);

    const existingCandidate = existingCandidateRows[0];
    const now = NOW();
    const notes = buildIndeedCandidateNotes(payload);
    let candidateId = clean(existingCandidate?.id);

    if (existingCandidate) {
      await txDb.execute(
        `
        UPDATE recruitment_candidates
        SET full_name = ?, email = ?, phone = ?, source = ?, source_system = 'INDEED', source_external_id = ?, application_external_id = ?, notes = ?, updated_at = ?
        WHERE id = ?
        `,
        [
          fullName,
          email,
          phone,
          'Indeed Apply',
          clean(resumeFile?.id) || clean(payload.job?.jobMeta) || null,
          applicationExternalId,
          notes || clean(existingCandidate.notes) || null,
          now,
          candidateId,
        ],
      );
      await insertHistory(
        txDb,
        candidateId,
        'INDEED_APPLICATION_RECEIVED',
        'indeed-system',
        upper(existingCandidate.stage || 'RECEBIDO') as RecruitmentCandidateStage,
        upper(existingCandidate.stage || 'RECEBIDO') as RecruitmentCandidateStage,
        'Candidatura recebida pela integração oficial da Indeed.',
      );
    } else {
      candidateId = randomUUID();
      await txDb.execute(
        `
        INSERT INTO recruitment_candidates (
          id, job_id, full_name, cpf, email, phone, stage, source, source_system, source_external_id, application_external_id,
          ai_status, ai_score, ai_last_analyzed_at,
          manager_review_status, manager_review_requested_at, manager_review_requested_by, manager_review_decided_at, manager_review_decided_by, manager_review_notes,
          notes, converted_employee_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          candidateId,
          job.id,
          fullName,
          null,
          email,
          phone,
          'RECEBIDO',
          'Indeed Apply',
          'INDEED',
          clean(resumeFile?.id) || clean(payload.job?.jobMeta) || null,
          applicationExternalId,
          'NAO_ANALISADO',
          null,
          null,
          'NAO_ENVIADO',
          null,
          null,
          null,
          null,
          null,
          notes,
          null,
          now,
          now,
        ],
      );
      await insertHistory(txDb, candidateId, 'CANDIDATE_CREATED', 'indeed-system', null, 'RECEBIDO', 'Candidato criado via Indeed Apply.');
    }

    const applicationRecordId = await createIndeedApplicationRecord(txDb, {
      candidateId,
      jobId: job.id,
      applicationExternalId,
      dedupeKey,
      signature,
      payloadJson: payloadRaw,
      ingestStatus: 'RECEBIDO',
      receivedAt: now,
    });

    return {
      applicationRecordId,
      candidateId,
      duplicate: false,
      resumeFile: resumePayload,
    };
  });
};

export const finalizeRecruitmentIndeedApplication = async (
  db: DbInterface,
  payload: {
    applicationRecordId: string;
    candidateId: string;
    success: boolean;
    lastError?: string | null;
  },
) => {
  await ensureRecruitmentTables(db);
  await db.execute(
    `
    UPDATE recruitment_indeed_applications
    SET candidate_id = ?, ingest_status = ?, last_error = ?, processed_at = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      payload.candidateId,
      payload.success ? 'PROCESSADO' : 'ERRO',
      clean(payload.lastError) || null,
      NOW(),
      NOW(),
      payload.applicationRecordId,
    ],
  );
};

export const createRecruitmentJob = async (db: DbInterface, payload: Payload) => {
  await ensureRecruitmentTables(db);
  const title = clean(payload?.title);
  if (!title) throw new RecruitmentValidationError('Informe o título da vaga.');
  const now = NOW();
  const automaticSyncStatus = await resolveAutomaticJobSyncStatus(db, payload);
  await db.execute(
    `
    INSERT INTO recruitment_jobs (
      id, title, department, unit_name, employment_regime, status, owner_name, opened_at, closed_at,
      description_html, description_text, requirements_text, benefits_text,
      source_system, source_external_id, sync_status, last_synced_at, external_payload_json,
      notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      title,
      clean(payload?.department) || null,
      normalizeUnit(payload?.unitName || payload?.unit_name),
      normalizeRegime(payload?.employmentRegime || payload?.employment_regime),
      normalizeJobStatus(payload?.status),
      clean(payload?.ownerName || payload?.owner_name) || null,
      parseDate(payload?.openedAt || payload?.opened_at) || TODAY_SAO_PAULO(),
      parseDate(payload?.closedAt || payload?.closed_at),
      clean(payload?.descriptionHtml || payload?.description_html) || null,
      clean(payload?.descriptionText || payload?.description_text) || null,
      clean(payload?.requirementsText || payload?.requirements_text) || null,
      clean(payload?.benefitsText || payload?.benefits_text) || null,
      normalizeSourceSystem(payload?.sourceSystem || payload?.source_system),
      clean(payload?.sourceExternalId || payload?.source_external_id) || null,
      automaticSyncStatus,
      clean(payload?.lastSyncedAt || payload?.last_synced_at) || null,
      cleanJsonPayload(payload?.externalPayloadJson || payload?.external_payload_json),
      clean(payload?.notes) || null,
      now,
      now,
    ],
  );
  return listRecruitmentDashboard(db);
};

export const updateRecruitmentJob = async (db: DbInterface, jobId: string, payload: Payload) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_jobs WHERE id = ? LIMIT 1`, [jobId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Vaga não encontrada.', 404);
  const now = NOW();
  const title = hasField(payload, 'title') ? clean(payload?.title) : clean(existing.title);
  if (!title) throw new RecruitmentValidationError('Informe o título da vaga.');
  const automaticSyncStatus = await resolveAutomaticJobSyncStatus(db, payload, existing);
  await db.execute(
    `
    UPDATE recruitment_jobs
    SET title = ?, department = ?, unit_name = ?, employment_regime = ?, status = ?, owner_name = ?, opened_at = ?, closed_at = ?,
        description_html = ?, description_text = ?, requirements_text = ?, benefits_text = ?,
        source_system = ?, source_external_id = ?, sync_status = ?, last_synced_at = ?, external_payload_json = ?,
        notes = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      title,
      hasField(payload, 'department') ? clean(payload?.department) || null : clean(existing.department) || null,
      hasField(payload, 'unitName', 'unit_name') ? normalizeUnit(payload?.unitName ?? payload?.unit_name) : clean(existing.unit_name) || null,
      normalizeRegime(payload?.employmentRegime || payload?.employment_regime || existing.employment_regime),
      normalizeJobStatus(payload?.status || existing.status),
      hasField(payload, 'ownerName', 'owner_name') ? clean(payload?.ownerName ?? payload?.owner_name) || null : clean(existing.owner_name) || null,
      hasField(payload, 'openedAt', 'opened_at') ? parseDate(payload?.openedAt ?? payload?.opened_at) : parseDate(existing.opened_at),
      hasField(payload, 'closedAt', 'closed_at') ? parseDate(payload?.closedAt ?? payload?.closed_at) : parseDate(existing.closed_at),
      hasField(payload, 'descriptionHtml', 'description_html') ? clean(payload?.descriptionHtml ?? payload?.description_html) || null : clean(existing.description_html) || null,
      hasField(payload, 'descriptionText', 'description_text') ? clean(payload?.descriptionText ?? payload?.description_text) || null : clean(existing.description_text) || null,
      hasField(payload, 'requirementsText', 'requirements_text') ? clean(payload?.requirementsText ?? payload?.requirements_text) || null : clean(existing.requirements_text) || null,
      hasField(payload, 'benefitsText', 'benefits_text') ? clean(payload?.benefitsText ?? payload?.benefits_text) || null : clean(existing.benefits_text) || null,
      hasField(payload, 'sourceSystem', 'source_system') ? normalizeSourceSystem(payload?.sourceSystem ?? payload?.source_system) : normalizeSourceSystem(existing.source_system),
      hasField(payload, 'sourceExternalId', 'source_external_id') ? clean(payload?.sourceExternalId ?? payload?.source_external_id) || null : clean(existing.source_external_id) || null,
      automaticSyncStatus,
      hasField(payload, 'lastSyncedAt', 'last_synced_at') ? clean(payload?.lastSyncedAt ?? payload?.last_synced_at) || null : clean(existing.last_synced_at) || null,
      hasField(payload, 'externalPayloadJson', 'external_payload_json') ? cleanJsonPayload(payload?.externalPayloadJson ?? payload?.external_payload_json) : cleanJsonPayload(existing.external_payload_json),
      hasField(payload, 'notes') ? clean(payload?.notes) || null : clean(existing.notes) || null,
      now,
      jobId,
    ],
  );
  return listRecruitmentDashboard(db);
};

export const createRecruitmentCandidate = async (db: DbInterface, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const input: RecruitmentCandidateInput = {
    jobId: clean(payload?.jobId || payload?.job_id),
    fullName: clean(payload?.fullName || payload?.full_name),
    cpf: normalizeCpf(payload?.cpf),
    email: normalizeEmail(payload?.email),
    phone: normalizePhone(payload?.phone),
    stage: normalizeStage(payload?.stage),
    source: clean(payload?.source) || null,
    sourceSystem: normalizeSourceSystem(payload?.sourceSystem || payload?.source_system),
    sourceExternalId: clean(payload?.sourceExternalId || payload?.source_external_id) || null,
    applicationExternalId: clean(payload?.applicationExternalId || payload?.application_external_id) || null,
    aiStatus: normalizeAiStatus(payload?.aiStatus || payload?.ai_status),
    aiScore: normalizeNullableScore(payload?.aiScore ?? payload?.ai_score),
    aiLastAnalyzedAt: clean(payload?.aiLastAnalyzedAt || payload?.ai_last_analyzed_at) || null,
    managerReviewStatus: normalizeManagerReviewStatus(payload?.managerReviewStatus || payload?.manager_review_status || (upper(payload?.stage) === 'GERENCIA' ? 'PENDENTE' : 'NAO_ENVIADO')),
    managerReviewRequestedAt: clean(payload?.managerReviewRequestedAt || payload?.manager_review_requested_at) || null,
    managerReviewRequestedBy: clean(payload?.managerReviewRequestedBy || payload?.manager_review_requested_by) || null,
    managerReviewDecidedAt: clean(payload?.managerReviewDecidedAt || payload?.manager_review_decided_at) || null,
    managerReviewDecidedBy: clean(payload?.managerReviewDecidedBy || payload?.manager_review_decided_by) || null,
    managerReviewNotes: clean(payload?.managerReviewNotes || payload?.manager_review_notes) || null,
    notes: clean(payload?.notes) || null,
  };
  if (!input.jobId) throw new RecruitmentValidationError('Selecione uma vaga.');
  if (!input.fullName) throw new RecruitmentValidationError('Informe o nome do candidato.');
  await ensureJobExists(db, input.jobId);
  await ensureNoDuplicatePerson(db, input.cpf || null, input.email || null);
  const candidateId = randomUUID();
  const now = NOW();

  await db.execute(
    `
    INSERT INTO recruitment_candidates (
      id, job_id, full_name, cpf, email, phone, stage, source, source_system, source_external_id, application_external_id,
      ai_status, ai_score, ai_last_analyzed_at,
      manager_review_status, manager_review_requested_at, manager_review_requested_by, manager_review_decided_at, manager_review_decided_by, manager_review_notes,
      notes, converted_employee_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      candidateId,
      input.jobId,
      input.fullName,
      input.cpf,
      input.email,
      input.phone,
      input.stage,
      input.source,
      input.sourceSystem,
      input.sourceExternalId,
      input.applicationExternalId,
      input.aiStatus,
      input.aiScore,
      input.aiLastAnalyzedAt,
      input.managerReviewStatus,
      input.managerReviewRequestedAt || (input.stage === 'GERENCIA' ? now : null),
      input.managerReviewRequestedBy || (input.stage === 'GERENCIA' ? actorUserId : null),
      input.managerReviewDecidedAt,
      input.managerReviewDecidedBy,
      input.managerReviewNotes,
      input.notes,
      null,
      now,
      now,
    ],
  );
  await insertHistory(db, candidateId, 'CANDIDATE_CREATED', actorUserId, null, input.stage || 'RECEBIDO', 'Candidato cadastrado.');
  const dashboard = await listRecruitmentDashboard(db);
  return { ...dashboard, createdCandidateId: candidateId };
};

export const updateRecruitmentCandidate = async (db: DbInterface, candidateId: string, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Candidato não encontrado.', 404);

  const cpf = payload?.cpf !== undefined ? normalizeCpf(payload.cpf) : clean(existing.cpf) || null;
  const email = payload?.email !== undefined ? normalizeEmail(payload.email) : clean(existing.email) || null;
  await ensureNoDuplicatePerson(db, cpf, email, candidateId);
  const nextStage = payload?.stage !== undefined ? normalizeStage(payload.stage) : (upper(existing.stage) as RecruitmentCandidateStage);
  const previousStage = upper(existing.stage || 'RECEBIDO') as RecruitmentCandidateStage;
  const nextJobId = clean(payload?.jobId || payload?.job_id) || clean(existing.job_id);
  if (nextJobId !== clean(existing.job_id)) await ensureJobExists(db, nextJobId);
  const now = NOW();
  const movingIntoManagerStage = nextStage === 'GERENCIA' && previousStage !== 'GERENCIA';
  const nextManagerReviewStatus = hasField(payload, 'managerReviewStatus', 'manager_review_status')
    ? normalizeManagerReviewStatus(payload?.managerReviewStatus ?? payload?.manager_review_status)
    : movingIntoManagerStage
      ? 'PENDENTE'
      : normalizeManagerReviewStatus(existing.manager_review_status);
  const nextManagerReviewRequestedAt = hasField(payload, 'managerReviewRequestedAt', 'manager_review_requested_at')
    ? clean(payload?.managerReviewRequestedAt ?? payload?.manager_review_requested_at) || null
    : movingIntoManagerStage
      ? now
      : clean(existing.manager_review_requested_at) || null;
  const nextManagerReviewRequestedBy = hasField(payload, 'managerReviewRequestedBy', 'manager_review_requested_by')
    ? clean(payload?.managerReviewRequestedBy ?? payload?.manager_review_requested_by) || null
    : movingIntoManagerStage
      ? actorUserId
      : clean(existing.manager_review_requested_by) || null;

  await db.execute(
    `
    UPDATE recruitment_candidates
    SET job_id = ?, full_name = ?, cpf = ?, email = ?, phone = ?, stage = ?, source = ?, source_system = ?, source_external_id = ?, application_external_id = ?,
        ai_status = ?, ai_score = ?, ai_last_analyzed_at = ?,
        manager_review_status = ?, manager_review_requested_at = ?, manager_review_requested_by = ?, manager_review_decided_at = ?, manager_review_decided_by = ?, manager_review_notes = ?,
        notes = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      nextJobId,
      clean(payload?.fullName || payload?.full_name) || clean(existing.full_name),
      cpf,
      email,
      payload?.phone !== undefined ? normalizePhone(payload.phone) : clean(existing.phone) || null,
      nextStage,
      payload?.source !== undefined ? clean(payload.source) || null : clean(existing.source) || null,
      hasField(payload, 'sourceSystem', 'source_system') ? normalizeSourceSystem(payload?.sourceSystem ?? payload?.source_system) : normalizeSourceSystem(existing.source_system),
      hasField(payload, 'sourceExternalId', 'source_external_id') ? clean(payload?.sourceExternalId ?? payload?.source_external_id) || null : clean(existing.source_external_id) || null,
      hasField(payload, 'applicationExternalId', 'application_external_id') ? clean(payload?.applicationExternalId ?? payload?.application_external_id) || null : clean(existing.application_external_id) || null,
      hasField(payload, 'aiStatus', 'ai_status') ? normalizeAiStatus(payload?.aiStatus ?? payload?.ai_status) : normalizeAiStatus(existing.ai_status),
      hasField(payload, 'aiScore', 'ai_score') ? normalizeNullableScore(payload?.aiScore ?? payload?.ai_score) : normalizeNullableScore(existing.ai_score),
      hasField(payload, 'aiLastAnalyzedAt', 'ai_last_analyzed_at') ? clean(payload?.aiLastAnalyzedAt ?? payload?.ai_last_analyzed_at) || null : clean(existing.ai_last_analyzed_at) || null,
      nextManagerReviewStatus,
      nextManagerReviewRequestedAt,
      nextManagerReviewRequestedBy,
      hasField(payload, 'managerReviewDecidedAt', 'manager_review_decided_at') ? clean(payload?.managerReviewDecidedAt ?? payload?.manager_review_decided_at) || null : clean(existing.manager_review_decided_at) || null,
      hasField(payload, 'managerReviewDecidedBy', 'manager_review_decided_by') ? clean(payload?.managerReviewDecidedBy ?? payload?.manager_review_decided_by) || null : clean(existing.manager_review_decided_by) || null,
      hasField(payload, 'managerReviewNotes', 'manager_review_notes') ? clean(payload?.managerReviewNotes ?? payload?.manager_review_notes) || null : clean(existing.manager_review_notes) || null,
      payload?.notes !== undefined ? clean(payload.notes) || null : clean(existing.notes) || null,
      now,
      candidateId,
    ],
  );

  if (nextStage !== previousStage) {
    await insertHistory(db, candidateId, 'STAGE_CHANGED', actorUserId, previousStage, nextStage, clean(payload?.historyNotes) || null);
  } else {
    await insertHistory(db, candidateId, 'CANDIDATE_UPDATED', actorUserId, previousStage, nextStage, clean(payload?.historyNotes) || null);
  }

  return listRecruitmentDashboard(db);
};

const queueRecruitmentAiAnalysisForFile = async (
  db: DbInterface,
  payload: {
    candidateId: string;
    jobId: string;
    sourceFileId: string;
    originalName: string;
    mimeType: string;
    actorUserId: string;
    currentStage: RecruitmentCandidateStage;
    force?: boolean;
  },
) => {
  await ensureRecruitmentTables(db);
  const support = resolveAiFileSupport({ originalName: payload.originalName, mimeType: payload.mimeType });
  const now = NOW();

  if (!support.supported) {
    await db.execute(
      `
      INSERT INTO recruitment_resume_extractions (
        id, candidate_id, file_id, extraction_status, file_format, extracted_text, quality_score, fallback_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        payload.candidateId,
        payload.sourceFileId,
        'NAO_SUPORTADO',
        support.fileFormat,
        null,
        null,
        null,
        now,
        now,
      ],
    );
    await db.execute(
      `UPDATE recruitment_candidates SET ai_status = ?, updated_at = ? WHERE id = ?`,
      ['NAO_SUPORTADO', now, payload.candidateId],
    );
    await insertHistory(
      db,
      payload.candidateId,
      'AI_ANALYSIS_UNSUPPORTED',
      payload.actorUserId,
      payload.currentStage,
      payload.currentStage,
      `Formato ${support.fileFormat} ainda não suportado para triagem automática.`,
    );
    return null;
  }

  const pendingRows = await db.query(
    `
    SELECT id FROM recruitment_ai_analysis_jobs
    WHERE candidate_id = ?
      AND source_file_id = ?
      AND status IN ('PENDING', 'RUNNING')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [payload.candidateId, payload.sourceFileId],
  );
  if (pendingRows[0]) {
    if (payload.force) {
      throw new RecruitmentValidationError('Já existe uma triagem de IA em andamento para este currículo.');
    }
    return clean(pendingRows[0].id);
  }

  const jobId = randomUUID();
  await db.execute(
    `
    INSERT INTO recruitment_ai_analysis_jobs (
      id, candidate_id, job_id, source_file_id, status, prompt_version, model, attempts, requested_by, last_error, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      jobId,
      payload.candidateId,
      payload.jobId,
      payload.sourceFileId,
      'PENDING',
      'recruitment-triage-v1',
      null,
      0,
      payload.actorUserId,
      null,
      null,
      now,
      now,
    ],
  );
  await db.execute(
    `UPDATE recruitment_candidates SET ai_status = ?, updated_at = ? WHERE id = ?`,
    ['PENDENTE', now, payload.candidateId],
  );
  await insertHistory(
    db,
    payload.candidateId,
    'AI_ANALYSIS_QUEUED',
    payload.actorUserId,
    payload.currentStage,
    payload.currentStage,
    `Triagem IA enfileirada para o arquivo ${payload.originalName}.`,
  );
  return jobId;
};

export const getRecruitmentCandidateAnalysisDetails = async (
  db: DbInterface,
  candidateId: string,
): Promise<RecruitmentCandidateAnalysisDetails> => {
  await ensureRecruitmentTables(db);
  const candidateRows = await db.query(`SELECT id FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  if (!candidateRows[0]) throw new RecruitmentValidationError('Candidato não encontrado.', 404);

  const [jobRows, analysisRows, extractionRows] = await Promise.all([
    db.query(`SELECT * FROM recruitment_ai_analysis_jobs WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`, [candidateId]),
    db.query(`SELECT * FROM recruitment_ai_analyses WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`, [candidateId]),
    db.query(`SELECT * FROM recruitment_resume_extractions WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`, [candidateId]),
  ]);

  const latestJob = jobRows[0] ? mapAiAnalysisJob(jobRows[0]) : null;
  const latestAnalysis = analysisRows[0] ? mapAiAnalysis(analysisRows[0]) : null;
  const latestExtraction = extractionRows[0] ? mapResumeExtraction(extractionRows[0]) : null;
  const relatedFileId = latestJob?.sourceFileId || latestAnalysis?.sourceFileId || latestExtraction?.fileId || null;
  const latestFile = relatedFileId ? await getRecruitmentCandidateFileById(db, relatedFileId) : null;

  return {
    candidateId,
    latestJob,
    latestAnalysis,
    latestExtraction,
    latestFile,
  };
};

export const enqueueRecruitmentCandidateAiAnalysis = async (
  db: DbInterface,
  candidateId: string,
  actorUserId: string,
  payload: { sourceFileId?: string | null; force?: boolean } = {},
) => {
  await ensureRecruitmentTables(db);
  const candidateRows = await db.query(`SELECT id, job_id, stage FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  const candidateRow = candidateRows[0];
  if (!candidateRow) throw new RecruitmentValidationError('Candidato não encontrado.', 404);

  const sourceFileId = clean(payload.sourceFileId) || null;
  const fileRows = sourceFileId
    ? await db.query(`SELECT * FROM recruitment_candidate_files WHERE id = ? AND candidate_id = ? LIMIT 1`, [sourceFileId, candidateId])
    : await db.query(`SELECT * FROM recruitment_candidate_files WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`, [candidateId]);
  const fileRow = fileRows[0];
  if (!fileRow) {
    throw new RecruitmentValidationError('Anexe um currículo em PDF ou DOCX antes de solicitar a triagem com IA.');
  }

  await queueRecruitmentAiAnalysisForFile(db, {
    candidateId,
    jobId: clean(candidateRow.job_id),
    sourceFileId: clean(fileRow.id),
    originalName: clean(fileRow.original_name),
    mimeType: clean(fileRow.mime_type),
    actorUserId,
    currentStage: upper(candidateRow.stage || 'RECEBIDO') as RecruitmentCandidateStage,
    force: Boolean(payload.force),
  });

  return getRecruitmentCandidateAnalysisDetails(db, candidateId);
};

export const createRecruitmentCandidateFileRecord = async (
  db: DbInterface,
  candidateId: string,
  payload: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    uploadedBy: string;
  },
  actorUserId: string,
) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT stage, job_id FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Candidato não encontrado.', 404);
  const fileId = randomUUID();
  await db.execute(
    `
    INSERT INTO recruitment_candidate_files (
      id, candidate_id, storage_provider, storage_bucket, storage_key, original_name, mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fileId,
      candidateId,
      payload.storageProvider,
      payload.storageBucket,
      payload.storageKey,
      payload.originalName,
      payload.mimeType,
      payload.sizeBytes,
      payload.uploadedBy,
      NOW(),
    ],
  );
  await insertHistory(db, candidateId, 'FILE_UPLOADED', actorUserId, upper(existing.stage) as RecruitmentCandidateStage, upper(existing.stage) as RecruitmentCandidateStage, payload.originalName);
  await queueRecruitmentAiAnalysisForFile(db, {
    candidateId,
    jobId: clean(existing.job_id),
    sourceFileId: fileId,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    actorUserId,
    currentStage: upper(existing.stage) as RecruitmentCandidateStage,
  });
  return listRecruitmentDashboard(db);
};

export const getRecruitmentCandidateFileById = async (db: DbInterface, fileId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_candidate_files WHERE id = ? LIMIT 1`, [fileId]);
  return rows[0] ? mapFile(rows[0]) : null;
};

export const convertRecruitmentCandidateToEmployee = async (db: DbInterface, candidateId: string, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(
    `
    SELECT c.*, j.title AS job_title, j.department, j.unit_name, j.employment_regime
    FROM recruitment_candidates c
    INNER JOIN recruitment_jobs j ON j.id = c.job_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [candidateId],
  );
  const candidate = rows[0];
  if (!candidate) throw new RecruitmentValidationError('Candidato não encontrado.', 404);
  if (clean(candidate.converted_employee_id)) throw new RecruitmentValidationError('Candidato já convertido em colaborador.');
  const cpf = normalizeCpf(candidate.cpf);
  if (!cpf) throw new RecruitmentValidationError('Informe o CPF do candidato antes de converter.');
  const email = normalizeEmail(candidate.email);
  await ensureNoDuplicatePerson(db, cpf, email, candidateId);

  const employee = await createEmployee(
    db,
    {
      fullName: clean(candidate.full_name),
      employmentRegime: normalizeRegime(candidate.employment_regime),
      status: 'PRE_ADMISSAO',
      cpf,
      email,
      phone: normalizePhone(candidate.phone),
      admissionDate: parseDate(payload?.admissionDate || payload?.admission_date) || TODAY_SAO_PAULO(),
      units: clean(candidate.unit_name) ? [clean(candidate.unit_name)] : [],
      jobTitle: clean(candidate.job_title) || null,
      department: clean(candidate.department) || null,
      notes: clean(payload?.notes) || `Convertido do recrutamento em ${TODAY_SAO_PAULO()}.`,
    },
    actorUserId,
  );

  await db.execute(
    `
    UPDATE recruitment_candidates
    SET stage = 'CONTRATADO', converted_employee_id = ?, updated_at = ?
    WHERE id = ?
    `,
    [employee.id, NOW(), candidateId],
  );
  await insertHistory(db, candidateId, 'CONVERTED_TO_EMPLOYEE', actorUserId, upper(candidate.stage) as RecruitmentCandidateStage, 'CONTRATADO', employee.id);
  return listRecruitmentDashboard(db);
};
