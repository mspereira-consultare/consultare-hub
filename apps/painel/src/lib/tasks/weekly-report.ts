import { randomUUID } from 'crypto';
import {
  getTaskWeeklyReportEligibilitySummary,
  getTaskWeeklyReportPreview,
  listTasks,
  TaskValidationError,
} from '@consultare/core/tasks/repository';
import type {
  TaskGlobalWeeklyReportEmailPayload,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TaskWeeklyReportEmailPayload,
  TaskWeeklyReportTaskItem,
  TaskViewerContext,
} from '@consultare/core/tasks/types';
import { runInTransaction, type DbInterface } from '@/lib/db';

type TaskWeeklyReportRecipientStatus =
  | 'SKIPPED'
  | 'FAILED'
  | 'ACCEPTED_PROVIDER'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'UNSUBSCRIBED'
  | 'RESUBSCRIBED'
  | 'SPAM'
  | 'SOFT_BOUNCE'
  | 'HARD_BOUNCE';

type TaskWeeklyReportRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
type TaskWeeklyReportTriggerSource = 'cron' | 'manual';
type TaskWeeklyReportType = 'INDIVIDUAL' | 'GLOBAL';

export type TaskWeeklyReportSettings = {
  enabled: boolean;
  globalReportEnabled: boolean;
  globalRecipientUserIds: string[];
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type TaskWeeklyReportRun = {
  id: string;
  runKey: string;
  windowStartDate: string;
  windowEndDate: string;
  status: TaskWeeklyReportRunStatus;
  triggerSource: TaskWeeklyReportTriggerSource;
  triggeredBy: string;
  attemptNumber: number;
  provider: string;
  eligibleCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskWeeklyReportRecipientRecord = {
  id: string;
  runId: string;
  reportType: TaskWeeklyReportType;
  userId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  corporateEmail: string | null;
  status: TaskWeeklyReportRecipientStatus;
  skipReason: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  providerEventStatus: string | null;
  providerEventAt: string | null;
  subject: string | null;
  payloadJson: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskWeeklyReportEventRecord = {
  id: string;
  runId: string | null;
  recipientRecordId: string | null;
  reportType: TaskWeeklyReportType | null;
  provider: string;
  eventType: string;
  normalizedStatus: string;
  providerEventId: string;
  providerMessageId: string | null;
  recipientEmail: string | null;
  payloadJson: string;
  occurredAt: string | null;
  processedAt: string;
  createdAt: string;
};

export type TaskWeeklyReportProcessResult = {
  reusedExistingRun: boolean;
  run: TaskWeeklyReportRun;
};

export type TaskWeeklyReportGlobalRecipientState = {
  userId: string | null;
  userName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  corporateEmail: string | null;
  status: 'READY' | 'SKIPPED';
  reason: 'MISSING_USER_EMPLOYEE_LINK' | 'MISSING_CORPORATE_EMAIL' | 'USER_NOT_FOUND' | null;
};

export type TaskWeeklyReportGlobalRecipientsSummary = {
  generatedAt: string;
  selectedCount: number;
  readyRecipients: TaskWeeklyReportGlobalRecipientState[];
  skippedRecipients: TaskWeeklyReportGlobalRecipientState[];
};

export class TaskWeeklyReportValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;
let cachedSendPulseToken: { token: string; expiresAt: number } | null = null;

const SETTINGS_ROW_ID = 'default';
const SENDPULSE_API_BASE_URL = 'https://api.sendpulse.com';
const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
};
const parseBool = (value: unknown) =>
  value === true || value === 1 || String(value ?? '').trim() === '1' || String(value ?? '').toLowerCase() === 'true';
const parseIntSafe = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const isValidEmail = (value: string | null) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(message) || /Duplicate key name/i.test(message)) return;
    throw error;
  }
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(message)) return;
    throw error;
  }
};

const getTodayInSaoPauloIso = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const shiftIsoDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getPreviousWeeklyReportWindow = () => {
  const todayIso = getTodayInSaoPauloIso();
  const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  const diffToCurrentMonday = weekday === 0 ? -6 : 1 - weekday;
  const currentWeekStart = shiftIsoDate(todayIso, diffToCurrentMonday);
  const startDate = shiftIsoDate(currentWeekStart, -7);
  const endDate = shiftIsoDate(currentWeekStart, -1);
  return {
    startDate,
    endDate,
    label: `${startDate} a ${endDate}`,
    runKey: `${startDate}:${endDate}`,
  };
};

const formatIsoDate = (value: string | null, options: { includeYear?: boolean } = {}) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    ...(options.includeYear === false ? {} : { year: 'numeric' }),
  }).format(date);
};

const mapRun = (row: any): TaskWeeklyReportRun => ({
  id: clean(row.id),
  runKey: clean(row.run_key),
  windowStartDate: clean(row.window_start_date),
  windowEndDate: clean(row.window_end_date),
  status: clean(row.status) as TaskWeeklyReportRunStatus,
  triggerSource: clean(row.trigger_source) as TaskWeeklyReportTriggerSource,
  triggeredBy: clean(row.triggered_by),
  attemptNumber: parseIntSafe(row.attempt_number, 1),
  provider: clean(row.provider) || 'sendpulse',
  eligibleCount: parseIntSafe(row.eligible_count, 0),
  skippedCount: parseIntSafe(row.skipped_count, 0),
  sentCount: parseIntSafe(row.sent_count, 0),
  failedCount: parseIntSafe(row.failed_count, 0),
  startedAt: clean(row.started_at),
  finishedAt: nullable(row.finished_at),
  errorMessage: nullable(row.error_message),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapRecipientRecord = (row: any): TaskWeeklyReportRecipientRecord => ({
  id: clean(row.id),
  runId: clean(row.run_id),
  reportType: (clean(row.report_type) || 'INDIVIDUAL') as TaskWeeklyReportType,
  userId: nullable(row.user_id),
  employeeId: nullable(row.employee_id),
  employeeName: nullable(row.employee_name),
  corporateEmail: nullable(row.corporate_email),
  status: clean(row.status) as TaskWeeklyReportRecipientStatus,
  skipReason: nullable(row.skip_reason),
  errorMessage: nullable(row.error_message),
  providerMessageId: nullable(row.provider_message_id),
  providerEventStatus: nullable(row.provider_event_status),
  providerEventAt: nullable(row.provider_event_at),
  subject: nullable(row.subject),
  payloadJson: nullable(row.payload_json),
  sentAt: nullable(row.sent_at),
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapEventRecord = (row: any): TaskWeeklyReportEventRecord => ({
  id: clean(row.id),
  runId: nullable(row.run_id),
  recipientRecordId: nullable(row.recipient_record_id),
  reportType: (nullable(row.report_type) as TaskWeeklyReportType | null) || null,
  provider: clean(row.provider),
  eventType: clean(row.event_type),
  normalizedStatus: clean(row.normalized_status),
  providerEventId: clean(row.provider_event_id),
  providerMessageId: nullable(row.provider_message_id),
  recipientEmail: nullable(row.recipient_email),
  payloadJson: clean(row.payload_json),
  occurredAt: nullable(row.occurred_at),
  processedAt: clean(row.processed_at),
  createdAt: clean(row.created_at),
});

export const ensureTaskWeeklyReportTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_weekly_report_settings (
      id VARCHAR(32) PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      global_report_enabled INTEGER NOT NULL DEFAULT 0,
      global_recipient_user_ids LONGTEXT NULL,
      from_email VARCHAR(180) NULL,
      from_name VARCHAR(180) NULL,
      reply_to_email VARCHAR(180) NULL,
      updated_by VARCHAR(64) NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_weekly_report_runs (
      id VARCHAR(64) PRIMARY KEY,
      run_key VARCHAR(32) NOT NULL,
      window_start_date DATE NOT NULL,
      window_end_date DATE NOT NULL,
      status VARCHAR(24) NOT NULL,
      trigger_source VARCHAR(16) NOT NULL,
      triggered_by VARCHAR(64) NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      provider VARCHAR(32) NOT NULL DEFAULT 'sendpulse',
      eligible_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT NULL,
      error_message TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_weekly_report_recipients (
      id VARCHAR(64) PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL,
      report_type VARCHAR(16) NOT NULL DEFAULT 'INDIVIDUAL',
      user_id VARCHAR(64) NULL,
      employee_id VARCHAR(64) NULL,
      employee_name VARCHAR(180) NULL,
      corporate_email VARCHAR(180) NULL,
      status VARCHAR(32) NOT NULL,
      skip_reason VARCHAR(64) NULL,
      error_message TEXT NULL,
      provider_message_id VARCHAR(128) NULL,
      provider_event_status VARCHAR(64) NULL,
      provider_event_at TEXT NULL,
      subject VARCHAR(255) NULL,
      payload_json LONGTEXT NULL,
      sent_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_weekly_report_events (
      id VARCHAR(64) PRIMARY KEY,
      run_id VARCHAR(64) NULL,
      recipient_record_id VARCHAR(64) NULL,
      report_type VARCHAR(16) NULL,
      provider VARCHAR(32) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      normalized_status VARCHAR(64) NOT NULL,
      provider_event_id VARCHAR(180) NOT NULL,
      provider_message_id VARCHAR(128) NULL,
      recipient_email VARCHAR(180) NULL,
      payload_json LONGTEXT NOT NULL,
      occurred_at TEXT NULL,
      processed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE task_weekly_report_runs ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'sendpulse'`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_settings ADD COLUMN global_report_enabled INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_settings ADD COLUMN global_recipient_user_ids LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_recipients ADD COLUMN report_type VARCHAR(16) NOT NULL DEFAULT 'INDIVIDUAL'`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_recipients ADD COLUMN provider_event_status VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_recipients ADD COLUMN provider_event_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_events ADD COLUMN report_type VARCHAR(16) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_runs_run_key ON task_weekly_report_runs (run_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_runs_status ON task_weekly_report_runs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_recipients_run ON task_weekly_report_recipients (run_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_recipients_message ON task_weekly_report_recipients (provider_message_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_events_run ON task_weekly_report_events (run_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_weekly_report_events_provider_event ON task_weekly_report_events (provider, provider_event_id)`);

  const now = NOW();
  if (isMysqlProvider()) {
    await db.execute(
      `
      INSERT IGNORE INTO task_weekly_report_settings (id, enabled, from_email, from_name, reply_to_email, updated_by, updated_at)
      VALUES (?, 0, NULL, 'Consultare Intranet', NULL, NULL, ?)
      `,
      [SETTINGS_ROW_ID, now]
    );
  } else {
    await db.execute(
      `
      INSERT INTO task_weekly_report_settings (id, enabled, from_email, from_name, reply_to_email, updated_by, updated_at)
      VALUES (?, 0, NULL, 'Consultare Intranet', NULL, NULL, ?)
      ON CONFLICT(id) DO NOTHING
      `,
      [SETTINGS_ROW_ID, now]
    );
  }

  tablesEnsured = true;
};

export const getTaskWeeklyReportSettings = async (db: DbInterface): Promise<TaskWeeklyReportSettings> => {
  await ensureTaskWeeklyReportTables(db);
  const rows = await db.query(`SELECT * FROM task_weekly_report_settings WHERE id = ? LIMIT 1`, [SETTINGS_ROW_ID]);
  const row = rows[0] || {};
  const globalRecipientUserIds = (() => {
    try {
      const parsed = JSON.parse(clean(row.global_recipient_user_ids || '[]'));
      return Array.isArray(parsed) ? parsed.map((value) => clean(value)).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();
  return {
    enabled: parseBool(row.enabled),
    globalReportEnabled: parseBool(row.global_report_enabled),
    globalRecipientUserIds: Array.from(new Set(globalRecipientUserIds)),
    fromEmail: clean(row.from_email),
    fromName: clean(row.from_name) || 'Consultare Intranet',
    replyToEmail: nullable(row.reply_to_email),
    updatedAt: nullable(row.updated_at),
    updatedBy: nullable(row.updated_by),
  };
};

const normalizeSendPulseSettingsInput = (payload: Partial<TaskWeeklyReportSettings>) => {
  const enabled = Boolean(payload.enabled);
  const globalReportEnabled = Boolean(payload.globalReportEnabled);
  const globalRecipientUserIds = Array.from(new Set((payload.globalRecipientUserIds || []).map((value) => clean(value)).filter(Boolean)));
  const fromEmail = clean(payload.fromEmail);
  const fromName = clean(payload.fromName) || 'Consultare Intranet';
  const replyToEmail = nullable(payload.replyToEmail);

  if (!fromEmail) {
    throw new TaskWeeklyReportValidationError('Informe o e-mail remetente do report semanal.');
  }
  if (!isValidEmail(fromEmail)) {
    throw new TaskWeeklyReportValidationError('E-mail remetente inválido.');
  }
  if (replyToEmail && !isValidEmail(replyToEmail)) {
    throw new TaskWeeklyReportValidationError('E-mail de resposta inválido.');
  }
  if (globalReportEnabled && globalRecipientUserIds.length <= 0) {
    throw new TaskWeeklyReportValidationError('Selecione ao menos um destinatário para ativar o relatório global.');
  }

  return {
    enabled,
    globalReportEnabled,
    globalRecipientUserIds,
    fromEmail,
    fromName,
    replyToEmail,
  };
};

const getSendPulseBearerToken = async () => {
  const staticToken = clean(process.env.SENDPULSE_API_TOKEN);
  if (staticToken) return staticToken;

  const now = Date.now();
  if (cachedSendPulseToken && cachedSendPulseToken.expiresAt > now + 60_000) {
    return cachedSendPulseToken.token;
  }

  const clientId = clean(process.env.SENDPULSE_CLIENT_ID);
  const clientSecret = clean(process.env.SENDPULSE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new TaskWeeklyReportValidationError(
      'Credenciais do SendPulse não configuradas. Defina SENDPULSE_API_TOKEN ou SENDPULSE_CLIENT_ID/SENDPULSE_CLIENT_SECRET.',
      500
    );
  }

  const response = await fetch(`${SENDPULSE_API_BASE_URL}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !clean((payload as any).access_token)) {
    throw new TaskWeeklyReportValidationError(
      String((payload as any)?.error_description || (payload as any)?.message || 'Falha ao autenticar no SendPulse.'),
      502
    );
  }

  const token = clean((payload as any).access_token);
  const expiresIn = parseIntSafe((payload as any).expires_in, 3600);
  cachedSendPulseToken = {
    token,
    expiresAt: now + Math.max(300, expiresIn - 60) * 1000,
  };
  return token;
};

const sendPulseRequest = async <T>(
  path: string,
  init?: RequestInit,
  options: { allowNotFound?: boolean } = {}
): Promise<T> => {
  const token = await getSendPulseBearerToken();
  const response = await fetch(`${SENDPULSE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (options.allowNotFound && response.status === 404) {
    return [] as unknown as T;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new TaskWeeklyReportValidationError(
      String((payload as any)?.message || (payload as any)?.error || 'Falha ao comunicar com o SendPulse.'),
      502
    );
  }

  return payload as T;
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
};

const extractDomain = (email: string) => clean(email).split('@')[1]?.toLowerCase() || '';

const validateSendPulseSender = async (fromEmail: string) => {
  const [senders, domains] = await Promise.all([
    sendPulseRequest<any[]>(`/smtp/senders`),
    sendPulseRequest<any[]>(`/v2/email-service/smtp/sender_domains`, undefined, { allowNotFound: true }),
  ]);

  const normalizedSenders = new Set(normalizeStringList(senders).map((item) => item.toLowerCase()));
  if (normalizedSenders.has(fromEmail.toLowerCase())) return;

  const allowedDomains = new Set(
    (Array.isArray(domains) ? domains : [])
      .map((item) => {
        if (typeof item === 'string') return clean(item).toLowerCase();
        return clean((item as any)?.domain || (item as any)?.name || (item as any)?.value).toLowerCase();
      })
      .filter(Boolean)
  );

  if (allowedDomains.has(extractDomain(fromEmail))) return;

  throw new TaskWeeklyReportValidationError(
    'O e-mail remetente não está autorizado no SendPulse. Valide o remetente ou o domínio antes de ativar o report semanal.'
  );
};

const ensureGlobalRecipientUsersExist = async (db: DbInterface, userIds: string[]) => {
  if (userIds.length <= 0) return;
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT id
    FROM users
    WHERE id IN (${placeholders})
      AND UPPER(TRIM(COALESCE(status, 'ATIVO'))) = 'ATIVO'
    `,
    userIds
  );
  const foundIds = new Set((rows || []).map((row: any) => clean(row.id)).filter(Boolean));
  const missing = userIds.filter((userId) => !foundIds.has(userId));
  if (missing.length > 0) {
    throw new TaskWeeklyReportValidationError('Há destinatários globais inválidos ou inativos. Atualize a seleção antes de salvar.');
  }
};

const resolveCorporateRecipientByUserId = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      e.id AS employee_id,
      e.full_name AS employee_name,
      e.corporate_email
    FROM users u
    LEFT JOIN employees e ON u.employee_id = e.id
    WHERE ${isMysqlProvider() ? `u.id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci` : `u.id = ?`}
      AND UPPER(TRIM(COALESCE(u.status, 'ATIVO'))) = 'ATIVO'
    LIMIT 1
    `,
    [userId]
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return {
      userId,
      userName: null,
      employeeId: null,
      employeeName: null,
      corporateEmail: null,
      status: 'SKIPPED' as const,
      reason: 'USER_NOT_FOUND' as const,
    };
  }

  const employeeId = nullable(row.employee_id);
  const employeeName = nullable(row.employee_name);
  const corporateEmail = nullable(row.corporate_email);
  if (!employeeId || !employeeName) {
    return {
      userId: clean(row.user_id),
      userName: nullable(row.user_name),
      employeeId,
      employeeName,
      corporateEmail,
      status: 'SKIPPED' as const,
      reason: 'MISSING_USER_EMPLOYEE_LINK' as const,
    };
  }

  if (!corporateEmail) {
    return {
      userId: clean(row.user_id),
      userName: nullable(row.user_name),
      employeeId,
      employeeName,
      corporateEmail: null,
      status: 'SKIPPED' as const,
      reason: 'MISSING_CORPORATE_EMAIL' as const,
    };
  }

  return {
    userId: clean(row.user_id),
    userName: nullable(row.user_name),
    employeeId,
    employeeName,
    corporateEmail,
    status: 'READY' as const,
    reason: null,
  };
};

export const getTaskWeeklyReportGlobalRecipientsSummary = async (
  db: DbInterface,
  selectedUserIds: string[]
): Promise<TaskWeeklyReportGlobalRecipientsSummary> => {
  const uniqueIds = Array.from(new Set(selectedUserIds.map((value) => clean(value)).filter(Boolean)));
  const results = await Promise.all(uniqueIds.map((userId) => resolveCorporateRecipientByUserId(db, userId)));
  return {
    generatedAt: NOW(),
    selectedCount: uniqueIds.length,
    readyRecipients: results.filter((item) => item.status === 'READY'),
    skippedRecipients: results.filter((item) => item.status === 'SKIPPED'),
  };
};

export const updateTaskWeeklyReportSettings = async (
  db: DbInterface,
  payload: Partial<TaskWeeklyReportSettings>,
  actorUserId: string
): Promise<TaskWeeklyReportSettings> => {
  await ensureTaskWeeklyReportTables(db);
  const normalized = normalizeSendPulseSettingsInput(payload);
  await validateSendPulseSender(normalized.fromEmail);
  await ensureGlobalRecipientUsersExist(db, normalized.globalRecipientUserIds);
  const now = NOW();
  if (isMysqlProvider()) {
    await db.execute(
      `
      INSERT INTO task_weekly_report_settings (
        id, enabled, global_report_enabled, global_recipient_user_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        enabled = VALUES(enabled),
        global_report_enabled = VALUES(global_report_enabled),
        global_recipient_user_ids = VALUES(global_recipient_user_ids),
        from_email = VALUES(from_email),
        from_name = VALUES(from_name),
        reply_to_email = VALUES(reply_to_email),
        updated_by = VALUES(updated_by),
        updated_at = VALUES(updated_at)
      `,
      [
        SETTINGS_ROW_ID,
        normalized.enabled ? 1 : 0,
        normalized.globalReportEnabled ? 1 : 0,
        JSON.stringify(normalized.globalRecipientUserIds),
        normalized.fromEmail,
        normalized.fromName,
        normalized.replyToEmail,
        clean(actorUserId),
        now,
      ]
    );
  } else {
    await db.execute(
      `
      INSERT INTO task_weekly_report_settings (
        id, enabled, global_report_enabled, global_recipient_user_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        global_report_enabled = excluded.global_report_enabled,
        global_recipient_user_ids = excluded.global_recipient_user_ids,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        reply_to_email = excluded.reply_to_email,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
      `,
      [
        SETTINGS_ROW_ID,
        normalized.enabled ? 1 : 0,
        normalized.globalReportEnabled ? 1 : 0,
        JSON.stringify(normalized.globalRecipientUserIds),
        normalized.fromEmail,
        normalized.fromName,
        normalized.replyToEmail,
        clean(actorUserId),
        now,
      ]
    );
  }

  return getTaskWeeklyReportSettings(db);
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};
const STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  PAUSADO: 'Pausadas',
  CONCLUIDA: 'Concluídas',
  ARQUIVADA: 'Arquivadas',
  CANCELADA: 'Canceladas',
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

const OPERATIONAL_STATUSES: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'PAUSADO'];
const PENDING_OPERATIONAL_STATUSES: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'PAUSADO'];
const STATUS_ORDER: TaskStatus[] = ['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'PAUSADO', 'CONCLUIDA', 'ARQUIVADA', 'CANCELADA'];
const PRIORITY_ORDER: TaskPriority[] = ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'];

const isPendingOperationalStatus = (status: TaskStatus) => PENDING_OPERATIONAL_STATUSES.includes(status);
const isOperationalStatus = (status: TaskStatus) => OPERATIONAL_STATUSES.includes(status);
const isOverdueTask = (task: Pick<TaskSummary, 'dueDate' | 'status'>, todayIso: string) =>
  Boolean(task.dueDate && task.dueDate < todayIso && task.status !== 'CONCLUIDA' && task.status !== 'ARQUIVADA' && task.status !== 'CANCELADA');
const isDueInRange = (dueDate: string | null, startDate: string, endDate: string) => Boolean(dueDate && dueDate >= startDate && dueDate <= endDate);
const isCompletedWithinWindow = (completedAt: string | null, startDate: string, endDate: string) =>
  Boolean(completedAt && completedAt >= `${startDate}T00:00:00.000Z` && completedAt <= `${endDate}T23:59:59.999Z`);

const buildEfficiencySummary = (tasks: Array<Pick<TaskSummary, 'status'>>) => {
  const operationalTasks = tasks.filter((task) => isOperationalStatus(task.status)).length;
  const completedTasks = tasks.filter((task) => task.status === 'CONCLUIDA').length;
  return {
    completedTasks,
    operationalTasks,
    efficiencyPercent: operationalTasks > 0 ? Math.round((completedTasks / operationalTasks) * 100) : null,
  };
};

const compareHighlightedTasks = (left: TaskSummary, right: TaskSummary, todayIso: string) => {
  const leftOverdue = isOverdueTask(left, todayIso);
  const rightOverdue = isOverdueTask(right, todayIso);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const leftDue = left.dueDate || '9999-12-31';
  const rightDue = right.dueDate || '9999-12-31';
  if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);

  return left.protocolNumber - right.protocolNumber;
};

const mapWeeklyReportTaskItem = (task: TaskSummary, todayIso: string, dueSoonEndDate: string): TaskWeeklyReportTaskItem => ({
  taskId: task.id,
  protocolId: task.protocolId,
  title: task.title,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  startDate: task.startDate,
  department: task.department,
  projectName: task.projectName,
  isOverdue: isOverdueTask(task, todayIso),
  isDueSoon: isDueInRange(task.dueDate, todayIso, dueSoonEndDate),
});

const buildGovernanceTasksUrl = () => {
  const rawBase = clean(process.env.NEXTAUTH_URL || process.env.PAINEL_BASE_URL || process.env.NEXT_PUBLIC_PAINEL_URL);
  if (!rawBase) return '/dashboard-executivo/tarefas';
  return `${rawBase.replace(/\/$/, '')}/dashboard-executivo/tarefas`;
};

export const getTaskGlobalWeeklyReportPreview = async (
  db: DbInterface,
  userId: string
): Promise<TaskGlobalWeeklyReportEmailPayload> => {
  const recipient = await resolveCorporateRecipientByUserId(db, clean(userId));
  if (recipient.status !== 'READY' || !recipient.employeeId || !recipient.employeeName || !recipient.corporateEmail) {
    if (recipient.reason === 'MISSING_CORPORATE_EMAIL') {
      throw new TaskValidationError('Destinatário global não possui e-mail corporativo cadastrado.', 400);
    }
    if (recipient.reason === 'MISSING_USER_EMPLOYEE_LINK') {
      throw new TaskValidationError('Destinatário global não possui vínculo ativo com colaborador.', 404);
    }
    throw new TaskValidationError('Destinatário global inválido ou inativo.', 404);
  }

  const period = getPreviousWeeklyReportWindow();
  const todayIso = getTodayInSaoPauloIso();
  const dueSoonEndDate = shiftIsoDate(todayIso, 7);
  const viewer: TaskViewerContext = { userId: clean(userId), canViewAll: true };
  const tasks = await listTasks(db, viewer, { includeCanceled: true });

  const operationalTasks = tasks.filter((task) => isOperationalStatus(task.status));
  const pendingTasks = tasks.filter((task) => isPendingOperationalStatus(task.status));
  const overdueTasks = pendingTasks.filter((task) => isOverdueTask(task, todayIso));
  const dueNext7DaysTasks = pendingTasks.filter((task) => isDueInRange(task.dueDate, todayIso, dueSoonEndDate));
  const awaitingApprovalTasks = pendingTasks.filter((task) => task.status === 'AGUARDANDO_APROVACAO');
  const pausedTasks = pendingTasks.filter((task) => task.status === 'PAUSADO');
  const archivedTasks = tasks.filter((task) => task.status === 'ARQUIVADA');
  const canceledTasks = tasks.filter((task) => task.status === 'CANCELADA');
  const completedThisWeek = tasks.filter((task) => task.status !== 'CANCELADA' && isCompletedWithinWindow(task.completedAt, period.startDate, period.endDate)).length;
  const efficiency = buildEfficiencySummary(tasks);

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length,
  }));
  const byPriority = PRIORITY_ORDER.map((priority) => ({
    priority,
    count: tasks.filter((task) => task.priority === priority).length,
  }));

  const departmentMap = new Map<string, number>();
  for (const task of tasks) {
    const key = task.department || 'Sem setor';
    departmentMap.set(key, (departmentMap.get(key) || 0) + 1);
  }
  const byDepartment = Array.from(departmentMap.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((left, right) => right.count - left.count || left.department.localeCompare(right.department, 'pt-BR'));

  const topDepartmentPending = new Map<string, number>();
  const topProjectPending = new Map<string, number>();
  for (const task of pendingTasks) {
    const department = task.department || 'Sem setor';
    topDepartmentPending.set(department, (topDepartmentPending.get(department) || 0) + 1);
    const projectLabel = task.projectName || 'Tarefas avulsas';
    topProjectPending.set(projectLabel, (topProjectPending.get(projectLabel) || 0) + 1);
  }

  const highlightedOverdueTasks = overdueTasks
    .slice()
    .sort((left, right) => compareHighlightedTasks(left, right, todayIso))
    .slice(0, 6)
    .map((task) => mapWeeklyReportTaskItem(task, todayIso, dueSoonEndDate));
  const highlightedPriorityTasks = pendingTasks
    .filter((task) => task.priority === 'URGENTE' || task.priority === 'ALTA')
    .slice()
    .sort((left, right) => compareHighlightedTasks(left, right, todayIso))
    .slice(0, 6)
    .map((task) => mapWeeklyReportTaskItem(task, todayIso, dueSoonEndDate));
  const highlightedApprovalTasks = awaitingApprovalTasks
    .slice()
    .sort((left, right) => compareHighlightedTasks(left, right, todayIso))
    .slice(0, 6)
    .map((task) => mapWeeklyReportTaskItem(task, todayIso, dueSoonEndDate));

  const topPendingGroups = [
    ...Array.from(topProjectPending.entries()).map(([label, count]) => ({ label, count, scope: 'PROJECT' as const })),
    ...Array.from(topDepartmentPending.entries()).map(([label, count]) => ({ label, count, scope: 'DEPARTMENT' as const })),
  ]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'))
    .slice(0, 8);

  return {
    recipient: {
      userId: recipient.userId || clean(userId),
      employeeId: recipient.employeeId,
      employeeName: recipient.employeeName,
      corporateEmail: recipient.corporateEmail,
    },
    period,
    generatedAt: NOW(),
    governanceTasksUrl: buildGovernanceTasksUrl(),
    summary: {
      operationalTasks: operationalTasks.length,
      pendingTasks: pendingTasks.length,
      completedThisWeek,
      overdueTasks: overdueTasks.length,
      dueNext7DaysTasks: dueNext7DaysTasks.length,
      awaitingApprovalTasks: awaitingApprovalTasks.length,
      pausedTasks: pausedTasks.length,
      archivedTasks: archivedTasks.length,
      canceledTasks: canceledTasks.length,
      efficiency,
    },
    byStatus,
    byPriority,
    byDepartment,
    highlightedOverdueTasks,
    highlightedPriorityTasks,
    highlightedApprovalTasks,
    topPendingGroups,
  };
};

const buildWeeklyReportSubject = (payload: TaskWeeklyReportEmailPayload) =>
  `Consultare Intranet | Tarefas da semana | ${formatIsoDate(payload.period.startDate, { includeYear: false })} a ${formatIsoDate(payload.period.endDate, { includeYear: false })}`;

const buildGlobalWeeklyReportSubject = (payload: TaskGlobalWeeklyReportEmailPayload) =>
  `Consultare Intranet | Relatório global de tarefas | ${formatIsoDate(payload.period.startDate, { includeYear: false })} a ${formatIsoDate(payload.period.endDate, { includeYear: false })}`;

const renderWeeklyEfficiency = (value: number | null) => (value == null ? '—' : `${value}%`);

const renderWeeklyReportText = (payload: TaskWeeklyReportEmailPayload) => {
  const lines = [
    `Olá, ${payload.recipient.employeeName}.`,
    '',
    `Segue seu resumo semanal de tarefas da Consultare referente ao período ${formatIsoDate(payload.period.startDate)} a ${formatIsoDate(payload.period.endDate)}.`,
    '',
    `Pendências atuais: ${payload.summary.pendingTasks}`,
    `Vencidas: ${payload.summary.overdueTasks}`,
    `Vencem nos próximos 7 dias: ${payload.summary.dueNext7DaysTasks}`,
    `Aguardando aprovação: ${payload.summary.awaitingApprovalTasks}`,
    `Eficiência acumulada: ${renderWeeklyEfficiency(payload.summary.accumulatedEfficiency.efficiencyPercent)} (${payload.summary.accumulatedEfficiency.completedTasks}/${payload.summary.accumulatedEfficiency.operationalTasks})`,
    `Eficiência da semana: ${renderWeeklyEfficiency(payload.summary.weeklyEfficiencyPercent)} (${payload.summary.weeklyCompletedTasks}/${payload.summary.weeklyEfficiencyBaseTasks})`,
    '',
    'Tarefas prioritárias:',
  ];

  for (const task of payload.highlightedTasks) {
    const duePart = task.dueDate ? ` | prazo ${formatIsoDate(task.dueDate)}` : '';
    const projectPart = task.projectName ? ` | projeto ${task.projectName}` : '';
    lines.push(`- ${task.protocolId} | ${task.title} | ${task.priority}${duePart}${projectPart}`);
  }

  lines.push('', `Acesse a intranet para atualizar suas entregas: ${payload.intranetTasksUrl}`);
  return lines.join('\n');
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderWeeklyReportHtml = (payload: TaskWeeklyReportEmailPayload) => {
  const metric = (label: string, value: string, helper: string) => `
    <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">${escapeHtml(label)}</div>
      <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(value)}</div>
      <div style="margin-top:6px;font-size:12px;color:#64748b;">${escapeHtml(helper)}</div>
    </div>
  `;

  const tasksHtml = payload.highlightedTasks
    .map(
      (task: TaskWeeklyReportTaskItem) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#123b78;font-weight:700;">${escapeHtml(task.protocolId)}</div>
          <div style="margin-top:4px;font-size:15px;color:#0f172a;font-weight:700;">${escapeHtml(task.title)}</div>
          <div style="margin-top:4px;font-size:12px;color:#64748b;">
            ${escapeHtml(task.priority)}${task.projectName ? ` • ${escapeHtml(task.projectName)}` : ''}${task.dueDate ? ` • prazo ${escapeHtml(formatIsoDate(task.dueDate))}` : ''}
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <div style="background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;overflow:hidden;">
        <div style="background:#123b78;padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;opacity:0.88;">Consultare Intranet</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.2;">Resumo semanal das suas tarefas</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.6;opacity:0.92;">
            ${escapeHtml(payload.recipient.employeeName)}, aqui está seu panorama operacional de ${escapeHtml(formatIsoDate(payload.period.startDate))} até ${escapeHtml(formatIsoDate(payload.period.endDate))}.
          </p>
        </div>
        <div style="padding:28px 32px;">
          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            ${metric('Pendências atuais', String(payload.summary.pendingTasks), 'Sob sua execução direta')}
            ${metric('Vencidas', String(payload.summary.overdueTasks), 'Demandas com prazo expirado')}
            ${metric('Próximos 7 dias', String(payload.summary.dueNext7DaysTasks), 'Prazos que vencem em breve')}
            ${metric('Aguardando aprovação', String(payload.summary.awaitingApprovalTasks), 'Fila de decisão')}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;">
            ${metric(
              'Eficiência acumulada',
              renderWeeklyEfficiency(payload.summary.accumulatedEfficiency.efficiencyPercent),
              `${payload.summary.accumulatedEfficiency.completedTasks}/${payload.summary.accumulatedEfficiency.operationalTasks} tarefas operacionais`
            )}
            ${metric(
              'Eficiência da semana',
              renderWeeklyEfficiency(payload.summary.weeklyEfficiencyPercent),
              `${payload.summary.weeklyCompletedTasks}/${payload.summary.weeklyEfficiencyBaseTasks} no recorte`
            )}
          </div>

          <div style="margin-top:28px;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;">Tarefas prioritárias da semana</div>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#64748b;">
              Ordenamos primeiro as vencidas, depois urgentes, alta prioridade e os prazos mais próximos.
            </p>
            <table style="width:100%;margin-top:12px;border-collapse:collapse;">
              <tbody>${tasksHtml}</tbody>
            </table>
          </div>

          <div style="margin-top:28px;border:1px solid #cfe0ff;background:#eff6ff;border-radius:16px;padding:18px;">
            <div style="font-size:15px;font-weight:700;color:#123b78;">Ação recomendada</div>
            <p style="margin:8px 0 16px;font-size:14px;line-height:1.6;color:#475569;">
              Revise suas pendências na intranet, atualize status, checklist e comentários para manter a governança do time em dia.
            </p>
            <a
              href="${escapeHtml(payload.intranetTasksUrl)}"
              style="display:inline-block;background:#123b78;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;"
            >
              Abrir módulo de tarefas
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderStatusSummaryText = (payload: TaskGlobalWeeklyReportEmailPayload) =>
  payload.byStatus
    .filter((item) => item.count > 0)
    .map((item) => `${STATUS_LABELS[item.status]}: ${item.count}`)
    .join(' | ') || 'Sem tarefas no período.';

const renderPrioritySummaryText = (payload: TaskGlobalWeeklyReportEmailPayload) =>
  payload.byPriority
    .filter((item) => item.count > 0)
    .map((item) => `${PRIORITY_LABELS[item.priority]}: ${item.count}`)
    .join(' | ') || 'Sem distribuição por prioridade.';

const renderDepartmentSummaryText = (payload: TaskGlobalWeeklyReportEmailPayload) =>
  payload.byDepartment
    .slice(0, 5)
    .map((item) => `${item.department}: ${item.count}`)
    .join(' | ') || 'Sem distribuição por setor.';

const renderTaskHighlightsTextBlock = (title: string, tasks: TaskWeeklyReportTaskItem[]) => {
  const lines = [title];
  if (tasks.length <= 0) {
    lines.push('- Sem itens de destaque neste bloco.');
    return lines;
  }
  for (const task of tasks) {
    lines.push(
      `- ${task.protocolId} | ${task.title} | ${task.priority}${task.projectName ? ` | projeto ${task.projectName}` : ''}${task.dueDate ? ` | prazo ${formatIsoDate(task.dueDate)}` : ''}`
      .replace(`| ${task.priority}`, `| ${PRIORITY_LABELS[task.priority]}`)
    );
  }
  return lines;
};

const renderGlobalWeeklyReportText = (payload: TaskGlobalWeeklyReportEmailPayload) => {
  const lines = [
    `Olá, ${payload.recipient.employeeName}.`,
    '',
    `Segue o relatório global semanal de tarefas da Consultare referente ao período ${formatIsoDate(payload.period.startDate)} a ${formatIsoDate(payload.period.endDate)}.`,
    '',
    `Base operacional: ${payload.summary.operationalTasks}`,
    `Pendências operacionais: ${payload.summary.pendingTasks}`,
    `Concluídas na semana: ${payload.summary.completedThisWeek}`,
    `Vencidas: ${payload.summary.overdueTasks}`,
    `Vencem nos próximos 7 dias: ${payload.summary.dueNext7DaysTasks}`,
    `Aguardando aprovação: ${payload.summary.awaitingApprovalTasks}`,
    `Pausadas: ${payload.summary.pausedTasks}`,
    `Arquivadas: ${payload.summary.archivedTasks}`,
    `Canceladas: ${payload.summary.canceledTasks}`,
    `Eficiência global: ${renderWeeklyEfficiency(payload.summary.efficiency.efficiencyPercent)} (${payload.summary.efficiency.completedTasks}/${payload.summary.efficiency.operationalTasks})`,
    '',
    `Resumo por status: ${renderStatusSummaryText(payload)}`,
    `Resumo por prioridade: ${renderPrioritySummaryText(payload)}`,
    `Resumo por setor: ${renderDepartmentSummaryText(payload)}`,
    '',
    ...renderTaskHighlightsTextBlock('Tarefas vencidas mais críticas:', payload.highlightedOverdueTasks),
    '',
    ...renderTaskHighlightsTextBlock('Tarefas urgentes/alta prioridade:', payload.highlightedPriorityTasks),
    '',
    ...renderTaskHighlightsTextBlock('Tarefas aguardando aprovação:', payload.highlightedApprovalTasks),
    '',
    'Grupos com maior volume pendente:',
  ];

  if (payload.topPendingGroups.length <= 0) {
    lines.push('- Sem concentração relevante de pendências neste recorte.');
  } else {
    for (const item of payload.topPendingGroups) {
      lines.push(`- ${item.scope === 'PROJECT' ? 'Projeto' : 'Setor'} ${item.label}: ${item.count} pendência(s)`);
    }
  }

  lines.push('', `Acesse a governança de tarefas no painel: ${payload.governanceTasksUrl}`);
  return lines.join('\n');
};

const renderTaskHighlightRowsHtml = (tasks: TaskWeeklyReportTaskItem[], emptyLabel: string) => {
  if (tasks.length <= 0) {
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">${escapeHtml(emptyLabel)}</td></tr>`;
  }

  return tasks
    .map(
      (task) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:12px;color:#123b78;font-weight:700;">${escapeHtml(task.protocolId)}</div>
            <div style="margin-top:4px;font-size:15px;color:#0f172a;font-weight:700;">${escapeHtml(task.title)}</div>
            <div style="margin-top:4px;font-size:12px;color:#64748b;">
              ${escapeHtml(task.priority)}${task.projectName ? ` • ${escapeHtml(task.projectName)}` : ''}${task.dueDate ? ` • prazo ${escapeHtml(formatIsoDate(task.dueDate))}` : ''}
            </div>
          </td>
        </tr>
      `
    )
    .join('');
};

const renderGlobalWeeklyReportHtml = (payload: TaskGlobalWeeklyReportEmailPayload) => {
  const metric = (label: string, value: string, helper: string) => `
    <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">${escapeHtml(label)}</div>
      <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(value)}</div>
      <div style="margin-top:6px;font-size:12px;color:#64748b;">${escapeHtml(helper)}</div>
    </div>
  `;

  const summaryList = (items: string[]) =>
    items.length > 0
      ? `<ul style="margin:10px 0 0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : `<div style="margin-top:10px;font-size:13px;color:#64748b;">Sem dados relevantes neste bloco.</div>`;

  const prioritySummaryItems = payload.byPriority.filter((item) => item.count > 0).map((item) => `${PRIORITY_LABELS[item.priority]}: ${item.count}`);
  const normalizedStatusSummaryItems = payload.byStatus.filter((item) => item.count > 0).map((item) => `${STATUS_LABELS[item.status]}: ${item.count}`);
  const departmentSummaryItems = payload.byDepartment.slice(0, 6).map((item) => `${item.department}: ${item.count}`);
  const topPendingItems = payload.topPendingGroups.map(
    (item) => `${item.scope === 'PROJECT' ? 'Projeto' : 'Setor'} ${item.label}: ${item.count} pendência(s)`
  );

  return `
    <div style="background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:840px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;overflow:hidden;">
        <div style="background:#123b78;padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;opacity:0.88;">Consultare Intranet</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.2;">Relatório global semanal de tarefas</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.6;opacity:0.92;">
            Panorama executivo de ${escapeHtml(formatIsoDate(payload.period.startDate))} até ${escapeHtml(formatIsoDate(payload.period.endDate))}, com foco em pendências, ritmo operacional e pontos de atenção.
          </p>
        </div>
        <div style="padding:28px 32px;">
          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            ${metric('Base operacional', String(payload.summary.operationalTasks), 'Ativas e concluídas no fluxo')}
            ${metric('Pendências', String(payload.summary.pendingTasks), 'Demandas ainda em execução')}
            ${metric('Concluídas na semana', String(payload.summary.completedThisWeek), 'Entregas encerradas no recorte')}
            ${metric('Vencidas', String(payload.summary.overdueTasks), 'Prazos já expirados')}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;">
            ${metric('Próximos 7 dias', String(payload.summary.dueNext7DaysTasks), 'Prazos que vencem em breve')}
            ${metric('Aguardando aprovação', String(payload.summary.awaitingApprovalTasks), 'Fila de decisão')}
            ${metric('Pausadas', String(payload.summary.pausedTasks), 'Demandas interrompidas')}
            ${metric(
              'Eficiência global',
              renderWeeklyEfficiency(payload.summary.efficiency.efficiencyPercent),
              `${payload.summary.efficiency.completedTasks}/${payload.summary.efficiency.operationalTasks} tarefas operacionais`
            )}
          </div>

          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:24px;">
            <div style="border:1px solid #dbe4f0;border-radius:16px;padding:16px;background:#ffffff;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;">Resumo por status</div>
              ${summaryList(normalizedStatusSummaryItems)}
            </div>
            <div style="border:1px solid #dbe4f0;border-radius:16px;padding:16px;background:#ffffff;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;">Resumo por prioridade</div>
              ${summaryList(prioritySummaryItems)}
            </div>
            <div style="border:1px solid #dbe4f0;border-radius:16px;padding:16px;background:#ffffff;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;">Resumo por setor</div>
              ${summaryList(departmentSummaryItems)}
            </div>
            <div style="border:1px solid #dbe4f0;border-radius:16px;padding:16px;background:#ffffff;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;">Maior volume pendente</div>
              ${summaryList(topPendingItems)}
            </div>
          </div>

          <div style="margin-top:28px;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;">Destaques executivos</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:12px;">
              <div style="border:1px solid #dbe4f0;border-radius:16px;padding:14px;background:#ffffff;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;">Vencidas críticas</div>
                <table style="width:100%;margin-top:10px;border-collapse:collapse;"><tbody>${renderTaskHighlightRowsHtml(payload.highlightedOverdueTasks, 'Sem tarefas vencidas críticas no recorte.')}</tbody></table>
              </div>
              <div style="border:1px solid #dbe4f0;border-radius:16px;padding:14px;background:#ffffff;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;">Urgentes e alta prioridade</div>
                <table style="width:100%;margin-top:10px;border-collapse:collapse;"><tbody>${renderTaskHighlightRowsHtml(payload.highlightedPriorityTasks, 'Sem urgências ou prioridades altas destacadas.')}</tbody></table>
              </div>
              <div style="border:1px solid #dbe4f0;border-radius:16px;padding:14px;background:#ffffff;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;">Aguardando aprovação</div>
                <table style="width:100%;margin-top:10px;border-collapse:collapse;"><tbody>${renderTaskHighlightRowsHtml(payload.highlightedApprovalTasks, 'Sem tarefas aguardando aprovação neste momento.')}</tbody></table>
              </div>
            </div>
          </div>

          <div style="margin-top:28px;border:1px solid #cfe0ff;background:#eff6ff;border-radius:16px;padding:18px;">
            <div style="font-size:15px;font-weight:700;color:#123b78;">Leitura gerencial recomendada</div>
            <p style="margin:8px 0 16px;font-size:14px;line-height:1.6;color:#475569;">
              Use este resumo como triagem executiva da semana e aprofunde a análise completa na governança de tarefas do painel.
            </p>
            <a
              href="${escapeHtml(payload.governanceTasksUrl)}"
              style="display:inline-block;background:#123b78;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;"
            >
              Abrir governança de tarefas
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
};

const sendWeeklyReportEmailContent = async (
  recipient: { employeeName: string; corporateEmail: string },
  content: { subject: string; text: string; html: string; payloadJson: string },
  settings: TaskWeeklyReportSettings
) => {

  const response = await sendPulseRequest<{ result?: boolean; id?: string }>(`/smtp/emails`, {
    method: 'POST',
    body: JSON.stringify({
      email: {
        html: Buffer.from(content.html, 'utf-8').toString('base64'),
        text: content.text,
        subject: content.subject,
        from: {
          name: settings.fromName,
          email: settings.fromEmail,
        },
        to: [
          {
            name: recipient.employeeName,
            email: recipient.corporateEmail,
          },
        ],
        ...(settings.replyToEmail
          ? {
              reply_to: {
                name: settings.fromName,
                email: settings.replyToEmail,
              },
            }
          : {}),
      },
    }),
  });

  if (!response?.result || !clean(response.id)) {
    throw new TaskWeeklyReportValidationError('SendPulse não retornou confirmação válida para o envio.', 502);
  }

  return {
    providerMessageId: clean(response.id),
    subject: content.subject,
    payloadJson: content.payloadJson,
  };
};

const sendWeeklyReportEmail = async (payload: TaskWeeklyReportEmailPayload, settings: TaskWeeklyReportSettings) =>
  sendWeeklyReportEmailContent(
    payload.recipient,
    {
      subject: buildWeeklyReportSubject(payload),
      text: renderWeeklyReportText(payload),
      html: renderWeeklyReportHtml(payload),
      payloadJson: JSON.stringify(payload),
    },
    settings
  );

const sendGlobalWeeklyReportEmail = async (payload: TaskGlobalWeeklyReportEmailPayload, settings: TaskWeeklyReportSettings) =>
  sendWeeklyReportEmailContent(
    payload.recipient,
    {
      subject: buildGlobalWeeklyReportSubject(payload),
      text: renderGlobalWeeklyReportText(payload),
      html: renderGlobalWeeklyReportHtml(payload),
      payloadJson: JSON.stringify(payload),
    },
    settings
  );

const refreshRunCounters = async (db: DbInterface, runId: string) => {
  const rows = await db.query(
    `
    SELECT
      SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped_count,
      SUM(CASE WHEN status IN ('ACCEPTED_PROVIDER', 'DELIVERED', 'OPENED', 'CLICKED', 'UNSUBSCRIBED', 'RESUBSCRIBED', 'SPAM', 'SOFT_BOUNCE', 'HARD_BOUNCE') THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
    FROM task_weekly_report_recipients
    WHERE run_id = ?
    `,
    [runId]
  );
  const row = rows[0] || {};
  await db.execute(
    `
    UPDATE task_weekly_report_runs
    SET skipped_count = ?, sent_count = ?, failed_count = ?, updated_at = ?
    WHERE id = ?
    `,
    [parseIntSafe(row.skipped_count, 0), parseIntSafe(row.sent_count, 0), parseIntSafe(row.failed_count, 0), NOW(), runId]
  );
};

export const listTaskWeeklyReportRuns = async (db: DbInterface, limit = 20): Promise<TaskWeeklyReportRun[]> => {
  await ensureTaskWeeklyReportTables(db);
  const rows = await db.query(
    `SELECT * FROM task_weekly_report_runs ORDER BY created_at DESC LIMIT ?`,
    [Math.max(1, Math.min(limit, 100))]
  );
  return rows.map(mapRun);
};

export const processTaskWeeklyReportRun = async (
  db: DbInterface,
  input: {
    triggerSource: TaskWeeklyReportTriggerSource;
    triggeredBy: string;
    force?: boolean;
    maxRecipients?: number;
  }
): Promise<TaskWeeklyReportProcessResult> => {
  await ensureTaskWeeklyReportTables(db);
  const settings = await getTaskWeeklyReportSettings(db);
  if (!settings.enabled && !settings.globalReportEnabled) {
    throw new TaskWeeklyReportValidationError('Ative ao menos um fluxo do report semanal de tarefas antes de processar o envio.');
  }
  if (!settings.fromEmail) {
    throw new TaskWeeklyReportValidationError('Configure o remetente do report semanal antes de processar o envio.');
  }

  const window = getPreviousWeeklyReportWindow();
  const existingRuns = await db.query(
    `SELECT * FROM task_weekly_report_runs WHERE run_key = ? ORDER BY attempt_number DESC, created_at DESC`,
    [window.runKey]
  );
  const latestRun = existingRuns[0] ? mapRun(existingRuns[0]) : null;

  if (!input.force && latestRun?.status === 'COMPLETED') {
    return { reusedExistingRun: true, run: latestRun };
  }
  if (!input.force && latestRun?.status === 'RUNNING') {
    throw new TaskWeeklyReportValidationError('Já existe um processamento semanal em andamento para esta janela.', 409);
  }

  const now = NOW();
  const runId = randomUUID();
  const attemptNumber = latestRun ? latestRun.attemptNumber + 1 : 1;
  const maxRecipients = input.maxRecipients && input.maxRecipients > 0 ? input.maxRecipients : null;

  const run = await runInTransaction(db, async (txDb) => {
    const eligibility = settings.enabled
      ? await getTaskWeeklyReportEligibilitySummary(txDb)
      : {
          generatedAt: NOW(),
          eligibleRecipients: [],
          skippedRecipients: [],
        };
    const globalRecipientsSummary = settings.globalReportEnabled
      ? await getTaskWeeklyReportGlobalRecipientsSummary(txDb, settings.globalRecipientUserIds)
      : {
          generatedAt: NOW(),
          selectedCount: 0,
          readyRecipients: [],
          skippedRecipients: [],
        };
    const eligibleRecipients = maxRecipients ? eligibility.eligibleRecipients.slice(0, maxRecipients) : eligibility.eligibleRecipients;
    const totalEligibleCount = eligibleRecipients.length + globalRecipientsSummary.readyRecipients.length;
    const totalSkippedCount = eligibility.skippedRecipients.length + globalRecipientsSummary.skippedRecipients.length;

    await txDb.execute(
      `
      INSERT INTO task_weekly_report_runs (
        id, run_key, window_start_date, window_end_date, status, trigger_source, triggered_by,
        attempt_number, provider, eligible_count, skipped_count, sent_count, failed_count,
        started_at, finished_at, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, 'sendpulse', ?, ?, 0, 0, ?, NULL, NULL, ?, ?)
      `,
      [
        runId,
        window.runKey,
        window.startDate,
        window.endDate,
        input.triggerSource,
        clean(input.triggeredBy),
        attemptNumber,
        totalEligibleCount,
        totalSkippedCount,
        now,
        now,
        now,
      ]
    );

    for (const skipped of eligibility.skippedRecipients) {
      await txDb.execute(
        `
        INSERT INTO task_weekly_report_recipients (
          id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
          provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
        ) VALUES (?, ?, 'INDIVIDUAL', ?, ?, ?, NULL, 'SKIPPED', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
        `,
        [
          randomUUID(),
          runId,
          skipped.userId,
          skipped.employeeId,
          skipped.employeeName,
          skipped.reason,
          now,
          now,
        ]
      );
    }

    for (const skipped of globalRecipientsSummary.skippedRecipients) {
      await txDb.execute(
        `
        INSERT INTO task_weekly_report_recipients (
          id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
          provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
        ) VALUES (?, ?, 'GLOBAL', ?, ?, ?, ?, 'SKIPPED', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
        `,
        [
          randomUUID(),
          runId,
          skipped.userId,
          skipped.employeeId,
          skipped.employeeName || skipped.userName || null,
          skipped.corporateEmail,
          skipped.reason,
          now,
          now,
        ]
      );
    }

    for (const recipient of eligibleRecipients) {
      let recipientRecordId = randomUUID();
      try {
        const preview = await getTaskWeeklyReportPreview(txDb, recipient.userId);
        const sent = await sendWeeklyReportEmail(preview, settings);

        await txDb.execute(
          `
          INSERT INTO task_weekly_report_recipients (
            id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, 'INDIVIDUAL', ?, ?, ?, ?, 'ACCEPTED_PROVIDER', NULL, NULL, ?, 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?)
          `,
          [
            recipientRecordId,
            runId,
            recipient.userId,
            recipient.employeeId,
            recipient.employeeName,
            recipient.corporateEmail,
            sent.providerMessageId,
            now,
            sent.subject,
            sent.payloadJson,
            now,
            now,
            now,
          ]
        );

        await txDb.execute(
          `
          INSERT INTO task_weekly_report_events (
            id, run_id, recipient_record_id, report_type, provider, event_type, normalized_status, provider_event_id,
            provider_message_id, recipient_email, payload_json, occurred_at, processed_at, created_at
          ) VALUES (?, ?, ?, 'INDIVIDUAL', 'sendpulse', 'send_request_accepted', 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            randomUUID(),
            runId,
            recipientRecordId,
            `send_request_accepted:${sent.providerMessageId}`,
            sent.providerMessageId,
            recipient.corporateEmail,
            sent.payloadJson,
            now,
            now,
            now,
          ]
        );
      } catch (error: any) {
        await txDb.execute(
          `
          INSERT INTO task_weekly_report_recipients (
            id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, 'INDIVIDUAL', ?, ?, ?, ?, 'FAILED', NULL, ?, NULL, 'FAILED', ?, NULL, NULL, NULL, ?, ?)
          `,
          [
            recipientRecordId,
            runId,
            recipient.userId,
            recipient.employeeId,
            recipient.employeeName,
            recipient.corporateEmail,
            String(error?.message || 'Falha ao enviar report semanal.'),
            now,
            now,
            now,
          ]
        );
      }
    }

    for (const recipient of globalRecipientsSummary.readyRecipients) {
      let recipientRecordId = randomUUID();
      try {
        const preview = await getTaskGlobalWeeklyReportPreview(txDb, recipient.userId || '');
        const sent = await sendGlobalWeeklyReportEmail(preview, settings);

        await txDb.execute(
          `
          INSERT INTO task_weekly_report_recipients (
            id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, 'GLOBAL', ?, ?, ?, ?, 'ACCEPTED_PROVIDER', NULL, NULL, ?, 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?)
          `,
          [
            recipientRecordId,
            runId,
            recipient.userId,
            recipient.employeeId,
            recipient.employeeName,
            recipient.corporateEmail,
            sent.providerMessageId,
            now,
            sent.subject,
            sent.payloadJson,
            now,
            now,
            now,
          ]
        );

        await txDb.execute(
          `
          INSERT INTO task_weekly_report_events (
            id, run_id, recipient_record_id, report_type, provider, event_type, normalized_status, provider_event_id,
            provider_message_id, recipient_email, payload_json, occurred_at, processed_at, created_at
          ) VALUES (?, ?, ?, 'GLOBAL', 'sendpulse', 'send_request_accepted', 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            randomUUID(),
            runId,
            recipientRecordId,
            `send_request_accepted:${sent.providerMessageId}:global`,
            sent.providerMessageId,
            recipient.corporateEmail,
            sent.payloadJson,
            now,
            now,
            now,
          ]
        );
      } catch (error: any) {
        await txDb.execute(
          `
          INSERT INTO task_weekly_report_recipients (
            id, run_id, report_type, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, 'GLOBAL', ?, ?, ?, ?, 'FAILED', NULL, ?, NULL, 'FAILED', ?, NULL, NULL, NULL, ?, ?)
          `,
          [
            recipientRecordId,
            runId,
            recipient.userId,
            recipient.employeeId,
            recipient.employeeName,
            recipient.corporateEmail,
            String(error?.message || 'Falha ao enviar relatório global semanal.'),
            now,
            now,
            now,
          ]
        );
      }
    }

    await refreshRunCounters(txDb, runId);
    await txDb.execute(
      `
      UPDATE task_weekly_report_runs
      SET status = 'COMPLETED', finished_at = ?, updated_at = ?
      WHERE id = ?
      `,
      [NOW(), NOW(), runId]
    );

    const runRows = await txDb.query(`SELECT * FROM task_weekly_report_runs WHERE id = ? LIMIT 1`, [runId]);
    return mapRun(runRows[0]);
  });

  return {
    reusedExistingRun: false,
    run,
  };
};

const normalizeWebhookStatus = (eventType: string): TaskWeeklyReportRecipientStatus | null => {
  const normalized = clean(eventType).toLowerCase();
  if (normalized === 'delivered') return 'DELIVERED';
  if (normalized === 'undelivered') return 'FAILED';
  if (normalized === 'opened') return 'OPENED';
  if (normalized === 'clicked') return 'CLICKED';
  if (normalized === 'unsubscribed') return 'UNSUBSCRIBED';
  if (normalized === 'resubscribed') return 'RESUBSCRIBED';
  if (normalized === 'spam_by_user') return 'SPAM';
  if (normalized === 'soft_bounces') return 'SOFT_BOUNCE';
  if (normalized === 'hard_bounces') return 'HARD_BOUNCE';
  return null;
};

const findRecipientRecordForWebhook = async (
  db: DbInterface,
  messageId: string | null,
  recipientEmail: string | null,
  subject: string | null
) => {
  if (messageId) {
    const directRows = await db.query(
      `
      SELECT *
      FROM task_weekly_report_recipients
      WHERE provider_message_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [messageId]
    );
    if (directRows[0]) return mapRecipientRecord(directRows[0]);
  }

  if (recipientEmail) {
    const fallbackRows = await db.query(
      `
      SELECT *
      FROM task_weekly_report_recipients
      WHERE corporate_email = ?
        AND (? IS NULL OR subject = ?)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [recipientEmail, subject, subject]
    );
    if (fallbackRows[0]) return mapRecipientRecord(fallbackRows[0]);
  }

  return null;
};

export const processTaskWeeklyReportSendPulseWebhook = async (
  db: DbInterface,
  payload: any
): Promise<TaskWeeklyReportEventRecord[]> => {
  await ensureTaskWeeklyReportTables(db);

  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload];
  const processed: TaskWeeklyReportEventRecord[] = [];

  for (const item of items) {
    const eventType = clean(item?.event);
    if (!eventType) continue;

    const occurredAt = item?.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : null;
    const providerMessageId = nullable(item?.message_id);
    const recipientEmail = nullable(item?.recipient || item?.email);
    const subject = nullable(item?.subject);
    const providerEventId = clean(
      item?.provider_event_id ||
        `${eventType}:${providerMessageId || recipientEmail || 'unknown'}:${clean(item?.timestamp || NOW())}`
    );

    const existingRows = await db.query(
      `
      SELECT *
      FROM task_weekly_report_events
      WHERE provider = 'sendpulse' AND provider_event_id = ?
      LIMIT 1
      `,
      [providerEventId]
    );
    if (existingRows[0]) {
      processed.push(mapEventRecord(existingRows[0]));
      continue;
    }

    const normalizedStatus = normalizeWebhookStatus(eventType) || 'FAILED';
    const recipientRecord = await findRecipientRecordForWebhook(db, providerMessageId, recipientEmail, subject);
    const recipientRecordId = recipientRecord?.id || null;
    const runId = recipientRecord?.runId || null;
    const now = NOW();

    await db.execute(
      `
      INSERT INTO task_weekly_report_events (
        id, run_id, recipient_record_id, report_type, provider, event_type, normalized_status, provider_event_id,
        provider_message_id, recipient_email, payload_json, occurred_at, processed_at, created_at
      ) VALUES (?, ?, ?, ?, 'sendpulse', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        runId,
        recipientRecordId,
        recipientRecord?.reportType || null,
        eventType,
        normalizedStatus,
        providerEventId,
        providerMessageId,
        recipientEmail,
        JSON.stringify(item),
        occurredAt,
        now,
        now,
      ]
    );

    if (recipientRecordId) {
      await db.execute(
        `
        UPDATE task_weekly_report_recipients
        SET status = ?, provider_event_status = ?, provider_event_at = ?, updated_at = ?
        WHERE id = ?
        `,
        [normalizedStatus, eventType, occurredAt || now, now, recipientRecordId]
      );
    }

    if (runId) {
      await refreshRunCounters(db, runId);
    }

    const rows = await db.query(
      `
      SELECT *
      FROM task_weekly_report_events
      WHERE provider = 'sendpulse' AND provider_event_id = ?
      LIMIT 1
      `,
      [providerEventId]
    );
    if (rows[0]) processed.push(mapEventRecord(rows[0]));
  }

  return processed;
};
