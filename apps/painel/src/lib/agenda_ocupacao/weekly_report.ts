import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { runInTransaction, type DbInterface } from '@/lib/db';
import { listAgendaOcupacaoDailyRows } from '@/lib/agenda_ocupacao/repository';
import { AGENDA_OCCUPANCY_DEFAULT_UNITS } from '@/lib/agenda_ocupacao/types';
import { upsertSystemStatus } from '@/lib/system_status_repository';

type AgendaOccupancyWeeklyReportRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
type AgendaOccupancyWeeklyReportRecipientStatus = 'SKIPPED' | 'FAILED' | 'ACCEPTED_PROVIDER';
type AgendaOccupancyWeeklyReportTriggerSource = 'cron' | 'manual';

type OccupancyClassification = 'HIGH' | 'LOW';

export type AgendaOccupancyWeeklyReportSettings = {
  enabled: boolean;
  recipientEmployeeIds: string[];
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AgendaOccupancyWeeklyReportRecipientState = {
  employeeId: string;
  employeeName: string;
  corporateEmail: string | null;
  isActive: boolean;
  status: 'READY' | 'SKIPPED';
  reason: 'MISSING_CORPORATE_EMAIL' | 'INACTIVE' | 'EMPLOYEE_NOT_FOUND' | null;
  isSelected: boolean;
};

export type AgendaOccupancyWeeklyReportEligibilitySummary = {
  generatedAt: string;
  eligibleRecipients: AgendaOccupancyWeeklyReportRecipientState[];
  ineligibleRecipients: AgendaOccupancyWeeklyReportRecipientState[];
  selectedReadyRecipients: AgendaOccupancyWeeklyReportRecipientState[];
  selectedSkippedRecipients: AgendaOccupancyWeeklyReportRecipientState[];
};

export type AgendaOccupancyWeeklyReportRun = {
  id: string;
  runKey: string;
  weekStartDate: string;
  weekEndDate: string;
  status: AgendaOccupancyWeeklyReportRunStatus;
  triggerSource: AgendaOccupancyWeeklyReportTriggerSource;
  triggeredBy: string;
  refreshJobId: string | null;
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

export type AgendaOccupancyWeeklyReportPreview = {
  subject: string;
  text: string;
  recipient: {
    employeeId: string;
    employeeName: string;
    corporateEmail: string;
  };
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  generatedAt: string;
  attachments: string[];
  summary: {
    highCount: number;
    lowCount: number;
    totalAppointments: number;
    totalOpenSlots: number;
    totalBlockedSlots: number;
    totalSpecialties: number;
  };
  sections: Array<{
    unitId: number;
    unitName: string;
    highOccupancy: WeeklyOccupancySectionItem[];
    lowOccupancy: WeeklyOccupancySectionItem[];
    totals: {
      appointments: number;
      openSlots: number;
      blockedSlots: number;
      specialties: number;
      occupancyPct: number;
    };
  }>;
};

export type AgendaOccupancyWeeklyReportProcessResult = {
  reusedExistingRun: boolean;
  run: AgendaOccupancyWeeklyReportRun;
};

type WeeklyOccupancySectionItem = {
  especialidadeId: number;
  especialidadeNome: string;
  agendamentosCount: number;
  horariosDisponiveisCount: number;
  horariosBloqueadosCount: number;
  capacidadeLiquidaCount: number;
  taxaOcupacaoComercialPct: number;
  taxaBloqueioPct: number;
  classification: OccupancyClassification;
};

type WeeklyOccupancyDataset = {
  startDate: string;
  endDate: string;
  generatedAt: string;
  sections: Array<{
    unitId: number;
    unitName: string;
    highOccupancy: WeeklyOccupancySectionItem[];
    lowOccupancy: WeeklyOccupancySectionItem[];
    allRows: WeeklyOccupancySectionItem[];
    totals: {
      appointments: number;
      openSlots: number;
      blockedSlots: number;
      specialties: number;
      occupancyPct: number;
    };
  }>;
  summary: {
    highCount: number;
    lowCount: number;
    totalAppointments: number;
    totalOpenSlots: number;
    totalBlockedSlots: number;
    totalSpecialties: number;
  };
  detailRows: Awaited<ReturnType<typeof listAgendaOcupacaoDailyRows>>;
};

type SendAttachment = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

const SETTINGS_ROW_ID = 'default';
const HIGH_OCCUPANCY_THRESHOLD = 70;
const LOW_OCCUPANCY_THRESHOLD = 50;
const SENDPULSE_API_BASE_URL = 'https://api.sendpulse.com';
const SYSTEM_STATUS_SERVICE = 'agenda_occupancy_weekly_report';
const UNIT_NAME_BY_ID: Record<number, string> = {
  2: 'Ouro Verde',
  3: 'Centro Cambui',
  12: 'Shopping Campinas',
};

let tablesEnsured = false;
let cachedSendPulseToken: { token: string; expiresAt: number } | null = null;

export class AgendaOccupancyWeeklyReportValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const NOW = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
};
const parseBool = (value: unknown) =>
  value === true || value === 1 || clean(value) === '1' || clean(value).toLowerCase() === 'true';
const parseIntSafe = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(clean(value), 10);
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

const normalizeIsoDate = (value: unknown, fieldName: string) => {
  const raw = clean(value);
  if (!raw) throw new AgendaOccupancyWeeklyReportValidationError(`Campo ${fieldName} obrigatório.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AgendaOccupancyWeeklyReportValidationError(`Campo ${fieldName} inválido. Use YYYY-MM-DD.`);
  }
  const dt = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw new AgendaOccupancyWeeklyReportValidationError(`Campo ${fieldName} inválido.`);
  }
  return raw;
};

const formatIsoDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`));

const formatDateTime = (value: string) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
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

export const getNextAgendaOccupancyWeeklyWindow = () => {
  const todayIso = getTodayInSaoPauloIso();
  const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  const diffToCurrentMonday = weekday === 0 ? -6 : 1 - weekday;
  const currentWeekStart = shiftIsoDate(todayIso, diffToCurrentMonday);
  const startDate = shiftIsoDate(currentWeekStart, 7);
  const endDate = shiftIsoDate(startDate, 5);
  return {
    startDate,
    endDate,
    label: `${formatIsoDate(startDate)} a ${formatIsoDate(endDate)}`,
    runKey: `${startDate}:${endDate}`,
  };
};

const mapRun = (row: Record<string, unknown>): AgendaOccupancyWeeklyReportRun => ({
  id: clean(row.id),
  runKey: clean(row.run_key),
  weekStartDate: clean(row.week_start_date),
  weekEndDate: clean(row.week_end_date),
  status: clean(row.status) as AgendaOccupancyWeeklyReportRunStatus,
  triggerSource: clean(row.trigger_source) as AgendaOccupancyWeeklyReportTriggerSource,
  triggeredBy: clean(row.triggered_by),
  refreshJobId: nullable(row.refresh_job_id),
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

export const ensureAgendaOccupancyWeeklyReportTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_occupancy_report_settings (
      id VARCHAR(32) PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      recipient_employee_ids LONGTEXT NULL,
      from_email VARCHAR(180) NULL,
      from_name VARCHAR(180) NULL,
      reply_to_email VARCHAR(180) NULL,
      updated_by VARCHAR(64) NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_occupancy_report_runs (
      id VARCHAR(64) PRIMARY KEY,
      run_key VARCHAR(32) NOT NULL,
      week_start_date DATE NOT NULL,
      week_end_date DATE NOT NULL,
      status VARCHAR(24) NOT NULL,
      trigger_source VARCHAR(16) NOT NULL,
      triggered_by VARCHAR(64) NOT NULL,
      refresh_job_id VARCHAR(64) NULL,
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
    CREATE TABLE IF NOT EXISTS agenda_occupancy_report_recipients (
      id VARCHAR(64) PRIMARY KEY,
      run_id VARCHAR(64) NOT NULL,
      employee_id VARCHAR(64) NULL,
      employee_name VARCHAR(180) NULL,
      corporate_email VARCHAR(180) NULL,
      status VARCHAR(32) NOT NULL,
      skip_reason VARCHAR(64) NULL,
      error_message TEXT NULL,
      provider_message_id VARCHAR(128) NULL,
      subject VARCHAR(255) NULL,
      payload_json LONGTEXT NULL,
      sent_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE agenda_occupancy_report_runs ADD COLUMN refresh_job_id VARCHAR(64) NULL`);
  await safeCreateIndex(db, `CREATE INDEX idx_agenda_occ_report_runs_run_key ON agenda_occupancy_report_runs (run_key)`);
  await safeCreateIndex(db, `CREATE INDEX idx_agenda_occ_report_runs_status ON agenda_occupancy_report_runs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_agenda_occ_report_recipients_run ON agenda_occupancy_report_recipients (run_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_agenda_occ_report_recipients_message ON agenda_occupancy_report_recipients (provider_message_id)`);

  const now = NOW();
  if (isMysqlProvider()) {
    await db.execute(
      `
      INSERT IGNORE INTO agenda_occupancy_report_settings (
        id, enabled, recipient_employee_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      ) VALUES (?, 0, '[]', NULL, 'Consultare Hub', NULL, NULL, ?)
      `,
      [SETTINGS_ROW_ID, now],
    );
  } else {
    await db.execute(
      `
      INSERT INTO agenda_occupancy_report_settings (
        id, enabled, recipient_employee_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      ) VALUES (?, 0, '[]', NULL, 'Consultare Hub', NULL, NULL, ?)
      ON CONFLICT(id) DO NOTHING
      `,
      [SETTINGS_ROW_ID, now],
    );
  }

  tablesEnsured = true;
};

export const getAgendaOccupancyWeeklyReportSettings = async (
  db: DbInterface,
): Promise<AgendaOccupancyWeeklyReportSettings> => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const rows = await db.query(`SELECT * FROM agenda_occupancy_report_settings WHERE id = ? LIMIT 1`, [SETTINGS_ROW_ID]);
  const row = (rows?.[0] || {}) as Record<string, unknown>;

  const recipientEmployeeIds = (() => {
    try {
      const parsed = JSON.parse(clean(row.recipient_employee_ids || '[]'));
      return Array.isArray(parsed) ? parsed.map((value) => clean(value)).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();

  return {
    enabled: parseBool(row.enabled),
    recipientEmployeeIds: Array.from(new Set(recipientEmployeeIds)),
    fromEmail: clean(row.from_email),
    fromName: clean(row.from_name) || 'Consultare Hub',
    replyToEmail: nullable(row.reply_to_email),
    updatedAt: nullable(row.updated_at),
    updatedBy: nullable(row.updated_by),
  };
};

const normalizeSettingsInput = (payload: Partial<AgendaOccupancyWeeklyReportSettings>) => {
  const enabled = Boolean(payload.enabled);
  const recipientEmployeeIds = Array.from(
    new Set((payload.recipientEmployeeIds || []).map((value) => clean(value)).filter(Boolean)),
  );
  const fromEmail = clean(payload.fromEmail);
  const fromName = clean(payload.fromName) || 'Consultare Hub';
  const replyToEmail = nullable(payload.replyToEmail);

  if (!fromEmail) {
    throw new AgendaOccupancyWeeklyReportValidationError('Informe o e-mail remetente do report semanal de ocupação.');
  }
  if (!isValidEmail(fromEmail)) {
    throw new AgendaOccupancyWeeklyReportValidationError('E-mail remetente inválido.');
  }
  if (replyToEmail && !isValidEmail(replyToEmail)) {
    throw new AgendaOccupancyWeeklyReportValidationError('E-mail de resposta inválido.');
  }
  if (enabled && recipientEmployeeIds.length <= 0) {
    throw new AgendaOccupancyWeeklyReportValidationError('Selecione ao menos um destinatário apto para ativar o report.');
  }

  return {
    enabled,
    recipientEmployeeIds,
    fromEmail,
    fromName,
    replyToEmail,
  };
};

const resolveRecipientsByEmployeeIds = async (db: DbInterface, employeeIds: string[]) => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const uniqueIds = Array.from(new Set(employeeIds.map((value) => clean(value)).filter(Boolean)));
  if (uniqueIds.length <= 0) return [] as AgendaOccupancyWeeklyReportRecipientState[];

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.query(
    `
    SELECT id, full_name, corporate_email, status
    FROM employees
    WHERE id IN (${placeholders})
    `,
    uniqueIds,
  );

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows || []) {
    byId.set(clean((row as Record<string, unknown>).id), row as Record<string, unknown>);
  }

  return uniqueIds.map((employeeId) => {
    const row = byId.get(employeeId);
    if (!row) {
      return {
        employeeId,
        employeeName: `Colaborador ${employeeId}`,
        corporateEmail: null,
        isActive: false,
        status: 'SKIPPED' as const,
        reason: 'EMPLOYEE_NOT_FOUND' as const,
        isSelected: true,
      };
    }

    const employeeName = clean(row.full_name) || `Colaborador ${employeeId}`;
    const corporateEmail = nullable(row.corporate_email);
    const isActive = clean(row.status || 'ATIVO').toUpperCase() === 'ATIVO';

    if (!isActive) {
      return {
        employeeId,
        employeeName,
        corporateEmail,
        isActive,
        status: 'SKIPPED' as const,
        reason: 'INACTIVE' as const,
        isSelected: true,
      };
    }

    if (!corporateEmail) {
      return {
        employeeId,
        employeeName,
        corporateEmail,
        isActive,
        status: 'SKIPPED' as const,
        reason: 'MISSING_CORPORATE_EMAIL' as const,
        isSelected: true,
      };
    }

    return {
      employeeId,
      employeeName,
      corporateEmail,
      isActive,
      status: 'READY' as const,
      reason: null,
      isSelected: true,
    };
  });
};

export const getAgendaOccupancyWeeklyReportEligibilitySummary = async (
  db: DbInterface,
): Promise<AgendaOccupancyWeeklyReportEligibilitySummary> => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const settings = await getAgendaOccupancyWeeklyReportSettings(db);
  const selectedIds = new Set(settings.recipientEmployeeIds);

  const rows = await db.query(
    `
    SELECT id, full_name, corporate_email, status
    FROM employees
    ORDER BY full_name ASC
    `,
  );

  const eligibleRecipients: AgendaOccupancyWeeklyReportRecipientState[] = [];
  const ineligibleRecipients: AgendaOccupancyWeeklyReportRecipientState[] = [];

  for (const row of rows || []) {
    const item = row as Record<string, unknown>;
    const employeeId = clean(item.id);
    const employeeName = clean(item.full_name) || `Colaborador ${employeeId}`;
    const corporateEmail = nullable(item.corporate_email);
    const isActive = clean(item.status || 'ATIVO').toUpperCase() === 'ATIVO';
    const isSelected = selectedIds.has(employeeId);

    if (!isActive) {
      ineligibleRecipients.push({
        employeeId,
        employeeName,
        corporateEmail,
        isActive,
        status: 'SKIPPED',
        reason: 'INACTIVE',
        isSelected,
      });
      continue;
    }

    if (!corporateEmail) {
      ineligibleRecipients.push({
        employeeId,
        employeeName,
        corporateEmail,
        isActive,
        status: 'SKIPPED',
        reason: 'MISSING_CORPORATE_EMAIL',
        isSelected,
      });
      continue;
    }

    eligibleRecipients.push({
      employeeId,
      employeeName,
      corporateEmail,
      isActive,
      status: 'READY',
      reason: null,
      isSelected,
    });
  }

  const selectedRecipients = await resolveRecipientsByEmployeeIds(db, settings.recipientEmployeeIds);
  return {
    generatedAt: NOW(),
    eligibleRecipients,
    ineligibleRecipients,
    selectedReadyRecipients: selectedRecipients.filter((item) => item.status === 'READY'),
    selectedSkippedRecipients: selectedRecipients.filter((item) => item.status === 'SKIPPED'),
  };
};

const ensureSelectedRecipientsExist = async (db: DbInterface, employeeIds: string[]) => {
  if (employeeIds.length <= 0) return;
  const resolved = await resolveRecipientsByEmployeeIds(db, employeeIds);
  const invalid = resolved.filter((item) => item.status !== 'READY');
  if (invalid.length > 0) {
    throw new AgendaOccupancyWeeklyReportValidationError(
      'Há destinatários inválidos, inativos ou sem e-mail corporativo. Atualize a seleção antes de salvar.',
    );
  }
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
    throw new AgendaOccupancyWeeklyReportValidationError(
      'Credenciais do SendPulse não configuradas. Defina SENDPULSE_API_TOKEN ou SENDPULSE_CLIENT_ID/SENDPULSE_CLIENT_SECRET.',
      500,
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
    throw new AgendaOccupancyWeeklyReportValidationError(
      String((payload as any)?.error_description || (payload as any)?.message || 'Falha ao autenticar no SendPulse.'),
      502,
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
  options: { allowNotFound?: boolean } = {},
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
    throw new AgendaOccupancyWeeklyReportValidationError(
      String((payload as any)?.message || (payload as any)?.error || 'Falha ao comunicar com o SendPulse.'),
      502,
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
      .filter(Boolean),
  );

  if (allowedDomains.has(extractDomain(fromEmail))) return;

  throw new AgendaOccupancyWeeklyReportValidationError(
    'O e-mail remetente não está autorizado no SendPulse. Valide o remetente ou o domínio antes de ativar o report.',
  );
};

export const updateAgendaOccupancyWeeklyReportSettings = async (
  db: DbInterface,
  payload: Partial<AgendaOccupancyWeeklyReportSettings>,
  actorUserId: string,
) => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const input = normalizeSettingsInput(payload);
  await ensureSelectedRecipientsExist(db, input.recipientEmployeeIds);
  await validateSendPulseSender(input.fromEmail);
  const now = NOW();

  if (isMysqlProvider()) {
    await db.execute(
      `
      INSERT INTO agenda_occupancy_report_settings (
        id, enabled, recipient_employee_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        enabled = VALUES(enabled),
        recipient_employee_ids = VALUES(recipient_employee_ids),
        from_email = VALUES(from_email),
        from_name = VALUES(from_name),
        reply_to_email = VALUES(reply_to_email),
        updated_by = VALUES(updated_by),
        updated_at = VALUES(updated_at)
      `,
      [
        SETTINGS_ROW_ID,
        input.enabled ? 1 : 0,
        JSON.stringify(input.recipientEmployeeIds),
        input.fromEmail,
        input.fromName,
        input.replyToEmail,
        clean(actorUserId) || null,
        now,
      ],
    );
  } else {
    await db.execute(
      `
      INSERT INTO agenda_occupancy_report_settings (
        id, enabled, recipient_employee_ids, from_email, from_name, reply_to_email, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        recipient_employee_ids = excluded.recipient_employee_ids,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        reply_to_email = excluded.reply_to_email,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
      `,
      [
        SETTINGS_ROW_ID,
        input.enabled ? 1 : 0,
        JSON.stringify(input.recipientEmployeeIds),
        input.fromEmail,
        input.fromName,
        input.replyToEmail,
        clean(actorUserId) || null,
        now,
      ],
    );
  }

  return getAgendaOccupancyWeeklyReportSettings(db);
};

const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;
const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR');

const aggregateWeeklyDataset = async (db: DbInterface, startDate: string, endDate: string): Promise<WeeklyOccupancyDataset> => {
  const detailRows = await listAgendaOcupacaoDailyRows(db, { startDate, endDate, unitId: 'all' });
  const grouped = new Map<string, WeeklyOccupancySectionItem & { unitId: number; unitName: string }>();

  for (const row of detailRows) {
    const key = `${row.unidadeId}:${row.especialidadeId}`;
    const current = grouped.get(key) || {
      unitId: row.unidadeId,
      unitName: clean(row.unidadeNome) || UNIT_NAME_BY_ID[row.unidadeId] || `Unidade ${row.unidadeId}`,
      especialidadeId: row.especialidadeId,
      especialidadeNome: clean(row.especialidadeNome) || 'Sem especialidade',
      agendamentosCount: 0,
      horariosDisponiveisCount: 0,
      horariosBloqueadosCount: 0,
      capacidadeLiquidaCount: 0,
      taxaOcupacaoComercialPct: 0,
      taxaBloqueioPct: 0,
      classification: 'LOW' as OccupancyClassification,
    };

    current.agendamentosCount += row.agendamentosCount;
    current.horariosDisponiveisCount += row.horariosDisponiveisCount;
    current.horariosBloqueadosCount += row.horariosBloqueadosCount;
    current.capacidadeLiquidaCount = current.agendamentosCount + current.horariosDisponiveisCount;
    current.taxaOcupacaoComercialPct =
      current.capacidadeLiquidaCount > 0 ? (current.agendamentosCount * 100) / current.capacidadeLiquidaCount : 0;
    const totalBase = current.agendamentosCount + current.horariosDisponiveisCount + current.horariosBloqueadosCount;
    current.taxaBloqueioPct = totalBase > 0 ? (current.horariosBloqueadosCount * 100) / totalBase : 0;

    if (current.capacidadeLiquidaCount > 0 && current.taxaOcupacaoComercialPct >= HIGH_OCCUPANCY_THRESHOLD) {
      current.classification = 'HIGH';
    } else {
      current.classification = 'LOW';
    }

    grouped.set(key, current);
  }

  const byUnit = new Map<number, Array<WeeklyOccupancySectionItem & { unitId: number; unitName: string }>>();
  for (const value of grouped.values()) {
    const list = byUnit.get(value.unitId) || [];
    list.push(value);
    byUnit.set(value.unitId, list);
  }

  const sections = Array.from(byUnit.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([unitId, rows]) => {
      const allRows = rows
        .map((row) => ({ ...row }))
        .sort((a, b) => a.especialidadeNome.localeCompare(b.especialidadeNome, 'pt-BR'));
      const highOccupancy = allRows
        .filter((row) => row.capacidadeLiquidaCount > 0 && row.taxaOcupacaoComercialPct >= HIGH_OCCUPANCY_THRESHOLD)
        .sort(
          (a, b) =>
            b.taxaOcupacaoComercialPct - a.taxaOcupacaoComercialPct ||
            b.agendamentosCount - a.agendamentosCount ||
            a.especialidadeNome.localeCompare(b.especialidadeNome, 'pt-BR'),
        );
      const lowOccupancy = allRows
        .filter((row) => row.capacidadeLiquidaCount > 0 && row.taxaOcupacaoComercialPct <= LOW_OCCUPANCY_THRESHOLD)
        .sort(
          (a, b) =>
            a.taxaOcupacaoComercialPct - b.taxaOcupacaoComercialPct ||
            b.horariosDisponiveisCount - a.horariosDisponiveisCount ||
            a.especialidadeNome.localeCompare(b.especialidadeNome, 'pt-BR'),
        );

      const totals = allRows.reduce(
        (acc, row) => {
          acc.appointments += row.agendamentosCount;
          acc.openSlots += row.horariosDisponiveisCount;
          acc.blockedSlots += row.horariosBloqueadosCount;
          acc.specialties += 1;
          return acc;
        },
        { appointments: 0, openSlots: 0, blockedSlots: 0, specialties: 0, occupancyPct: 0 },
      );

      const capacity = totals.appointments + totals.openSlots;
      totals.occupancyPct = capacity > 0 ? (totals.appointments * 100) / capacity : 0;

      return {
        unitId,
        unitName: rows[0]?.unitName || UNIT_NAME_BY_ID[unitId] || `Unidade ${unitId}`,
        highOccupancy,
        lowOccupancy,
        allRows,
        totals,
      };
    });

  const summary = sections.reduce(
    (acc, section) => {
      acc.highCount += section.highOccupancy.length;
      acc.lowCount += section.lowOccupancy.length;
      acc.totalAppointments += section.totals.appointments;
      acc.totalOpenSlots += section.totals.openSlots;
      acc.totalBlockedSlots += section.totals.blockedSlots;
      acc.totalSpecialties += section.totals.specialties;
      return acc;
    },
    {
      highCount: 0,
      lowCount: 0,
      totalAppointments: 0,
      totalOpenSlots: 0,
      totalBlockedSlots: 0,
      totalSpecialties: 0,
    },
  );

  return {
    startDate,
    endDate,
    generatedAt: NOW(),
    sections,
    summary,
    detailRows,
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPreviewFromDataset = (
  dataset: WeeklyOccupancyDataset,
  recipient: AgendaOccupancyWeeklyReportRecipientState,
): AgendaOccupancyWeeklyReportPreview => {
  const subject = `Relatório semanal de ocupação de agenda | ${formatIsoDate(dataset.startDate)} a ${formatIsoDate(dataset.endDate)}`;
  const periodLabel = `${formatIsoDate(dataset.startDate)} a ${formatIsoDate(dataset.endDate)}`;
  const lines = [
    `Olá, ${recipient.employeeName}.`,
    '',
    `Segue o relatório semanal de ocupação da agenda referente ao período ${periodLabel}.`,
    '',
    `Especialidades com alta ocupação (avaliar mais médicos): ${dataset.summary.highCount}`,
    `Especialidades com baixa ocupação (buscar pacientes): ${dataset.summary.lowCount}`,
    `Agendamentos no recorte: ${formatNumber(dataset.summary.totalAppointments)}`,
    `Horários disponíveis no recorte: ${formatNumber(dataset.summary.totalOpenSlots)}`,
    `Horários bloqueados no recorte: ${formatNumber(dataset.summary.totalBlockedSlots)}`,
    '',
  ];

  for (const section of dataset.sections) {
    lines.push(`Unidade: ${section.unitName}`);
    lines.push(`- Especialidades analisadas: ${formatNumber(section.totals.specialties)}`);
    lines.push(`- Taxa média do recorte: ${formatPercent(section.totals.occupancyPct)}`);
    lines.push('- Alta ocupação:');
    if (section.highOccupancy.length <= 0) {
      lines.push('  Sem especialidades acima da faixa definida.');
    } else {
      for (const item of section.highOccupancy.slice(0, 8)) {
        lines.push(
          `  ${item.especialidadeNome}: ${formatPercent(item.taxaOcupacaoComercialPct)} | agendamentos ${formatNumber(item.agendamentosCount)} | livres ${formatNumber(item.horariosDisponiveisCount)}`,
        );
      }
    }
    lines.push('- Baixa ocupação:');
    if (section.lowOccupancy.length <= 0) {
      lines.push('  Sem especialidades abaixo da faixa definida.');
    } else {
      for (const item of section.lowOccupancy.slice(0, 8)) {
        lines.push(
          `  ${item.especialidadeNome}: ${formatPercent(item.taxaOcupacaoComercialPct)} | agendamentos ${formatNumber(item.agendamentosCount)} | livres ${formatNumber(item.horariosDisponiveisCount)}`,
        );
      }
    }
    lines.push('');
  }

  lines.push('Os anexos XLSX e PDF seguem com o detalhamento completo do recorte.');

  return {
    subject,
    text: lines.join('\n'),
    recipient: {
      employeeId: recipient.employeeId,
      employeeName: recipient.employeeName,
      corporateEmail: recipient.corporateEmail || '',
    },
    period: {
      startDate: dataset.startDate,
      endDate: dataset.endDate,
      label: periodLabel,
    },
    generatedAt: dataset.generatedAt,
    attachments: [
      `agenda-ocupacao-semanal-${dataset.startDate}_${dataset.endDate}.xlsx`,
      `agenda-ocupacao-semanal-${dataset.startDate}_${dataset.endDate}.pdf`,
    ],
    summary: dataset.summary,
    sections: dataset.sections.map((section) => ({
      unitId: section.unitId,
      unitName: section.unitName,
      highOccupancy: section.highOccupancy,
      lowOccupancy: section.lowOccupancy,
      totals: section.totals,
    })),
  };
};

const renderSectionHtml = (title: string, items: WeeklyOccupancySectionItem[], emptyLabel: string) => {
  if (items.length <= 0) {
    return `<tr><td style="padding:10px 0;font-size:13px;color:#64748b;">${escapeHtml(emptyLabel)}</td></tr>`;
  }

  return items
    .slice(0, 8)
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(item.especialidadeNome)}</div>
            <div style="margin-top:4px;font-size:12px;color:#475569;">
              Ocupação ${escapeHtml(formatPercent(item.taxaOcupacaoComercialPct))} • Agendamentos ${escapeHtml(
                formatNumber(item.agendamentosCount),
              )} • Livres ${escapeHtml(formatNumber(item.horariosDisponiveisCount))}
            </div>
          </td>
        </tr>
      `,
    )
    .join('');
};

const renderWeeklyReportHtml = (preview: AgendaOccupancyWeeklyReportPreview) => `
  <div style="background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:880px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;overflow:hidden;">
      <div style="background:#123b78;padding:28px 32px;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;opacity:0.88;">Consultare Hub</div>
        <h1 style="margin:10px 0 0;font-size:30px;line-height:1.2;">Relatório semanal de ocupação de agenda</h1>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.6;opacity:0.92;">
          Panorama da semana ${escapeHtml(preview.period.label)} para apoiar reforço médico e ações de captação.
        </p>
      </div>
      <div style="padding:28px 32px;">
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">Alta ocupação</div>
            <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(
              formatNumber(preview.summary.highCount),
            )}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b;">Especialidades para avaliar mais médicos</div>
          </div>
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">Baixa ocupação</div>
            <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(
              formatNumber(preview.summary.lowCount),
            )}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b;">Especialidades para buscar pacientes</div>
          </div>
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">Agendamentos</div>
            <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(
              formatNumber(preview.summary.totalAppointments),
            )}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b;">Volume total do recorte</div>
          </div>
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:16px;background:#ffffff;min-width:140px;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7b93;font-weight:700;">Horários livres</div>
            <div style="margin-top:8px;font-size:28px;line-height:1;font-weight:800;color:#123b78;">${escapeHtml(
              formatNumber(preview.summary.totalOpenSlots),
            )}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b;">Espaço comercial disponível</div>
          </div>
        </div>

        ${preview.sections
          .map(
            (section) => `
          <div style="margin-top:24px;border:1px solid #dbe4f0;border-radius:18px;padding:18px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(section.unitName)}</div>
                <div style="margin-top:6px;font-size:13px;color:#64748b;">
                  ${escapeHtml(formatNumber(section.totals.specialties))} especialidades •
                  ${escapeHtml(formatPercent(section.totals.occupancyPct))} de ocupação média •
                  ${escapeHtml(formatNumber(section.totals.openSlots))} horários livres
                </div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:16px;">
              <div>
                <div style="font-size:14px;font-weight:700;color:#0f172a;">Alta ocupação</div>
                <table style="width:100%;margin-top:8px;border-collapse:collapse;"><tbody>${renderSectionHtml(
                  'Alta ocupação',
                  section.highOccupancy,
                  'Sem especialidades acima da faixa definida.',
                )}</tbody></table>
              </div>
              <div>
                <div style="font-size:14px;font-weight:700;color:#0f172a;">Baixa ocupação</div>
                <table style="width:100%;margin-top:8px;border-collapse:collapse;"><tbody>${renderSectionHtml(
                  'Baixa ocupação',
                  section.lowOccupancy,
                  'Sem especialidades abaixo da faixa definida.',
                )}</tbody></table>
              </div>
            </div>
          </div>
        `,
          )
          .join('')}

        <div style="margin-top:24px;border:1px solid #cfe0ff;background:#eff6ff;border-radius:16px;padding:18px;">
          <div style="font-size:15px;font-weight:700;color:#123b78;">Leitura operacional recomendada</div>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#475569;">
            Especialidades com alta ocupação sinalizam pressão de capacidade e ajudam a priorizar reforço médico.
            Especialidades com baixa ocupação indicam espaço comercial para captação ativa de pacientes.
          </p>
        </div>
      </div>
    </div>
  </div>
`;

const buildWeeklyReportAttachments = async (dataset: WeeklyOccupancyDataset): Promise<SendAttachment[]> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hub Consultare';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.columns = [
    { header: 'Unidade', key: 'unit', width: 24 },
    { header: 'Classificação', key: 'classification', width: 18 },
    { header: 'Especialidade', key: 'specialty', width: 36 },
    { header: 'Agendamentos', key: 'appointments', width: 16 },
    { header: 'Horários disponíveis', key: 'openSlots', width: 18 },
    { header: 'Horários bloqueados', key: 'blockedSlots', width: 18 },
    { header: 'Base ofertável', key: 'capacity', width: 16 },
    { header: 'Tx. ocupação (%)', key: 'occupancy', width: 16 },
    { header: 'Taxa bloqueio (%)', key: 'blockedRate', width: 18 },
  ];
  summarySheet.getRow(1).values = summarySheet.columns.map((item) => item.header as string);
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const section of dataset.sections) {
    for (const row of section.highOccupancy) {
      summarySheet.addRow({
        unit: section.unitName,
        classification: 'Alta ocupação',
        specialty: row.especialidadeNome,
        appointments: row.agendamentosCount,
        openSlots: row.horariosDisponiveisCount,
        blockedSlots: row.horariosBloqueadosCount,
        capacity: row.capacidadeLiquidaCount,
        occupancy: row.taxaOcupacaoComercialPct / 100,
        blockedRate: row.taxaBloqueioPct / 100,
      });
    }
    for (const row of section.lowOccupancy) {
      summarySheet.addRow({
        unit: section.unitName,
        classification: 'Baixa ocupação',
        specialty: row.especialidadeNome,
        appointments: row.agendamentosCount,
        openSlots: row.horariosDisponiveisCount,
        blockedSlots: row.horariosBloqueadosCount,
        capacity: row.capacidadeLiquidaCount,
        occupancy: row.taxaOcupacaoComercialPct / 100,
        blockedRate: row.taxaBloqueioPct / 100,
      });
    }
  }
  summarySheet.getColumn('occupancy').numFmt = '0.00%';
  summarySheet.getColumn('blockedRate').numFmt = '0.00%';

  const detailSheet = workbook.addWorksheet('Detalhes');
  detailSheet.columns = [
    { header: 'Data', key: 'date', width: 12 },
    { header: 'Unidade', key: 'unit', width: 24 },
    { header: 'Especialidade', key: 'specialty', width: 34 },
    { header: 'Agendamentos', key: 'appointments', width: 16 },
    { header: 'Horários disponíveis', key: 'openSlots', width: 18 },
    { header: 'Horários bloqueados', key: 'blockedSlots', width: 18 },
    { header: 'Base ofertável', key: 'capacity', width: 16 },
    { header: 'Tx. ocupação (%)', key: 'occupancy', width: 16 },
    { header: 'Taxa bloqueio (%)', key: 'blockedRate', width: 18 },
  ];
  detailSheet.getRow(1).values = detailSheet.columns.map((item) => item.header as string);
  detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  detailSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const row of dataset.detailRows) {
    detailSheet.addRow({
      date: row.dataRef,
      unit: row.unidadeNome,
      specialty: row.especialidadeNome,
      appointments: row.agendamentosCount,
      openSlots: row.horariosDisponiveisCount,
      blockedSlots: row.horariosBloqueadosCount,
      capacity: row.capacidadeLiquidaCount,
      occupancy: row.taxaOcupacaoComercialPct / 100,
      blockedRate: row.taxaBloqueioPct / 100,
    });
  }
  detailSheet.getColumn('occupancy').numFmt = '0.00%';
  detailSheet.getColumn('blockedRate').numFmt = '0.00%';

  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 28;
  const rowHeight = 18;
  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;
  page.drawText('Relatório semanal de ocupação de agenda', {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.07, 0.23, 0.47),
  });
  y -= 18;
  page.drawText(`Período ${formatIsoDate(dataset.startDate)} a ${formatIsoDate(dataset.endDate)}`, {
    x: margin,
    y,
    size: 10,
    font: regular,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 24;

  const ensurePdfSpace = (needed: number) => {
    if (y > needed) return;
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  };

  for (const section of dataset.sections) {
    ensurePdfSpace(160);
    page.drawText(section.unitName, {
      x: margin,
      y,
      size: 13,
      font: bold,
      color: rgb(0.07, 0.23, 0.47),
    });
    y -= 16;
    page.drawText(
      `${formatNumber(section.totals.specialties)} especialidades | ${formatPercent(section.totals.occupancyPct)} ocupação média | ${formatNumber(
        section.totals.openSlots,
      )} livres`,
      {
        x: margin,
        y,
        size: 9,
        font: regular,
        color: rgb(0.35, 0.35, 0.35),
      },
    );
    y -= 16;

    const drawList = (title: string, items: WeeklyOccupancySectionItem[]) => {
      ensurePdfSpace(80);
      page.drawText(title, {
        x: margin,
        y,
        size: 10,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 14;
      if (items.length <= 0) {
        page.drawText('Sem especialidades nesta faixa.', {
          x: margin + 8,
          y,
          size: 9,
          font: regular,
          color: rgb(0.45, 0.45, 0.45),
        });
        y -= 14;
        return;
      }

      for (const item of items.slice(0, 6)) {
        ensurePdfSpace(32);
        page.drawRectangle({
          x: margin,
          y: y - 3,
          width: page.getWidth() - margin * 2,
          height: rowHeight,
          borderColor: rgb(0.85, 0.88, 0.92),
          borderWidth: 0.5,
        });
        page.drawText(item.especialidadeNome, {
          x: margin + 6,
          y: y + 3,
          size: 9,
          font: bold,
          color: rgb(0.1, 0.1, 0.1),
        });
        page.drawText(
          `Ocupação ${formatPercent(item.taxaOcupacaoComercialPct)} | Agendamentos ${formatNumber(item.agendamentosCount)} | Livres ${formatNumber(
            item.horariosDisponiveisCount,
          )}`,
          {
            x: margin + 240,
            y: y + 3,
            size: 8,
            font: regular,
            color: rgb(0.25, 0.25, 0.25),
          },
        );
        y -= rowHeight;
      }
      y -= 6;
    };

    drawList('Alta ocupação', section.highOccupancy);
    drawList('Baixa ocupação', section.lowOccupancy);
    y -= 8;
  }

  const pdfBuffer = Buffer.from(await pdf.save());

  return [
    {
      fileName: `agenda-ocupacao-semanal-${dataset.startDate}_${dataset.endDate}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.isBuffer(xlsxBuffer) ? xlsxBuffer : Buffer.from(xlsxBuffer as ArrayBuffer),
    },
    {
      fileName: `agenda-ocupacao-semanal-${dataset.startDate}_${dataset.endDate}.pdf`,
      contentType: 'application/pdf',
      buffer: pdfBuffer,
    },
  ];
};

const sendWeeklyReportEmail = async (
  preview: AgendaOccupancyWeeklyReportPreview,
  settings: AgendaOccupancyWeeklyReportSettings,
  attachments: SendAttachment[],
) => {
  const html = renderWeeklyReportHtml(preview);
  const response = await sendPulseRequest<{ result?: boolean; id?: string }>(`/smtp/emails`, {
    method: 'POST',
    body: JSON.stringify({
      email: {
        html: Buffer.from(html, 'utf-8').toString('base64'),
        text: preview.text,
        subject: preview.subject,
        from: {
          name: settings.fromName,
          email: settings.fromEmail,
        },
        to: [
          {
            name: preview.recipient.employeeName,
            email: preview.recipient.corporateEmail,
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
        attachments_binary: attachments.map((attachment) => ({
          name: attachment.fileName,
          type: attachment.contentType,
          content: attachment.buffer.toString('base64'),
        })),
      },
    }),
  });

  if (!response?.result || !clean(response.id)) {
    throw new AgendaOccupancyWeeklyReportValidationError('SendPulse não retornou confirmação válida para o envio.', 502);
  }

  return {
    providerMessageId: clean(response.id),
    subject: preview.subject,
    payloadJson: JSON.stringify(preview),
  };
};

const refreshRunCounters = async (db: DbInterface, runId: string) => {
  const rows = await db.query(
    `
    SELECT
      SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped_count,
      SUM(CASE WHEN status = 'ACCEPTED_PROVIDER' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
    FROM agenda_occupancy_report_recipients
    WHERE run_id = ?
    `,
    [runId],
  );
  const row = (rows?.[0] || {}) as Record<string, unknown>;
  await db.execute(
    `
    UPDATE agenda_occupancy_report_runs
    SET skipped_count = ?, sent_count = ?, failed_count = ?, updated_at = ?
    WHERE id = ?
    `,
    [parseIntSafe(row.skipped_count, 0), parseIntSafe(row.sent_count, 0), parseIntSafe(row.failed_count, 0), NOW(), runId],
  );
};

export const listAgendaOccupancyWeeklyReportRuns = async (db: DbInterface, limit = 20) => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const rows = await db.query(
    `SELECT * FROM agenda_occupancy_report_runs ORDER BY created_at DESC LIMIT ?`,
    [Math.max(1, Math.min(limit, 100))],
  );
  return (rows || []).map((row) => mapRun(row as Record<string, unknown>));
};

export const getAgendaOccupancyWeeklyReportPreview = async (
  db: DbInterface,
  employeeId: string,
  input?: { startDate?: string; endDate?: string },
): Promise<AgendaOccupancyWeeklyReportPreview> => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const startDate = input?.startDate ? normalizeIsoDate(input.startDate, 'startDate') : getNextAgendaOccupancyWeeklyWindow().startDate;
  const endDate = input?.endDate ? normalizeIsoDate(input.endDate, 'endDate') : getNextAgendaOccupancyWeeklyWindow().endDate;
  if (startDate > endDate) {
    throw new AgendaOccupancyWeeklyReportValidationError('Data inicial não pode ser maior que a data final.');
  }

  const recipients = await resolveRecipientsByEmployeeIds(db, [employeeId]);
  const recipient = recipients[0];
  if (!recipient || recipient.status !== 'READY' || !recipient.corporateEmail) {
    throw new AgendaOccupancyWeeklyReportValidationError('Selecione um destinatário apto para gerar a prévia.', 400);
  }

  const dataset = await aggregateWeeklyDataset(db, startDate, endDate);
  return buildPreviewFromDataset(dataset, recipient);
};

export const processAgendaOccupancyWeeklyReportRun = async (
  db: DbInterface,
  input: {
    triggerSource: AgendaOccupancyWeeklyReportTriggerSource;
    triggeredBy: string;
    force?: boolean;
    startDate?: string;
    endDate?: string;
    refreshJobId?: string | null;
  },
): Promise<AgendaOccupancyWeeklyReportProcessResult> => {
  await ensureAgendaOccupancyWeeklyReportTables(db);
  const settings = await getAgendaOccupancyWeeklyReportSettings(db);
  if (!settings.enabled) {
    throw new AgendaOccupancyWeeklyReportValidationError('Ative o report semanal de ocupação antes de processar o envio.');
  }
  if (!settings.fromEmail) {
    throw new AgendaOccupancyWeeklyReportValidationError('Configure o remetente do report semanal antes do envio.');
  }

  const fallbackWindow = getNextAgendaOccupancyWeeklyWindow();
  const startDate = input.startDate ? normalizeIsoDate(input.startDate, 'startDate') : fallbackWindow.startDate;
  const endDate = input.endDate ? normalizeIsoDate(input.endDate, 'endDate') : fallbackWindow.endDate;
  if (startDate > endDate) {
    throw new AgendaOccupancyWeeklyReportValidationError('Data inicial não pode ser maior que a data final.');
  }
  const runKey = `${startDate}:${endDate}`;

  const existingRuns = await db.query(
    `SELECT * FROM agenda_occupancy_report_runs WHERE run_key = ? ORDER BY created_at DESC`,
    [runKey],
  );
  const latestRun = existingRuns[0] ? mapRun(existingRuns[0] as Record<string, unknown>) : null;

  if (!input.force && latestRun?.status === 'COMPLETED') {
    return { reusedExistingRun: true, run: latestRun };
  }
  if (!input.force && latestRun?.status === 'RUNNING') {
    throw new AgendaOccupancyWeeklyReportValidationError('Já existe um processamento semanal em andamento para esta janela.', 409);
  }

  const eligibility = await getAgendaOccupancyWeeklyReportEligibilitySummary(db);
  if (eligibility.selectedReadyRecipients.length <= 0) {
    throw new AgendaOccupancyWeeklyReportValidationError('Nenhum destinatário apto selecionado para o report semanal.');
  }

  const dataset = await aggregateWeeklyDataset(db, startDate, endDate);
  const attachments = await buildWeeklyReportAttachments(dataset);
  const runId = randomUUID();
  const now = NOW();

  try {
    const run = await runInTransaction(db, async (txDb) => {
      await txDb.execute(
        `
        INSERT INTO agenda_occupancy_report_runs (
          id, run_key, week_start_date, week_end_date, status, trigger_source, triggered_by,
          refresh_job_id, provider, eligible_count, skipped_count, sent_count, failed_count,
          started_at, finished_at, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, 'sendpulse', ?, ?, 0, 0, ?, NULL, NULL, ?, ?)
        `,
        [
          runId,
          runKey,
          startDate,
          endDate,
          input.triggerSource,
          clean(input.triggeredBy),
          input.refreshJobId || null,
          eligibility.selectedReadyRecipients.length,
          eligibility.selectedSkippedRecipients.length,
          now,
          now,
          now,
        ],
      );

      for (const skipped of eligibility.selectedSkippedRecipients) {
        await txDb.execute(
          `
          INSERT INTO agenda_occupancy_report_recipients (
            id, run_id, employee_id, employee_name, corporate_email, status, skip_reason,
            error_message, provider_message_id, subject, payload_json, sent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'SKIPPED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
          `,
          [
            randomUUID(),
            runId,
            skipped.employeeId,
            skipped.employeeName,
            skipped.corporateEmail,
            skipped.reason,
            now,
            now,
          ],
        );
      }

      for (const recipient of eligibility.selectedReadyRecipients) {
        const preview = buildPreviewFromDataset(dataset, recipient);
        let recordId = randomUUID();
        try {
          const sent = await sendWeeklyReportEmail(preview, settings, attachments);
          await txDb.execute(
            `
            INSERT INTO agenda_occupancy_report_recipients (
              id, run_id, employee_id, employee_name, corporate_email, status, skip_reason,
              error_message, provider_message_id, subject, payload_json, sent_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'ACCEPTED_PROVIDER', NULL, NULL, ?, ?, ?, ?, ?, ?)
            `,
            [
              recordId,
              runId,
              recipient.employeeId,
              recipient.employeeName,
              recipient.corporateEmail,
              sent.providerMessageId,
              sent.subject,
              sent.payloadJson,
              NOW(),
              NOW(),
              NOW(),
            ],
          );
        } catch (error: any) {
          await txDb.execute(
            `
            INSERT INTO agenda_occupancy_report_recipients (
              id, run_id, employee_id, employee_name, corporate_email, status, skip_reason,
              error_message, provider_message_id, subject, payload_json, sent_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'FAILED', NULL, ?, NULL, ?, ?, NULL, ?, ?)
            `,
            [
              recordId,
              runId,
              recipient.employeeId,
              recipient.employeeName,
              recipient.corporateEmail,
              String(error?.message || 'Falha ao enviar report semanal de ocupação.'),
              preview.subject,
              JSON.stringify(preview),
              NOW(),
              NOW(),
            ],
          );
        }
      }

      await refreshRunCounters(txDb, runId);
      await txDb.execute(
        `
        UPDATE agenda_occupancy_report_runs
        SET status = 'COMPLETED', finished_at = ?, updated_at = ?
        WHERE id = ?
        `,
        [NOW(), NOW(), runId],
      );

      const runRows = await txDb.query(`SELECT * FROM agenda_occupancy_report_runs WHERE id = ? LIMIT 1`, [runId]);
      return mapRun((runRows?.[0] || {}) as Record<string, unknown>);
    });

    await upsertSystemStatus(db, {
      serviceName: SYSTEM_STATUS_SERVICE,
      status: 'COMPLETED',
      details: `run=${run.id} janela=${run.weekStartDate}..${run.weekEndDate} sent=${run.sentCount} failed=${run.failedCount}`,
    });

    return {
      reusedExistingRun: false,
      run,
    };
  } catch (error: any) {
    try {
      await db.execute(
        `
        UPDATE agenda_occupancy_report_runs
        SET status = 'FAILED', finished_at = ?, error_message = ?, updated_at = ?
        WHERE id = ?
        `,
        [NOW(), String(error?.message || 'Falha ao processar report semanal de ocupação.'), NOW(), runId],
      );
    } catch {
      // noop
    }
    await upsertSystemStatus(db, {
      serviceName: SYSTEM_STATUS_SERVICE,
      status: 'FAILED',
      details: `janela=${startDate}..${endDate} erro=${String(error?.message || 'Falha ao processar report semanal.')}`,
    });
    throw error;
  }
};
