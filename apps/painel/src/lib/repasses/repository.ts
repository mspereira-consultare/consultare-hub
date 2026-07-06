import { createHash, randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { parseLocalizedMoneyInput } from '@/lib/repasses/money';
import type {
  RepasseAConferirExpandedItem,
  RepasseAConferirDetailsResult,
  RepasseAConferirLine,
  RepasseAConferirMainRow,
  RepasseConsolidacaoFinancialInput,
  RepasseConsolidacaoBooleanFilter,
  RepasseConsolidacaoJob,
  RepasseConsolidacaoJobInput,
  RepasseConsolidacaoLineMark,
  RepasseConsolidacaoLineMarkColor,
  RepasseConsolidacaoMarkLegend,
  RepasseConsolidacaoProfessionalListFilters,
  RepasseConsolidacaoProfessionalListResult,
  RepasseConsolidacaoProfessionalStatus,
  RepasseConsolidacaoStatusFilter,
  RepasseConsolidacaoScope,
  RepasseEmailBatch,
  RepasseEmailBatchListFilters,
  RepasseEmailBatchPrepareInput,
  RepasseEmailBatchPrepareRow,
  RepasseEmailBatchStatus,
  RepasseEmailEvent,
  RepasseEmailEventListFilters,
  RepasseEmailEventProcessingStatus,
  RepasseEmailJob,
  RepasseEmailJobInput,
  RepasseEmailJobListFilters,
  RepasseEmailJobScope,
  RepasseEmailJobStatus,
  RepasseEmailRecipient,
  RepasseEmailRecipientListFilters,
  RepasseEmailRecipientSendStatus,
  RepasseJobListFilters,
  RepassePdfArtifact,
  RepassePdfArtifactListFilters,
  RepasseProfessionalListFilters,
  RepasseProfessionalListResult,
  RepasseProfessionalOption,
  RepasseProfessionalSummary,
  RepassePdfJob,
  RepassePdfJobInput,
  RepassePdfScope,
  RepasseSyncScope,
  RepasseSyncJob,
  RepasseSyncJobInput,
} from '@/lib/repasses/types';

export class RepasseValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let repasseTablesEnsured = false;
let repasseConsolidacaoTablesEnsured = false;
let repasseEmailTablesEnsured = false;

const nowIso = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const stableHash64 = (value: string) => createHash('sha256').update(value).digest('hex');
const textTypes = new Set(['tinytext', 'text', 'mediumtext', 'longtext']);
const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const buildRequestedByUserJoin = (jobAlias: string) =>
  isMysqlProvider()
    ? `CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_bin = CONVERT(${jobAlias}.requested_by USING utf8mb4) COLLATE utf8mb4_bin`
    : `u.id = ${jobAlias}.requested_by`;

const readCount = (row: any): number => {
  if (!row || typeof row !== 'object') return 0;
  if (row.total !== undefined) return Number(row.total) || 0;
  const key = Object.keys(row).find((k) => /count|total/i.test(k));
  return key ? Number((row as any)[key]) || 0 : 0;
};

const previousMonthRef = () => {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = prev.getUTCFullYear();
  const month = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const normalizePeriodRef = (value?: unknown) => {
  const raw = clean(value);
  if (!raw) return previousMonthRef();
  const normalized = raw.match(/^(\d{4})-(\d{2})$/);
  if (!normalized) {
    throw new RepasseValidationError('Periodo invalido. Use o formato YYYY-MM.');
  }
  const month = Number(normalized[2]);
  if (month < 1 || month > 12) {
    throw new RepasseValidationError('Mes invalido no periodo informado.');
  }
  return `${normalized[1]}-${normalized[2]}`;
};

const normalizeLimit = (value: unknown, fallback = 20) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
};

const normalizeOptionLimit = (value: unknown, fallback = 500) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(3000, Math.floor(n)));
};

const normalizePage = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
};

const normalizeDueDateNf = (value: unknown) => {
  const raw = clean(value);
  if (!raw) {
    throw new RepasseValidationError('Informe a data limite para envio da NF.');
  }
  return raw;
};

const normalizeEmailAddress = (value: unknown) => clean(value).toLowerCase();

const isValidEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeScope = (value: unknown): RepassePdfScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi' || raw === 'all_with_data') {
    return raw;
  }
  return 'all_with_data';
};

const normalizeSyncScope = (value: unknown, hasProfessionalIds: boolean): RepasseSyncScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  if (raw === 'all') return 'all';
  return hasProfessionalIds ? 'multi' : 'all';
};

const normalizeConsolidacaoScope = (
  value: unknown,
  hasProfessionalIds: boolean
): RepasseConsolidacaoScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  if (raw === 'all') return 'all';
  return hasProfessionalIds ? 'multi' : 'all';
};

const normalizeProfessionalIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const id = clean(item);
    if (id) unique.add(id);
  }
  return Array.from(unique);
};

const parseProfessionalIdsJson = (value: unknown): string[] => {
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeProfessionalIds(parsed);
  } catch {
    return [];
  }
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_DUP_KEYNAME' ||
      /duplicate/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const mapSyncJob = (row: any): RepasseSyncJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeSyncScope(row.scope, parseProfessionalIdsJson(row.professional_ids_json).length > 0),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepasseSyncJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPdfJob = (row: any): RepassePdfJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeScope(row.scope),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepassePdfJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapConsolidacaoJob = (row: any): RepasseConsolidacaoJob => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  scope: normalizeConsolidacaoScope(
    row.scope,
    parseProfessionalIdsJson(row.professional_ids_json).length > 0
  ),
  professionalIds: parseProfessionalIdsJson(row.professional_ids_json),
  status: clean(row.status).toUpperCase() as RepasseConsolidacaoJob['status'],
  requestedBy: clean((row as any).requested_by_display || row.requested_by),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapPdfArtifact = (row: any): RepassePdfArtifact => ({
  id: clean(row.id),
  pdfJobId: clean(row.pdf_job_id),
  periodRef: clean(row.period_ref),
  professionalId: clean(row.professional_id),
  professionalName: clean(row.professional_name),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  fileName: clean(row.file_name),
  sizeBytes: Number(row.size_bytes) || 0,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const parseJsonStringArray = (value: unknown): string[] => {
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => clean(item)).filter(Boolean);
  } catch {
    return [];
  }
};

const mapEmailBatch = (row: any): RepasseEmailBatch => ({
  id: clean(row.id),
  periodRef: clean(row.period_ref),
  dueDateNf: clean(row.due_date_nf),
  status: clean(row.status).toUpperCase() as RepasseEmailBatchStatus,
  totalRecipients: Number(row.total_recipients) || 0,
  readyCount: Number(row.ready_count) || 0,
  warningCount: Number(row.warning_count) || 0,
  errorCount: Number(row.error_count) || 0,
  acceptedCount: Number(row.accepted_count) || 0,
  deliveredCount: Number(row.delivered_count) || 0,
  failedCount: Number(row.failed_count) || 0,
  requestedBy: clean((row as any).requested_by_display || row.requested_by) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  error: clean(row.error) || null,
});

const mapEmailRecipient = (row: any): RepasseEmailRecipient => ({
  id: clean(row.id),
  batchId: clean(row.batch_id),
  periodRef: clean(row.period_ref),
  professionalId: clean(row.professional_id),
  professionalName: clean(row.professional_name),
  recipientEmail: clean(row.recipient_email),
  amountValue: Number(row.amount_value) || 0,
  dueDateNf: clean(row.due_date_nf),
  pdfArtifactId: clean(row.pdf_artifact_id) || null,
  storageProvider: clean(row.storage_provider) || null,
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key) || null,
  driveFileId: clean(row.drive_file_id) || null,
  driveFileUrl: clean(row.drive_file_url) || null,
  fileName: clean(row.file_name) || null,
  professionalMatchStatus: clean(row.professional_match_status) || null,
  professionalMatchScore: row.professional_match_score === null || row.professional_match_score === undefined
    ? null
    : Number(row.professional_match_score) || 0,
  attachmentMatchStatus: clean(row.attachment_match_status) || null,
  attachmentSource: clean(row.attachment_source) || null,
  attachmentCode: clean(row.attachment_code) || null,
  originalSheetRowJson: clean(row.original_sheet_row_json) || null,
  observations: clean(row.observations) || null,
  attachmentSizeBytes: row.attachment_size_bytes === null || row.attachment_size_bytes === undefined
    ? null
    : Number(row.attachment_size_bytes) || 0,
  attachmentContentType: clean(row.attachment_content_type) || null,
  validationStatus: clean(row.validation_status).toUpperCase() as RepasseEmailRecipient['validationStatus'],
  validationErrors: parseJsonStringArray(row.validation_errors_json),
  sendStatus: clean(row.send_status).toUpperCase() as RepasseEmailRecipientSendStatus,
  lastMessageId: clean(row.last_message_id) || null,
  lastProviderMessageId: clean(row.last_provider_message_id) || null,
  lastEventType: clean(row.last_event_type) || null,
  lastEventAt: clean(row.last_event_at) || null,
  manualConfirmedBy: clean(row.manual_confirmed_by) || null,
  manualConfirmedAt: clean(row.manual_confirmed_at) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const normalizeEmailJobScope = (value: unknown, hasRecipientIds: boolean): RepasseEmailJobScope => {
  const raw = clean(value).toLowerCase();
  if (raw === 'selected' || raw === 'retry_failed' || raw === 'all_ready') return raw;
  return hasRecipientIds ? 'selected' : 'all_ready';
};

const parseEmailRecipientIdsJson = (value: unknown): string[] => parseJsonStringArray(value);

const mapEmailJob = (row: any): RepasseEmailJob => {
  const recipientIds = parseEmailRecipientIdsJson(row.recipient_ids_json);
  return {
    id: clean(row.id),
    batchId: clean(row.batch_id),
    periodRef: clean(row.period_ref),
    scope: normalizeEmailJobScope(row.scope, recipientIds.length > 0),
    recipientIds,
    status: clean(row.status).toUpperCase() as RepasseEmailJobStatus,
    requestedBy: clean((row as any).requested_by_display || row.requested_by),
    startedAt: clean(row.started_at) || null,
    finishedAt: clean(row.finished_at) || null,
    error: clean(row.error) || null,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const mapEmailEvent = (row: any): RepasseEmailEvent => ({
  id: clean(row.id),
  provider: clean(row.provider),
  providerEventId: clean(row.provider_event_id),
  providerMessageId: clean(row.provider_message_id) || null,
  messageId: clean(row.message_id) || null,
  recipientId: clean(row.recipient_id) || null,
  batchId: clean(row.batch_id) || null,
  eventType: clean(row.event_type),
  normalizedStatus: clean(row.normalized_status),
  payloadJson: clean(row.payload_json),
  receivedAt: clean(row.received_at),
  processedAt: clean(row.processed_at) || null,
  processingStatus: clean(row.processing_status).toUpperCase() as RepasseEmailEventProcessingStatus,
  errorMessage: clean(row.error_message) || null,
});

const normalizeProfessionalStatusFilter = (
  value: unknown
): RepasseProfessionalListFilters['status'] => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'success' ||
    raw === 'no_data' ||
    raw === 'error' ||
    raw === 'not_processed' ||
    raw === 'all'
  ) {
    return raw;
  }
  return 'all';
};

const mapProfessionalStatus = (
  rowStatus: string | null | undefined
): RepasseProfessionalSummary['status'] => {
  const normalized = clean(rowStatus).toUpperCase();
  if (normalized === 'SUCCESS') return 'SUCCESS';
  if (normalized === 'NO_DATA') return 'NO_DATA';
  if (normalized === 'ERROR') return 'ERROR';
  return 'NOT_PROCESSED';
};

const normalizeConsolidacaoProfessionalStatusFilter = (
  value: unknown
): RepasseConsolidacaoProfessionalListFilters['status'] => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'success' ||
    raw === 'no_data' ||
    raw === 'skipped' ||
    raw === 'error' ||
    raw === 'not_processed' ||
    raw === 'all'
  ) {
    return raw;
  }
  return 'all';
};

const normalizeConsolidacaoStatusFilter = (
  value: unknown
): RepasseConsolidacaoStatusFilter => {
  const raw = clean(value).toLowerCase();
  if (
    raw === 'all' ||
    raw === 'consolidado' ||
    raw === 'nao_consolidado' ||
    raw === 'nao_recebido'
  ) {
    return raw;
  }
  return 'all';
};

const normalizeBooleanFilter = (value: unknown): RepasseConsolidacaoBooleanFilter => {
  const raw = clean(value).toLowerCase();
  if (raw === 'yes' || raw === 'no' || raw === 'all') return raw;
  return 'all';
};

const normalizeIsoDate = (value: unknown): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new RepasseValidationError('Data invalida. Use o formato YYYY-MM-DD.');
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const normalizeNullableMoneyValue = (value: unknown): number | null => {
  const parsed = parseLocalizedMoneyInput(value);
  if (parsed === null) {
    if (value === null || value === undefined || !String(value).trim()) return null;
    throw new RepasseValidationError('Valor monetario invalido.');
  }
  return parsed;
};

const normalizeTextKey = (value: unknown): string =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

const normalizeBrDate = (value: unknown): string => {
  const raw = clean(value);
  if (!raw) return '';
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
};

const buildConsolidadoMatchKey = (
  executionDate: unknown,
  patientName: unknown,
  procedureName: unknown
): string => `${normalizeBrDate(executionDate)}|${normalizeTextKey(patientName)}|${normalizeTextKey(procedureName)}`;

const buildDuplicateAttendanceKey = (
  executionDate: unknown,
  patientName: unknown,
  procedureName: unknown,
  repasseValue: unknown
): string =>
  `${normalizeBrDate(executionDate)}|${normalizeTextKey(patientName)}|${normalizeTextKey(procedureName)}|${Number(repasseValue) || 0}`;

const buildPatientDateMatchKey = (executionDate: unknown, patientName: unknown): string =>
  `${normalizeBrDate(executionDate)}|${normalizeTextKey(patientName)}`;

const getDateExpr = (column: string): string =>
  isMysqlProvider()
    ? `STR_TO_DATE(${column}, '%d/%m/%Y')`
    : `date(substr(${column}, 7, 4) || '-' || substr(${column}, 4, 2) || '-' || substr(${column}, 1, 2))`;

const mapConsolidacaoProfessionalStatus = (
  rowStatus: string | null | undefined
): RepasseConsolidacaoProfessionalStatus => {
  const normalized = clean(rowStatus).toUpperCase();
  if (normalized === 'SUCCESS') return 'SUCCESS';
  if (normalized === 'NO_DATA') return 'NO_DATA';
  if (normalized === 'SKIPPED_NOT_IN_FILTER' || normalized === 'SKIPPED_AMBIGUOUS_NAME') {
    return 'SKIPPED';
  }
  if (normalized === 'ERROR') return 'ERROR';
  return 'NOT_PROCESSED';
};

const normalizeLineMarkColor = (value: unknown): RepasseConsolidacaoLineMarkColor | null => {
  const raw = clean(value).toLowerCase();
  if (raw === 'green' || raw === 'yellow' || raw === 'red') return raw;
  return null;
};

const loadRepasseProfessionalSummaries = async (
  db: DbInterface,
  input: { periodRef: string; search: string }
): Promise<{ items: RepasseProfessionalSummary[]; stats: RepasseProfessionalListResult['stats'] }> => {
  const periodRef = normalizePeriodRef(input.periodRef);
  const search = clean(input.search);

  const where: string[] = ['is_active = 1'];
  const whereParams: any[] = [];
  if (search) {
    where.push('UPPER(name) LIKE ?');
    whereParams.push(`%${search.toUpperCase()}%`);
  }

  const professionals = await db.query(
    `
    SELECT id, name, payment_minimum_text
    FROM professionals
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC
    `,
    whereParams
  );

  const repasseWhere: string[] = ['period_ref = ?', 'is_active = 1'];
  const repasseWhereParams: any[] = [periodRef];
  if (search) {
    repasseWhere.push('UPPER(professional_name) LIKE ?');
    repasseWhereParams.push(`%${search.toUpperCase()}%`);
  }
  const repasseProfessionals = await db.query(
    `
    SELECT DISTINCT professional_id, professional_name
    FROM feegow_repasse_consolidado
    WHERE ${repasseWhere.join(' AND ')}
    `,
    repasseWhereParams
  );

  const professionalMap = new Map<string, string>();
  const paymentMinimumByProfessional = new Map<string, string | null>();
  for (const row of professionals) {
    const id = clean((row as any).id);
    const name = clean((row as any).name);
    if (!id || !name) continue;
    professionalMap.set(id, name);
    paymentMinimumByProfessional.set(id, clean((row as any).payment_minimum_text) || null);
  }
  for (const row of repasseProfessionals) {
    const id = clean((row as any).professional_id);
    const name = clean((row as any).professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  const professionalPairs = Array.from(professionalMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));
  professionalPairs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const professionalIds = professionalPairs.map((pair) => pair.id);

  const aggregateByProfessional = new Map<
    string,
    { rowsCount: number; totalValue: number }
  >();
  const latestByProfessional = new Map<
    string,
    { status: RepasseProfessionalSummary['status']; errorMessage: string | null; updatedAt: string | null }
  >();
  const noteByProfessional = new Map<string, string | null>();
  const latestPdfByProfessional = new Map<
    string,
    { createdAt: string | null; artifactId: string | null }
  >();

  if (professionalIds.length > 0) {
    const placeholders = professionalIds.map(() => '?').join(', ');

    const aggregateRows = await db.query(
      `
      SELECT professional_id, COUNT(*) as rows_count, COALESCE(SUM(repasse_value), 0) as total_value
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds]
    );

    for (const row of aggregateRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      aggregateByProfessional.set(id, {
        rowsCount: Number((row as any).rows_count) || 0,
        totalValue: Number((row as any).total_value) || 0,
      });
    }

    const latestRows = await db.query(
      `
      SELECT
        i.professional_id,
        i.status,
        i.error_message,
        i.updated_at,
        j.created_at as job_created_at
      FROM repasse_sync_job_items i
      INNER JOIN repasse_sync_jobs j ON j.id = i.job_id
      WHERE j.period_ref = ?
        AND i.professional_id IN (${placeholders})
      ORDER BY j.created_at DESC, i.updated_at DESC
      `,
      [periodRef, ...professionalIds]
    );

    for (const row of latestRows) {
      const id = clean((row as any).professional_id);
      if (!id || latestByProfessional.has(id)) continue;
      latestByProfessional.set(id, {
        status: mapProfessionalStatus((row as any).status),
        errorMessage: clean((row as any).error_message) || null,
        updatedAt: clean((row as any).updated_at) || null,
      });
    }

    const noteRows = await db.query(
      `
      SELECT professional_id, note
      FROM repasse_professional_notes
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of noteRows) {
      noteByProfessional.set(clean((row as any).professional_id), clean((row as any).note) || null);
    }

    const latestPdfRows = await db.query(
      `
      SELECT a.professional_id, a.id as artifact_id, a.created_at
      FROM repasse_pdf_artifacts a
      INNER JOIN (
        SELECT professional_id, MAX(created_at) as max_created_at
        FROM repasse_pdf_artifacts
        WHERE period_ref = ?
          AND professional_id IN (${placeholders})
        GROUP BY professional_id
      ) latest
        ON latest.professional_id = a.professional_id
       AND latest.max_created_at = a.created_at
      WHERE a.period_ref = ?
      `,
      [periodRef, ...professionalIds, periodRef]
    );
    for (const row of latestPdfRows) {
      const professionalId = clean((row as any).professional_id);
      if (!professionalId || latestPdfByProfessional.has(professionalId)) continue;
      latestPdfByProfessional.set(professionalId, {
        createdAt: clean((row as any).created_at) || null,
        artifactId: clean((row as any).artifact_id) || null,
      });
    }
  }

  const items: RepasseProfessionalSummary[] = professionalPairs.map((pair) => {
    const professionalId = pair.id;
    const professionalName = pair.name;
    const aggregate = aggregateByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
    };
    const latest = latestByProfessional.get(professionalId);

    const status = latest?.status
      ? latest.status
      : aggregate.rowsCount > 0
        ? 'SUCCESS'
        : 'NOT_PROCESSED';

    return {
      professionalId,
      professionalName,
      status,
      rowsCount: aggregate.rowsCount,
      totalValue: aggregate.totalValue,
      lastProcessedAt: latest?.updatedAt || null,
      errorMessage: status === 'ERROR' ? latest?.errorMessage || null : null,
      note: noteByProfessional.get(professionalId) || null,
      paymentMinimumText: paymentMinimumByProfessional.get(professionalId) || null,
      lastPdfAt: latestPdfByProfessional.get(professionalId)?.createdAt || null,
      lastPdfArtifactId: latestPdfByProfessional.get(professionalId)?.artifactId || null,
    };
  });

  const stats = items.reduce(
    (acc, item) => {
      acc.totalRows += item.rowsCount;
      acc.totalValue += item.totalValue;

      if (item.status === 'SUCCESS') acc.success += 1;
      else if (item.status === 'NO_DATA') acc.noData += 1;
      else if (item.status === 'ERROR') acc.error += 1;
      else acc.notProcessed += 1;

      return acc;
    },
    {
      totalProfessionals: items.length,
      success: 0,
      noData: 0,
      error: 0,
      notProcessed: 0,
      totalRows: 0,
      totalValue: 0,
    }
  );

  return { items, stats };
};

const loadRepasseConsolidacaoProfessionalSummaries = async (
  db: DbInterface,
  input: {
    periodRef: string;
    search: string;
    hasPaymentMinimum: RepasseConsolidacaoBooleanFilter;
    consolidacaoStatus: RepasseConsolidacaoStatusFilter;
    hasDivergence: RepasseConsolidacaoBooleanFilter;
    attendanceDateStart: string | null;
    attendanceDateEnd: string | null;
    patientName: string;
  }
): Promise<{
  items: RepasseConsolidacaoProfessionalListResult['items'];
  stats: RepasseConsolidacaoProfessionalListResult['stats'];
}> => {
  await ensureRepasseTables(db);
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const search = clean(input.search);
  const hasPaymentMinimumFilter = normalizeBooleanFilter(input.hasPaymentMinimum);
  const consolidacaoStatusFilter = normalizeConsolidacaoStatusFilter(input.consolidacaoStatus);
  const hasDivergenceFilter = normalizeBooleanFilter(input.hasDivergence);
  const attendanceDateStart = input.attendanceDateStart ? normalizeIsoDate(input.attendanceDateStart) : null;
  const attendanceDateEnd = input.attendanceDateEnd ? normalizeIsoDate(input.attendanceDateEnd) : null;
  const patientName = clean(input.patientName);

  if (attendanceDateStart && attendanceDateEnd && attendanceDateStart > attendanceDateEnd) {
    throw new RepasseValidationError('Data inicial maior que a data final nos filtros.');
  }

  const where: string[] = ['is_active = 1'];
  const whereParams: any[] = [];
  if (search) {
    where.push('UPPER(name) LIKE ?');
    whereParams.push(`%${search.toUpperCase()}%`);
  }

  const professionals = await db.query(
    `
    SELECT id, name, payment_minimum_text
    FROM professionals
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC
    `,
    whereParams
  );

  const repasseWhere: string[] = ['period_ref = ?', 'is_active = 1'];
  const repasseWhereParams: any[] = [periodRef];
  if (search) {
    repasseWhere.push('UPPER(professional_name) LIKE ?');
    repasseWhereParams.push(`%${search.toUpperCase()}%`);
  }
  if (patientName) {
    repasseWhere.push('UPPER(patient_name) LIKE ?');
    repasseWhereParams.push(`%${patientName.toUpperCase()}%`);
  }
  if (attendanceDateStart) {
    repasseWhere.push(`${getDateExpr('execution_date')} >= ?`);
    repasseWhereParams.push(attendanceDateStart);
  }
  if (attendanceDateEnd) {
    repasseWhere.push(`${getDateExpr('execution_date')} <= ?`);
    repasseWhereParams.push(attendanceDateEnd);
  }

  const repasseProfessionals = await db.query(
    `
    SELECT DISTINCT professional_id, professional_name
    FROM feegow_repasse_a_conferir
    WHERE ${repasseWhere.join(' AND ')}
    `,
    repasseWhereParams
  );
  const consolidadoWhere: string[] = ['period_ref = ?', 'is_active = 1'];
  const consolidadoWhereParams: any[] = [periodRef];
  if (search) {
    consolidadoWhere.push('UPPER(professional_name) LIKE ?');
    consolidadoWhereParams.push(`%${search.toUpperCase()}%`);
  }
  if (patientName) {
    consolidadoWhere.push('UPPER(paciente) LIKE ?');
    consolidadoWhereParams.push(`%${patientName.toUpperCase()}%`);
  }
  if (attendanceDateStart) {
    consolidadoWhere.push(`${getDateExpr('data_exec')} >= ?`);
    consolidadoWhereParams.push(attendanceDateStart);
  }
  if (attendanceDateEnd) {
    consolidadoWhere.push(`${getDateExpr('data_exec')} <= ?`);
    consolidadoWhereParams.push(attendanceDateEnd);
  }
  const consolidadoProfessionals = await db.query(
    `
    SELECT DISTINCT professional_id, professional_name
    FROM feegow_repasse_consolidado
    WHERE ${consolidadoWhere.join(' AND ')}
    `,
    consolidadoWhereParams
  );

  const professionalMap = new Map<string, string>();
  const paymentMinimumByProfessional = new Map<string, string | null>();
  for (const row of professionals) {
    const id = clean((row as any).id);
    const name = clean((row as any).name);
    if (!id || !name) continue;
    professionalMap.set(id, name);
    paymentMinimumByProfessional.set(id, clean((row as any).payment_minimum_text) || null);
  }
  for (const row of repasseProfessionals) {
    const id = clean((row as any).professional_id);
    const name = clean((row as any).professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }
  for (const row of consolidadoProfessionals) {
    const id = clean((row as any).professional_id);
    const name = clean((row as any).professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  let professionalPairs = Array.from(professionalMap.entries()).map(([id, name]) => ({ id, name }));
  const hasLineFilter = Boolean(patientName || attendanceDateStart || attendanceDateEnd);
  if (hasLineFilter) {
    const eligibleByLine = new Set<string>();
    for (const row of repasseProfessionals) {
      const id = clean((row as any).professional_id);
      if (id) eligibleByLine.add(id);
    }
    for (const row of consolidadoProfessionals) {
      const id = clean((row as any).professional_id);
      if (id) eligibleByLine.add(id);
    }
    professionalPairs = professionalPairs.filter((pair) => eligibleByLine.has(pair.id));
  }
  professionalPairs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const professionalIds = professionalPairs.map((pair) => pair.id);

  const aggregateByProfessional = new Map<
    string,
    {
      rowsCount: number;
      totalValue: number;
      consolidadoQty: number;
      consolidadoValue: number;
      naoConsolidadoQty: number;
      naoConsolidadoValue: number;
      naoRecebidoQty: number;
      naoRecebidoValue: number;
    }
  >();
  const duplicateAttendanceByProfessional = new Map<
    string,
    {
      caseCount: number;
      rowsCount: number;
      totalValue: number;
    }
  >();
  const zeroRepasseByProfessional = new Map<
    string,
    {
      rowsCount: number;
      totalValue: number;
    }
  >();
  const consolidadoTotalsByProfessional = new Map<
    string,
    {
      rowsCount: number;
      totalValue: number;
    }
  >();
  const totalConsolidadoTabelaByProfessional = new Map<string, number>();
  const latestByProfessional = new Map<
    string,
    { status: RepasseConsolidacaoProfessionalStatus; errorMessage: string | null; updatedAt: string | null }
  >();
  const noteByProfessional = new Map<string, { note: string | null; internalNote: string | null }>();
  const manualByProfessional = new Map<
    string,
    { repasseFinalValue: number | null; produtividadeValue: number | null }
  >();
  const latestPdfByProfessional = new Map<
    string,
    { createdAt: string | null; artifactId: string | null }
  >();

  if (professionalIds.length > 0) {
    const placeholders = professionalIds.map(() => '?').join(', ');
    const lineFilterClauses: string[] = [];
    const lineFilterParams: any[] = [];
    if (patientName) {
      lineFilterClauses.push('UPPER(patient_name) LIKE ?');
      lineFilterParams.push(`%${patientName.toUpperCase()}%`);
    }
    if (attendanceDateStart) {
      lineFilterClauses.push(`${getDateExpr('execution_date')} >= ?`);
      lineFilterParams.push(attendanceDateStart);
    }
    if (attendanceDateEnd) {
      lineFilterClauses.push(`${getDateExpr('execution_date')} <= ?`);
      lineFilterParams.push(attendanceDateEnd);
    }

    const aggregateRows = await db.query(
      `
      SELECT
        professional_id,
        COUNT(*) as rows_count,
        COALESCE(SUM(detail_repasse_value), 0) as total_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN 1 ELSE 0 END), 0) as consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN detail_repasse_value ELSE 0 END), 0) as consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('NAO_CONSOLIDADO', 'OUTRO', 'SEM_DETALHE') THEN 1 ELSE 0 END), 0) as nao_consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('NAO_CONSOLIDADO', 'OUTRO', 'SEM_DETALHE') THEN detail_repasse_value ELSE 0 END), 0) as nao_consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN 1 ELSE 0 END), 0) as nao_recebido_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN detail_repasse_value ELSE 0 END), 0) as nao_recebido_value
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        ${lineFilterClauses.length ? `AND ${lineFilterClauses.join(' AND ')}` : ''}
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...lineFilterParams]
    );
    for (const row of aggregateRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      aggregateByProfessional.set(id, {
        rowsCount: Number((row as any).rows_count) || 0,
        totalValue: Number((row as any).total_value) || 0,
        consolidadoQty: Number((row as any).consolidado_qty) || 0,
        consolidadoValue: Number((row as any).consolidado_value) || 0,
        naoConsolidadoQty: Number((row as any).nao_consolidado_qty) || 0,
        naoConsolidadoValue: Number((row as any).nao_consolidado_value) || 0,
        naoRecebidoQty: Number((row as any).nao_recebido_qty) || 0,
        naoRecebidoValue: Number((row as any).nao_recebido_value) || 0,
      });
    }

    const duplicateRows = await db.query(
      `
      SELECT
        professional_id,
        COUNT(*) as duplicate_case_count,
        COALESCE(SUM(rows_count), 0) as duplicate_rows_count,
        COALESCE(SUM(total_value), 0) as duplicate_total_value
      FROM (
        SELECT
          professional_id,
          execution_date,
          patient_name,
          procedure_name,
          detail_repasse_value,
          COUNT(*) as rows_count,
          COALESCE(SUM(detail_repasse_value), 0) as total_value
        FROM feegow_repasse_a_conferir
        WHERE period_ref = ?
          AND is_active = 1
          AND professional_id IN (${placeholders})
          ${lineFilterClauses.length ? `AND ${lineFilterClauses.join(' AND ')}` : ''}
        GROUP BY professional_id, execution_date, patient_name, procedure_name, detail_repasse_value
        HAVING COUNT(*) > 1
      ) duplicated
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...lineFilterParams]
    );
    for (const row of duplicateRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      duplicateAttendanceByProfessional.set(id, {
        caseCount: Number((row as any).duplicate_case_count) || 0,
        rowsCount: Number((row as any).duplicate_rows_count) || 0,
        totalValue: Number((row as any).duplicate_total_value) || 0,
      });
    }

    const zeroRepasseRows = await db.query(
      `
      SELECT
        professional_id,
        COUNT(*) as zero_repasse_rows_count,
        COALESCE(SUM(detail_repasse_value), 0) as zero_repasse_total_value
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        AND ABS(COALESCE(detail_repasse_value, 0) - 0.01) < 0.0001
        ${lineFilterClauses.length ? `AND ${lineFilterClauses.join(' AND ')}` : ''}
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...lineFilterParams]
    );
    for (const row of zeroRepasseRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      zeroRepasseByProfessional.set(id, {
        rowsCount: Number((row as any).zero_repasse_rows_count) || 0,
        totalValue: Number((row as any).zero_repasse_total_value) || 0,
      });
    }

    const consolidadoWhereClauses: string[] = [];
    const consolidadoWhereParams: any[] = [];
    if (patientName) {
      consolidadoWhereClauses.push('UPPER(paciente) LIKE ?');
      consolidadoWhereParams.push(`%${patientName.toUpperCase()}%`);
    }
    if (attendanceDateStart) {
      consolidadoWhereClauses.push(`${getDateExpr('data_exec')} >= ?`);
      consolidadoWhereParams.push(attendanceDateStart);
    }
    if (attendanceDateEnd) {
      consolidadoWhereClauses.push(`${getDateExpr('data_exec')} <= ?`);
      consolidadoWhereParams.push(attendanceDateEnd);
    }

    const totalConsolidadoRows = await db.query(
      `
      SELECT
        professional_id,
        COUNT(*) as rows_count,
        COALESCE(SUM(repasse_value), 0) as total_consolidado
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        ${consolidadoWhereClauses.length ? `AND ${consolidadoWhereClauses.join(' AND ')}` : ''}
      GROUP BY professional_id
      `,
      [periodRef, ...professionalIds, ...consolidadoWhereParams]
    );
    for (const row of totalConsolidadoRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      totalConsolidadoTabelaByProfessional.set(id, Number((row as any).total_consolidado) || 0);
      consolidadoTotalsByProfessional.set(id, {
        rowsCount: Number((row as any).rows_count) || 0,
        totalValue: Number((row as any).total_consolidado) || 0,
      });
    }

    const latestRows = await db.query(
      `
      SELECT
        i.professional_id,
        i.status,
        i.error_message,
        i.updated_at,
        j.created_at as job_created_at
      FROM repasse_consolidacao_job_items i
      INNER JOIN repasse_consolidacao_jobs j ON j.id = i.job_id
      WHERE j.period_ref = ?
        AND i.professional_id IN (${placeholders})
      ORDER BY j.created_at DESC, i.updated_at DESC
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of latestRows) {
      const id = clean((row as any).professional_id);
      if (!id || latestByProfessional.has(id)) continue;
      latestByProfessional.set(id, {
        status: mapConsolidacaoProfessionalStatus((row as any).status),
        errorMessage: clean((row as any).error_message) || null,
        updatedAt: clean((row as any).updated_at) || null,
      });
    }

    const noteRows = await db.query(
      `
      SELECT professional_id, note, internal_note
      FROM repasse_consolidacao_notes
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of noteRows) {
      noteByProfessional.set(clean((row as any).professional_id), {
        note: clean((row as any).note) || null,
        internalNote: clean((row as any).internal_note) || null,
      });
    }

    const manualRows = await db.query(
      `
      SELECT professional_id, repasse_final_value, produtividade_value
      FROM repasse_fechamento_manual
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
      `,
      [periodRef, ...professionalIds]
    );
    for (const row of manualRows) {
      const id = clean((row as any).professional_id);
      if (!id) continue;
      manualByProfessional.set(id, {
        repasseFinalValue:
          (row as any).repasse_final_value === null || (row as any).repasse_final_value === undefined
            ? null
            : Number((row as any).repasse_final_value),
        produtividadeValue:
          (row as any).produtividade_value === null || (row as any).produtividade_value === undefined
            ? null
            : Number((row as any).produtividade_value),
      });
    }

    const latestPdfRows = await db.query(
      `
      SELECT a.professional_id, a.id as artifact_id, a.created_at
      FROM repasse_pdf_artifacts a
      INNER JOIN (
        SELECT professional_id, MAX(created_at) as max_created_at
        FROM repasse_pdf_artifacts
        WHERE period_ref = ?
          AND professional_id IN (${placeholders})
        GROUP BY professional_id
      ) latest
        ON latest.professional_id = a.professional_id
       AND latest.max_created_at = a.created_at
      WHERE a.period_ref = ?
      `,
      [periodRef, ...professionalIds, periodRef]
    );
    for (const row of latestPdfRows) {
      const id = clean((row as any).professional_id);
      if (!id || latestPdfByProfessional.has(id)) continue;
      latestPdfByProfessional.set(id, {
        createdAt: clean((row as any).created_at) || null,
        artifactId: clean((row as any).artifact_id) || null,
      });
    }
  }

  const items = professionalPairs.map((pair) => {
    const professionalId = pair.id;
    const professionalName = pair.name;
    const aggregate = aggregateByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
    };
    const consolidadoTotals = consolidadoTotalsByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
    };
    const latest = latestByProfessional.get(professionalId);

    const status = latest?.status
      ? latest.status
      : consolidadoTotals.rowsCount > 0 || aggregate.rowsCount > 0
        ? 'SUCCESS'
        : 'NOT_PROCESSED';
    const repasseTotalConsolidadoTabela = totalConsolidadoTabelaByProfessional.get(professionalId) || 0;
    const repasseTotalConsolidadoAConferir = aggregate.consolidadoValue;
    const divergenciaValue = repasseTotalConsolidadoTabela - repasseTotalConsolidadoAConferir;
    const hasDivergencia = Math.abs(divergenciaValue) > 0.01;
    const manual = manualByProfessional.get(professionalId);
    const repasseFinalOverride =
      manual?.repasseFinalValue === null || manual?.repasseFinalValue === undefined
        ? null
        : Number(manual.repasseFinalValue) || 0;
    const produtividadeValue =
      manual?.produtividadeValue === null || manual?.produtividadeValue === undefined
        ? 0
        : Number(manual.produtividadeValue) || 0;
    const repasseFinalValue = repasseFinalOverride === null ? consolidadoTotals.totalValue : repasseFinalOverride;
    const percentualProdutividadeValue = produtividadeValue * 0.05;
    const totalFinalValue = repasseFinalValue + percentualProdutividadeValue;
    const duplicateAttendance = duplicateAttendanceByProfessional.get(professionalId) || {
      caseCount: 0,
      rowsCount: 0,
      totalValue: 0,
    };
    const zeroRepasse = zeroRepasseByProfessional.get(professionalId) || {
      rowsCount: 0,
      totalValue: 0,
    };

    return {
      professionalId,
      professionalName,
      status,
      execucaoQty: 0,
      execucaoValue: 0,
      execucaoPending: true,
      producaoQty: consolidadoTotals.rowsCount,
      producaoValue: consolidadoTotals.totalValue,
      rowsCount: consolidadoTotals.rowsCount,
      totalValue: consolidadoTotals.totalValue,
      consolidadoQty: aggregate.consolidadoQty,
      consolidadoValue: aggregate.consolidadoValue,
      naoConsolidadoQty: aggregate.naoConsolidadoQty,
      naoConsolidadoValue: aggregate.naoConsolidadoValue,
      naoRecebidoQty: aggregate.naoRecebidoQty,
      naoRecebidoValue: aggregate.naoRecebidoValue,
      repasseTotalConsolidadoTabela,
      repasseTotalConsolidadoAConferir,
      hasDivergencia,
      divergenciaValue,
      repasseFinalValue,
      produtividadeValue,
      percentualProdutividadeValue,
      totalFinalValue,
      duplicateAttendanceCaseCount: duplicateAttendance.caseCount,
      duplicateAttendanceQty: duplicateAttendance.rowsCount,
      duplicateAttendanceValue: duplicateAttendance.totalValue,
      hasPossibleDuplicateAttendances: duplicateAttendance.caseCount > 0,
      zeroRepasseQty: zeroRepasse.rowsCount,
      zeroRepasseValue: zeroRepasse.totalValue,
      hasZeroRepasseAlert: zeroRepasse.rowsCount > 0,
      hasRepasseFinalOverride: repasseFinalOverride !== null,
      lastProcessedAt: latest?.updatedAt || null,
      errorMessage: status === 'ERROR' ? latest?.errorMessage || null : null,
      note: noteByProfessional.get(professionalId)?.note || null,
      internalNote: noteByProfessional.get(professionalId)?.internalNote || null,
      paymentMinimumText: paymentMinimumByProfessional.get(professionalId) || null,
      lastPdfAt: latestPdfByProfessional.get(professionalId)?.createdAt || null,
      lastPdfArtifactId: latestPdfByProfessional.get(professionalId)?.artifactId || null,
    };
  });

  let filteredItems = items;
  if (hasPaymentMinimumFilter === 'yes') {
    filteredItems = filteredItems.filter((item) => Boolean(clean(item.paymentMinimumText)));
  } else if (hasPaymentMinimumFilter === 'no') {
    filteredItems = filteredItems.filter((item) => !clean(item.paymentMinimumText));
  }

  if (consolidacaoStatusFilter === 'consolidado') {
    filteredItems = filteredItems.filter((item) => item.consolidadoQty > 0);
  } else if (consolidacaoStatusFilter === 'nao_consolidado') {
    filteredItems = filteredItems.filter((item) => item.naoConsolidadoQty > 0);
  } else if (consolidacaoStatusFilter === 'nao_recebido') {
    filteredItems = filteredItems.filter((item) => item.naoRecebidoQty > 0);
  }

  if (hasDivergenceFilter === 'yes') {
    filteredItems = filteredItems.filter((item) => item.hasDivergencia);
  } else if (hasDivergenceFilter === 'no') {
    filteredItems = filteredItems.filter((item) => !item.hasDivergencia);
  }

  const stats = filteredItems.reduce(
    (acc, item) => {
      acc.totalRows += item.rowsCount;
      acc.totalValue += item.totalValue;
      acc.consolidadoQty += item.consolidadoQty;
      acc.consolidadoValue += item.consolidadoValue;
      acc.naoConsolidadoQty += item.naoConsolidadoQty;
      acc.naoConsolidadoValue += item.naoConsolidadoValue;
      acc.naoRecebidoQty += item.naoRecebidoQty;
      acc.naoRecebidoValue += item.naoRecebidoValue;
      if (item.hasDivergencia) acc.divergenceCount += 1;
      if (item.status === 'SUCCESS') acc.success += 1;
      else if (item.status === 'NO_DATA') acc.noData += 1;
      else if (item.status === 'SKIPPED') acc.skipped += 1;
      else if (item.status === 'ERROR') acc.error += 1;
      else acc.notProcessed += 1;
      return acc;
    },
    {
      totalProfessionals: filteredItems.length,
      success: 0,
      noData: 0,
      skipped: 0,
      error: 0,
      notProcessed: 0,
      totalRows: 0,
      totalValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
      divergenceCount: 0,
    }
  );

  return { items: filteredItems, stats };
};

export const ensureRepasseTables = async (db: DbInterface) => {
  if (repasseTablesEnsured) return;

  const ensureMysqlColumnDefinition = async (
    tableName: string,
    columnName: string,
    definitionSql: string
  ) => {
    if (!isMysqlProvider()) return;
    const rows = await db.query(
      `
      SELECT DATA_TYPE as data_type, COLUMN_TYPE as column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows?.[0] as any;
    if (!row) return;
    const dataType = clean(row.data_type).toLowerCase();
    const currentType = clean(row.column_type).toLowerCase();
    const targetType = clean(definitionSql).toLowerCase();
    if (currentType === targetType) return;
    if (textTypes.has(dataType) || !currentType.startsWith(targetType.split(' ')[0])) {
      await db.execute(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definitionSql}`);
    }
  };

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_repasse_consolidado (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      invoice_id VARCHAR(64),
      data_exec VARCHAR(32) NOT NULL,
      paciente VARCHAR(180) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      funcao VARCHAR(120) NOT NULL,
      convenio VARCHAR(180) NOT NULL,
      repasse_value DECIMAL(14,2) NOT NULL,
      source_row_hash VARCHAR(64) NOT NULL UNIQUE,
      is_active INTEGER NOT NULL,
      last_job_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidado_period_prof ON feegow_repasse_consolidado(period_ref, professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidado_data_exec ON feegow_repasse_consolidado(data_exec)`
  );
  await safeExecute(db, `ALTER TABLE feegow_repasse_consolidado ADD COLUMN invoice_id VARCHAR(64)`);
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'invoice_id', 'VARCHAR(64)');
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'professional_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('feegow_repasse_consolidado', 'source_row_hash', 'VARCHAR(64) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_period ON repasse_sync_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_status ON repasse_sync_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_jobs_created ON repasse_sync_jobs(created_at)`);
  await safeExecute(db, `ALTER TABLE repasse_sync_jobs ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'all'`);
  await safeExecute(db, `ALTER TABLE repasse_sync_jobs ADD COLUMN professional_ids_json TEXT`);
  await ensureMysqlColumnDefinition('repasse_sync_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_sync_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_sync_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rows_count INTEGER NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      error_message TEXT,
      duration_ms INTEGER,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_job ON repasse_sync_job_items(job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_prof ON repasse_sync_job_items(professional_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_sync_items_status ON repasse_sync_job_items(status)`);
  await ensureMysqlColumnDefinition('repasse_sync_job_items', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_sync_job_items', 'job_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'repasse_sync_job_items',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_professional_notes (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      note TEXT,
      internal_note TEXT,
      updated_by VARCHAR(64) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id)
    )
  `);
  await safeExecute(
    db,
    `ALTER TABLE repasse_professional_notes ADD COLUMN internal_note TEXT NULL`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_prof_notes_prof ON repasse_professional_notes(professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_period ON repasse_pdf_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_status ON repasse_pdf_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_jobs_created ON repasse_pdf_jobs(created_at)`);
  await ensureMysqlColumnDefinition('repasse_pdf_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_pdf_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_pdf_artifacts (
      id VARCHAR(64) PRIMARY KEY,
      pdf_job_id VARCHAR(64) NOT NULL,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_job ON repasse_pdf_artifacts(pdf_job_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_pdf_artifacts_prof ON repasse_pdf_artifacts(professional_id)`);
  await ensureMysqlColumnDefinition('repasse_pdf_artifacts', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_pdf_artifacts', 'pdf_job_id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'repasse_pdf_artifacts',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  repasseTablesEnsured = true;
};

export const ensureRepasseConsolidacaoTables = async (db: DbInterface) => {
  if (repasseConsolidacaoTablesEnsured) return;
  await ensureRepasseTables(db);

  const ensureMysqlColumnDefinition = async (
    tableName: string,
    columnName: string,
    definitionSql: string
  ) => {
    if (!isMysqlProvider()) return;
    const rows = await db.query(
      `
      SELECT DATA_TYPE as data_type, COLUMN_TYPE as column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
      `,
      [tableName, columnName]
    );
    const row = rows?.[0] as any;
    if (!row) return;
    const dataType = clean(row.data_type).toLowerCase();
    const currentType = clean(row.column_type).toLowerCase();
    const targetType = clean(definitionSql).toLowerCase();
    if (currentType === targetType) return;
    if (textTypes.has(dataType) || !currentType.startsWith(targetType.split(' ')[0])) {
      await db.execute(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definitionSql}`);
    }
  };

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_repasse_a_conferir (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      invoice_id VARCHAR(64),
      execution_date VARCHAR(32),
      patient_name VARCHAR(180),
      unit_name VARCHAR(120),
      account_date VARCHAR(32),
      requester_name VARCHAR(180),
      specialty_name VARCHAR(180),
      procedure_name VARCHAR(255),
      attendance_value DECIMAL(14,2) NOT NULL,
      detail_status VARCHAR(32),
      detail_status_text VARCHAR(255),
      role_code VARCHAR(32),
      role_name VARCHAR(120),
      detail_professional_name VARCHAR(180),
      detail_repasse_value DECIMAL(14,2) NOT NULL,
      executante_option_value VARCHAR(64),
      executante_option_title VARCHAR(255),
      source_row_hash VARCHAR(64) NOT NULL UNIQUE,
      is_active INTEGER NOT NULL,
      last_job_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_period_prof ON feegow_repasse_a_conferir(period_ref, professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_exec_date ON feegow_repasse_a_conferir(execution_date)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_conferir_status ON feegow_repasse_a_conferir(detail_status)`
  );
  await ensureMysqlColumnDefinition('feegow_repasse_a_conferir', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition(
    'feegow_repasse_a_conferir',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'feegow_repasse_a_conferir',
    'source_row_hash',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_jobs (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(20) NOT NULL,
      professional_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_period ON repasse_consolidacao_jobs(period_ref)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_status ON repasse_consolidacao_jobs(status)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_jobs_created ON repasse_consolidacao_jobs(created_at)`
  );
  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_jobs ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'all'`
  );
  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_jobs ADD COLUMN professional_ids_json TEXT`
  );
  await ensureMysqlColumnDefinition('repasse_consolidacao_jobs', 'id', 'VARCHAR(64) NOT NULL');
  await ensureMysqlColumnDefinition('repasse_consolidacao_jobs', 'scope', 'VARCHAR(20) NOT NULL');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      status VARCHAR(40) NOT NULL,
      rows_count INTEGER NOT NULL,
      total_value DECIMAL(14,2) NOT NULL,
      error_message TEXT,
      duration_ms INTEGER,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_job ON repasse_consolidacao_job_items(job_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_prof ON repasse_consolidacao_job_items(professional_id)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_items_status ON repasse_consolidacao_job_items(status)`
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'job_id',
    'VARCHAR(64) NOT NULL'
  );
  await ensureMysqlColumnDefinition(
    'repasse_consolidacao_job_items',
    'professional_id',
    'VARCHAR(64) NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_notes (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      note TEXT,
      internal_note TEXT,
      updated_by VARCHAR(64) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id)
    )
  `);

  await safeExecute(
    db,
    `ALTER TABLE repasse_consolidacao_notes ADD COLUMN internal_note TEXT NULL`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_notes_prof ON repasse_consolidacao_notes(professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_fechamento_manual (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      repasse_final_value DECIMAL(14,2) NULL,
      produtividade_value DECIMAL(14,2) NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id)
    )
  `);
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_fechamento_manual_prof ON repasse_fechamento_manual(professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_line_marks (
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      source_row_hash VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      color_key VARCHAR(16) NOT NULL,
      note TEXT,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (period_ref, professional_id, source_row_hash, user_id)
    )
  `);
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_line_marks_user ON repasse_consolidacao_line_marks(user_id, updated_at)`
  );
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_line_marks_period_prof ON repasse_consolidacao_line_marks(period_ref, professional_id)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_consolidacao_mark_legends (
      user_id VARCHAR(64) NOT NULL,
      color_key VARCHAR(16) NOT NULL,
      label VARCHAR(120) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (user_id, color_key)
    )
  `);
  await safeExecute(
    db,
    `CREATE INDEX idx_repasse_consolidacao_legends_updated ON repasse_consolidacao_mark_legends(updated_at)`
  );

  repasseConsolidacaoTablesEnsured = true;
};

export const ensureRepasseEmailTables = async (db: DbInterface) => {
  if (repasseEmailTablesEnsured) return;
  await ensureRepasseConsolidacaoTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_batches (
      id VARCHAR(64) PRIMARY KEY,
      period_ref VARCHAR(7) NOT NULL,
      due_date_nf VARCHAR(32) NOT NULL,
      status VARCHAR(30) NOT NULL,
      total_recipients INTEGER NOT NULL DEFAULT 0,
      ready_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      requested_by VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT
    )
  `);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_batches_period ON repasse_email_batches(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_batches_status ON repasse_email_batches(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_batches_created ON repasse_email_batches(created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_recipients (
      id VARCHAR(64) PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      period_ref VARCHAR(7) NOT NULL,
      professional_id VARCHAR(64) NOT NULL,
      professional_name VARCHAR(180) NOT NULL,
      recipient_email VARCHAR(220) NOT NULL,
      amount_value DECIMAL(14,2) NOT NULL,
      due_date_nf VARCHAR(32) NOT NULL,
      pdf_artifact_id VARCHAR(64),
      storage_provider VARCHAR(30),
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255),
      drive_file_id VARCHAR(180),
      drive_file_url VARCHAR(500),
      file_name VARCHAR(255),
      professional_match_status VARCHAR(40),
      professional_match_score DECIMAL(8,4),
      attachment_match_status VARCHAR(40),
      attachment_source VARCHAR(40),
      attachment_code VARCHAR(180),
      original_sheet_row_json LONGTEXT,
      observations LONGTEXT,
      attachment_size_bytes INTEGER,
      attachment_content_type VARCHAR(120),
      validation_status VARCHAR(20) NOT NULL,
      validation_errors_json LONGTEXT,
      send_status VARCHAR(40) NOT NULL,
      last_message_id VARCHAR(128),
      last_provider_message_id VARCHAR(128),
      last_event_type VARCHAR(80),
      last_event_at VARCHAR(32),
      manual_confirmed_by VARCHAR(64),
      manual_confirmed_at VARCHAR(32),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_batch_prof ON repasse_email_recipients(batch_id, professional_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_batch ON repasse_email_recipients(batch_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_period ON repasse_email_recipients(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_prof ON repasse_email_recipients(professional_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_status ON repasse_email_recipients(send_status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_email ON repasse_email_recipients(recipient_email)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN drive_file_id VARCHAR(180)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN drive_file_url VARCHAR(500)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN professional_match_status VARCHAR(40)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN professional_match_score DECIMAL(8,4)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN attachment_match_status VARCHAR(40)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN attachment_source VARCHAR(40)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN attachment_code VARCHAR(180)`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN original_sheet_row_json LONGTEXT`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN observations LONGTEXT`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN attachment_size_bytes INTEGER`);
  await safeExecute(db, `ALTER TABLE repasse_email_recipients ADD COLUMN attachment_content_type VARCHAR(120)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_prof_match ON repasse_email_recipients(professional_match_status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_attachment_match ON repasse_email_recipients(attachment_match_status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_recipients_attachment_code ON repasse_email_recipients(batch_id, attachment_code)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_jobs (
      id VARCHAR(64) PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      period_ref VARCHAR(7) NOT NULL,
      scope VARCHAR(30) NOT NULL,
      recipient_ids_json LONGTEXT,
      status VARCHAR(20) NOT NULL,
      requested_by VARCHAR(64) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_jobs_batch ON repasse_email_jobs(batch_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_jobs_period ON repasse_email_jobs(period_ref)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_jobs_status ON repasse_email_jobs(status)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_jobs_created ON repasse_email_jobs(created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_messages (
      id VARCHAR(64) PRIMARY KEY,
      batch_id VARCHAR(64) NOT NULL,
      recipient_id VARCHAR(64) NOT NULL,
      job_id VARCHAR(64),
      message_id VARCHAR(128) NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_message_id VARCHAR(128),
      to_email VARCHAR(220) NOT NULL,
      from_email VARCHAR(220) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      template_key VARCHAR(80),
      pdf_artifact_id VARCHAR(64),
      attachment_file_name VARCHAR(255),
      status VARCHAR(40) NOT NULL,
      request_payload_json LONGTEXT,
      response_payload_json LONGTEXT,
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_messages_recipient ON repasse_email_messages(recipient_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_messages_provider_id ON repasse_email_messages(provider_message_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_messages_message_id ON repasse_email_messages(message_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_messages_status ON repasse_email_messages(status)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_events (
      id VARCHAR(64) PRIMARY KEY,
      provider VARCHAR(40) NOT NULL,
      provider_event_id VARCHAR(180) NOT NULL,
      provider_message_id VARCHAR(128),
      message_id VARCHAR(128),
      recipient_id VARCHAR(64),
      batch_id VARCHAR(64),
      event_type VARCHAR(80) NOT NULL,
      normalized_status VARCHAR(40) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      received_at VARCHAR(32) NOT NULL,
      processed_at VARCHAR(32),
      processing_status VARCHAR(30) NOT NULL,
      error_message TEXT
    )
  `);
  await safeExecute(
    db,
    `CREATE UNIQUE INDEX ux_repasse_email_events_provider ON repasse_email_events(provider, provider_event_id)`
  );
  await safeExecute(db, `CREATE INDEX idx_repasse_email_events_message ON repasse_email_events(provider_message_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_events_recipient ON repasse_email_events(recipient_id)`);
  await safeExecute(db, `CREATE INDEX idx_repasse_email_events_batch ON repasse_email_events(batch_id)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS repasse_email_suppressions (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(220) NOT NULL,
      reason VARCHAR(40) NOT NULL,
      provider VARCHAR(40),
      source_event_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      created_by VARCHAR(64),
      notes TEXT
    )
  `);
  await safeExecute(
    db,
    `CREATE UNIQUE INDEX ux_repasse_email_suppressions_email ON repasse_email_suppressions(email)`
  );

  repasseEmailTablesEnsured = true;
};

const batchCountersSql = `
  SELECT
    COUNT(*) as total_recipients,
    COALESCE(SUM(CASE WHEN send_status = 'READY' THEN 1 ELSE 0 END), 0) as ready_count,
    COALESCE(SUM(CASE WHEN validation_status = 'WARNING' THEN 1 ELSE 0 END), 0) as warning_count,
    COALESCE(SUM(CASE WHEN validation_status = 'ERROR' THEN 1 ELSE 0 END), 0) as error_count,
    COALESCE(SUM(CASE WHEN send_status = 'ACCEPTED_PROVIDER' THEN 1 ELSE 0 END), 0) as accepted_count,
    COALESCE(SUM(CASE WHEN send_status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as delivered_count,
    COALESCE(SUM(CASE WHEN send_status IN ('FAILED', 'SOFT_BOUNCE', 'HARD_BOUNCE', 'SPAM_COMPLAINT') THEN 1 ELSE 0 END), 0) as failed_count
  FROM repasse_email_recipients
  WHERE batch_id = ?
`;

const updateRepasseEmailBatchCounters = async (
  db: DbInterface,
  batchId: string,
  status?: RepasseEmailBatchStatus
) => {
  const counters = (await db.query(batchCountersSql, [clean(batchId)]))[0] as any;
  const now = nowIso();
  const params: any[] = [
    Number(counters?.total_recipients) || 0,
    Number(counters?.ready_count) || 0,
    Number(counters?.warning_count) || 0,
    Number(counters?.error_count) || 0,
    Number(counters?.accepted_count) || 0,
    Number(counters?.delivered_count) || 0,
    Number(counters?.failed_count) || 0,
    now,
  ];

  let statusSql = '';
  if (status) {
    statusSql = 'status = ?,';
    params.unshift(status);
  }

  await db.execute(
    `
    UPDATE repasse_email_batches
    SET ${statusSql}
        total_recipients = ?,
        ready_count = ?,
        warning_count = ?,
        error_count = ?,
        accepted_count = ?,
        delivered_count = ?,
        failed_count = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [...params, clean(batchId)]
  );
};

const normalizeMatchText = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeAttachmentToken = (value: unknown) =>
  normalizeMatchText(clean(value).replace(/\.[^.]+$/, '')).replace(/\s+/g, '');

const baseFileName = (value: unknown) => {
  const raw = clean(value).replace(/\\/g, '/');
  const name = raw.split('/').pop() || raw;
  return name.trim();
};

const buildRepasseEmailUploadBatchId = (
  periodRef: string,
  dueDateNf: string,
  rows: RepasseEmailBatchPrepareRow[]
) => {
  const scopeKey = rows
    .map((row) =>
      [
        clean(row.professionalId),
        clean(row.professionalName),
        normalizeEmailAddress(row.recipientEmail),
        clean(row.amountValue),
        clean(row.attachmentCode),
        clean(row.arquivo),
        clean(row.fileName),
      ].join('|')
    )
    .sort()
    .join('||');
  return stableHash64(`repasse-email-upload-batch|${periodRef}|${dueDateNf}|${scopeKey}`);
};

const normalizeRepasseEmailPrepareRows = (input: RepasseEmailBatchPrepareInput) => {
  const rawRows = Array.isArray(input.rows) && input.rows.length ? input.rows : [];
  const rows = rawRows
    .map((row) => {
      const amountValue = parseLocalizedMoneyInput(row.amountValue);
      const arquivo = clean(row.arquivo || row.fileName);
      const fileName = baseFileName(row.fileName || row.arquivo);
      const attachmentCode = clean(row.attachmentCode) || normalizeAttachmentToken(arquivo || row.professionalName);
      return {
        professionalId: clean(row.professionalId),
        professionalName: clean(row.professionalName),
        recipientEmail: normalizeEmailAddress(row.recipientEmail),
        amountValue,
        dueDateNf: clean(row.dueDateNf),
        fileName,
        attachmentCode,
        arquivo,
        observations: clean(row.observations),
        anoReferencia: clean(row.anoReferencia),
        mesReferencia: clean(row.mesReferencia),
      };
    })
    .filter(
      (row) =>
        row.professionalName ||
        row.recipientEmail ||
        row.amountValue !== null ||
        row.fileName ||
        row.attachmentCode
    );

  if (!rows.length) {
    throw new RepasseValidationError('Nenhuma linha valida foi encontrada na planilha enviada.');
  }
  return rows;
};

type RepasseProfessionalMatch = {
  id: string;
  name: string;
  email: string;
  normalizedName: string;
};

const loadRepasseEmailProfessionals = async (db: DbInterface): Promise<RepasseProfessionalMatch[]> => {
  const rows = await db.query(`
    SELECT id, name, email
    FROM professionals
    WHERE COALESCE(is_active, 1) = 1
  `);
  return rows.map((row: Record<string, unknown>) => ({
    id: clean(row.id),
    name: clean(row.name),
    email: normalizeEmailAddress(row.email),
    normalizedName: normalizeMatchText(row.name),
  })).filter((row) => row.id && row.name);
};

const tokenScore = (source: string, candidate: string) => {
  if (!source || !candidate) return 0;
  if (source === candidate) return 1;
  const sourceTokens = source.split(' ').filter((token) => token.length > 1);
  const candidateTokens = candidate.split(' ').filter((token) => token.length > 1);
  if (!sourceTokens.length || !candidateTokens.length) return 0;
  const hits = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
  const overlap = hits / Math.max(sourceTokens.length, candidateTokens.length);
  if (source.includes(candidate) || candidate.includes(source)) return Math.max(overlap, 0.9);
  return overlap;
};

const resolveRepasseEmailProfessional = (
  row: ReturnType<typeof normalizeRepasseEmailPrepareRows>[number],
  professionals: RepasseProfessionalMatch[]
) => {
  const requestedId = clean(row.professionalId);
  if (requestedId) {
    const byId = professionals.find((professional) => professional.id === requestedId);
    if (byId) return { professional: byId, status: 'RESOLVED_ID', score: 1, warning: '' };
    return { professional: null, status: 'UNMATCHED', score: 0, warning: 'PROFESSIONAL_ID nao encontrado em professionals.' };
  }

  if (row.recipientEmail) {
    const byEmail = professionals.filter((professional) => professional.email === row.recipientEmail);
    if (byEmail.length === 1) return { professional: byEmail[0], status: 'RESOLVED_EMAIL', score: 1, warning: '' };
    if (byEmail.length > 1) return { professional: null, status: 'AMBIGUOUS', score: 0, warning: 'Mais de um profissional encontrado com o mesmo e-mail.' };
  }

  const normalizedName = normalizeMatchText(row.professionalName);
  if (normalizedName) {
    const exact = professionals.filter((professional) => professional.normalizedName === normalizedName);
    if (exact.length === 1) return { professional: exact[0], status: 'RESOLVED_NAME', score: 1, warning: '' };
    if (exact.length > 1) return { professional: null, status: 'AMBIGUOUS', score: 0, warning: 'Mais de um profissional encontrado com o mesmo nome.' };

    const scored = professionals
      .map((professional) => ({ professional, score: tokenScore(normalizedName, professional.normalizedName) }))
      .filter((item) => item.score >= 0.86)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 1 || (scored[0] && scored[0].score - (scored[1]?.score || 0) >= 0.12)) {
      return { professional: scored[0].professional, status: 'RESOLVED_APPROX', score: scored[0].score, warning: '' };
    }
    if (scored.length > 1) {
      return { professional: null, status: 'AMBIGUOUS', score: scored[0].score, warning: 'Nome do profissional gerou mais de um candidato forte.' };
    }
  }

  return { professional: null, status: 'UNMATCHED', score: 0, warning: 'Profissional nao encontrado em professionals.' };
};

const isProfessionalMatchResolved = (status: string | null | undefined) =>
  ['RESOLVED_ID', 'RESOLVED_EMAIL', 'RESOLVED_NAME', 'RESOLVED_APPROX', 'MANUAL_CONFIRMED'].includes(clean(status).toUpperCase());

const isAttachmentResolved = (status: string | null | undefined) =>
  clean(status).toUpperCase() === 'RESOLVED';

const isRepasseEmailResendAllowed = (status: string | null | undefined) =>
  ['FAILED', 'SOFT_BOUNCE', 'DEFERRED', 'ACCEPTED_PROVIDER', 'DELIVERED'].includes(clean(status).toUpperCase());

const escapeRepasseEmailHtml = (value: unknown) =>
  clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatRepasseEmailProfessionalDisplayName = (value: string) => {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'profissional';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const formatRepasseEmailBrl = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatRepasseEmailDateBr = (value: string) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  return raw || '-';
};

const formatRepasseEmailPeriodBr = (value: string) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${match[2]}/${match[1]}`;
  return raw || '-';
};

const resolveRepasseEmailLogoUrl = () => {
  const explicit = clean(process.env.REPASSE_EMAIL_LOGO_URL);
  if (explicit) return explicit;
  const base = clean(process.env.NEXTAUTH_URL || process.env.AUTH_URL);
  if (!base) return '/logo-white.png';
  return `${base.replace(/\/+$/g, '')}/logo-white.png`;
};

const buildRepasseEmailObservationsHtml = (observations: string | null) => {
  const text = clean(observations);
  if (!text) return '';
  return `
                    <div class="obs-box">
                        <span class="obs-label">Observações</span>
                        <span class="obs-content">${escapeRepasseEmailHtml(text)}</span>
                    </div>
  `.trim();
};

const renderRepasseEmailContent = (recipient: RepasseEmailRecipient) => {
  const professionalName = recipient.professionalName || 'profissional';
  const professionalDisplayName = formatRepasseEmailProfessionalDisplayName(professionalName);
  const periodRef = recipient.periodRef || '-';
  const dueDateNf = recipient.dueDateNf || '-';
  const amountText = formatRepasseEmailBrl(recipient.amountValue);
  const hasAttachment = Boolean(recipient.storageKey && isAttachmentResolved(recipient.attachmentMatchStatus));
  const escapedProfessionalName = escapeRepasseEmailHtml(professionalDisplayName);
  const periodText = formatRepasseEmailPeriodBr(periodRef);
  const dueDateText = formatRepasseEmailDateBr(dueDateNf);
  const escapedPeriodRef = escapeRepasseEmailHtml(periodText);
  const escapedDueDateNf = escapeRepasseEmailHtml(dueDateText);
  const escapedAmountText = escapeRepasseEmailHtml(amountText);
  const logoUrl = escapeRepasseEmailHtml(resolveRepasseEmailLogoUrl());
  const attachmentText = hasAttachment
    ? 'O relatório detalhado está anexado a este e-mail em formato PDF para sua conferência.'
    : '';
  const attachmentHtml = hasAttachment
    ? '<p>O relatório detalhado está anexado a este e-mail em formato PDF para sua conferência.</p>'
    : '';
  const observationsHtml = buildRepasseEmailObservationsHtml(recipient.observations);
  const subject = `Fechamento Mensal ${periodText} - CONSULTARE`;
  const text = (
    `Ola, ${professionalDisplayName}.\n\n` +
    `Esperamos que esteja bem. Segue o demonstrativo de atendimentos realizados no mes de ${periodText} na Clinica Consultare.\n` +
    `Valor final: ${amountText}.\n` +
    (recipient.observations ? `Observacoes: ${recipient.observations}.\n` : '') +
    (attachmentText ? `${attachmentText}\n` : '') +
    `Solicitamos o envio da NF ate o dia ${dueDateText} para processamento do pagamento no ciclo atual.\n\n` +
    `Atenciosamente,\nFinanceiro Consultare`
  );
  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeRepasseEmailHtml(subject)}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Segoe UI', Tahoma, sans-serif; }
        table { border-spacing: 0; }
        td { padding: 0; }
        img { border: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding: 32px 0 40px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .header { background-color: #053F74; padding: 36px 20px; text-align: center; }
        .logo { width: 280px; max-width: 80%; height: auto; }
        .content { padding: 40px 50px; color: #444444; font-size: 17px; line-height: 1.7; }
        h1 { color: #053F74; font-size: 24px; line-height: 1.25; margin-top: 0; }
        p { font-size: 17px; }
        .value-box { background-color: #f0f9f8; border: 1px solid #229A8A; border-radius: 6px; padding: 20px; text-align: center; margin: 25px 0; }
        .value-label { display: block; font-size: 15px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
        .value-amount { display: block; font-size: 32px; color: #229A8A; font-weight: bold; margin-top: 5px; }
        .obs-box { background-color: #f0f4f8; border: 1px solid #053F74; border-radius: 6px; padding: 20px; text-align: left; margin: 25px 0; }
        .obs-label { display: block; font-size: 13px; color: #053F74; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #d1d9e0; padding-bottom: 5px; }
        .obs-content { display: block; font-size: 16px; color: #444; line-height: 1.55; white-space: pre-line; }
        .alert-section { border-left: 4px solid #3FBD80; background-color: #f9fdfb; padding: 15px 20px; margin-top: 25px; font-size: 16px; }
        .alert-title { color: #259D89; font-weight: bold; display: block; margin-bottom: 5px; }
        .footer { text-align: center; padding: 30px; font-size: 13px; color: #999999; }
    </style>
</head>
<body>
    <div style="display:none; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
        Olá Dr(a). ${escapedProfessionalName}, o demonstrativo de atendimentos de ${escapedPeriodRef} está disponível para conferência.
    </div>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    <img src="${logoUrl}" alt="Consultare" class="logo">
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h1>Olá, Dr(a). ${escapedProfessionalName}!</h1>
                    <p>Esperamos que esteja bem. Segue o demonstrativo de atendimentos realizados no mês de <strong>${escapedPeriodRef}</strong> na Clínica Consultare.</p>
                    <div class="value-box">
                        <span class="value-label">Valor Total a Receber</span>
                        <span class="value-amount">${escapedAmountText}</span>
                    </div>
                    ${observationsHtml}
                    ${attachmentHtml}
                    <div class="alert-section">
                        <span class="alert-title">Prazo para Nota Fiscal</span>
                        Solicitamos o envio da NF até o dia <strong>${escapedDueDateNf}</strong> para processamento do pagamento no ciclo atual.
                    </div>
                    <p style="font-size: 15px; color: #888; margin-top: 30px;">
                        Dúvidas sobre o fechamento? Responda a este e-mail e nossa equipe financeira entrará em contato.
                    </p>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <strong>Clínica Consultare</strong><br>
                    Rua Jacy Teixeira de Camargo, 940 - Campinas/SP<br>
                    Telefone: (19) 3500-1700<br>
                    <br>
                    <p style="font-size: 10px; color: #bbb;">
                        Caso não queira mais receber estes demonstrativos por e-mail, responda com o assunto "Unsubscribe".
                    </p>
                    &copy; 2026 Consultare - Centro Médico Acessível. Todos os direitos reservados.
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
  `.trim();
  return { subject, text, html, hasAttachment };
};

const buildRepasseEmailValidation = (params: {
  professionalName: string;
  recipientEmail: string;
  amountValue: number;
  suppressionReason?: string;
  professionalMatchStatus?: string | null;
  professionalWarning?: string;
  attachmentMatchStatus?: string | null;
}) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!params.professionalName) errors.push('Nome do profissional ausente na planilha.');
  if (!params.recipientEmail) errors.push('E-mail ausente na planilha.');
  else if (!isValidEmailAddress(params.recipientEmail)) errors.push('E-mail invalido na planilha.');
  if (params.suppressionReason) errors.push(`E-mail bloqueado por suppression: ${params.suppressionReason}.`);
  if (!isProfessionalMatchResolved(params.professionalMatchStatus)) {
    warnings.push(params.professionalWarning || 'Vinculo com professional pendente de conferencia.');
  }
  if (!isAttachmentResolved(params.attachmentMatchStatus)) {
    warnings.push('Sem PDF vinculado; o envio sera feito sem anexo.');
  }
  if (params.amountValue <= 0) warnings.push('Valor informado na planilha zerado ou negativo.');

  const validationStatus = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID';
  const sendStatus = errors.length > 0 || !isProfessionalMatchResolved(params.professionalMatchStatus)
    ? 'SKIPPED'
    : 'READY';
  return { errors, warnings, validationStatus, sendStatus };
};

const loadRepasseEmailSuppressions = async (db: DbInterface, emails: string[]) => {
  const normalized = Array.from(new Set(emails.map(normalizeEmailAddress).filter(Boolean)));
  if (!normalized.length) return new Map<string, string>();
  const placeholders = normalized.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT email, reason
    FROM repasse_email_suppressions
    WHERE email IN (${placeholders})
    `,
    normalized
  );
  return new Map(rows.map((row) => {
    const suppression = row as Record<string, unknown>;
    return [normalizeEmailAddress(suppression.email), clean(suppression.reason)] as const;
  }));
};

const refreshRepasseEmailBatchReadiness = async (db: DbInterface, batchId: string) => {
  const rows = await db.query(`SELECT * FROM repasse_email_recipients WHERE batch_id = ?`, [batchId]);
  const recipients = rows.map(mapEmailRecipient);
  if (!recipients.length) return;
  const suppressions = await loadRepasseEmailSuppressions(
    db,
    recipients.map((recipient) => recipient.recipientEmail)
  );
  const now = nowIso();
  for (const recipient of recipients) {
    const validation = buildRepasseEmailValidation({
      professionalName: recipient.professionalName,
      recipientEmail: recipient.recipientEmail,
      amountValue: recipient.amountValue,
      suppressionReason: suppressions.get(recipient.recipientEmail),
      professionalMatchStatus: recipient.professionalMatchStatus,
      professionalWarning: 'Vinculo com professional pendente de conferencia.',
      attachmentMatchStatus: recipient.attachmentMatchStatus,
    });
    await db.execute(
      `
      UPDATE repasse_email_recipients
      SET validation_status = ?,
          validation_errors_json = ?,
          send_status = CASE
            WHEN send_status IN ('IMPORTED', 'READY', 'SKIPPED', 'FAILED', 'SOFT_BOUNCE', 'DEFERRED') THEN ?
            ELSE send_status
          END,
          updated_at = ?
      WHERE id = ?
      `,
      [
        validation.validationStatus,
        JSON.stringify([...validation.errors, ...validation.warnings]),
        validation.sendStatus,
        now,
        recipient.id,
      ]
    );
  }
  await updateRepasseEmailBatchCounters(db, batchId);
};

export const prepareRepasseEmailBatch = async (
  db: DbInterface,
  input: RepasseEmailBatchPrepareInput,
  actorUserId: string
): Promise<{ batch: RepasseEmailBatch; recipients: RepasseEmailRecipient[] }> => {
  await ensureRepasseEmailTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const dueDateNf = normalizeDueDateNf(input.dueDateNf);
  const sheetRows = normalizeRepasseEmailPrepareRows(input);
  const batchId = buildRepasseEmailUploadBatchId(periodRef, dueDateNf, sheetRows);
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO repasse_email_batches (
      id, period_ref, due_date_nf, status, total_recipients, ready_count, warning_count,
      error_count, accepted_count, delivered_count, failed_count, requested_by,
      created_at, updated_at, started_at, finished_at, error
    ) VALUES (?, ?, ?, 'DRAFT', 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, NULL, NULL, NULL)
    ON DUPLICATE KEY UPDATE
      due_date_nf = ?,
      requested_by = ?,
      updated_at = ?,
      error = NULL
    `,
    [batchId, periodRef, dueDateNf, clean(actorUserId), now, now, dueDateNf, clean(actorUserId), now]
  );

  const suppressions = await loadRepasseEmailSuppressions(
    db,
    sheetRows.map((row) => row.recipientEmail || '')
  );
  const professionals = await loadRepasseEmailProfessionals(db);

  for (const [index, row] of sheetRows.entries()) {
    const match = resolveRepasseEmailProfessional(row, professionals);
    const matchedProfessional = match.professional;
    const professionalId = matchedProfessional?.id || `sheet-${stableHash64(`sheet-row|${batchId}|${index}|${row.recipientEmail}`).slice(0, 24)}`;
    const professionalName = row.professionalName || matchedProfessional?.name || professionalId;
    const recipientEmail = row.recipientEmail || '';
    const rowDueDateNf = normalizeDueDateNf(row.dueDateNf || dueDateNf);
    const amountValue = row.amountValue ?? 0;
    const attachmentCode = row.attachmentCode || normalizeAttachmentToken(row.fileName || professionalName);
    const attachmentMatchStatus = 'SEM_ANEXO';
    const validation = buildRepasseEmailValidation({
      professionalName,
      recipientEmail,
      amountValue,
      suppressionReason: recipientEmail ? suppressions.get(recipientEmail) : '',
      professionalMatchStatus: match.status,
      professionalWarning: match.warning,
      attachmentMatchStatus,
    });
    const validationPayload = JSON.stringify([...validation.errors, ...validation.warnings]);
    const recipientId = stableHash64(`repasse-email-recipient|${batchId}|${professionalId}|${recipientEmail}|${attachmentCode}|${amountValue}`);
    const originalSheetRowJson = JSON.stringify({
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      recipientEmail: row.recipientEmail,
      amountValue: row.amountValue,
      dueDateNf: row.dueDateNf,
      arquivo: row.arquivo,
      fileName: row.fileName,
      attachmentCode,
      observations: row.observations,
      anoReferencia: row.anoReferencia,
      mesReferencia: row.mesReferencia,
    });

    await db.execute(
      `
      INSERT INTO repasse_email_recipients (
        id, batch_id, period_ref, professional_id, professional_name, recipient_email,
        amount_value, due_date_nf, pdf_artifact_id, storage_provider, storage_bucket, storage_key,
        drive_file_id, drive_file_url, file_name, professional_match_status, professional_match_score,
        attachment_match_status, attachment_source, attachment_code, original_sheet_row_json, observations,
        attachment_size_bytes, attachment_content_type, validation_status, validation_errors_json, send_status, last_message_id,
        last_provider_message_id, last_event_type, last_event_at, manual_confirmed_by,
        manual_confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
      ON DUPLICATE KEY UPDATE
        professional_name = ?,
        recipient_email = ?,
        amount_value = ?,
        due_date_nf = ?,
        file_name = ?,
        professional_match_status = ?,
        professional_match_score = ?,
        attachment_match_status = CASE
          WHEN attachment_match_status = 'RESOLVED' THEN attachment_match_status
          ELSE ?
        END,
        attachment_source = CASE
          WHEN attachment_match_status = 'RESOLVED' THEN attachment_source
          ELSE NULL
        END,
        attachment_code = ?,
        original_sheet_row_json = ?,
        observations = ?,
        validation_status = ?,
        validation_errors_json = ?,
        send_status = CASE
          WHEN send_status IN ('IMPORTED', 'READY', 'SKIPPED', 'FAILED', 'SOFT_BOUNCE', 'DEFERRED') THEN ?
          ELSE send_status
        END,
        updated_at = ?
      `,
      [
        recipientId,
        batchId,
        periodRef,
        professionalId,
        professionalName,
        recipientEmail,
        amountValue,
        rowDueDateNf,
        row.fileName || row.arquivo || null,
        match.status,
        Number(match.score.toFixed(4)),
        attachmentMatchStatus,
        attachmentCode,
        originalSheetRowJson,
        row.observations || null,
        validation.validationStatus,
        validationPayload,
        validation.sendStatus,
        now,
        now,
        professionalName,
        recipientEmail,
        amountValue,
        rowDueDateNf,
        row.fileName || row.arquivo || null,
        match.status,
        Number(match.score.toFixed(4)),
        attachmentMatchStatus,
        attachmentCode,
        originalSheetRowJson,
        row.observations || null,
        validation.validationStatus,
        validationPayload,
        validation.sendStatus,
        now,
      ]
    );
  }

  const counters = (await db.query(batchCountersSql, [batchId]))[0] as Record<string, unknown> | undefined;
  const nextStatus = Number(counters?.ready_count) > 0 ? 'READY' : 'DRAFT';
  await updateRepasseEmailBatchCounters(db, batchId, nextStatus);

  const batchRows = await db.query(`SELECT * FROM repasse_email_batches WHERE id = ? LIMIT 1`, [batchId]);
  const recipients = await listRepasseEmailRecipients(db, { batchId, limit: 500 });
  return {
    batch: mapEmailBatch(batchRows[0]),
    recipients: recipients.items,
  };
};

export const listRepasseEmailBatches = async (
  db: DbInterface,
  filters: RepasseEmailBatchListFilters = {}
): Promise<{ items: RepasseEmailBatch[]; total: number }> => {
  await ensureRepasseEmailTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);
  if (periodRef) {
    where.push('b.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('b');
  const rows = await db.query(
    `
    SELECT b.*, COALESCE(u.name, u.email, b.requested_by) as requested_by_display
    FROM repasse_email_batches b
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY b.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );
  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_email_batches b
    WHERE ${where.join(' AND ')}
    `,
    params
  );
  return {
    items: rows.map(mapEmailBatch),
    total: readCount(countRows[0]),
  };
};

export const getRepasseEmailBatchById = async (
  db: DbInterface,
  batchIdRaw: string
): Promise<RepasseEmailBatch | null> => {
  await ensureRepasseEmailTables(db);
  const batchId = clean(batchIdRaw);
  if (!batchId) return null;
  const rows = await db.query(`SELECT * FROM repasse_email_batches WHERE id = ? LIMIT 1`, [batchId]);
  return rows.length ? mapEmailBatch(rows[0]) : null;
};

export const listRepasseEmailRecipients = async (
  db: DbInterface,
  filters: RepasseEmailRecipientListFilters
): Promise<{ items: RepasseEmailRecipient[]; total: number }> => {
  await ensureRepasseEmailTables(db);
  const batchId = clean(filters.batchId);
  if (!batchId) throw new RepasseValidationError('Lote de e-mail invalido.');
  const where: string[] = ['batch_id = ?'];
  const params: any[] = [batchId];
  const status = clean(filters.status).toUpperCase();
  const limit = normalizeLimit(filters.limit, 500);
  await refreshRepasseEmailBatchReadiness(db, batchId);
  if (status && status !== 'ALL') {
    where.push('send_status = ?');
    params.push(status);
  }
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_email_recipients
    WHERE ${where.join(' AND ')}
    ORDER BY professional_name ASC
    LIMIT ?
    `,
    [...params, limit]
  );
  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_email_recipients
    WHERE ${where.join(' AND ')}
    `,
    params
  );
  return {
    items: rows.map(mapEmailRecipient),
    total: readCount(countRows[0]),
  };
};

export const getRepasseEmailRecipientPreview = async (
  db: DbInterface,
  recipientIdRaw: string
): Promise<{ recipient: RepasseEmailRecipient; subject: string; text: string; html: string; hasAttachment: boolean }> => {
  await ensureRepasseEmailTables(db);
  const recipientId = clean(recipientIdRaw);
  if (!recipientId) throw new RepasseValidationError('Destinatario invalido.');
  const rows = await db.query(`SELECT * FROM repasse_email_recipients WHERE id = ? LIMIT 1`, [recipientId]);
  if (!rows.length) throw new RepasseValidationError('Destinatario nao encontrado.', 404);
  const recipient = mapEmailRecipient(rows[0]);
  return {
    recipient,
    ...renderRepasseEmailContent(recipient),
  };
};

const refreshRepasseEmailRecipientReadiness = async (db: DbInterface, recipientId: string) => {
  const rows = await db.query(`SELECT * FROM repasse_email_recipients WHERE id = ? LIMIT 1`, [recipientId]);
  if (!rows.length) return null;
  const recipient = mapEmailRecipient(rows[0]);
  const suppressions = await loadRepasseEmailSuppressions(db, [recipient.recipientEmail]);
  const validation = buildRepasseEmailValidation({
    professionalName: recipient.professionalName,
    recipientEmail: recipient.recipientEmail,
    amountValue: recipient.amountValue,
    suppressionReason: suppressions.get(recipient.recipientEmail),
    professionalMatchStatus: recipient.professionalMatchStatus,
    professionalWarning: 'Vinculo com professional pendente de conferencia.',
    attachmentMatchStatus: recipient.attachmentMatchStatus,
  });
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_email_recipients
    SET validation_status = ?,
        validation_errors_json = ?,
        send_status = CASE
          WHEN send_status IN ('IMPORTED', 'READY', 'SKIPPED', 'FAILED', 'SOFT_BOUNCE', 'DEFERRED') THEN ?
          ELSE send_status
        END,
        updated_at = ?
    WHERE id = ?
    `,
    [validation.validationStatus, JSON.stringify([...validation.errors, ...validation.warnings]), validation.sendStatus, now, recipientId]
  );
  const updated = await db.query(`SELECT * FROM repasse_email_recipients WHERE id = ? LIMIT 1`, [recipientId]);
  return updated[0] ? mapEmailRecipient(updated[0]) : null;
};

export type RepasseEmailAttachmentUploadInput = {
  recipientId?: string | null;
  fileName: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  sizeBytes: number;
  contentType: string;
  source?: 'bulk' | 'individual';
};

const updateRecipientAttachment = async (
  db: DbInterface,
  recipientId: string,
  attachment: RepasseEmailAttachmentUploadInput,
  status = 'RESOLVED'
) => {
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_email_recipients
    SET storage_provider = ?,
        storage_bucket = ?,
        storage_key = ?,
        drive_file_id = NULL,
        drive_file_url = NULL,
        file_name = ?,
        attachment_match_status = ?,
        attachment_source = ?,
        attachment_size_bytes = ?,
        attachment_content_type = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [
      attachment.storageProvider,
      attachment.storageBucket,
      attachment.storageKey,
      attachment.fileName,
      status,
      attachment.source || 'bulk',
      attachment.sizeBytes,
      attachment.contentType,
      now,
      recipientId,
    ]
  );
  return refreshRepasseEmailRecipientReadiness(db, recipientId);
};

const markRecipientAttachmentAmbiguous = async (db: DbInterface, recipientId: string) => {
  await db.execute(
    `
    UPDATE repasse_email_recipients
    SET attachment_match_status = 'ANEXO_AMBIGUO',
        storage_provider = NULL,
        storage_bucket = NULL,
        storage_key = NULL,
        updated_at = ?
    WHERE id = ?
    `,
    [nowIso(), recipientId]
  );
  return refreshRepasseEmailRecipientReadiness(db, recipientId);
};

export const attachRepasseEmailBatchFiles = async (
  db: DbInterface,
  batchIdRaw: string,
  attachments: RepasseEmailAttachmentUploadInput[],
  actorUserId: string
): Promise<{ matched: number; unmatched: number; ambiguous: number; recipients: RepasseEmailRecipient[] }> => {
  await ensureRepasseEmailTables(db);
  void actorUserId;
  const batchId = clean(batchIdRaw);
  if (!batchId) throw new RepasseValidationError('Lote de e-mail invalido.');
  if (!attachments.length) throw new RepasseValidationError('Nenhum PDF valido enviado.');

  const existingRows = await db.query(
    `SELECT * FROM repasse_email_recipients WHERE batch_id = ? ORDER BY professional_name ASC`,
    [batchId]
  );
  const recipients = existingRows.map(mapEmailRecipient);
  if (!recipients.length) throw new RepasseValidationError('Lote sem destinatarios importados.', 404);

  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;

  for (const attachment of attachments) {
    const targetRecipientId = clean(attachment.recipientId);
    if (targetRecipientId) {
      const target = recipients.find((recipient) => recipient.id === targetRecipientId);
      if (!target) {
        unmatched += 1;
        continue;
      }
      await updateRecipientAttachment(db, target.id, { ...attachment, source: 'individual' });
      matched += 1;
      continue;
    }

    const fileToken = normalizeAttachmentToken(baseFileName(attachment.fileName));
    const available = recipients.filter((recipient) => recipient.attachmentMatchStatus !== 'RESOLVED');
    const findBy = (selector: (recipient: RepasseEmailRecipient) => string | null | undefined) =>
      available.filter((recipient) => normalizeAttachmentToken(selector(recipient)) === fileToken);

    let candidates = findBy((recipient) => recipient.attachmentCode);
    if (!candidates.length) candidates = findBy((recipient) => recipient.fileName);
    if (!candidates.length) candidates = findBy((recipient) => recipient.professionalName);

    if (candidates.length === 1) {
      await updateRecipientAttachment(db, candidates[0].id, { ...attachment, source: 'bulk' });
      candidates[0].attachmentMatchStatus = 'RESOLVED';
      matched += 1;
    } else if (candidates.length > 1) {
      ambiguous += 1;
      for (const candidate of candidates) {
        await markRecipientAttachmentAmbiguous(db, candidate.id);
      }
    } else {
      unmatched += 1;
    }
  }

  const refreshed = await listRepasseEmailRecipients(db, { batchId, limit: 1000 });
  await updateRepasseEmailBatchCounters(db, batchId, refreshed.items.some((item) => item.sendStatus === 'READY') ? 'READY' : 'DRAFT');
  return { matched, unmatched, ambiguous, recipients: refreshed.items };
};

const getRepasseEmailRecipientRowsForJob = async (
  db: DbInterface,
  batchId: string,
  scope: RepasseEmailJobScope,
  recipientIds: string[]
) => {
  const where: string[] = ['r.batch_id = ?'];
  const params: any[] = [batchId];
  const allowedStatuses = ['READY'];

  if (scope === 'selected') {
    if (!recipientIds.length) {
      throw new RepasseValidationError('Selecione ao menos um destinatario para enfileirar.');
    }
    where.push(`r.id IN (${recipientIds.map(() => '?').join(', ')})`);
    params.push(...recipientIds);
    allowedStatuses.push('FAILED', 'SOFT_BOUNCE', 'DEFERRED', 'ACCEPTED_PROVIDER', 'DELIVERED');
  } else if (scope === 'retry_failed') {
    allowedStatuses.splice(0, allowedStatuses.length, 'FAILED', 'SOFT_BOUNCE', 'DEFERRED');
  }

  where.push(`r.send_status IN (${allowedStatuses.map(() => '?').join(', ')})`);
  params.push(...allowedStatuses);

  const rows = await db.query(
    `
    SELECT r.*
    FROM repasse_email_recipients r
    LEFT JOIN repasse_email_suppressions s ON s.email = r.recipient_email
    WHERE ${where.join(' AND ')}
      AND s.id IS NULL
      AND r.professional_match_status IN ('RESOLVED_ID', 'RESOLVED_EMAIL', 'RESOLVED_NAME', 'RESOLVED_APPROX', 'MANUAL_CONFIRMED')
    ORDER BY r.professional_name ASC
    `,
    params
  );
  return rows.map(mapEmailRecipient);
};

export const createRepasseEmailJob = async (
  db: DbInterface,
  input: RepasseEmailJobInput,
  actorUserId: string
): Promise<RepasseEmailJob> => {
  await ensureRepasseEmailTables(db);
  const batchId = clean(input.batchId);
  const batch = await getRepasseEmailBatchById(db, batchId);
  if (!batch) throw new RepasseValidationError('Lote de e-mail nao encontrado.', 404);
  const recipientIds = parseJsonStringArray(JSON.stringify(input.recipientIds || []));
  const scope = normalizeEmailJobScope(input.scope, recipientIds.length > 0);
  const recipients = await getRepasseEmailRecipientRowsForJob(db, batchId, scope, recipientIds);
  if (!recipients.length) {
    throw new RepasseValidationError('Nenhum destinatario elegivel para envio no lote.');
  }

  const now = nowIso();
  const jobId = randomUUID();
  const selectedIds = recipients.map((recipient) => recipient.id);
  await db.execute(
    `
    INSERT INTO repasse_email_jobs (
      id, batch_id, period_ref, scope, recipient_ids_json, status, requested_by,
      started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, NULL, NULL, ?, ?)
    `,
    [jobId, batchId, batch.periodRef, scope, JSON.stringify(selectedIds), clean(actorUserId), now, now]
  );

  const placeholders = selectedIds.map(() => '?').join(', ');
  await db.execute(
    `
    UPDATE repasse_email_recipients
    SET send_status = 'QUEUED',
        updated_at = ?
    WHERE id IN (${placeholders})
    `,
    [now, ...selectedIds]
  );
  await updateRepasseEmailBatchCounters(db, batchId, 'QUEUED');

  const rows = await db.query(`SELECT * FROM repasse_email_jobs WHERE id = ? LIMIT 1`, [jobId]);
  return mapEmailJob(rows[0]);
};

export const listRepasseEmailJobs = async (
  db: DbInterface,
  filters: RepasseEmailJobListFilters = {}
): Promise<{ items: RepasseEmailJob[]; total: number }> => {
  await ensureRepasseEmailTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];
  const batchId = clean(filters.batchId);
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);
  if (batchId) {
    where.push('j.batch_id = ?');
    params.push(batchId);
  }
  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');
  const rows = await db.query(
    `
    SELECT j.*, COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_email_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );
  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_email_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );
  return {
    items: rows.map(mapEmailJob),
    total: readCount(countRows[0]),
  };
};

export const createRetryRepasseEmailRecipientJob = async (
  db: DbInterface,
  recipientIdRaw: string,
  actorUserId: string
): Promise<RepasseEmailJob> => {
  await ensureRepasseEmailTables(db);
  const recipientId = clean(recipientIdRaw);
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_email_recipients
    WHERE id = ?
    LIMIT 1
    `,
    [recipientId]
  );
  if (!rows.length) throw new RepasseValidationError('Destinatario nao encontrado.', 404);
  const recipient = mapEmailRecipient(rows[0]);
  if (!isRepasseEmailResendAllowed(recipient.sendStatus)) {
    throw new RepasseValidationError('Apenas e-mails enviados ou falhas recuperaveis podem ser reenviados.');
  }
  const suppressions = await loadRepasseEmailSuppressions(db, [recipient.recipientEmail]);
  if (suppressions.has(recipient.recipientEmail)) {
    throw new RepasseValidationError('Destinatario bloqueado por suppression.');
  }
  return createRepasseEmailJob(
    db,
    {
      batchId: recipient.batchId,
      scope: 'selected',
      recipientIds: [recipient.id],
    },
    actorUserId
  );
};

export const markRepasseEmailRecipientManualConfirmed = async (
  db: DbInterface,
  recipientIdRaw: string,
  actorUserId: string
): Promise<RepasseEmailRecipient> => {
  await ensureRepasseEmailTables(db);
  const recipientId = clean(recipientIdRaw);
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_email_recipients
    WHERE id = ?
    LIMIT 1
    `,
    [recipientId]
  );
  if (!rows.length) throw new RepasseValidationError('Destinatario nao encontrado.', 404);
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_email_recipients
    SET professional_match_status = 'MANUAL_CONFIRMED',
        manual_confirmed_by = ?,
        manual_confirmed_at = ?,
        last_event_type = 'manual_confirmed',
        last_event_at = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [clean(actorUserId), now, now, now, recipientId]
  );
  const recipient = await refreshRepasseEmailRecipientReadiness(db, recipientId);
  if (!recipient) throw new RepasseValidationError('Destinatario nao encontrado.', 404);
  await updateRepasseEmailBatchCounters(db, recipient.batchId);
  return recipient;
};

const normalizeMailerSendEventStatus = (eventType: string): RepasseEmailRecipientSendStatus | null => {
  const normalized = clean(eventType).toLowerCase();
  if (normalized === 'activity.sent') return 'ACCEPTED_PROVIDER';
  if (normalized === 'activity.delivered') return 'DELIVERED';
  if (normalized === 'activity.soft_bounced') return 'SOFT_BOUNCE';
  if (normalized === 'activity.hard_bounced') return 'HARD_BOUNCE';
  if (normalized === 'activity.deferred') return 'DEFERRED';
  if (normalized === 'activity.spam_complaint') return 'SPAM_COMPLAINT';
  if (normalized.includes('failed') || normalized.includes('rejected')) return 'FAILED';
  return null;
};

const getMailerSendProviderMessageId = (payload: any) => {
  const data = payload?.data || {};
  return (
    clean(data.message_id) ||
    clean(data.email_id) ||
    clean(data?.email?.message?.id) ||
    clean(data?.email?.id) ||
    clean(data?.message?.id)
  );
};

export const processRepasseMailerSendWebhookEvent = async (
  db: DbInterface,
  payload: any
): Promise<RepasseEmailEvent> => {
  await ensureRepasseEmailTables(db);
  const eventType = clean(payload?.type);
  if (!eventType) throw new RepasseValidationError('Payload MailerSend sem tipo de evento.');
  const data = payload?.data || {};
  const provider = 'mailersend';
  const providerMessageId = getMailerSendProviderMessageId(payload);
  const providerEventId =
    clean(data.id) ||
    stableHash64(`${eventType}|${providerMessageId}|${clean(payload?.created_at)}|${JSON.stringify(payload)}`).slice(
      0,
      180
    );

  const existingRows = await db.query(
    `
    SELECT *
    FROM repasse_email_events
    WHERE provider = ?
      AND provider_event_id = ?
    LIMIT 1
    `,
    [provider, providerEventId]
  );
  if (existingRows.length) return mapEmailEvent(existingRows[0]);

  const status = normalizeMailerSendEventStatus(eventType);
  let messageRow: any = null;
  if (providerMessageId) {
    const messageRows = await db.query(
      `
      SELECT *
      FROM repasse_email_messages
      WHERE provider = ?
        AND (provider_message_id = ? OR message_id = ?)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [provider, providerMessageId, providerMessageId]
    );
    messageRow = messageRows[0] || null;
  }

  const messageId = clean(messageRow?.message_id) || null;
  const recipientId = clean(messageRow?.recipient_id) || null;
  const batchId = clean(messageRow?.batch_id) || null;
  const now = nowIso();
  const processingStatus: RepasseEmailEventProcessingStatus = status && messageRow ? 'PROCESSED' : 'IGNORED';
  const eventId = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_email_events (
      id, provider, provider_event_id, provider_message_id, message_id, recipient_id,
      batch_id, event_type, normalized_status, payload_json, received_at, processed_at,
      processing_status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      eventId,
      provider,
      providerEventId,
      providerMessageId || null,
      messageId,
      recipientId,
      batchId,
      eventType,
      status || 'IGNORED',
      JSON.stringify(payload),
      now,
      now,
      processingStatus,
      status ? null : 'Evento sem mapeamento operacional.',
    ]
  );

  if (status && messageRow) {
    await db.execute(
      `
      UPDATE repasse_email_messages
      SET status = ?,
          updated_at = ?
      WHERE id = ?
      `,
      [status, now, clean(messageRow.id)]
    );
    await db.execute(
      `
      UPDATE repasse_email_recipients
      SET send_status = ?,
          last_provider_message_id = COALESCE(?, last_provider_message_id),
          last_event_type = ?,
          last_event_at = ?,
          updated_at = ?
      WHERE id = ?
      `,
      [status, providerMessageId || null, eventType, now, now, recipientId]
    );

    if (status === 'HARD_BOUNCE' || status === 'SPAM_COMPLAINT') {
      const recipientRows = await db.query(
        `SELECT recipient_email FROM repasse_email_recipients WHERE id = ? LIMIT 1`,
        [recipientId]
      );
      const email = normalizeEmailAddress((recipientRows[0] as any)?.recipient_email || data.email);
      if (email) {
        await db.execute(
          `
          INSERT INTO repasse_email_suppressions (
            id, email, reason, provider, source_event_id, created_at, created_by, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            reason = ?,
            provider = ?,
            source_event_id = ?,
            notes = ?
          `,
          [
            randomUUID(),
            email,
            status,
            provider,
            eventId,
            now,
            'mailersend_webhook',
            eventType,
            status,
            provider,
            eventId,
            eventType,
          ]
        );
      }
    }

    if (batchId) await updateRepasseEmailBatchCounters(db, batchId);
  }

  const rows = await db.query(`SELECT * FROM repasse_email_events WHERE id = ? LIMIT 1`, [eventId]);
  return mapEmailEvent(rows[0]);
};

export const listRepasseEmailEvents = async (
  db: DbInterface,
  filters: RepasseEmailEventListFilters = {}
): Promise<{ items: RepasseEmailEvent[]; total: number }> => {
  await ensureRepasseEmailTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];
  const batchId = clean(filters.batchId);
  const recipientId = clean(filters.recipientId);
  const limit = normalizeLimit(filters.limit, 100);
  if (batchId) {
    where.push('batch_id = ?');
    params.push(batchId);
  }
  if (recipientId) {
    where.push('recipient_id = ?');
    params.push(recipientId);
  }
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_email_events
    WHERE ${where.join(' AND ')}
    ORDER BY received_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );
  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_email_events
    WHERE ${where.join(' AND ')}
    `,
    params
  );
  return {
    items: rows.map(mapEmailEvent),
    total: readCount(countRows[0]),
  };
};

export const createRepasseSyncJob = async (
  db: DbInterface,
  input: RepasseSyncJobInput,
  actorUserId: string
): Promise<RepasseSyncJob> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  const scope = normalizeSyncScope(input?.scope, professionalIds.length > 0);
  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }
  if (scope === 'single' && professionalIds.length !== 1) {
    throw new RepasseValidationError('Escopo single exige exatamente um profissional.');
  }
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_sync_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by, started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_sync_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapSyncJob(rows[0]);
};

export const listRepasseSyncJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepasseSyncJob[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_sync_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_sync_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapSyncJob),
    total: readCount(countRows[0]),
  };
};

export const createRepassePdfJob = async (
  db: DbInterface,
  input: RepassePdfJobInput,
  actorUserId: string
): Promise<RepassePdfJob> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const scope = normalizeScope(input?.scope);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }

  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_pdf_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by,
      started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapPdfJob(rows[0]);
};

export const listRepassePdfJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepassePdfJob[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_pdf_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_pdf_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapPdfJob),
    total: readCount(countRows[0]),
  };
};

export const listRepasseProfessionalSummaries = async (
  db: DbInterface,
  filters: RepasseProfessionalListFilters = {}
): Promise<RepasseProfessionalListResult> => {
  await ensureRepasseTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeProfessionalStatusFilter(filters.status);
  const page = normalizePage(filters.page);
  const pageSize = normalizeLimit(filters.pageSize, 50);

  const loaded = await loadRepasseProfessionalSummaries(db, { periodRef, search });
  const allItems = loaded.items;
  const stats = loaded.stats;

  const filteredItems =
    statusFilter === 'all'
      ? allItems
      : allItems.filter((item) => item.status.toLowerCase() === statusFilter);

  const total = filteredItems.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filteredItems.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
    stats,
  };
};

export const listRepasseProfessionalIds = async (
  db: DbInterface,
  filters: Pick<RepasseProfessionalListFilters, 'periodRef' | 'search' | 'status'> = {}
): Promise<string[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeProfessionalStatusFilter(filters.status);

  const loaded = await loadRepasseProfessionalSummaries(db, { periodRef, search });
  const filteredItems =
    statusFilter === 'all'
      ? loaded.items
      : loaded.items.filter((item) => item.status.toLowerCase() === statusFilter);
  return filteredItems.map((item) => item.professionalId);
};

export const listRepasseProfessionalOptions = async (
  db: DbInterface,
  input: { search?: string; limit?: number } = {}
): Promise<RepasseProfessionalOption[]> => {
  await ensureRepasseTables(db);
  const search = clean(input.search);
  const limit = normalizeOptionLimit(input.limit, 500);
  const searchPattern = `%${search.toUpperCase()}%`;

  const rows = await db.query(
    `
    SELECT professional_id, professional_name
    FROM (
      SELECT id as professional_id, name as professional_name
      FROM professionals
      WHERE is_active = 1
        AND (? = '' OR UPPER(name) LIKE ?)
      UNION
      SELECT professional_id, professional_name
      FROM feegow_repasse_consolidado
      WHERE is_active = 1
        AND (? = '' OR UPPER(professional_name) LIKE ?)
    ) unioned
    ORDER BY professional_name ASC
    LIMIT ?
    `,
    [search, searchPattern, search, searchPattern, limit]
  );

  return rows
    .map((row) => ({
      professionalId: clean((row as any).professional_id),
      professionalName: clean((row as any).professional_name),
    }))
    .filter((row) => row.professionalId && row.professionalName);
};

export const upsertRepasseProfessionalNote = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    note?: string | null;
    internalNote?: string | null;
  },
  actorUserId: string
): Promise<{
  periodRef: string;
  professionalId: string;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
}> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    throw new RepasseValidationError('Profissional invalido para salvar observacao.');
  }
  const hasNote = Object.prototype.hasOwnProperty.call(input, 'note');
  const hasInternalNote = Object.prototype.hasOwnProperty.call(input, 'internalNote');
  if (!hasNote && !hasInternalNote) {
    throw new RepasseValidationError(
      'Informe ao menos um campo para atualizacao (note ou internalNote).'
    );
  }

  const currentRows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_professional_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  const current = (currentRows?.[0] as any) || null;
  const currentNote = current ? clean(current.note) || null : null;
  const currentInternalNote = current ? clean(current.internal_note) || null : null;

  const note = hasNote ? clean(input.note) || null : currentNote;
  const internalNote = hasInternalNote ? clean(input.internalNote) || null : currentInternalNote;
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO repasse_professional_notes (
      period_ref, professional_id, note, internal_note, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      note = ?,
      internal_note = ?,
      updated_by = ?,
      updated_at = ?
    `,
    [
      periodRef,
      professionalId,
      note,
      internalNote,
      clean(actorUserId),
      now,
      note,
      internalNote,
      clean(actorUserId),
      now,
    ]
  );

  return { periodRef, professionalId, note, internalNote, updatedAt: now };
};

export const getRepasseProfessionalNote = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{ note: string | null; internalNote: string | null }> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return { note: null, internalNote: null };
  const rows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_professional_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  if (!rows?.length) return { note: null, internalNote: null };
  return {
    note: clean((rows[0] as any).note) || null,
    internalNote: clean((rows[0] as any).internal_note) || null,
  };
};

export const getRepasseProfessionalPaymentMinimum = async (
  db: DbInterface,
  professionalIdRaw: string
): Promise<string | null> => {
  await ensureRepasseTables(db);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return null;
  const rows = await db.query(
    `
    SELECT payment_minimum_text
    FROM professionals
    WHERE id = ?
    LIMIT 1
    `,
    [professionalId]
  );
  if (!rows?.length) return null;
  return clean((rows[0] as any).payment_minimum_text) || null;
};

export type RepassePdfJobRow = RepassePdfJob;

export type RepassePdfJobTargetProfessional = {
  professionalId: string;
  professionalName: string;
};

export type RepasseConsolidatedLine = {
  invoiceId: string;
  dataExec: string;
  paciente: string;
  descricao: string;
  funcao: string;
  convenio: string;
  repasseValue: number;
};

export const getNextPendingRepassePdfJob = async (
  db: DbInterface
): Promise<RepassePdfJobRow | null> => {
  await ensureRepasseTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_jobs
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 1
    `
  );
  if (!rows.length) return null;
  return mapPdfJob(rows[0]);
};

export const markRepassePdfJobRunning = async (db: DbInterface, jobId: string) => {
  await ensureRepasseTables(db);
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_pdf_jobs
    SET status = 'RUNNING',
        started_at = ?,
        finished_at = NULL,
        error = NULL,
        updated_at = ?
    WHERE id = ?
    `,
    [now, now, clean(jobId)]
  );
};

export const markRepassePdfJobFinished = async (
  db: DbInterface,
  jobId: string,
  status: RepassePdfJob['status'],
  errorMessage?: string | null
) => {
  await ensureRepasseTables(db);
  const now = nowIso();
  await db.execute(
    `
    UPDATE repasse_pdf_jobs
    SET status = ?,
        finished_at = ?,
        error = ?,
        updated_at = ?
    WHERE id = ?
    `,
    [status, now, clean(errorMessage) || null, now, clean(jobId)]
  );
};

export const listRepassePdfTargetProfessionals = async (
  db: DbInterface,
  job: RepassePdfJobRow
): Promise<RepassePdfJobTargetProfessional[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(job.periodRef);

  if (job.scope === 'all_with_data') {
    const rows = await db.query(
      `
      SELECT professional_id, professional_name
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
      GROUP BY professional_id, professional_name
      ORDER BY professional_name ASC
      `,
      [periodRef]
    );
    return rows.map((row) => ({
      professionalId: clean(row.professional_id),
      professionalName: clean(row.professional_name),
    }));
  }

  const ids = normalizeProfessionalIds(job.professionalIds);
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT id, name
    FROM professionals
    WHERE id IN (${placeholders})
    ORDER BY name ASC
    `,
    ids
  );

  const byId = new Map(
    rows.map((row) => [clean(row.id), clean(row.name)] as const)
  );
  return ids.map((id) => ({
    professionalId: id,
    professionalName: byId.get(id) || id,
  }));
};

export const listRepasseConsolidatedLinesByProfessional = async (
  db: DbInterface,
  periodRefRaw: string,
  professionalIdRaw: string
): Promise<RepasseConsolidatedLine[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(periodRefRaw);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) return [];

  const rows = await db.query(
    `
    SELECT invoice_id, data_exec, paciente, descricao, funcao, convenio, repasse_value
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    ORDER BY data_exec ASC, paciente ASC, invoice_id ASC
    `,
    [periodRef, professionalId]
  );

  return rows.map((row) => ({
    invoiceId: clean((row as any).invoice_id),
    dataExec: clean(row.data_exec),
    paciente: clean(row.paciente),
    descricao: clean(row.descricao),
    funcao: clean(row.funcao),
    convenio: clean(row.convenio),
    repasseValue: Number(row.repasse_value) || 0,
  }));
};

export const createRepassePdfArtifact = async (
  db: DbInterface,
  payload: {
    pdfJobId: string;
    periodRef: string;
    professionalId: string;
    professionalName: string;
    storageProvider: string;
    storageBucket?: string | null;
    storageKey: string;
    fileName: string;
    sizeBytes: number;
  }
): Promise<RepassePdfArtifact> => {
  await ensureRepasseTables(db);
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_pdf_artifacts (
      id, pdf_job_id, period_ref, professional_id, professional_name,
      storage_provider, storage_bucket, storage_key, file_name, size_bytes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      clean(payload.pdfJobId),
      normalizePeriodRef(payload.periodRef),
      clean(payload.professionalId),
      clean(payload.professionalName),
      clean(payload.storageProvider),
      clean(payload.storageBucket) || null,
      clean(payload.storageKey),
      clean(payload.fileName),
      Math.max(0, Math.floor(Number(payload.sizeBytes) || 0)),
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );
  return mapPdfArtifact(rows[0]);
};

export const listRepassePdfArtifactsByPeriodProfessional = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<RepassePdfArtifact[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return [];

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE period_ref = ?
      AND professional_id = ?
    ORDER BY created_at DESC
    `,
    [periodRef, professionalId]
  );
  return rows.map(mapPdfArtifact);
};

export const listLatestRepassePdfArtifactsByPeriodProfessionals = async (
  db: DbInterface,
  input: { periodRef?: string; professionalIds: string[] }
): Promise<RepassePdfArtifact[]> => {
  await ensureRepasseTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalIds = normalizeProfessionalIds(input.professionalIds);
  if (!professionalIds.length) return [];

  const placeholders = professionalIds.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE period_ref = ?
      AND professional_id IN (${placeholders})
    ORDER BY professional_id ASC, created_at DESC, id DESC
    `,
    [periodRef, ...professionalIds]
  );

  const latestByProfessional = new Map<string, RepassePdfArtifact>();
  for (const row of rows) {
    const mapped = mapPdfArtifact(row);
    if (!mapped.professionalId || latestByProfessional.has(mapped.professionalId)) continue;
    latestByProfessional.set(mapped.professionalId, mapped);
  }

  return professionalIds
    .map((professionalId) => latestByProfessional.get(professionalId) || null)
    .filter((artifact): artifact is RepassePdfArtifact => Boolean(artifact));
};

export const deleteRepassePdfArtifactsByIds = async (
  db: DbInterface,
  artifactIds: string[]
): Promise<number> => {
  await ensureRepasseTables(db);
  const ids = Array.from(new Set((artifactIds || []).map((id) => clean(id)).filter(Boolean)));
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  await db.execute(
    `
    DELETE FROM repasse_pdf_artifacts
    WHERE id IN (${placeholders})
    `,
    ids
  );
  return ids.length;
};

export const listRepassePdfArtifacts = async (
  db: DbInterface,
  filters: RepassePdfArtifactListFilters = {}
): Promise<{ items: RepassePdfArtifact[]; total: number }> => {
  await ensureRepasseTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const professionalId = clean(filters.professionalId);
  const limit = normalizeLimit(filters.limit, 50);

  if (periodRef) {
    where.push('period_ref = ?');
    params.push(periodRef);
  }
  if (professionalId) {
    where.push('professional_id = ?');
    params.push(professionalId);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_pdf_artifacts
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapPdfArtifact),
    total: readCount(countRows[0]),
  };
};

export const getRepassePdfArtifactById = async (
  db: DbInterface,
  artifactId: string
): Promise<RepassePdfArtifact | null> => {
  await ensureRepasseTables(db);
  const cleanId = clean(artifactId);
  if (!cleanId) return null;

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_pdf_artifacts
    WHERE id = ?
    LIMIT 1
    `,
    [cleanId]
  );
  if (!rows.length) return null;
  return mapPdfArtifact(rows[0]);
};

export const createRepasseConsolidacaoJob = async (
  db: DbInterface,
  input: RepasseConsolidacaoJobInput,
  actorUserId: string
): Promise<RepasseConsolidacaoJob> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input?.periodRef);
  const professionalIds = normalizeProfessionalIds(input?.professionalIds);
  const scope = normalizeConsolidacaoScope(input?.scope, professionalIds.length > 0);

  if ((scope === 'single' || scope === 'multi') && professionalIds.length === 0) {
    throw new RepasseValidationError('Informe ao menos um profissional para o escopo selecionado.');
  }
  if (scope === 'single' && professionalIds.length !== 1) {
    throw new RepasseValidationError('Escopo single exige exatamente um profissional.');
  }

  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO repasse_consolidacao_jobs (
      id, period_ref, scope, professional_ids_json, status, requested_by, started_at, finished_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      periodRef,
      scope,
      professionalIds.length ? JSON.stringify(professionalIds) : null,
      'PENDING',
      actorUserId,
      null,
      null,
      null,
      now,
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT *
    FROM repasse_consolidacao_jobs
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  return mapConsolidacaoJob(rows[0]);
};

export const listRepasseConsolidacaoJobs = async (
  db: DbInterface,
  filters: RepasseJobListFilters = {}
): Promise<{ items: RepasseConsolidacaoJob[]; total: number }> => {
  await ensureRepasseConsolidacaoTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];
  const periodRef = clean(filters.periodRef);
  const limit = normalizeLimit(filters.limit, 20);

  if (periodRef) {
    where.push('j.period_ref = ?');
    params.push(periodRef);
  }
  const userJoinCondition = buildRequestedByUserJoin('j');

  const rows = await db.query(
    `
    SELECT
      j.*,
      COALESCE(u.name, u.email, j.requested_by) as requested_by_display
    FROM repasse_consolidacao_jobs j
    LEFT JOIN users u ON ${userJoinCondition}
    WHERE ${where.join(' AND ')}
    ORDER BY j.created_at DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  const countRows = await db.query(
    `
    SELECT COUNT(*) as total
    FROM repasse_consolidacao_jobs j
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.map(mapConsolidacaoJob),
    total: readCount(countRows[0]),
  };
};

export const listRepasseConsolidacaoProfessionalSummaries = async (
  db: DbInterface,
  filters: RepasseConsolidacaoProfessionalListFilters = {}
): Promise<RepasseConsolidacaoProfessionalListResult> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeConsolidacaoProfessionalStatusFilter(filters.status);
  const hasPaymentMinimum = normalizeBooleanFilter(filters.hasPaymentMinimum);
  const consolidacaoStatus = normalizeConsolidacaoStatusFilter(filters.consolidacaoStatus);
  const hasDivergence = normalizeBooleanFilter(filters.hasDivergence);
  const attendanceDateStart = filters.attendanceDateStart
    ? normalizeIsoDate(filters.attendanceDateStart)
    : null;
  const attendanceDateEnd = filters.attendanceDateEnd ? normalizeIsoDate(filters.attendanceDateEnd) : null;
  const patientName = clean(filters.patientName);
  const page = normalizePage(filters.page);
  const pageSize = normalizeLimit(filters.pageSize, 50);

  const loaded = await loadRepasseConsolidacaoProfessionalSummaries(db, {
    periodRef,
    search,
    hasPaymentMinimum,
    consolidacaoStatus,
    hasDivergence,
    attendanceDateStart,
    attendanceDateEnd,
    patientName,
  });
  const allItems = loaded.items;
  const stats = loaded.stats;

  const filteredItems =
    statusFilter === 'all'
      ? allItems
      : allItems.filter((item) => item.status.toLowerCase() === statusFilter);

  const resolvedStats =
    statusFilter === 'all'
      ? stats
      : filteredItems.reduce(
          (acc, item) => {
            acc.totalRows += item.rowsCount;
            acc.totalValue += item.totalValue;
            acc.consolidadoQty += item.consolidadoQty;
            acc.consolidadoValue += item.consolidadoValue;
            acc.naoConsolidadoQty += item.naoConsolidadoQty;
            acc.naoConsolidadoValue += item.naoConsolidadoValue;
            acc.naoRecebidoQty += item.naoRecebidoQty;
            acc.naoRecebidoValue += item.naoRecebidoValue;
            if (item.hasDivergencia) acc.divergenceCount += 1;
            if (item.status === 'SUCCESS') acc.success += 1;
            else if (item.status === 'NO_DATA') acc.noData += 1;
            else if (item.status === 'SKIPPED') acc.skipped += 1;
            else if (item.status === 'ERROR') acc.error += 1;
            else acc.notProcessed += 1;
            return acc;
          },
          {
            totalProfessionals: filteredItems.length,
            success: 0,
            noData: 0,
            skipped: 0,
            error: 0,
            notProcessed: 0,
            totalRows: 0,
            totalValue: 0,
            consolidadoQty: 0,
            consolidadoValue: 0,
            naoConsolidadoQty: 0,
            naoConsolidadoValue: 0,
            naoRecebidoQty: 0,
            naoRecebidoValue: 0,
            divergenceCount: 0,
          }
        );

  const total = filteredItems.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filteredItems.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
    stats: resolvedStats,
  };
};

export const listRepasseConsolidacaoProfessionalIds = async (
  db: DbInterface,
  filters: Pick<
    RepasseConsolidacaoProfessionalListFilters,
    | 'periodRef'
    | 'search'
    | 'status'
    | 'hasPaymentMinimum'
    | 'consolidacaoStatus'
    | 'hasDivergence'
    | 'attendanceDateStart'
    | 'attendanceDateEnd'
    | 'patientName'
  > = {}
): Promise<string[]> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(filters.periodRef);
  const search = clean(filters.search);
  const statusFilter = normalizeConsolidacaoProfessionalStatusFilter(filters.status);
  const hasPaymentMinimum = normalizeBooleanFilter(filters.hasPaymentMinimum);
  const consolidacaoStatus = normalizeConsolidacaoStatusFilter(filters.consolidacaoStatus);
  const hasDivergence = normalizeBooleanFilter(filters.hasDivergence);
  const attendanceDateStart = filters.attendanceDateStart
    ? normalizeIsoDate(filters.attendanceDateStart)
    : null;
  const attendanceDateEnd = filters.attendanceDateEnd ? normalizeIsoDate(filters.attendanceDateEnd) : null;
  const patientName = clean(filters.patientName);

  const loaded = await loadRepasseConsolidacaoProfessionalSummaries(db, {
    periodRef,
    search,
    hasPaymentMinimum,
    consolidacaoStatus,
    hasDivergence,
    attendanceDateStart,
    attendanceDateEnd,
    patientName,
  });
  const filteredItems =
    statusFilter === 'all'
      ? loaded.items
      : loaded.items.filter((item) => item.status.toLowerCase() === statusFilter);
  return filteredItems.map((item) => item.professionalId);
};

export const listRepasseConsolidacaoProfessionalOptions = async (
  db: DbInterface,
  input: { search?: string; limit?: number } = {}
): Promise<RepasseProfessionalOption[]> => {
  await ensureRepasseConsolidacaoTables(db);

  const search = clean(input.search);
  const limit = normalizeOptionLimit(input.limit, 500);
  const searchPattern = `%${search.toUpperCase()}%`;

  const rows = await db.query(
    `
    SELECT professional_id, professional_name
    FROM (
      SELECT id as professional_id, name as professional_name
      FROM professionals
      WHERE is_active = 1
        AND (? = '' OR UPPER(name) LIKE ?)
      UNION
      SELECT professional_id, professional_name
      FROM feegow_repasse_a_conferir
      WHERE is_active = 1
        AND (? = '' OR UPPER(professional_name) LIKE ?)
    ) unioned
    ORDER BY professional_name ASC
    LIMIT ?
    `,
    [search, searchPattern, search, searchPattern, limit]
  );

  return rows
    .map((row) => ({
      professionalId: clean((row as any).professional_id),
      professionalName: clean((row as any).professional_name),
    }))
    .filter((row) => row.professionalId && row.professionalName);
};

export const listRepasseAConferirLinesByProfessional = async (
  db: DbInterface,
  periodRefRaw: string,
  professionalIdRaw: string
): Promise<RepasseAConferirDetailsResult> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(periodRefRaw);
  const professionalId = clean(professionalIdRaw);
  if (!professionalId) {
    return {
      mainRows: [],
      rows: [],
      summary: {
        rowsCount: 0,
        producaoValue: 0,
        consolidadoQty: 0,
        consolidadoValue: 0,
        naoConsolidadoQty: 0,
        naoConsolidadoValue: 0,
        naoRecebidoQty: 0,
        naoRecebidoValue: 0,
      },
    };
  }

  const consolidadoRows = await db.query(
    `
    SELECT
      source_row_hash,
      invoice_id,
      data_exec,
      paciente,
      descricao,
      funcao,
      convenio,
      repasse_value
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    ORDER BY ${getDateExpr('data_exec')} DESC, paciente ASC
    `,
    [periodRef, professionalId]
  );

  const aConferirRows = await db.query(
    `
    SELECT
      source_row_hash,
      invoice_id,
      execution_date,
      patient_name,
      unit_name,
      account_date,
      requester_name,
      specialty_name,
      procedure_name,
      attendance_value,
      detail_status,
      detail_status_text,
      role_code,
      role_name,
      detail_professional_name,
      detail_repasse_value
    FROM feegow_repasse_a_conferir
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    ORDER BY ${getDateExpr('execution_date')} DESC, patient_name ASC
    `,
    [periodRef, professionalId]
  );

  const classifyStatus = (value: unknown): 'CONSOLIDADO' | 'NAO_RECEBIDO' | 'NAO_CONSOLIDADO' => {
    const normalized = clean(value).toUpperCase();
    if (normalized === 'CONSOLIDADO') return 'CONSOLIDADO';
    if (normalized === 'NAO_RECEBIDO') return 'NAO_RECEBIDO';
    if (normalized === 'OUTRO' || normalized === 'SEM_DETALHE') return 'NAO_CONSOLIDADO';
    return 'NAO_CONSOLIDADO';
  };

  const statusLabel: Record<string, string> = {
    CONSOLIDADO: 'Consolidado',
    NAO_CONSOLIDADO: 'Não consolidado',
    NAO_RECEBIDO: 'Não recebido',
    SEM_CORRESPONDENCIA: 'Sem correspondência',
  };

  type AConferirGroup = {
    details: RepasseAConferirLine[];
    expandedItems: RepasseAConferirExpandedItem[];
    unitNames: Set<string>;
    specialtyNames: Set<string>;
    accountDates: Set<string>;
    detailRepasseValueTotal: number;
    statusCounts: {
      consolidado: number;
      naoConsolidado: number;
      naoRecebido: number;
    };
  };

  const groupByFullKey = new Map<string, AConferirGroup>();
  const groupByInvoiceId = new Map<string, AConferirGroup>();
  const fullKeysByPatientDate = new Map<string, Set<string>>();

  const createEmptyGroup = (): AConferirGroup => ({
    details: [],
    expandedItems: [],
    unitNames: new Set<string>(),
    specialtyNames: new Set<string>(),
    accountDates: new Set<string>(),
    detailRepasseValueTotal: 0,
    statusCounts: {
      consolidado: 0,
      naoConsolidado: 0,
      naoRecebido: 0,
    },
  });

  const appendRowToGroup = (group: AConferirGroup, row: any, statusGroup: ReturnType<typeof classifyStatus>) => {
    const attendanceValue = Number((row as any).attendance_value) || 0;
    const detailRepasseValue = Number((row as any).detail_repasse_value) || 0;
    group.detailRepasseValueTotal += detailRepasseValue;
    if (statusGroup === 'CONSOLIDADO') {
      group.statusCounts.consolidado += 1;
    } else if (statusGroup === 'NAO_RECEBIDO') {
      group.statusCounts.naoRecebido += 1;
    } else {
      group.statusCounts.naoConsolidado += 1;
    }

    group.details.push({
      sourceRowHash: clean((row as any).source_row_hash),
      invoiceId: clean((row as any).invoice_id),
      executionDate: clean((row as any).execution_date),
      patientName: clean((row as any).patient_name),
      unitName: clean((row as any).unit_name),
      accountDate: clean((row as any).account_date),
      requesterName: clean((row as any).requester_name),
      specialtyName: clean((row as any).specialty_name),
      procedureName: clean((row as any).procedure_name),
      attendanceValue,
      detailStatus: clean((row as any).detail_status),
      detailStatusText: clean((row as any).detail_status_text),
      roleCode: clean((row as any).role_code),
      roleName: clean((row as any).role_name),
      detailProfessionalName: clean((row as any).detail_professional_name),
      detailRepasseValue,
      isInConsolidado: false,
      convenio: '',
      funcao: clean((row as any).role_name),
      origin: 'a_conferir',
    });
    group.expandedItems.push({
      specialtyName: clean((row as any).specialty_name),
      requesterName: clean((row as any).requester_name),
      convenio: '',
      invoiceId: clean((row as any).invoice_id),
      attendanceValue,
      detailRepasseValue,
      detailStatusText: clean((row as any).detail_status_text),
    });
    if (clean((row as any).unit_name)) group.unitNames.add(clean((row as any).unit_name));
    if (clean((row as any).specialty_name)) group.specialtyNames.add(clean((row as any).specialty_name));
    if (clean((row as any).account_date)) group.accountDates.add(clean((row as any).account_date));
  };

  const mergeGroups = (groups: AConferirGroup[]): AConferirGroup | null => {
    if (!groups.length) return null;
    return {
      details: groups.flatMap((group) => group.details),
      expandedItems: groups.flatMap((group) => group.expandedItems),
      unitNames: new Set(groups.flatMap((group) => Array.from(group.unitNames))),
      specialtyNames: new Set(groups.flatMap((group) => Array.from(group.specialtyNames))),
      accountDates: new Set(groups.flatMap((group) => Array.from(group.accountDates))),
      detailRepasseValueTotal: groups.reduce((sum, group) => sum + group.detailRepasseValueTotal, 0),
      statusCounts: groups.reduce(
        (acc, group) => {
          acc.consolidado += group.statusCounts.consolidado;
          acc.naoConsolidado += group.statusCounts.naoConsolidado;
          acc.naoRecebido += group.statusCounts.naoRecebido;
          return acc;
        },
        { consolidado: 0, naoConsolidado: 0, naoRecebido: 0 }
      ),
    };
  };

  for (const row of aConferirRows) {
    const fullKey = buildConsolidadoMatchKey(
      (row as any).execution_date,
      (row as any).patient_name,
      (row as any).procedure_name
    );
    const patientDateKey = buildPatientDateMatchKey((row as any).execution_date, (row as any).patient_name);
    const statusGroup = classifyStatus((row as any).detail_status);

    const current = groupByFullKey.get(fullKey) || createEmptyGroup();
    appendRowToGroup(current, row, statusGroup);
    groupByFullKey.set(fullKey, current);

    const invoiceId = clean((row as any).invoice_id);
    if (invoiceId) {
      const currentByInvoice = groupByInvoiceId.get(invoiceId) || createEmptyGroup();
      appendRowToGroup(currentByInvoice, row, statusGroup);
      groupByInvoiceId.set(invoiceId, currentByInvoice);
    }

    const fullKeys = fullKeysByPatientDate.get(patientDateKey) || new Set<string>();
    fullKeys.add(fullKey);
    fullKeysByPatientDate.set(patientDateKey, fullKeys);
  }

  const toDisplayValue = (values: string[], empty = ''): string => {
    const uniq = values.filter(Boolean);
    if (uniq.length === 0) return empty;
    if (uniq.length === 1) return uniq[0];
    return 'Múltiplas';
  };

  const resolveMainStatus = (group: AConferirGroup | null): { code: RepasseAConferirMainRow['detailStatus']; text: string } => {
    if (!group) return { code: 'SEM_CORRESPONDENCIA', text: statusLabel.SEM_CORRESPONDENCIA };
    if (group.statusCounts.naoRecebido > 0) return { code: 'NAO_RECEBIDO', text: statusLabel.NAO_RECEBIDO };
    if (group.statusCounts.naoConsolidado > 0) {
      return { code: 'NAO_CONSOLIDADO', text: statusLabel.NAO_CONSOLIDADO };
    }
    if (group.statusCounts.consolidado > 0) return { code: 'CONSOLIDADO', text: statusLabel.CONSOLIDADO };
    return { code: 'NAO_CONSOLIDADO', text: statusLabel.NAO_CONSOLIDADO };
  };

  const mainRows: RepasseAConferirMainRow[] = [];
  const duplicateAttendanceCountByKey = new Map<string, number>();
  for (const row of consolidadoRows) {
    const duplicateKey = buildDuplicateAttendanceKey(
      (row as any).data_exec,
      (row as any).paciente,
      (row as any).descricao,
      (row as any).repasse_value
    );
    duplicateAttendanceCountByKey.set(
      duplicateKey,
      (duplicateAttendanceCountByKey.get(duplicateKey) || 0) + 1
    );
  }

  for (const row of consolidadoRows) {
    const fullKey = buildConsolidadoMatchKey((row as any).data_exec, (row as any).paciente, (row as any).descricao);
    const patientDateKey = buildPatientDateMatchKey((row as any).data_exec, (row as any).paciente);
    const invoiceId = clean((row as any).invoice_id);
    const invoiceMatch = invoiceId ? groupByInvoiceId.get(invoiceId) || null : null;
    const directMatch = invoiceMatch || groupByFullKey.get(fullKey) || null;
    const fallbackKeys = directMatch ? [] : Array.from(fullKeysByPatientDate.get(patientDateKey) || []);
    const fallbackGroups = fallbackKeys
      .map((key) => groupByFullKey.get(key))
      .filter((g): g is AConferirGroup => Boolean(g));

    const mergedGroup = directMatch || mergeGroups(fallbackGroups);

    const matchRule: RepasseAConferirMainRow['matchRule'] = directMatch
      ? 'PATIENT_DATE_PROCEDURE'
      : 'PATIENT_DATE';
    const matchConfidence: RepasseAConferirMainRow['matchConfidence'] = directMatch ? 'HIGH' : 'LOW';
    const hasMatch = Boolean(mergedGroup);
    const status = resolveMainStatus(mergedGroup);
    const rowKey =
      clean((row as any).source_row_hash) ||
      stableHash64(
        `${periodRef}|${professionalId}|${invoiceId}|${clean((row as any).data_exec)}|${clean((row as any).paciente)}|${clean((row as any).descricao)}|${Number((row as any).repasse_value) || 0}`
      );
    const duplicateAttendanceCount =
      duplicateAttendanceCountByKey.get(
        buildDuplicateAttendanceKey(
          (row as any).data_exec,
          (row as any).paciente,
          (row as any).descricao,
          (row as any).repasse_value
        )
      ) || 0;

    const baseConvenio = clean((row as any).convenio);
    const expandedItems = (mergedGroup?.expandedItems || []).map((entry) => ({
      ...entry,
      convenio: entry.convenio || baseConvenio,
    }));
    const hasZeroRepasseAlert =
      Math.abs((Number((row as any).repasse_value) || 0) - 0.01) < 0.0001 ||
      expandedItems.some((entry) => Math.abs((Number(entry.detailRepasseValue) || 0) - 0.01) < 0.0001);

    mainRows.push({
      rowKey,
      executionDate: clean((row as any).data_exec),
      patientName: clean((row as any).paciente),
      unitName: toDisplayValue(Array.from(mergedGroup?.unitNames || []), '-'),
      specialtyName: toDisplayValue(Array.from(mergedGroup?.specialtyNames || []), '-'),
      accountDate: toDisplayValue(Array.from(mergedGroup?.accountDates || []), '-'),
      procedureName: clean((row as any).descricao),
      repasseConsolidadoValue: Number((row as any).repasse_value) || 0,
      repasseAConferirValue: Number(mergedGroup?.detailRepasseValueTotal || 0),
      detailStatus: status.code,
      detailStatusText: status.text,
      hasMatch,
      matchRule,
      matchConfidence,
      duplicateAttendanceCount,
      hasPossibleDuplicateAttendance: duplicateAttendanceCount > 1,
      hasZeroRepasseAlert,
      expandedItems,
    });
  }

  const parseDateForSort = (value: string) => {
    const raw = clean(value);
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return '0000-00-00';
  };

  mainRows.sort((a, b) => {
    const da = parseDateForSort(a.executionDate);
    const dbs = parseDateForSort(b.executionDate);
    if (da !== dbs) return dbs.localeCompare(da);
    return a.patientName.localeCompare(b.patientName, 'pt-BR');
  });

  const rows = mainRows.map((row) => ({
    sourceRowHash: row.rowKey,
    invoiceId: row.expandedItems[0]?.invoiceId || '',
    executionDate: row.executionDate,
    patientName: row.patientName,
    unitName: row.unitName,
    accountDate: row.accountDate === 'Múltiplas' ? '' : row.accountDate,
    requesterName: '',
    specialtyName: row.specialtyName === 'Múltiplas' ? '' : row.specialtyName,
    procedureName: row.procedureName,
    attendanceValue: row.repasseConsolidadoValue,
    detailStatus: row.detailStatus,
    detailStatusText: row.detailStatusText,
    roleCode: '',
    roleName: '',
    detailProfessionalName: '',
    detailRepasseValue: row.repasseConsolidadoValue,
    isInConsolidado: true,
    convenio: '',
    funcao: '',
    origin: 'consolidado' as const,
  }));

  const summary = mainRows.reduce(
    (acc, row) => {
      acc.rowsCount += 1;
      acc.producaoValue += row.repasseConsolidadoValue;
      if (row.detailStatus === 'CONSOLIDADO') {
        acc.consolidadoQty += 1;
        acc.consolidadoValue += row.repasseAConferirValue;
      } else if (row.detailStatus === 'NAO_RECEBIDO') {
        acc.naoRecebidoQty += 1;
        acc.naoRecebidoValue += row.repasseAConferirValue;
      } else {
        acc.naoConsolidadoQty += 1;
        acc.naoConsolidadoValue += row.repasseAConferirValue;
      }
      return acc;
    },
    {
      rowsCount: 0,
      producaoValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
    }
  );

  return {
    mainRows,
    rows,
    summary,
  };
};

export const upsertRepasseConsolidacaoNote = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    note?: string | null;
    internalNote?: string | null;
  },
  actorUserId: string
): Promise<{
  periodRef: string;
  professionalId: string;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
}> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    throw new RepasseValidationError('Profissional invalido para salvar observacao.');
  }

  const hasNote = Object.prototype.hasOwnProperty.call(input, 'note');
  const hasInternalNote = Object.prototype.hasOwnProperty.call(input, 'internalNote');
  if (!hasNote && !hasInternalNote) {
    throw new RepasseValidationError(
      'Informe ao menos um campo para atualizacao (note ou internalNote).'
    );
  }

  const currentRows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_consolidacao_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  const current = (currentRows?.[0] as any) || null;
  const currentNote = current ? clean(current.note) || null : null;
  const currentInternalNote = current ? clean(current.internal_note) || null : null;

  const note = hasNote ? clean(input.note) || null : currentNote;
  const internalNote = hasInternalNote ? clean(input.internalNote) || null : currentInternalNote;
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO repasse_consolidacao_notes (
      period_ref, professional_id, note, internal_note, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      note = ?,
      internal_note = ?,
      updated_by = ?,
      updated_at = ?
    `,
    [
      periodRef,
      professionalId,
      note,
      internalNote,
      clean(actorUserId),
      now,
      note,
      internalNote,
      clean(actorUserId),
      now,
    ]
  );

  return { periodRef, professionalId, note, internalNote, updatedAt: now };
};

export const getRepasseConsolidacaoNote = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{ note: string | null; internalNote: string | null }> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) return { note: null, internalNote: null };

  const rows = await db.query(
    `
    SELECT note, internal_note
    FROM repasse_consolidacao_notes
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  if (!rows?.length) return { note: null, internalNote: null };
  return {
    note: clean((rows[0] as any).note) || null,
    internalNote: clean((rows[0] as any).internal_note) || null,
  };
};

export const getRepasseConsolidacaoFinancialInput = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{ repasseFinalValue: number | null; produtividadeValue: number | null; updatedAt: string | null }> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    return { repasseFinalValue: null, produtividadeValue: null, updatedAt: null };
  }

  const rows = await db.query(
    `
    SELECT repasse_final_value, produtividade_value, updated_at
    FROM repasse_fechamento_manual
    WHERE period_ref = ?
      AND professional_id = ?
    LIMIT 1
    `,
    [periodRef, professionalId]
  );
  if (!rows?.length) {
    return { repasseFinalValue: null, produtividadeValue: null, updatedAt: null };
  }
  const row = rows[0] as any;
  return {
    repasseFinalValue:
      row.repasse_final_value === null || row.repasse_final_value === undefined
        ? null
        : Number(row.repasse_final_value) || 0,
    produtividadeValue:
      row.produtividade_value === null || row.produtividade_value === undefined
        ? null
        : Number(row.produtividade_value) || 0,
    updatedAt: clean(row.updated_at) || null,
  };
};

export const getRepasseConsolidacaoFinancialBreakdown = async (
  db: DbInterface,
  input: { periodRef?: string; professionalId: string }
): Promise<{
  producaoQty: number;
  producaoValue: number;
  repasseFinalValue: number;
  produtividadeValue: number;
  percentualProdutividadeValue: number;
  totalFinalValue: number;
  hasRepasseFinalOverride: boolean;
}> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    return {
      producaoQty: 0,
      producaoValue: 0,
      repasseFinalValue: 0,
      produtividadeValue: 0,
      percentualProdutividadeValue: 0,
      totalFinalValue: 0,
      hasRepasseFinalOverride: false,
    };
  }

  const rows = await db.query(
    `
    SELECT
      COUNT(*) as producao_qty,
      COALESCE(SUM(repasse_value), 0) as producao_value
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    `,
    [periodRef, professionalId]
  );
  const producaoQty = Number((rows?.[0] as any)?.producao_qty) || 0;
  const producaoValue = Number((rows?.[0] as any)?.producao_value) || 0;
  const manual = await getRepasseConsolidacaoFinancialInput(db, { periodRef, professionalId });

  const repasseFinalValue =
    manual.repasseFinalValue === null || manual.repasseFinalValue === undefined
      ? producaoValue
      : Number(manual.repasseFinalValue) || 0;
  const produtividadeValue =
    manual.produtividadeValue === null || manual.produtividadeValue === undefined
      ? 0
      : Number(manual.produtividadeValue) || 0;
  const percentualProdutividadeValue = produtividadeValue * 0.05;
  const totalFinalValue = repasseFinalValue + percentualProdutividadeValue;

  return {
    producaoQty,
    producaoValue,
    repasseFinalValue,
    produtividadeValue,
    percentualProdutividadeValue,
    totalFinalValue,
    hasRepasseFinalOverride: manual.repasseFinalValue !== null,
  };
};

export const upsertRepasseConsolidacaoFinancialInput = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    repasseFinalValue?: number | string | null;
    produtividadeValue?: number | string | null;
  },
  actorUserId: string
): Promise<RepasseConsolidacaoFinancialInput> => {
  await ensureRepasseConsolidacaoTables(db);

  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  if (!professionalId) {
    throw new RepasseValidationError('Profissional invalido para salvar fechamento manual.');
  }

  const hasRepasseFinal = Object.prototype.hasOwnProperty.call(input, 'repasseFinalValue');
  const hasProdutividade = Object.prototype.hasOwnProperty.call(input, 'produtividadeValue');
  if (!hasRepasseFinal && !hasProdutividade) {
    throw new RepasseValidationError(
      'Informe ao menos um campo para atualizacao (repasseFinalValue ou produtividadeValue).'
    );
  }

  const current = await getRepasseConsolidacaoFinancialInput(db, { periodRef, professionalId });
  const repasseFinalValue = hasRepasseFinal
    ? normalizeNullableMoneyValue((input as any).repasseFinalValue)
    : current.repasseFinalValue;
  const produtividadeValue = hasProdutividade
    ? normalizeNullableMoneyValue((input as any).produtividadeValue)
    : current.produtividadeValue;

  const now = nowIso();
  await db.execute(
    `
    INSERT INTO repasse_fechamento_manual (
      period_ref, professional_id, repasse_final_value, produtividade_value, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      repasse_final_value = ?,
      produtividade_value = ?,
      updated_by = ?,
      updated_at = ?
    `,
    [
      periodRef,
      professionalId,
      repasseFinalValue,
      produtividadeValue,
      clean(actorUserId),
      now,
      repasseFinalValue,
      produtividadeValue,
      clean(actorUserId),
      now,
    ]
  );

  const rows = await db.query(
    `
    SELECT
      COUNT(*) as producao_qty,
      COALESCE(SUM(repasse_value), 0) as producao_value
    FROM feegow_repasse_consolidado
    WHERE period_ref = ?
      AND professional_id = ?
      AND is_active = 1
    `,
    [periodRef, professionalId]
  );
  const producaoValue = Number((rows?.[0] as any)?.producao_value) || 0;
  const effectiveRepasseFinal =
    repasseFinalValue === null || repasseFinalValue === undefined ? producaoValue : repasseFinalValue;
  const effectiveProdutividade =
    produtividadeValue === null || produtividadeValue === undefined ? 0 : produtividadeValue;
  const percentualProdutividadeValue = effectiveProdutividade * 0.05;
  const totalFinalValue = effectiveRepasseFinal + percentualProdutividadeValue;

  return {
    periodRef,
    professionalId,
    repasseFinalValue,
    produtividadeValue,
    percentualProdutividadeValue,
    totalFinalValue,
    hasRepasseFinalOverride: repasseFinalValue !== null,
    updatedAt: now,
  };
};

const defaultConsolidacaoLegend: RepasseConsolidacaoMarkLegend = {
  green: 'OK',
  yellow: 'Revisar',
  red: 'Problema',
};

export const getRepasseConsolidacaoMarkLegend = async (
  db: DbInterface,
  userIdRaw: string
): Promise<RepasseConsolidacaoMarkLegend> => {
  await ensureRepasseConsolidacaoTables(db);
  const userId = clean(userIdRaw);
  if (!userId) return { ...defaultConsolidacaoLegend };

  const rows = await db.query(
    `
    SELECT color_key, label
    FROM repasse_consolidacao_mark_legends
    WHERE user_id = ?
    `,
    [userId]
  );

  const legend: RepasseConsolidacaoMarkLegend = { ...defaultConsolidacaoLegend };
  for (const row of rows) {
    const color = normalizeLineMarkColor((row as any).color_key);
    if (!color) continue;
    const label = clean((row as any).label);
    legend[color] = label || defaultConsolidacaoLegend[color];
  }
  return legend;
};

export const upsertRepasseConsolidacaoMarkLegend = async (
  db: DbInterface,
  userIdRaw: string,
  input: Partial<RepasseConsolidacaoMarkLegend>
): Promise<RepasseConsolidacaoMarkLegend> => {
  await ensureRepasseConsolidacaoTables(db);
  const userId = clean(userIdRaw);
  if (!userId) throw new RepasseValidationError('Usuario invalido para salvar legenda.');
  const now = nowIso();

  const entries = (Object.keys(defaultConsolidacaoLegend) as Array<keyof RepasseConsolidacaoMarkLegend>)
    .filter((color) => Object.prototype.hasOwnProperty.call(input, color))
    .map((color) => [color, clean(input[color]) || defaultConsolidacaoLegend[color]] as const);

  if (!entries.length) {
    throw new RepasseValidationError('Informe ao menos uma legenda para atualizar.');
  }

  for (const [color, label] of entries) {
    await db.execute(
      `
      INSERT INTO repasse_consolidacao_mark_legends (user_id, color_key, label, updated_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = ?,
        updated_at = ?
      `,
      [userId, color, label, now, label, now]
    );
  }

  return getRepasseConsolidacaoMarkLegend(db, userId);
};

export const listRepasseConsolidacaoLineMarks = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    userId: string;
  }
): Promise<RepasseConsolidacaoLineMark[]> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  const userId = clean(input.userId);
  if (!professionalId || !userId) return [];

  const rows = await db.query(
    `
    SELECT source_row_hash, color_key, note, updated_at
    FROM repasse_consolidacao_line_marks
    WHERE period_ref = ?
      AND professional_id = ?
      AND user_id = ?
    `,
    [periodRef, professionalId, userId]
  );

  return rows
    .map((row) => {
      const color = normalizeLineMarkColor((row as any).color_key);
      if (!color) return null;
      return {
        sourceRowHash: clean((row as any).source_row_hash),
        colorKey: color,
        note: clean((row as any).note) || null,
        updatedAt: clean((row as any).updated_at),
      } as RepasseConsolidacaoLineMark;
    })
    .filter((row): row is RepasseConsolidacaoLineMark => Boolean(row && row.sourceRowHash));
};

export const upsertRepasseConsolidacaoLineMarks = async (
  db: DbInterface,
  input: {
    periodRef?: string;
    professionalId: string;
    userId: string;
    marks: Array<{
      sourceRowHash: string;
      colorKey?: RepasseConsolidacaoLineMarkColor | null;
      note?: string | null;
    }>;
  }
): Promise<RepasseConsolidacaoLineMark[]> => {
  await ensureRepasseConsolidacaoTables(db);
  const periodRef = normalizePeriodRef(input.periodRef);
  const professionalId = clean(input.professionalId);
  const userId = clean(input.userId);
  if (!professionalId || !userId) {
    throw new RepasseValidationError('Profissional/usuario invalido para salvar marcacoes.');
  }
  if (!Array.isArray(input.marks) || input.marks.length === 0) {
    throw new RepasseValidationError('Nenhuma marcacao informada.');
  }

  const now = nowIso();
  for (const entry of input.marks) {
    const sourceRowHash = clean(entry?.sourceRowHash);
    if (!sourceRowHash) continue;
    const color = normalizeLineMarkColor(entry?.colorKey);
    const note = clean(entry?.note) || null;
    if (!color) {
      await db.execute(
        `
        DELETE FROM repasse_consolidacao_line_marks
        WHERE period_ref = ?
          AND professional_id = ?
          AND user_id = ?
          AND source_row_hash = ?
        `,
        [periodRef, professionalId, userId, sourceRowHash]
      );
      continue;
    }

    await db.execute(
      `
      INSERT INTO repasse_consolidacao_line_marks (
        period_ref, professional_id, source_row_hash, user_id, color_key, note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        color_key = ?,
        note = ?,
        updated_at = ?
      `,
      [
        periodRef,
        professionalId,
        sourceRowHash,
        userId,
        color,
        note,
        now,
        color,
        note,
        now,
      ]
    );
  }

  return listRepasseConsolidacaoLineMarks(db, { periodRef, professionalId, userId });
};
