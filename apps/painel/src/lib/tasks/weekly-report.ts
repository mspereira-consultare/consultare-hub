import { randomUUID } from 'crypto';
import {
  getTaskWeeklyReportEligibilitySummary,
  getTaskWeeklyReportPreview,
  TaskValidationError,
} from '@consultare/core/tasks/repository';
import type { TaskWeeklyReportEmailPayload, TaskWeeklyReportTaskItem } from '@consultare/core/tasks/types';
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

export type TaskWeeklyReportSettings = {
  enabled: boolean;
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
    runKey: `${startDate}:${endDate}`,
  };
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
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_recipients ADD COLUMN provider_event_status VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE task_weekly_report_recipients ADD COLUMN provider_event_at TEXT NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_runs_run_key ON task_weekly_report_runs (run_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_runs_status ON task_weekly_report_runs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_recipients_run ON task_weekly_report_recipients (run_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_recipients_message ON task_weekly_report_recipients (provider_message_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_task_weekly_report_events_run ON task_weekly_report_events (run_id)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_task_weekly_report_events_provider_event ON task_weekly_report_events (provider, provider_event_id)`);

  const now = NOW();
  await db.execute(
    `
    INSERT INTO task_weekly_report_settings (id, enabled, from_email, from_name, reply_to_email, updated_by, updated_at)
    VALUES (?, 0, NULL, 'Consultare Intranet', NULL, NULL, ?)
    ON CONFLICT(id) DO NOTHING
    `,
    [SETTINGS_ROW_ID, now]
  );

  tablesEnsured = true;
};

export const getTaskWeeklyReportSettings = async (db: DbInterface): Promise<TaskWeeklyReportSettings> => {
  await ensureTaskWeeklyReportTables(db);
  const rows = await db.query(`SELECT * FROM task_weekly_report_settings WHERE id = ? LIMIT 1`, [SETTINGS_ROW_ID]);
  const row = rows[0] || {};
  return {
    enabled: parseBool(row.enabled),
    fromEmail: clean(row.from_email),
    fromName: clean(row.from_name) || 'Consultare Intranet',
    replyToEmail: nullable(row.reply_to_email),
    updatedAt: nullable(row.updated_at),
    updatedBy: nullable(row.updated_by),
  };
};

const normalizeSendPulseSettingsInput = (payload: Partial<TaskWeeklyReportSettings>) => {
  const enabled = Boolean(payload.enabled);
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

  return {
    enabled,
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

export const updateTaskWeeklyReportSettings = async (
  db: DbInterface,
  payload: Partial<TaskWeeklyReportSettings>,
  actorUserId: string
): Promise<TaskWeeklyReportSettings> => {
  await ensureTaskWeeklyReportTables(db);
  const normalized = normalizeSendPulseSettingsInput(payload);
  await validateSendPulseSender(normalized.fromEmail);
  const now = NOW();

  await db.execute(
    `
    INSERT INTO task_weekly_report_settings (id, enabled, from_email, from_name, reply_to_email, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      from_email = excluded.from_email,
      from_name = excluded.from_name,
      reply_to_email = excluded.reply_to_email,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    `,
    [
      SETTINGS_ROW_ID,
      normalized.enabled ? 1 : 0,
      normalized.fromEmail,
      normalized.fromName,
      normalized.replyToEmail,
      clean(actorUserId),
      now,
    ]
  );

  return getTaskWeeklyReportSettings(db);
};

const buildWeeklyReportSubject = (payload: TaskWeeklyReportEmailPayload) =>
  `Consultare Intranet | Tarefas da semana | ${payload.period.startDate} a ${payload.period.endDate}`;

const renderWeeklyEfficiency = (value: number | null) => (value == null ? '—' : `${value}%`);

const renderWeeklyReportText = (payload: TaskWeeklyReportEmailPayload) => {
  const lines = [
    `Olá, ${payload.recipient.employeeName}.`,
    '',
    `Segue seu resumo semanal de tarefas da Consultare referente ao período ${payload.period.startDate} a ${payload.period.endDate}.`,
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
    const duePart = task.dueDate ? ` | prazo ${task.dueDate}` : '';
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
            ${escapeHtml(task.priority)}${task.projectName ? ` • ${escapeHtml(task.projectName)}` : ''}${task.dueDate ? ` • prazo ${escapeHtml(task.dueDate)}` : ''}
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
            ${escapeHtml(payload.recipient.employeeName)}, aqui está seu panorama operacional de ${escapeHtml(payload.period.startDate)} até ${escapeHtml(payload.period.endDate)}.
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

const sendWeeklyReportEmail = async (
  payload: TaskWeeklyReportEmailPayload,
  settings: TaskWeeklyReportSettings
) => {
  const subject = buildWeeklyReportSubject(payload);
  const text = renderWeeklyReportText(payload);
  const html = renderWeeklyReportHtml(payload);

  const response = await sendPulseRequest<{ result?: boolean; id?: string }>(`/smtp/emails`, {
    method: 'POST',
    body: JSON.stringify({
      email: {
        html: Buffer.from(html, 'utf-8').toString('base64'),
        text,
        subject,
        from: {
          name: settings.fromName,
          email: settings.fromEmail,
        },
        to: [
          {
            name: payload.recipient.employeeName,
            email: payload.recipient.corporateEmail,
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
    subject,
    payloadJson: JSON.stringify(payload),
  };
};

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
  if (!settings.enabled) {
    throw new TaskWeeklyReportValidationError('O report semanal de tarefas está desativado nas configurações administrativas.');
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
    const eligibility = await getTaskWeeklyReportEligibilitySummary(txDb);
    const eligibleRecipients = maxRecipients
      ? eligibility.eligibleRecipients.slice(0, maxRecipients)
      : eligibility.eligibleRecipients;

    await txDb.execute(
      `
      INSERT INTO task_weekly_report_runs (
        id, run_key, window_start_date, window_end_date, status, trigger_source, triggered_by,
        attempt_number, provider, eligible_count, skipped_count, sent_count, failed_count,
        started_at, finished_at, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, 'sendpulse', ?, 0, 0, 0, ?, NULL, NULL, ?, ?)
      `,
      [runId, window.runKey, window.startDate, window.endDate, input.triggerSource, clean(input.triggeredBy), attemptNumber, eligibleRecipients.length, now, now, now]
    );

    for (const skipped of eligibility.skippedRecipients) {
      await txDb.execute(
        `
        INSERT INTO task_weekly_report_recipients (
          id, run_id, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
          provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 'SKIPPED', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
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

    for (const recipient of eligibleRecipients) {
      let recipientRecordId = randomUUID();
      try {
        const preview = await getTaskWeeklyReportPreview(txDb, recipient.userId);
        const sent = await sendWeeklyReportEmail(preview, settings);

        await txDb.execute(
          `
          INSERT INTO task_weekly_report_recipients (
            id, run_id, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTED_PROVIDER', NULL, NULL, ?, 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?)
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
            id, run_id, recipient_record_id, provider, event_type, normalized_status, provider_event_id,
            provider_message_id, recipient_email, payload_json, occurred_at, processed_at, created_at
          ) VALUES (?, ?, ?, 'sendpulse', 'send_request_accepted', 'ACCEPTED_PROVIDER', ?, ?, ?, ?, ?, ?, ?)
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
            id, run_id, user_id, employee_id, employee_name, corporate_email, status, skip_reason, error_message,
            provider_message_id, provider_event_status, provider_event_at, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'FAILED', NULL, ?, NULL, 'FAILED', ?, NULL, NULL, NULL, ?, ?)
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
        id, run_id, recipient_record_id, provider, event_type, normalized_status, provider_event_id,
        provider_message_id, recipient_email, payload_json, occurred_at, processed_at, created_at
      ) VALUES (?, ?, ?, 'sendpulse', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        runId,
        recipientRecordId,
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
