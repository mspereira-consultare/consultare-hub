import { createHash } from 'crypto';
import { getDbConnection, type DbInterface } from '@/lib/db';
import { pickEffectiveSystemStatus } from '@/lib/system_status_health';
import {
  POST_CONSULT_EXECUTED_PROPOSAL_STATUSES,
  POST_CONSULT_NON_CLOSURE_REASONS,
  type PostConsultNonClosureReason,
} from '@/lib/post_consulta/constants';

type SqlDialect = 'mysql' | 'sqlite';

const getRuntimeSqlDialect = (): SqlDialect => {
  const provider = String(process.env.DB_PROVIDER || '').toLowerCase().trim();
  if (provider === 'mysql' || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL) {
    return 'mysql';
  }
  return 'sqlite';
};

const getAnaliticoDateSql = (dialect: SqlDialect) =>
  dialect === 'mysql'
    ? `(CASE WHEN INSTR(data_do_pagamento, '/') > 0 THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2)) ELSE data_do_pagamento END)`
    : `(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)`;

const getIntegerCastType = (dialect: SqlDialect) => (dialect === 'mysql' ? 'UNSIGNED' : 'INTEGER');

export type PostConsultFilters = {
  startDate: string;
  endDate: string;
  unit: string;
  status: string;
  responsible: string;
  closed: string;
  page: number;
  pageSize: number;
};

export type PostConsultOptions = {
  availableUnits: string[];
  availableStatuses: string[];
  availableResponsibles: string[];
  nonClosureReasons: Array<{ value: PostConsultNonClosureReason; label: string }>;
  heartbeat: {
    status: string;
    last_run: string | null;
    details: string | null;
  };
};

export type PostConsultProposalItem = {
  proposalId: number;
  proposalDate: string;
  status: string;
  unitName: string;
  professionalName: string;
  totalValue: number;
};

export type PostConsultRow = {
  eventKey: string;
  patientKey: string;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  consultDate: string;
  consultUnit: string;
  consultProcedure: string;
  attendantResponsible: string;
  billingSourceRowCount: number;
  proposalCount: number;
  proposalStatusSummary: string;
  proposalStatuses: string[];
  proposals: PostConsultProposalItem[];
  nonClosureReason: PostConsultNonClosureReason | null;
  nonClosureReasonLabel: string | null;
  autoClosedByExecution: boolean;
  effectiveClosed: boolean;
  executedProposalCount: number;
  executedProposalValue: number;
  totalProposalValue: number;
  firstContactClosed: boolean | null;
  firstContactAt: string | null;
  secondContactClosed: boolean | null;
  secondContactAt: string | null;
  observation: string | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
  closed: boolean;
};

export type PostConsultSummary = {
  totalEvents: number;
  totalProposals: number;
  totalClosedEvents: number;
  conversionRate: number;
  pendingPatients: number;
  afterSecondNoClosePatients: number;
  executedProposalValue: number;
};

export type PostConsultViewerPerformance = {
  hasOperationalMatch: boolean;
  attendantResponsible: string | null;
  totalEvents: number;
  totalClosedEvents: number;
  conversionRate: number;
  pendingPatients: number;
  afterSecondNoClosePatients: number;
  totalProposals: number;
  executedProposalValue: number;
};

export type PostConsultRankingFilters = {
  startDate: string;
  endDate: string;
  unit: string;
};

export type PostConsultRankingRow = {
  attendantResponsible: string;
  totalEvents: number;
  totalClosedEvents: number;
  conversionRate: number;
  pendingPatients: number;
  afterSecondNoClosePatients: number;
  totalProposals: number;
  executedProposalValue: number;
};

export type PostConsultRankingSummary = {
  totalAttendants: number;
  totalEvents: number;
  totalClosedEvents: number;
  conversionRate: number;
  executedProposalValue: number;
};

export type PostConsultRankingResult = {
  summary: PostConsultRankingSummary;
  rows: PostConsultRankingRow[];
};

export type PostConsultDetailResult = {
  summary: PostConsultSummary;
  viewerPerformance: PostConsultViewerPerformance;
  rows: PostConsultRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};

export type PostConsultFollowupSourceSnapshot = {
  patientId: number | null;
  patientName: string;
  consultDate: string;
  consultUnit: string;
  consultProcedure: string;
  attendantResponsible: string;
};

export type PostConsultFollowupUpdateInput = {
  eventKey: string;
  firstContactClosed: boolean | null;
  firstContactAt: string | null;
  secondContactClosed: boolean | null;
  secondContactAt: string | null;
  nonClosureReason: PostConsultNonClosureReason | null;
  observation: string | null;
  updatedByUserId: string;
  updatedByUserName: string;
  sourceSnapshot: PostConsultFollowupSourceSnapshot;
};

export type PostConsultFollowupSaveResult = {
  eventKey: string;
  firstContactClosed: boolean | null;
  firstContactAt: string | null;
  secondContactClosed: boolean | null;
  secondContactAt: string | null;
  nonClosureReason: PostConsultNonClosureReason | null;
  nonClosureReasonLabel: string | null;
  observation: string | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
  effectiveClosed: boolean;
  closed: boolean;
};

type ContactCacheRow = {
  patient_id?: number | string | null;
  patient_name?: string | null;
  phone_primary?: string | null;
  email_primary?: string | null;
};

type RawConsultationSourceRow = {
  consult_date?: string | null;
  patient_id?: number | string | null;
  patient_name?: string | null;
  consult_unit?: string | null;
  consult_procedure?: string | null;
  attendant_responsible?: string | null;
};

type ConsultationSourceRow = RawConsultationSourceRow & {
  billing_source_row_count: number;
};

type ProposalSourceRow = {
  proposal_id?: number | string | null;
  proposal_date?: string | null;
  status?: string | null;
  unit_name?: string | null;
  professional_name?: string | null;
  total_value?: number | string | null;
  patient_id?: number | string | null;
  proposal_patient_name?: string | null;
};

type FollowupControlRow = {
  event_key?: string | null;
  first_contact_closed?: number | string | boolean | null;
  first_contact_at?: string | null;
  second_contact_closed?: number | string | boolean | null;
  second_contact_at?: string | null;
  non_closure_reason?: string | null;
  observation?: string | null;
  updated_by_user_name?: string | null;
  updated_at?: string | null;
};

type RowLike = Record<string, unknown>;

const normalizeString = (value: unknown) => String(value || '').trim();
const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nonClosureReasonMap = new Map(POST_CONSULT_NON_CLOSURE_REASONS.map((item) => [item.value, item.label]));
const allowedNonClosureReasons = new Set(POST_CONSULT_NON_CLOSURE_REASONS.map((item) => item.value));
const executedProposalStatuses = new Set(POST_CONSULT_EXECUTED_PROPOSAL_STATUSES);

const normalizeComparableText = (value: unknown) =>
  normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeDateParam = (value: string | null | undefined, fallback: string) => {
  const raw = normalizeString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
};

const normalizeIsoDate = (value: unknown) => {
  const raw = normalizeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const normalizeDateTimeInput = (value: unknown) => {
  const raw = normalizeString(value).replace(' ', 'T');
  if (!raw) return '';
  const trimmed = raw.length >= 16 ? raw.slice(0, 16) : raw;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? trimmed : '';
};

const formatDateTimeForStorage = (value: string | null | undefined) => {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) return null;
  return `${normalized.replace('T', ' ')}:00`;
};

const normalizeBooleanInput = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = normalizeString(value).toLowerCase();
  if (['1', 'true', 'sim', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no'].includes(normalized)) return false;
  return null;
};

const normalizePostConsultNonClosureReason = (value: unknown): PostConsultNonClosureReason | null => {
  const normalized = normalizeString(value).toUpperCase();
  if (!normalized) return null;
  return allowedNonClosureReasons.has(normalized as PostConsultNonClosureReason)
    ? (normalized as PostConsultNonClosureReason)
    : null;
};

const isExecutedProposalStatus = (value: unknown) => executedProposalStatuses.has(normalizeComparableText(value) as (typeof POST_CONSULT_EXECUTED_PROPOSAL_STATUSES)[number]);

const normalizeObservation = (value: unknown) => normalizeString(value).slice(0, 2000);
const createHttpError = (message: string, status: number) => {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
};

const listColumnNames = async (db: DbInterface, tableName: string) => {
  const rows = await db.query(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => normalizeString((row as RowLike)?.name || (row as RowLike)?.COLUMN_NAME)).filter(Boolean));
};

const ensureColumn = async (db: DbInterface, tableName: string, columnName: string, definition: string) => {
  const columns = await listColumnNames(db, tableName);
  if (columns.has(columnName)) return;
  await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

export const ensurePostConsultSupportTable = async (db: DbInterface = getDbConnection()) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS post_consulta_followup_control (
      event_key VARCHAR(64) PRIMARY KEY,
      patient_id BIGINT NULL,
      patient_name TEXT NULL,
      consult_date TEXT NULL,
      consult_unit TEXT NULL,
      consult_procedure TEXT NULL,
      attendant_responsible TEXT NULL,
      first_contact_closed INTEGER NULL,
      first_contact_at TEXT NULL,
      second_contact_closed INTEGER NULL,
      second_contact_at TEXT NULL,
      non_closure_reason VARCHAR(64) NULL,
      observation TEXT NULL,
      updated_by_user_id VARCHAR(64) NULL,
      updated_by_user_name TEXT NULL,
      updated_at TEXT NULL
    )
  `);

  await ensureColumn(db, 'post_consulta_followup_control', 'patient_id', 'BIGINT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'patient_name', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'consult_date', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'consult_unit', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'consult_procedure', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'attendant_responsible', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'first_contact_closed', 'INTEGER NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'first_contact_at', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'second_contact_closed', 'INTEGER NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'second_contact_at', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'non_closure_reason', 'VARCHAR(64) NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'observation', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'updated_by_user_id', 'VARCHAR(64) NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'updated_by_user_name', 'TEXT NULL');
  await ensureColumn(db, 'post_consulta_followup_control', 'updated_at', 'TEXT NULL');
};

const getTodayRef = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getMonthStartRef = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(now).concat('-01');
};

const getParam = (params: URLSearchParams | Record<string, unknown>, key: string) => {
  if (params instanceof URLSearchParams) return params.get(key);
  const raw = params[key];
  return raw == null ? null : String(raw);
};

export const normalizePostConsultFilters = (params: URLSearchParams | Record<string, unknown>): PostConsultFilters => {
  const fallbackEndDate = getTodayRef();
  const fallbackStartDate = getMonthStartRef();
  const startDate = normalizeDateParam(getParam(params, 'startDate'), fallbackStartDate);
  const endDate = normalizeDateParam(getParam(params, 'endDate'), fallbackEndDate);

  return {
    startDate,
    endDate,
    unit: normalizeString(getParam(params, 'unit')) || 'all',
    status: normalizeString(getParam(params, 'status')) || 'all',
    responsible: normalizeString(getParam(params, 'responsible')) || 'all',
    closed: normalizeString(getParam(params, 'closed')) || 'all',
    page: clamp(normalizeNumber(getParam(params, 'page')) || 1, 1, 999999),
    pageSize: clamp(normalizeNumber(getParam(params, 'pageSize')) || 25, 10, 200),
  };
};

export const normalizePostConsultRankingFilters = (
  params: URLSearchParams | Record<string, unknown>,
): PostConsultRankingFilters => {
  const base = normalizePostConsultFilters(params);
  return {
    startDate: base.startDate,
    endDate: base.endDate,
    unit: base.unit,
  };
};

const buildPatientKey = (patientId: number | null, patientName: string) => {
  if (patientId && patientId > 0) return `id:${patientId}`;
  const normalizedName = normalizeComparableText(patientName);
  return normalizedName ? `name:${normalizedName}` : 'unknown';
};

const buildEventKeyFromSnapshot = (snapshot: PostConsultFollowupSourceSnapshot) => {
  const patientId = snapshot.patientId && snapshot.patientId > 0 ? Math.trunc(snapshot.patientId) : null;
  const patientKey = buildPatientKey(patientId, snapshot.patientName);
  const raw = [
    patientKey,
    normalizeIsoDate(snapshot.consultDate),
    normalizeComparableText(snapshot.consultUnit),
    normalizeComparableText(snapshot.consultProcedure),
    normalizeComparableText(snapshot.attendantResponsible),
  ].join('|');
  return createHash('md5').update(raw).digest('hex');
};

const readContactCache = async (db: DbInterface, patientIds: number[]) => {
  const ids = Array.from(new Set(patientIds.filter((value) => value > 0)));
  if (!ids.length) return new Map<number, ContactCacheRow>();

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.query(
    `
      SELECT patient_id, patient_name, phone_primary, email_primary
      FROM feegow_patient_contacts_cache
      WHERE patient_id IN (${placeholders})
    `,
    ids,
  );

  const map = new Map<number, ContactCacheRow>();
  for (const row of rows as ContactCacheRow[]) {
    const patientId = normalizeNumber((row as RowLike)?.patient_id);
    if (patientId > 0) map.set(patientId, row);
  }
  return map;
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const readFollowupControlRows = async (db: DbInterface, eventKeys: string[]) => {
  if (!eventKeys.length) return new Map<string, FollowupControlRow>();
  const result = new Map<string, FollowupControlRow>();

  for (const chunk of chunkArray(Array.from(new Set(eventKeys)), 300)) {
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.query(
      `
        SELECT
          event_key,
          first_contact_closed,
          first_contact_at,
          second_contact_closed,
          second_contact_at,
          non_closure_reason,
          observation,
          updated_by_user_name,
          updated_at
        FROM post_consulta_followup_control
        WHERE event_key IN (${placeholders})
      `,
      chunk,
    );

    for (const row of rows as FollowupControlRow[]) {
      const eventKey = normalizeString((row as RowLike)?.event_key);
      if (eventKey) result.set(eventKey, row);
    }
  }

  return result;
};

const hasSecondAttempt = (row: PostConsultRow) =>
  Boolean(row.secondContactAt) || row.secondContactClosed === true || row.secondContactClosed === false;

const isPendingContactRow = (row: PostConsultRow) =>
  !row.effectiveClosed &&
  !row.firstContactAt &&
  !row.secondContactAt &&
  row.firstContactClosed !== true &&
  row.secondContactClosed !== true;

const isAfterSecondNoCloseRow = (row: PostConsultRow) => !row.effectiveClosed && hasSecondAttempt(row);

const buildAutoClosedByExecution = (proposals: PostConsultProposalItem[]) =>
  proposals.length > 0 && proposals.every((proposal) => isExecutedProposalStatus(proposal.status));

const buildExecutedProposalCount = (proposals: PostConsultProposalItem[]) =>
  proposals.filter((proposal) => isExecutedProposalStatus(proposal.status)).length;

const buildExecutedProposalValue = (proposals: PostConsultProposalItem[]) =>
  proposals.reduce((total, proposal) => (isExecutedProposalStatus(proposal.status) ? total + normalizeNumber(proposal.totalValue) : total), 0);

const buildTotalProposalValue = (proposals: PostConsultProposalItem[]) =>
  proposals.reduce((total, proposal) => total + normalizeNumber(proposal.totalValue), 0);

const buildRowClosedState = (row: Pick<PostConsultRow, 'autoClosedByExecution' | 'firstContactClosed' | 'secondContactClosed'>) =>
  row.autoClosedByExecution || row.firstContactClosed === true || row.secondContactClosed === true;

const sortRows = (rows: PostConsultRow[]) =>
  [...rows].sort((left, right) => {
    const rank = (row: PostConsultRow) => {
      if (row.closed) return 3;
      if (!row.firstContactAt && !row.secondContactAt && row.firstContactClosed !== true && row.secondContactClosed !== true) return 0;
      if (hasSecondAttempt(row)) return 2;
      return 1;
    };

    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) return rankDiff;
    if (left.consultDate !== right.consultDate) return right.consultDate.localeCompare(left.consultDate);
    return left.patientName.localeCompare(right.patientName, 'pt-BR');
  });

const buildProposalStatusSummary = (statuses: string[]) => {
  const uniqueStatuses = Array.from(new Set(statuses.map((item) => normalizeString(item)).filter(Boolean)));
  if (!uniqueStatuses.length) return { summary: 'Sem status', statuses: [] as string[] };
  if (uniqueStatuses.length === 1) return { summary: uniqueStatuses[0], statuses: uniqueStatuses };
  return { summary: 'Múltiplos status', statuses: uniqueStatuses.sort((a, b) => a.localeCompare(b, 'pt-BR')) };
};

const proposalMatchesStatus = (proposal: PostConsultProposalItem, status: string) =>
  normalizeComparableText(proposal.status) === normalizeComparableText(status);

const rowMatchesClosedFilter = (row: PostConsultRow, closedFilter: string) => {
  const normalized = normalizeComparableText(closedFilter);
  if (!normalized || normalized === 'all') return true;
  if (normalized === 'sim' || normalized === 'yes') return row.closed;
  if (normalized === 'nao' || normalized === 'não' || normalized === 'no') return !row.closed;
  return true;
};

const mapFollowupControlToRow = (row: PostConsultRow, control: FollowupControlRow | undefined): PostConsultRow => {
  const nextRow: PostConsultRow = {
    ...row,
    firstContactClosed: normalizeBooleanInput(control?.first_contact_closed),
    firstContactAt: normalizeDateTimeInput(control?.first_contact_at) || null,
    secondContactClosed: normalizeBooleanInput(control?.second_contact_closed),
    secondContactAt: normalizeDateTimeInput(control?.second_contact_at) || null,
    nonClosureReason: normalizePostConsultNonClosureReason(control?.non_closure_reason),
    nonClosureReasonLabel: null,
    observation: normalizeString(control?.observation) || null,
    updatedByUserName: normalizeString(control?.updated_by_user_name) || null,
    updatedAt: normalizeString(control?.updated_at) || null,
    effectiveClosed: false,
    closed: false,
  };

  nextRow.effectiveClosed = buildRowClosedState(nextRow);
  nextRow.closed = nextRow.effectiveClosed;
  if (nextRow.effectiveClosed) {
    nextRow.nonClosureReason = null;
  }
  nextRow.nonClosureReasonLabel = nextRow.nonClosureReason ? nonClosureReasonMap.get(nextRow.nonClosureReason) || null : null;
  return nextRow;
};

const buildSummary = (rows: PostConsultRow[]): PostConsultSummary => {
  const pendingPatients = new Set<string>();
  const afterSecondNoClosePatients = new Set<string>();
  let totalProposals = 0;
  let totalClosedEvents = 0;
  let executedProposalValue = 0;

  for (const row of rows) {
    totalProposals += row.proposalCount;
    executedProposalValue += row.executedProposalValue;
    if (row.effectiveClosed) totalClosedEvents += 1;
    if (isPendingContactRow(row)) {
      pendingPatients.add(row.patientKey);
    }
    if (isAfterSecondNoCloseRow(row)) {
      afterSecondNoClosePatients.add(row.patientKey);
    }
  }

  return {
    totalEvents: rows.length,
    totalProposals,
    totalClosedEvents,
    conversionRate: rows.length > 0 ? (totalClosedEvents * 100) / rows.length : 0,
    pendingPatients: pendingPatients.size,
    afterSecondNoClosePatients: afterSecondNoClosePatients.size,
    executedProposalValue,
  };
};

const createEmptyViewerPerformance = (): PostConsultViewerPerformance => ({
  hasOperationalMatch: false,
  attendantResponsible: null,
  totalEvents: 0,
  totalClosedEvents: 0,
  conversionRate: 0,
  pendingPatients: 0,
  afterSecondNoClosePatients: 0,
  totalProposals: 0,
  executedProposalValue: 0,
});

const buildAttendantPerformanceRows = (rows: PostConsultRow[]): PostConsultRankingRow[] => {
  const grouped = new Map<
    string,
    PostConsultRankingRow & {
      normalizedKey: string;
    }
  >();

  for (const row of rows) {
    const normalizedKey = normalizeComparableText(row.attendantResponsible) || 'nao informado';
    const displayName = normalizeString(row.attendantResponsible) || 'Não informado';
    const current = grouped.get(normalizedKey) || {
      normalizedKey,
      attendantResponsible: displayName,
      totalEvents: 0,
      totalClosedEvents: 0,
      conversionRate: 0,
      pendingPatients: 0,
      afterSecondNoClosePatients: 0,
      totalProposals: 0,
      executedProposalValue: 0,
    };

    current.totalEvents += 1;
    current.totalProposals += row.proposalCount;
    current.executedProposalValue += row.executedProposalValue;
    if (row.effectiveClosed) current.totalClosedEvents += 1;
    if (isPendingContactRow(row)) current.pendingPatients += 1;
    if (isAfterSecondNoCloseRow(row)) current.afterSecondNoClosePatients += 1;

    if (!current.attendantResponsible || current.attendantResponsible === 'Não informado') {
      current.attendantResponsible = displayName;
    }

    grouped.set(normalizedKey, current);
  }

  return Array.from(grouped.values()).map(({ normalizedKey: _normalizedKey, ...row }) => ({
    ...row,
    conversionRate: row.totalEvents > 0 ? (row.totalClosedEvents * 100) / row.totalEvents : 0,
  }));
};

const sortAttendantPerformanceRows = (rows: PostConsultRankingRow[]) =>
  [...rows].sort((left, right) => {
    if (right.conversionRate !== left.conversionRate) return right.conversionRate - left.conversionRate;
    if (right.totalClosedEvents !== left.totalClosedEvents) return right.totalClosedEvents - left.totalClosedEvents;
    if (right.executedProposalValue !== left.executedProposalValue) return right.executedProposalValue - left.executedProposalValue;
    return left.attendantResponsible.localeCompare(right.attendantResponsible, 'pt-BR');
  });

const buildAttendantPerformanceSummary = (rows: PostConsultRankingRow[]): PostConsultRankingSummary => {
  const summary: PostConsultRankingSummary = {
    totalAttendants: rows.length,
    totalEvents: rows.reduce((total, row) => total + row.totalEvents, 0),
    totalClosedEvents: rows.reduce((total, row) => total + row.totalClosedEvents, 0),
    conversionRate: 0,
    executedProposalValue: rows.reduce((total, row) => total + row.executedProposalValue, 0),
  };
  summary.conversionRate = summary.totalEvents > 0 ? (summary.totalClosedEvents * 100) / summary.totalEvents : 0;
  return summary;
};

const tokenizeComparableText = (value: unknown) => normalizeComparableText(value).split(' ').filter(Boolean);

const computeLevenshteinDistance = (left: string, right: string) => {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
};

const scoreOperationalNameMatch = (viewerUserName: string, attendantResponsible: string) => {
  const viewerTokens = tokenizeComparableText(viewerUserName);
  const attendantTokens = tokenizeComparableText(attendantResponsible);

  if (!viewerTokens.length || viewerTokens.length !== attendantTokens.length) return null;
  if (viewerTokens[0] !== attendantTokens[0]) return null;

  let exactMatches = 0;
  let nearMatches = 0;

  for (let index = 0; index < viewerTokens.length; index += 1) {
    const viewerToken = viewerTokens[index];
    const attendantToken = attendantTokens[index];

    if (viewerToken === attendantToken) {
      exactMatches += 1;
      continue;
    }

    const maxLength = Math.max(viewerToken.length, attendantToken.length);
    if (maxLength < 5) return null;
    if (computeLevenshteinDistance(viewerToken, attendantToken) > 1) return null;

    nearMatches += 1;
  }

  if (nearMatches > 1) return null;
  if (exactMatches < Math.max(1, viewerTokens.length - 1)) return null;

  return exactMatches * 10 - nearMatches;
};

const resolveViewerOperationalMatch = (
  performanceRows: PostConsultRankingRow[],
  viewerUserName: string,
) => {
  const normalizedViewerName = normalizeComparableText(viewerUserName);
  if (!normalizedViewerName) return null;

  const exactMatch = performanceRows.find(
    (row) => normalizeComparableText(row.attendantResponsible) === normalizedViewerName,
  );
  if (exactMatch) return exactMatch;

  const scoredMatches = performanceRows
    .map((row) => ({
      row,
      score: scoreOperationalNameMatch(viewerUserName, row.attendantResponsible),
    }))
    .filter((candidate): candidate is { row: PostConsultRankingRow; score: number } => candidate.score !== null)
    .sort((left, right) => right.score - left.score);

  if (!scoredMatches.length) return null;
  if (scoredMatches.length > 1 && scoredMatches[0].score === scoredMatches[1].score) return null;

  return scoredMatches[0].row;
};

const buildViewerPerformance = (
  rows: PostConsultRow[],
  viewerUserName?: string | null,
): PostConsultViewerPerformance => {
  const normalizedViewerName = normalizeComparableText(viewerUserName);
  if (!normalizedViewerName) return createEmptyViewerPerformance();

  const performanceRows = buildAttendantPerformanceRows(rows);
  const matched = resolveViewerOperationalMatch(performanceRows, viewerUserName || '');
  if (!matched) return createEmptyViewerPerformance();

  return {
    hasOperationalMatch: true,
    attendantResponsible: matched.attendantResponsible,
    totalEvents: matched.totalEvents,
    totalClosedEvents: matched.totalClosedEvents,
    conversionRate: matched.conversionRate,
    pendingPatients: matched.pendingPatients,
    afterSecondNoClosePatients: matched.afterSecondNoClosePatients,
    totalProposals: matched.totalProposals,
    executedProposalValue: matched.executedProposalValue,
  };
};

const groupConsultationRows = (rows: RawConsultationSourceRow[]): ConsultationSourceRow[] => {
  const grouped = new Map<string, ConsultationSourceRow>();

  for (const row of rows) {
    const consultDate = normalizeIsoDate(row.consult_date);
    if (!consultDate) continue;

    const patientId = normalizeNumber(row.patient_id);
    const patientName = normalizeString(row.patient_name) || 'Não informado';
    const consultUnit = normalizeString(row.consult_unit) || 'Sem unidade';
    const consultProcedure = normalizeString(row.consult_procedure) || 'Consulta';
    const attendantResponsible = normalizeString(row.attendant_responsible) || 'Não informado';
    const patientGroupKey =
      patientId > 0 ? `id:${Math.trunc(patientId)}` : `name:${normalizeComparableText(patientName) || patientName.toLowerCase()}`;
    const groupKey = [
      patientGroupKey,
      consultDate,
      normalizeComparableText(consultUnit),
      normalizeComparableText(consultProcedure),
      normalizeComparableText(attendantResponsible),
    ].join('|');

    const current = grouped.get(groupKey);
    if (current) {
      current.billing_source_row_count += 1;
      if (!normalizeString(current.patient_name)) current.patient_name = patientName;
      continue;
    }

    grouped.set(groupKey, {
      consult_date: consultDate,
      patient_id: patientId > 0 ? Math.trunc(patientId) : null,
      patient_name: patientName,
      consult_unit: consultUnit,
      consult_procedure: consultProcedure,
      attendant_responsible: attendantResponsible,
      billing_source_row_count: 1,
    });
  }

  return Array.from(grouped.values());
};

const fetchConsultationRows = async (filters: PostConsultFilters, db: DbInterface) =>
  (async () => {
    const dialect = getRuntimeSqlDialect();
    const analiticoDateSql = getAnaliticoDateSql(dialect);
    const integerCastType = getIntegerCastType(dialect);

    const rawRows = (await db.query(
      `
        SELECT
          ${analiticoDateSql} AS consult_date,
          CAST(COALESCE(\`prontuário\`, 0) AS ${integerCastType}) AS patient_id,
          TRIM(COALESCE(paciente, '')) AS patient_name,
          TRIM(COALESCE(unidade, '')) AS consult_unit,
          TRIM(COALESCE(procedimento, '')) AS consult_procedure,
          TRIM(COALESCE(usuario_da_conta, '')) AS attendant_responsible
        FROM faturamento_analitico
        WHERE UPPER(TRIM(COALESCE(tipo_do_procedimento, ''))) = 'CONSULTA'
          AND ${analiticoDateSql} BETWEEN ? AND ?
      `,
      [filters.startDate, filters.endDate],
    )) as RawConsultationSourceRow[];

    return groupConsultationRows(rawRows);
  })();

const fetchProposalRows = async (filters: PostConsultFilters, db: DbInterface, hasProposalPatientName: boolean) => {
  const proposalPatientNameSelect = hasProposalPatientName
    ? `TRIM(COALESCE(patient_name, '')) AS proposal_patient_name`
    : `'' AS proposal_patient_name`;

  return (await db.query(
    `
      SELECT
        proposal_id,
        date AS proposal_date,
        status,
        unit_name,
        professional_name,
        total_value,
        patient_id,
        ${proposalPatientNameSelect}
      FROM feegow_proposals
      WHERE date BETWEEN ? AND ?
    `,
    [filters.startDate, filters.endDate],
  )) as ProposalSourceRow[];
};

const buildLinkedRows = async (filters: PostConsultFilters, db: DbInterface) => {
  await ensurePostConsultSupportTable(db);
  const proposalColumns = await listColumnNames(db, 'feegow_proposals');
  const hasProposalPatientName = proposalColumns.has('patient_name');

  const [consultationRows, proposalRows] = await Promise.all([
    fetchConsultationRows(filters, db),
    fetchProposalRows(filters, db, hasProposalPatientName),
  ]);

  const proposalByPatientId = new Map<string, ProposalSourceRow[]>();
  const proposalByPatientName = new Map<string, ProposalSourceRow[]>();

  for (const proposal of proposalRows) {
    const proposalDate = normalizeIsoDate(proposal.proposal_date);
    if (!proposalDate) continue;

    const patientId = normalizeNumber(proposal.patient_id);
    if (patientId > 0) {
      const key = `${proposalDate}|${patientId}`;
      const bucket = proposalByPatientId.get(key) || [];
      bucket.push(proposal);
      proposalByPatientId.set(key, bucket);
    }

    const proposalPatientName = normalizeComparableText(proposal.proposal_patient_name);
    if (proposalPatientName) {
      const key = `${proposalDate}|${proposalPatientName}`;
      const bucket = proposalByPatientName.get(key) || [];
      bucket.push(proposal);
      proposalByPatientName.set(key, bucket);
    }
  }

  const patientIds = consultationRows
    .map((row) => normalizeNumber(row.patient_id))
    .filter((patientId) => patientId > 0);
  const contactCacheMap = await readContactCache(db, patientIds);

  const rows: PostConsultRow[] = [];
  const eventKeys: string[] = [];

  for (const source of consultationRows) {
    const consultDate = normalizeIsoDate(source.consult_date);
    const patientId = normalizeNumber(source.patient_id);
    const patientNameFromBilling = normalizeString(source.patient_name);
    const consultUnit = normalizeString(source.consult_unit) || 'Sem unidade';
    const consultProcedure = normalizeString(source.consult_procedure) || 'Consulta';
    const attendantResponsible = normalizeString(source.attendant_responsible) || 'Não informado';
    if (!consultDate) continue;

    const contact = patientId > 0 ? contactCacheMap.get(patientId) : undefined;
    const patientName = normalizeString(contact?.patient_name) || patientNameFromBilling || 'Não informado';
    const patientPhone = normalizeString(contact?.phone_primary) || 'Não informado';
    const patientEmail = normalizeString(contact?.email_primary) || '';

    let linkedProposals: ProposalSourceRow[] = [];
    if (patientId > 0) {
      linkedProposals = proposalByPatientId.get(`${consultDate}|${patientId}`) || [];
    }
    if (!linkedProposals.length) {
      const normalizedName = normalizeComparableText(patientName);
      if (normalizedName) {
        linkedProposals = proposalByPatientName.get(`${consultDate}|${normalizedName}`) || [];
      }
    }
    if (!linkedProposals.length) continue;

    const proposals = Array.from(
      new Map(
        linkedProposals.map((proposal) => {
          const item: PostConsultProposalItem = {
            proposalId: Math.trunc(normalizeNumber(proposal.proposal_id)),
            proposalDate: normalizeIsoDate(proposal.proposal_date) || consultDate,
            status: normalizeString(proposal.status) || 'Sem status',
            unitName: normalizeString(proposal.unit_name) || 'Sem unidade',
            professionalName: normalizeString(proposal.professional_name) || 'Não informado',
            totalValue: normalizeNumber(proposal.total_value),
          };
          return [item.proposalId, item] as const;
        }),
      ).values(),
    ).sort((left, right) => right.proposalId - left.proposalId);

    const snapshot: PostConsultFollowupSourceSnapshot = {
      patientId: patientId > 0 ? Math.trunc(patientId) : null,
      patientName,
      consultDate,
      consultUnit,
      consultProcedure,
      attendantResponsible,
    };
    const eventKey = buildEventKeyFromSnapshot(snapshot);
    const statusSummary = buildProposalStatusSummary(proposals.map((proposal) => proposal.status));
    const autoClosedByExecution = buildAutoClosedByExecution(proposals);
    const executedProposalCount = buildExecutedProposalCount(proposals);
    const executedProposalValue = buildExecutedProposalValue(proposals);
    const totalProposalValue = buildTotalProposalValue(proposals);

    const row: PostConsultRow = {
      eventKey,
      patientKey: buildPatientKey(snapshot.patientId, patientName),
      patientId: snapshot.patientId,
      patientName,
      patientPhone,
      patientEmail,
      consultDate,
      consultUnit,
      consultProcedure,
      attendantResponsible,
      billingSourceRowCount: Math.max(1, Math.trunc(normalizeNumber(source.billing_source_row_count))),
      proposalCount: proposals.length,
      proposalStatusSummary: statusSummary.summary,
      proposalStatuses: statusSummary.statuses,
      proposals,
      nonClosureReason: null,
      nonClosureReasonLabel: null,
      autoClosedByExecution,
      effectiveClosed: autoClosedByExecution,
      executedProposalCount,
      executedProposalValue,
      totalProposalValue,
      firstContactClosed: null,
      firstContactAt: null,
      secondContactClosed: null,
      secondContactAt: null,
      observation: null,
      updatedByUserName: null,
      updatedAt: null,
      closed: autoClosedByExecution,
    };

    rows.push(row);
    eventKeys.push(eventKey);
  }

  const controlMap = await readFollowupControlRows(db, eventKeys);
  return rows.map((row) => mapFollowupControlToRow(row, controlMap.get(row.eventKey)));
};

const applyFilters = (rows: PostConsultRow[], filters: PostConsultFilters) =>
  rows.filter((row) => {
    if (normalizeComparableText(filters.unit) !== 'all' && normalizeComparableText(row.consultUnit) !== normalizeComparableText(filters.unit)) {
      return false;
    }

    if (
      normalizeComparableText(filters.responsible) !== 'all' &&
      normalizeComparableText(row.attendantResponsible) !== normalizeComparableText(filters.responsible)
    ) {
      return false;
    }

    if (
      normalizeComparableText(filters.status) !== 'all' &&
      !row.proposals.some((proposal) => proposalMatchesStatus(proposal, filters.status))
    ) {
      return false;
    }

    if (!rowMatchesClosedFilter(row, filters.closed)) {
      return false;
    }

    return true;
  });

const getPostConsultHeartbeat = async (db: DbInterface) => {
  const heartbeatAliases: Record<string, string> = {
    worker_faturamento_scraping: 'faturamento',
    propostas: 'comercial',
  };
  const rows = (await db.query(
    `
      SELECT service_name, status, last_run, details
      FROM system_status
      WHERE service_name IN (?, ?, ?, ?)
    `,
    ['faturamento', 'comercial', 'worker_faturamento_scraping', 'propostas'],
  )) as Array<{ service_name?: unknown; status?: unknown; last_run?: unknown; details?: unknown }>;

  const grouped = new Map<string, Array<{ serviceName: string; status: string; lastRun: string | null; details: string | null }>>();
  for (const row of rows) {
    const serviceName = heartbeatAliases[normalizeString(row?.service_name).toLowerCase()] || normalizeString(row?.service_name).toLowerCase();
    if (!serviceName) continue;
    const current = grouped.get(serviceName) || [];
    current.push({
      serviceName,
      status: normalizeString(row?.status || 'UNKNOWN').toUpperCase() || 'UNKNOWN',
      lastRun: normalizeString(row?.last_run) || null,
      details: normalizeString(row?.details) || null,
    });
    grouped.set(serviceName, current);
  }

  const normalizedRows = Array.from(grouped.entries()).map(([serviceName, serviceRows]) =>
    pickEffectiveSystemStatus(
      serviceRows.map((row) => ({
        serviceName,
        status: row.status,
        lastRun: row.lastRun,
        details: row.details,
      })),
    ),
  );

  const pickStatus = () => {
    if (normalizedRows.some((row) => row.status === 'RUNNING')) return 'RUNNING';
    if (normalizedRows.some((row) => row.status === 'PENDING' || row.status === 'QUEUED')) return 'PENDING';
    if (normalizedRows.some((row) => row.status === 'ERROR')) return 'ERROR';
    if (normalizedRows.some((row) => row.status === 'ONLINE')) return 'ONLINE';
    if (normalizedRows.some((row) => row.status === 'COMPLETED')) return 'COMPLETED';
    return normalizedRows[0]?.status || 'UNKNOWN';
  };

  const sortedByLastRun = [...normalizedRows].sort((left, right) => normalizeString(right.lastRun).localeCompare(normalizeString(left.lastRun)));
  const latest = sortedByLastRun[0];
  const details = normalizedRows
    .filter((row) => row.details)
    .map((row) => `${row.serviceName}: ${row.details}`)
    .join(' | ');

  return {
    status: pickStatus(),
    last_run: latest?.lastRun || null,
    details: details || null,
  };
};

export const listPostConsultOptions = async (
  filters: PostConsultFilters,
  db: DbInterface = getDbConnection(),
): Promise<PostConsultOptions> => {
  const rows = await buildLinkedRows(filters, db);
  const heartbeat = await getPostConsultHeartbeat(db);
  return {
    availableUnits: Array.from(new Set(rows.map((row) => row.consultUnit))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    availableStatuses: Array.from(new Set(rows.flatMap((row) => row.proposalStatuses))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    availableResponsibles: Array.from(new Set(rows.map((row) => row.attendantResponsible))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    nonClosureReasons: [...POST_CONSULT_NON_CLOSURE_REASONS],
    heartbeat,
  };
};

export const listPostConsultExportRows = async (
  filters: PostConsultFilters,
  db: DbInterface = getDbConnection(),
) => {
  const baseRows = await buildLinkedRows(filters, db);
  return sortRows(applyFilters(baseRows, filters));
};

export const listPostConsultDetails = async (
  filters: PostConsultFilters,
  db: DbInterface = getDbConnection(),
  viewerUserName?: string | null,
): Promise<PostConsultDetailResult> => {
  const baseRows = await buildLinkedRows(filters, db);
  const viewerRows = sortRows(
    applyFilters(baseRows, {
      ...filters,
      responsible: 'all',
    }),
  );
  const filteredRows = sortRows(applyFilters(baseRows, filters));
  const summary = buildSummary(filteredRows);
  const viewerPerformance = buildViewerPerformance(viewerRows, viewerUserName);
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const safePage = clamp(filters.page, 1, totalPages);
  const offset = (safePage - 1) * filters.pageSize;

  return {
    summary,
    viewerPerformance,
    rows: filteredRows.slice(offset, offset + filters.pageSize),
    page: safePage,
    pageSize: filters.pageSize,
    totalRows,
    totalPages,
  };
};

const createPostConsultFiltersFromRanking = (filters: PostConsultRankingFilters): PostConsultFilters => ({
  startDate: filters.startDate,
  endDate: filters.endDate,
  unit: filters.unit,
  status: 'all',
  responsible: 'all',
  closed: 'all',
  page: 1,
  pageSize: 200,
});

export const listPostConsultRanking = async (
  filters: PostConsultRankingFilters,
  db: DbInterface = getDbConnection(),
): Promise<PostConsultRankingResult> => {
  const baseFilters = createPostConsultFiltersFromRanking(filters);
  const rows = sortRows(applyFilters(await buildLinkedRows(baseFilters, db), baseFilters));
  const rankingRows = sortAttendantPerformanceRows(buildAttendantPerformanceRows(rows));
  const summary = buildAttendantPerformanceSummary(rankingRows);

  return {
    summary,
    rows: rankingRows,
  };
};

const resolveLinkedProposalsForSnapshot = async (
  snapshot: PostConsultFollowupSourceSnapshot,
  db: DbInterface,
): Promise<PostConsultProposalItem[]> => {
  const proposalColumns = await listColumnNames(db, 'feegow_proposals');
  const hasProposalPatientName = proposalColumns.has('patient_name');
  const proposalPatientNameSelect = hasProposalPatientName
    ? `TRIM(COALESCE(patient_name, '')) AS proposal_patient_name`
    : `'' AS proposal_patient_name`;
  const proposalRows = (await db.query(
    `
      SELECT
        proposal_id,
        date AS proposal_date,
        status,
        unit_name,
        professional_name,
        total_value,
        patient_id,
        ${proposalPatientNameSelect}
      FROM feegow_proposals
      WHERE date = ?
    `,
    [snapshot.consultDate],
  )) as ProposalSourceRow[];

  let linked = proposalRows.filter((proposal) => normalizeNumber(proposal.patient_id) > 0 && normalizeNumber(proposal.patient_id) === normalizeNumber(snapshot.patientId));
  if (!linked.length) {
    const patientName = normalizeComparableText(snapshot.patientName);
    if (patientName) {
      linked = proposalRows.filter((proposal) => normalizeComparableText(proposal.proposal_patient_name) === patientName);
    }
  }

  return Array.from(
    new Map(
      linked.map((proposal) => {
        const item: PostConsultProposalItem = {
          proposalId: Math.trunc(normalizeNumber(proposal.proposal_id)),
          proposalDate: normalizeIsoDate(proposal.proposal_date) || snapshot.consultDate,
          status: normalizeString(proposal.status) || 'Sem status',
          unitName: normalizeString(proposal.unit_name) || 'Sem unidade',
          professionalName: normalizeString(proposal.professional_name) || 'Não informado',
          totalValue: normalizeNumber(proposal.total_value),
        };
        return [item.proposalId, item] as const;
      }),
    ).values(),
  );
};

export const upsertPostConsultFollowup = async (
  input: PostConsultFollowupUpdateInput,
  db: DbInterface = getDbConnection(),
): Promise<PostConsultFollowupSaveResult> => {
  await ensurePostConsultSupportTable(db);

  const snapshot: PostConsultFollowupSourceSnapshot = {
    patientId: input.sourceSnapshot.patientId && input.sourceSnapshot.patientId > 0 ? Math.trunc(input.sourceSnapshot.patientId) : null,
    patientName: normalizeString(input.sourceSnapshot.patientName),
    consultDate: normalizeIsoDate(input.sourceSnapshot.consultDate),
    consultUnit: normalizeString(input.sourceSnapshot.consultUnit),
    consultProcedure: normalizeString(input.sourceSnapshot.consultProcedure),
    attendantResponsible: normalizeString(input.sourceSnapshot.attendantResponsible),
  };
  const expectedEventKey = buildEventKeyFromSnapshot(snapshot);
  const eventKey = normalizeString(input.eventKey);

  if (!eventKey || eventKey !== expectedEventKey) {
    throw createHttpError('Evento de pós-consulta inválido.', 400);
  }

  if (!snapshot.consultDate || !snapshot.patientName) {
    throw createHttpError('Dados de origem insuficientes para salvar o pós-consulta.', 400);
  }

  const firstContactClosed = normalizeBooleanInput(input.firstContactClosed);
  const secondContactClosed = normalizeBooleanInput(input.secondContactClosed);
  const firstContactAt = formatDateTimeForStorage(input.firstContactAt);
  const secondContactAt = formatDateTimeForStorage(input.secondContactAt);
  const linkedProposals = await resolveLinkedProposalsForSnapshot(snapshot, db);
  const autoClosedByExecution = buildAutoClosedByExecution(linkedProposals);
  const effectiveClosed = buildRowClosedState({
    autoClosedByExecution,
    firstContactClosed,
    secondContactClosed,
  });
  const hasManualNo = firstContactClosed === false || secondContactClosed === false;
  let nonClosureReason = normalizePostConsultNonClosureReason(input.nonClosureReason);
  if (effectiveClosed || !hasManualNo) {
    nonClosureReason = null;
  }
  if (hasManualNo && !effectiveClosed && !nonClosureReason) {
    throw createHttpError('Informe o motivo do não fechamento para salvar o pós-consulta.', 400);
  }
  const observation = normalizeObservation(input.observation) || null;
  const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(
    `
      INSERT INTO post_consulta_followup_control (
        event_key,
        patient_id,
        patient_name,
        consult_date,
        consult_unit,
        consult_procedure,
        attendant_responsible,
        first_contact_closed,
        first_contact_at,
        second_contact_closed,
        second_contact_at,
        non_closure_reason,
        observation,
        updated_by_user_id,
        updated_by_user_name,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_key) DO UPDATE SET
        patient_id = excluded.patient_id,
        patient_name = excluded.patient_name,
        consult_date = excluded.consult_date,
        consult_unit = excluded.consult_unit,
        consult_procedure = excluded.consult_procedure,
        attendant_responsible = excluded.attendant_responsible,
        first_contact_closed = excluded.first_contact_closed,
        first_contact_at = excluded.first_contact_at,
        second_contact_closed = excluded.second_contact_closed,
        second_contact_at = excluded.second_contact_at,
        non_closure_reason = excluded.non_closure_reason,
        observation = excluded.observation,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_by_user_name = excluded.updated_by_user_name,
        updated_at = excluded.updated_at
    `,
    [
      eventKey,
      snapshot.patientId,
      snapshot.patientName,
      snapshot.consultDate,
      snapshot.consultUnit,
      snapshot.consultProcedure,
      snapshot.attendantResponsible,
      firstContactClosed === null ? null : firstContactClosed ? 1 : 0,
      firstContactAt,
      secondContactClosed === null ? null : secondContactClosed ? 1 : 0,
      secondContactAt,
      nonClosureReason,
      observation,
      normalizeString(input.updatedByUserId) || null,
      normalizeString(input.updatedByUserName) || 'Usuário',
      updatedAt,
    ],
  );

  return {
    eventKey,
    firstContactClosed,
    firstContactAt,
    secondContactClosed,
    secondContactAt,
    nonClosureReason,
    nonClosureReasonLabel: nonClosureReason ? nonClosureReasonMap.get(nonClosureReason) || null : null,
    observation,
    updatedByUserName: normalizeString(input.updatedByUserName) || 'Usuário',
    updatedAt,
    effectiveClosed,
    closed: effectiveClosed,
  };
};
