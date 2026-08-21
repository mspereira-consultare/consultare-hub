import { randomUUID } from 'crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { requirePagePermission, type PagePermissionAuth, type PagePermissionDenied } from '@/lib/authz';
import {
  APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE,
  SNAPSHOT_CONFIRMED_STATUS_ID,
} from '@/lib/appointments_confirmation_repository';
import type { DbInterface } from '@/lib/db';
import { getExecutiveScope } from '@/lib/dashboard_executive/repository';
import {
  buildFinancialUnitClause,
  getFinancialUnitByKey,
  listFinancialUnits,
  normalizeFinancialUnitText,
  resolveFinancialUnit,
  type FinancialUnitDefinition,
} from '@/lib/financial_units';
import {
  calculateDailyTarget,
  calculateMonthProjection,
  calculateShouldHaveUntilDate,
  monthStart,
  operationalDaysSummary,
  parseIsoDate,
  previousBusinessDate,
  resolveFreezeSource,
  resolveIsHistorical,
  resolveReferenceDate,
  resolveReadOnly,
  shiftDate,
  type RecepcaoChecklistViewMode,
} from '@/lib/checklist_recepcao_domain';
import { calculateProjection, getProjectionStatus, type ProjectionStatus } from '@/lib/goals/projection';
import { DEFAULT_POINT_FILTERS } from '@/lib/point/filters';
import { listPointDailyControlRowsByDateRange } from '@/lib/point/repository';
import { listPostConsultExportRows, normalizePostConsultFilters } from '@/lib/post_consulta/repository';
import { invalidateCache } from '@/lib/api_cache';
import { listTasks } from '@consultare/core/tasks/repository';
import { parseSystemStatusTimestamp } from '@/lib/system_status_time';
import { pdfSafeText } from '@/lib/pdf/win_ansi';

const PROPOSAL_EXEC_STATUSES = "('executada','aprovada pelo cliente','ganho','realizado','concluido','pago')";
const IS_MYSQL =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const GOOGLE_RATING_TARGET = 4.7;
/** Tetos de linhas no PDF para títulos e descrições de tarefa da liderança. */
const TASK_TITLE_MAX_LINES = 3;
const TASK_DESCRIPTION_MAX_LINES = 3;
const CLINIC_REVENUE_EXCLUSION = "AND unidade NOT LIKE '%Card%' AND unidade NOT LIKE '%Resolve%'";
export const RECEPCAO_CHECKLIST_REFRESH_SERVICE = 'checklist_recepcao_refresh';
export const RECEPCAO_CHECKLIST_REFRESH_SERVICES = [
  'point_sync',
  'appointments',
  'faturamento',
  'comercial',
  'appointments_confirmation_snapshot',
] as const;
const CHECKLIST_PENDING_TASK_STATUSES = new Set(['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_APROVACAO', 'PAUSADO']);
const CHECKLIST_CLOSED_TASK_STATUSES = new Set(['CONCLUIDA', 'ARQUIVADA', 'CANCELADA']);
const CHECKLIST_TASK_PRIORITY_RANK: Record<string, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};
const SQL_DATE_ANALITICO = IS_MYSQL
  ? `(CASE WHEN INSTR(data_do_pagamento, '/') > 0 THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2)) ELSE data_do_pagamento END)`
  : `(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)`;

type ViewMode = RecepcaoChecklistViewMode;

type DbRow = Record<string, unknown>;

export type RecepcaoChecklistTeamMember = {
  employeeId: string;
  userId: string | null;
  fullName: string;
  department: string | null;
  units: string[];
};

export type RecepcaoChecklistConfig = {
  id: string;
  name: string;
  leaderUserId: string;
  leaderEmployeeId: string | null;
  leaderName: string;
  units: string[];
  teamMembers: RecepcaoChecklistTeamMember[];
  isActive: boolean;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type RecepcaoChecklistRiskManual = {
  groupName: string;
  planAction: string;
  fact: string;
  cause: string;
  action: string;
};

export type RecepcaoChecklistRecollectionEntry = {
  id: string;
  notes: string;
};

export type RecepcaoChecklistManualPayload = {
  resolveMonthlyTarget: number;
  resolveActual: number;
  checkupMonthlyTarget: number;
  checkupActual: number;
  nfOpenStatus: string;
  accountsOpenStatus: string;
  googleRating: number;
  googleNewReviewsCount: number;
  recollectionCount: number;
  recollectionNotes: string;
  recollections: RecepcaoChecklistRecollectionEntry[];
  pendingNotes: string;
  generalNotes: string;
  riskGroups: RecepcaoChecklistRiskManual[];
};

export type RecepcaoChecklistHistoryEntry = {
  id: string;
  referenceDate: string;
  unitKey: string;
  savedAt: string | null;
  savedByName: string | null;
  /** Resumo legível do que entrou neste salvamento. */
  changes: string[];
  isLatestForDate: boolean;
};


export type RecepcaoChecklistMetricFreshness = {
  updatedAt: string | null;
  sourceLabel: string;
  stale: boolean;
};

export type RecepcaoChecklistTaskDetail = {
  taskId: string;
  protocolId: string;
  title: string;
  description: string;
  dueDate: string | null;
};

export type RecepcaoChecklistActor = PagePermissionAuth & {
  isManager: boolean;
  scope: Awaited<ReturnType<typeof getExecutiveScope>> | null;
};

export type RecepcaoChecklistOptions = {
  leaders: Array<{
    userId: string;
    employeeId: string | null;
    name: string;
    units: string[];
    department: string | null;
  }>;
  teamMembers: RecepcaoChecklistTeamMember[];
  units: Array<{ key: string; label: string }>;
};

type RecepcaoChecklistVersionStoredPayload = {
  manual: RecepcaoChecklistManualPayload;
  selectedUnitKey: string;
  snapshot: {
    mode: ViewMode;
    referenceDate: string;
    summaryGeneratedAt: string;
  };
};

export type RecepcaoChecklistPayload = {
  generatedAt: string;
  today: string;
  /** Dia operacional anterior, para o atalho "Ontem" da barra de filtros. */
  previousBusinessDate: string;
  access: {
    isManager: boolean;
  };
  selectedLeaderUserId: string | null;
  availableLeaderFilters: Array<{
    userId: string;
    name: string;
  }>;
  viewMode: ViewMode;
  referenceDate: string;
  /** Data futura: não há o que preencher. */
  readOnly: boolean;
  /** Data anterior a hoje: indicadores vêm do histórico congelado. */
  isHistorical: boolean;
  selectedUnitKey: string;
  selectedUnitLabel: string;
  config: RecepcaoChecklistConfig | null;
  availableConfigs: Array<{
    id: string;
    name: string;
    leaderName: string;
    units: string[];
    isActive: boolean;
  }>;
  availableUnits: Array<{ key: string; label: string }>;
  /** Combinações endereçáveis de configuração x unidade, para o seletor de escopo. */
  availableScopes: Array<{
    configId: string;
    unitKey: string;
    unitLabel: string;
    configName: string;
    leaderName: string;
  }>;
  suggestedConfig: {
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
  } | null;
  suggestedConfigDraft: SaveConfigInput | null;
  /** Quem salvou o preenchimento exibido e quando. */
  lastSave: {
    savedAt: string | null;
    savedByName: string | null;
  } | null;
  manual: RecepcaoChecklistManualPayload;
  freezeMetadata: {
    isFrozen: boolean;
    source: 'version' | 'live-fallback' | 'legacy-fallback';
  };
  metrics: {
    unit: {
      revenueDay: number;
      revenueMonth: number;
      ticketAverageDay: number;
      monthlyGoal: number;
      shouldHaveUntilDate: number;
      dynamicDailyTarget: number;
      progressPct: number;
      expectedPct: number;
      /** Projeção do mês pela regra única de metas (dia corrente proporcional). */
      projectionMonth: number;
      /** Atingimento projetado sobre a meta mensal. */
      projectionPct: number;
      projectionStatus: ProjectionStatus;
      projectionSuppressed: boolean;
      projectionHint: string;
      /** Projeção do dia; null enquanto o expediente estiver abaixo do limiar de confiança. */
      projectionDay: number | null;
      /** Ritmo do mês: realizado sobre o que deveria ter até a data. */
      pacePct: number;
      businessDaysElapsed: number;
      businessDaysInMonth: number;
      businessDaysRemaining: number;
      freshness: {
        revenueDay: RecepcaoChecklistMetricFreshness;
        revenueMonth: RecepcaoChecklistMetricFreshness;
        ticketAverageDay: RecepcaoChecklistMetricFreshness;
        monthlyGoal: RecepcaoChecklistMetricFreshness;
        shouldHaveUntilDate: RecepcaoChecklistMetricFreshness;
        dynamicDailyTarget: RecepcaoChecklistMetricFreshness;
      };
    };
    collaborators: Array<{
      employeeId: string;
      userId: string | null;
      fullName: string;
      monthlyGoal: number;
      /** Realizado somente no dia de referência. */
      revenueDay: number;
      revenueMonth: number;
      dynamicDailyTarget: number;
      /** Realizado no dia sobre a meta diária dinâmica. null quando não há meta a perseguir. */
      dailyProgressPct: number | null;
      progressPct: number;
      /** false quando nenhum lançamento foi associado a esta pessoa no faturamento. */
      revenueMatched: boolean;
      /** Nome usado no Feegow, quando declarado pela meta do colaborador. */
      feegowAlias: string | null;
    }>;
    collaboratorsFreshness: RecepcaoChecklistMetricFreshness;
    teamProduction: {
      resolveMonthlyTarget: number;
      resolveActual: number;
      resolveDynamicDailyTarget: number;
      resolveProgressPct: number;
      checkupMonthlyTarget: number;
      checkupActual: number;
      checkupDynamicDailyTarget: number;
      checkupProgressPct: number;
    };
    appointmentsConfirmation: {
      targetDate: string;
      total: number;
      confirmed: number;
      ratePct: number;
      source: 'live' | 'snapshot' | 'snapshot-fallback';
      freshness: RecepcaoChecklistMetricFreshness;
    };
    postConsult: {
      totalEvents: number;
      totalClosedEvents: number;
      pendingPatients: number;
      executedProposalValue: number;
      /** % de eventos fechados no contexto (data de referência + equipe local). */
      conversionRate: number;
      freshness: RecepcaoChecklistMetricFreshness;
    };
    waits: {
      receptionAverageMinutes: number;
      receptionAttendedCount: number;
      medicAverageMinutes: number;
      medicAttendedCount: number;
      freshness: {
        reception: RecepcaoChecklistMetricFreshness;
        medic: RecepcaoChecklistMetricFreshness;
      };
    };
    tasks: {
      pendingTasks: number;
      overdueTasks: number;
      dueNext7DaysTasks: number;
      awaitingApprovalTasks: number;
      overdueItems: RecepcaoChecklistTaskDetail[];
      dueSoonItems: RecepcaoChecklistTaskDetail[];
      freshness: RecepcaoChecklistMetricFreshness;
    };
    proposals: {
      openCount: number;
      openValue: number;
      /** Janela considerada: dia 1 do mês da data de referência até ela. */
      periodStart: string;
      periodEnd: string;
      freshness: RecepcaoChecklistMetricFreshness;
    };
    absences: {
      trackedEmployees: number;
      absenceDays: number;
      lateMinutes: number;
      rows: Array<{
        employeeId: string | null;
        employeeName: string;
        absenceDays: number;
        lateMinutes: number;
      }>;
      freshness: RecepcaoChecklistMetricFreshness;
    };
    google: {
      ratingTarget: number;
      ratingActual: number;
      ratingProgressPct: number;
      newReviewsCount: number;
    };
    equipmentMaintenance: {
      items: Array<{
        equipmentId: string;
        name: string;
        identificationNumber: string;
        serialNumber: string;
        operationalStatus: string;
        operationalStatusLabel: string;
        locationDetail: string | null;
        updatedAt: string | null;
      }>;
      freshness: RecepcaoChecklistMetricFreshness;
    };
  };
  riskGroups: Array<{
    groupName: string;
    monthlyGoal: number;
    actualMonth: number;
    shouldHaveUntilDate: number;
    progressPct: number;
    atRisk: boolean;
    planAction: string;
    fact: string;
    cause: string;
    action: string;
  }>;
  riskGroupsFreshness: RecepcaoChecklistMetricFreshness;
};

type ConfigFilters = {
  configId?: string | null;
  leaderUserId?: string | null;
  unitKey?: string | null;
  viewMode?: string | null;
  referenceDate?: string | null;
};

type SystemStatusRow = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string;
};

type SystemStatusMap = Map<string, SystemStatusRow>;

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const bool = (value: unknown) =>
  value === true || value === 1 || clean(value) === '1' || clean(value).toLowerCase() === 'true';
const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  const raw = clean(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
const unique = <T>(items: T[]) => Array.from(new Set(items));
let cachedCollaboratorColumn: string | null | undefined;

const normalizeHumanText = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const quoteIdentifier = (value: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : `"${value.replace(/"/g, '""')}"`);

const namesLookEquivalent = (left: string, right: string) => {
  const normalizedLeft = normalizeHumanText(left);
  const normalizedRight = normalizeHumanText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return normalizedLeft.startsWith(`${normalizedRight} `) || normalizedRight.startsWith(`${normalizedLeft} `);
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInt = (value: unknown) => Math.max(0, Math.floor(toNumber(value)));

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatCompactCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

const formatPercent = (value: number) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

const toSaoPauloDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const toSaoPauloDateTime = (date = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('T', ' ');

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

const shiftIsoDate = (dateIso: string, deltaDays: number) => {
  if (!isIsoDate(dateIso)) return dateIso;
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const toDateOnly = (value: string | null | undefined) => {
  const raw = clean(value);
  return raw.slice(0, 10);
};

const hoursBetweenNowAnd = (value: string | null | undefined) => {
  const parsed = parseSystemStatusTimestamp(value);
  if (!parsed) return null;
  return (Date.now() - parsed.getTime()) / 3600000;
};

const buildFreshness = (
  updatedAt: string | null,
  sourceLabel: string,
  stale = false,
): RecepcaoChecklistMetricFreshness => ({
  updatedAt: clean(updatedAt) || null,
  sourceLabel,
  stale,
});

const pickOldestTimestamp = (items: Array<string | null | undefined>) => {
  let winner: string | null = null;
  let winnerTs = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const parsed = parseSystemStatusTimestamp(item || null);
    if (!parsed) continue;
    if (parsed.getTime() < winnerTs) {
      winner = clean(item) || null;
      winnerTs = parsed.getTime();
    }
  }
  return winner;
};

const mergeFreshness = (
  items: Array<RecepcaoChecklistMetricFreshness | null | undefined>,
  sourceLabel?: string,
): RecepcaoChecklistMetricFreshness => {
  const valid = items.filter(Boolean) as RecepcaoChecklistMetricFreshness[];
  if (valid.length <= 0) return buildFreshness(null, sourceLabel || 'Sem fonte', false);
  return buildFreshness(
    pickOldestTimestamp(valid.map((item) => item.updatedAt)),
    sourceLabel || valid.map((item) => item.sourceLabel).join(' + '),
    valid.some((item) => item.stale),
  );
};

const looksStaleForCurrentReference = (
  updatedAt: string | null | undefined,
  referenceDate: string,
  maxAgeHours: number,
) => {
  if (!clean(updatedAt)) return false;
  const updatedDate = toDateOnly(updatedAt);
  if (referenceDate && updatedDate && updatedDate < referenceDate) return true;
  const ageHours = hoursBetweenNowAnd(updatedAt);
  return ageHours !== null && ageHours > maxAgeHours;
};

const normalizeUnitKeys = (values: unknown) =>
  unique(
    safeJsonParse<string[]>(values, [])
      .map((item) => {
        const resolved = getFinancialUnitByKey(item);
        return resolved?.key || clean(item);
      })
      .filter(Boolean),
  );

const normalizeTeamMembers = (values: unknown): RecepcaoChecklistTeamMember[] =>
  safeJsonParse<RecepcaoChecklistTeamMember[]>(values, [])
    .map((row) => ({
      employeeId: clean(row?.employeeId),
      userId: clean(row?.userId) || null,
      fullName: clean(row?.fullName),
      department: clean(row?.department) || null,
      units: Array.isArray(row?.units) ? row.units.map((unit) => clean(unit)).filter(Boolean) : [],
    }))
    .filter((row) => row.employeeId && row.fullName);

const normalizeRecollectionEntries = (
  value: Partial<RecepcaoChecklistManualPayload> | null | undefined,
): RecepcaoChecklistRecollectionEntry[] => {
  const explicitRows = Array.isArray(value?.recollections)
    ? value!.recollections
        .map((row) => ({
          id: clean(row?.id) || randomUUID(),
          notes: clean(row?.notes).slice(0, 4000),
        }))
        .filter((row) => row.notes)
    : [];

  if (explicitRows.length > 0) return explicitRows;

  const legacyNotes = clean(value?.recollectionNotes).slice(0, 4000);
  const legacyCount = toInt(value?.recollectionCount);
  if (!legacyNotes && legacyCount <= 0) return [];

  const size = Math.max(legacyCount, legacyNotes ? 1 : 0);
  return Array.from({ length: size }).map((_, index) => ({
    id: `legacy-${index + 1}`,
    notes: index === 0 ? legacyNotes : '',
  }));
};

const normalizeManualPayload = (value: Partial<RecepcaoChecklistManualPayload> | null | undefined): RecepcaoChecklistManualPayload => ({
  recollections: normalizeRecollectionEntries(value),
  resolveMonthlyTarget: toInt(value?.resolveMonthlyTarget),
  resolveActual: toInt(value?.resolveActual),
  checkupMonthlyTarget: toInt(value?.checkupMonthlyTarget),
  checkupActual: toInt(value?.checkupActual),
  nfOpenStatus: clean(value?.nfOpenStatus),
  accountsOpenStatus: clean(value?.accountsOpenStatus),
  googleRating: Number(toNumber(value?.googleRating).toFixed(2)),
  googleNewReviewsCount: toInt(value?.googleNewReviewsCount),
  recollectionCount: normalizeRecollectionEntries(value).length,
  recollectionNotes: normalizeRecollectionEntries(value)
    .map((entry) => entry.notes)
    .filter(Boolean)
    .join('\n\n'),
  pendingNotes: clean(value?.pendingNotes).slice(0, 4000),
  generalNotes: clean(value?.generalNotes).slice(0, 4000),
  riskGroups: Array.isArray(value?.riskGroups)
    ? value!.riskGroups
        .map((row) => ({
          groupName: clean(row?.groupName),
          planAction: clean(row?.planAction).slice(0, 2000),
          fact: clean(row?.fact).slice(0, 2000),
          cause: clean(row?.cause).slice(0, 2000),
          action: clean(row?.action).slice(0, 2000),
        }))
        .filter((row) => row.groupName)
    : [],
});

const normalizeLegacyManual = (row: DbRow | null): RecepcaoChecklistManualPayload => {
  const generalParts = [clean(row?.google_comments), clean(row?.situacoes_criticas), clean(row?.acoes_realizadas)].filter(Boolean);
  return normalizeManualPayload({
    resolveMonthlyTarget: toNumber(row?.meta_resolve_target),
    checkupMonthlyTarget: toNumber(row?.meta_checkup_target),
    nfOpenStatus: clean(row?.nf_status),
    accountsOpenStatus: clean(row?.contas_status),
    googleRating: toNumber(String(row?.google_rating || '').replace(',', '.')),
    pendingNotes: clean(row?.pendencias_urgentes),
    generalNotes: generalParts.join('\n\n'),
  });
};

const mapConfigRow = (row: DbRow): RecepcaoChecklistConfig => ({
  id: clean(row.id),
  name: clean(row.name) || clean(row.leader_name) || 'Checklist Recepcao',
  leaderUserId: clean(row.leader_user_id),
  leaderEmployeeId: clean(row.leader_employee_id) || null,
  leaderName: clean(row.leader_name),
  units: normalizeUnitKeys(row.units_json),
  teamMembers: normalizeTeamMembers(row.team_members_json),
  isActive: !('is_active' in row) || bool(row.is_active),
  createdAt: clean(row.created_at) || null,
  createdBy: clean(row.created_by) || null,
  updatedAt: clean(row.updated_at) || null,
  updatedBy: clean(row.updated_by) || null,
});

const collatedEquality = (left: string, right: string) =>
  IS_MYSQL ? `${left} COLLATE utf8mb4_unicode_ci = ${right} COLLATE utf8mb4_unicode_ci` : `${left} = ${right}`;

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const message = String((error as { message?: unknown } | null)?.message || '');
    const code = String((error as { code?: unknown } | null)?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      /duplicate column/i.test(message) ||
      /already exists/i.test(message) ||
      /duplicate column name/i.test(message)
    ) {
      return;
    }
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const message = String((error as { message?: unknown } | null)?.message || '');
    const code = String((error as { code?: unknown } | null)?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(message) || /duplicate key name/i.test(message)) {
      return;
    }
    throw error;
  }
};

const loadSystemStatusMap = async (db: DbInterface, serviceNames: readonly string[]): Promise<SystemStatusMap> => {
  const normalized = unique(serviceNames.map((item) => clean(item)).filter(Boolean));
  const map: SystemStatusMap = new Map();
  if (normalized.length <= 0) return map;

  const placeholders = normalized.map(() => '?').join(',');
  const rows = await db.query(
    `
      SELECT service_name, status, last_run, details
      FROM system_status
      WHERE service_name IN (${placeholders})
    `,
    normalized,
  ).catch(() => []);

  for (const row of rows as DbRow[]) {
    const serviceName = clean(row.service_name);
    if (!serviceName) continue;
    map.set(serviceName, {
      serviceName,
      status: upper(row.status || 'UNKNOWN') || 'UNKNOWN',
      lastRun: clean(row.last_run) || null,
      details: clean(row.details),
    });
  }

  return map;
};

const getServiceFreshness = (
  statuses: SystemStatusMap,
  serviceName: string,
  sourceLabel: string,
  referenceDate: string,
  staleAfterHours = 18,
) => {
  const row = statuses.get(serviceName);
  return buildFreshness(
    row?.lastRun || null,
    sourceLabel,
    looksStaleForCurrentReference(row?.lastRun || null, referenceDate, staleAfterHours),
  );
};

const queryMaxTimestamp = async (
  db: DbInterface,
  sql: string,
  params: Array<string | number>,
  sourceLabel: string,
) => {
  const rows = await db.query(sql, params).catch(() => []);
  return buildFreshness(clean(rows[0]?.updated_at) || null, sourceLabel, false);
};

/**
 * Bootstrap de schema roda uma vez por processo. Antes disto era executado a
 * cada requisição: 2 CREATE, 12 ALTER (que sempre falhavam por coluna já
 * existente, e o erro era engolido) e 2 CREATE INDEX, tudo sequencial. Mesmo
 * padrão já usado em equipamentos e ponto.
 */
let schemaEnsured = false;

export const ensureRecepcaoChecklistSchema = async (db: DbInterface) => {
  if (schemaEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recepcao_checklist_configs (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      leader_user_id VARCHAR(64) NOT NULL,
      leader_employee_id VARCHAR(64) NULL,
      leader_name VARCHAR(180) NOT NULL,
      units_json LONGTEXT NOT NULL,
      team_members_json LONGTEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NULL,
      created_by VARCHAR(64) NULL,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recepcao_checklist_versions (
      id VARCHAR(64) PRIMARY KEY,
      config_id VARCHAR(64) NOT NULL,
      reference_date VARCHAR(10) NOT NULL,
      unit_key VARCHAR(64) NOT NULL,
      view_mode VARCHAR(16) NOT NULL DEFAULT 'current',
      created_at TEXT NULL,
      created_by_user_id VARCHAR(64) NULL,
      created_by_name VARCHAR(180) NULL,
      payload_json LONGTEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN name VARCHAR(180) NOT NULL DEFAULT 'Checklist Recepcao'`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN leader_employee_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN leader_name VARCHAR(180) NOT NULL DEFAULT ''`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN team_members_json LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN created_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN created_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN updated_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN updated_by VARCHAR(64) NULL`);

  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_versions ADD COLUMN view_mode VARCHAR(16) NOT NULL DEFAULT 'current'`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_versions ADD COLUMN created_by_user_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_versions ADD COLUMN created_by_name VARCHAR(180) NULL`);

  await safeCreateIndex(db, `CREATE INDEX idx_recepcao_checklist_configs_leader ON recepcao_checklist_configs (leader_user_id, is_active)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recepcao_checklist_versions_ref ON recepcao_checklist_versions (config_id, reference_date, unit_key)`);

  schemaEnsured = true;
};

export const requireRecepcaoChecklistAccess = async (
  action: 'view' | 'edit',
): Promise<(RecepcaoChecklistActor & { ok: true }) | (PagePermissionDenied & { ok: false })> => {
  const auth = await requirePagePermission('checklist_recepcao', action);
  if (!auth.ok) return auth as PagePermissionDenied & { ok: false };

  await ensureRecepcaoChecklistSchema(auth.db);
  const scope = await getExecutiveScope(auth.db, auth.userId).catch(() => null);
  const unrestrictedScope =
    !!scope &&
    Array.isArray(scope.units) &&
    Array.isArray(scope.departments) &&
    Array.isArray(scope.teams) &&
    scope.units.length === 0 &&
    scope.departments.length === 0 &&
    scope.teams.length === 0 &&
    !!scope.profileKey;

  return {
    ...auth,
    scope,
    isManager: auth.role === 'ADMIN' || scope?.profileKey === 'diretoria_gerencia_adm' || unrestrictedScope,
  };
};

const loadOptions = async (db: DbInterface): Promise<RecepcaoChecklistOptions> => {
  const rows = await db.query(
    `
      SELECT
        e.id AS employee_id,
        e.full_name,
        e.department,
        e.units_json,
        e.status AS employee_status,
        u.id AS user_id,
        u.name AS user_name,
        u.status AS user_status
      FROM employees e
      LEFT JOIN users u ON ${collatedEquality('u.employee_id', 'e.id')}
      ORDER BY e.full_name ASC
    `,
  );

  const teamMembers = (rows as DbRow[])
    .filter((row) => upper(row.employee_status || 'ATIVO') === 'ATIVO')
    .map((row) => ({
      employeeId: clean(row.employee_id),
      userId: clean(row.user_id) || null,
      fullName: clean(row.full_name),
      department: clean(row.department) || null,
      units: safeJsonParse<string[]>(row.units_json, []).map((unit) => clean(unit)).filter(Boolean),
    }))
    .filter((row) => row.employeeId && row.fullName);

  const leaders = teamMembers
    .filter((row) => row.userId)
    .map((row) => ({
      userId: row.userId || '',
      employeeId: row.employeeId,
      name: row.fullName,
      units: row.units,
      department: row.department,
    }));

  return {
    leaders,
    teamMembers,
    units: listFinancialUnits().map((unit) => ({ key: unit.key, label: unit.label })),
  };
};

const loadSuggestedConfig = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        e.id AS employee_id,
        e.units_json
      FROM users u
      LEFT JOIN employees e ON ${collatedEquality('u.employee_id', 'e.id')}
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId],
  );
  const row = rows[0] as DbRow | undefined;
  if (!row) return null;
  return {
    leaderUserId: clean(row.user_id),
    leaderEmployeeId: clean(row.employee_id) || null,
    leaderName: clean(row.user_name),
    units: normalizeUnitKeys(row.units_json),
  };
};

const buildSuggestedConfigInput = (
  options: RecepcaoChecklistOptions,
  suggestedConfig: {
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
  } | null,
) => {
  if (!suggestedConfig?.leaderUserId || suggestedConfig.units.length <= 0) return null;

  const unitSet = new Set(suggestedConfig.units);
  const teamEmployeeIds = options.teamMembers
    .filter((member) => member.units.some((unit) => unitSet.has(unit)))
    .map((member) => member.employeeId);

  return {
    name: `Checklist ${suggestedConfig.leaderName || 'Recepcao'}`,
    leaderUserId: suggestedConfig.leaderUserId,
    leaderEmployeeId: suggestedConfig.leaderEmployeeId,
    leaderName: suggestedConfig.leaderName,
    units: suggestedConfig.units,
    teamEmployeeIds,
    isActive: true,
  };
};

const listAccessibleConfigs = async (db: DbInterface, actor: RecepcaoChecklistActor, filters?: { leaderUserId?: string | null }) => {
  const whereParts: string[] = [];
  const params: string[] = [];

  if (!actor.isManager) {
    whereParts.push('leader_user_id = ?');
    params.push(actor.userId);
  } else if (clean(filters?.leaderUserId)) {
    whereParts.push('leader_user_id = ?');
    params.push(clean(filters?.leaderUserId));
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const rows = await db.query(
    `
      SELECT *
      FROM recepcao_checklist_configs
      ${where}
      ORDER BY is_active DESC, leader_name ASC, updated_at DESC
    `,
    params,
  );
  return (rows as DbRow[]).map(mapConfigRow).filter((row) => row.isActive);
};

const resolveConfigForActor = (
  configs: RecepcaoChecklistConfig[],
  actor: RecepcaoChecklistActor,
  filters: ConfigFilters,
) => {
  const requestedUnitKey = getFinancialUnitByKey(clean(filters.unitKey))?.key || null;
  const requested = clean(filters.configId);
  const requestedConfig = requested ? configs.find((config) => config.id === requested) : undefined;

  // A unidade escolhida manda: se a configuração selecionada não habilita
  // aquela unidade, buscamos a configuração que a habilita, para que a equipe
  // cadastrada daquela unidade continue sendo o contexto da página.
  if (requestedUnitKey) {
    if (requestedConfig?.units.includes(requestedUnitKey)) return requestedConfig;
    const byUnit = configs.find((config) => config.units.includes(requestedUnitKey));
    if (byUnit) return byUnit;
  }

  if (requestedConfig) return requestedConfig;

  const ownConfig = configs.find((config) => config.leaderUserId === actor.userId);
  return ownConfig || configs[0] || null;
};

const resolveUnitForConfig = (
  config: RecepcaoChecklistConfig | null,
  unitKeyRaw: string | null | undefined,
): FinancialUnitDefinition | null => {
  const requested = getFinancialUnitByKey(unitKeyRaw || '');
  if (requested && (!config || config.units.length === 0 || config.units.includes(requested.key))) return requested;

  if (config?.units?.length) {
    return getFinancialUnitByKey(config.units[0]) || null;
  }
  return listFinancialUnits()[0] || null;
};

const queryLegacyManualFallback = async (db: DbInterface, unitKey: string) => {
  const rows = await db.query(
    `
      SELECT *
      FROM recepcao_checklist_manual
      WHERE scope_key = ?
      LIMIT 1
    `,
    [unitKey],
  );
  if (rows.length > 0) return rows[0] as DbRow;

  const legacyRows = await db.query(
    `
      SELECT *
      FROM recepcao_checklist_daily
      WHERE unit_key = ?
      ORDER BY COALESCE(updated_at, date_ref) DESC
      LIMIT 1
    `,
    [unitKey],
  );
  return (legacyRows[0] as DbRow | undefined) || null;
};

/**
 * O preenchimento exibido é sempre o mais recente daquela data. O histórico
 * continua gravado linha a linha, mas serve só para auditoria (ver
 * listRecepcaoChecklistHistory), nunca para a leitura da página.
 */
const queryLatestFillRow = async (
  db: DbInterface,
  args: { configId: string; unitKey: string; referenceDate: string },
) => {
  const rows = await db.query(
    `
      SELECT *
      FROM recepcao_checklist_versions
      WHERE config_id = ?
        AND unit_key = ?
        AND reference_date = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [args.configId, args.unitKey, args.referenceDate],
  );
  return (rows[0] as DbRow | undefined) || null;
};

const loadUnitFinancialMetrics = async (db: DbInterface, referenceDate: string, unit: FinancialUnitDefinition) => {
  const dayParams: Array<string | number> = [referenceDate];
  const unitDaySql = buildFinancialUnitClause('unidade', unit.key, dayParams);
  const dayRowsPromise = db.query(
    `
    SELECT COALESCE(SUM(total_pago), 0) AS total_pago, COALESCE(SUM(qtd), 0) AS qtd
    FROM faturamento_resumo_diario
    WHERE data_ref = ? ${unitDaySql}
  `,
    dayParams,
  );

  const monthParams: Array<string | number> = [monthStart(referenceDate), referenceDate];
  const unitMonthSql = buildFinancialUnitClause('unidade', unit.key, monthParams);
  const monthRowsPromise = db.query(
    `
    SELECT COALESCE(SUM(total_pago), 0) AS total_pago
    FROM faturamento_resumo_diario
    WHERE data_ref BETWEEN ? AND ? ${unitMonthSql}
  `,
    monthParams,
  );

  const commonGoalFilter = `
    linked_kpi_id = 'revenue'
    AND periodicity = 'monthly'
    AND start_date <= ?
    AND end_date >= ?
    AND UPPER(COALESCE(TRIM(scope), '')) = 'CLINIC'
    AND (collaborator IS NULL OR TRIM(collaborator) = '' OR LOWER(TRIM(collaborator)) = 'all')
    AND (team IS NULL OR TRIM(team) = '' OR LOWER(TRIM(team)) = 'all')
    AND (filter_group IS NULL OR TRIM(filter_group) = '' OR LOWER(TRIM(filter_group)) = 'all')
  `;

  const goalUnitParams: Array<string | number> = [referenceDate, referenceDate];
  const goalUnitSql = buildFinancialUnitClause('clinic_unit', unit.key, goalUnitParams);
  const goalRowsPromise = db.query(
    `
    SELECT COALESCE(SUM(target_value), 0) AS total
    FROM goals_config
    WHERE ${commonGoalFilter} ${goalUnitSql}
  `,
    goalUnitParams,
  );

  const [dayRows, monthRows, goalRows] = await Promise.all([dayRowsPromise, monthRowsPromise, goalRowsPromise]);

  let monthlyGoal = toNumber(goalRows[0]?.total);
  if (monthlyGoal <= 0) {
    const fallbackRows = await db.query(
      `
        SELECT COALESCE(SUM(target_value), 0) AS total
        FROM goals_config
        WHERE ${commonGoalFilter}
          AND (clinic_unit IS NULL OR TRIM(clinic_unit) = '' OR LOWER(TRIM(clinic_unit)) = 'all')
      `,
      [referenceDate, referenceDate],
    );
    monthlyGoal = toNumber(fallbackRows[0]?.total);
  }

  const revenueDay = toNumber(dayRows[0]?.total_pago);
  const qtdDay = toNumber(dayRows[0]?.qtd);
  const revenueMonth = toNumber(monthRows[0]?.total_pago);
  const operationalDays = operationalDaysSummary(referenceDate);
  const shouldHaveUntilDate = calculateShouldHaveUntilDate(monthlyGoal, referenceDate);

  // Projeção do mês pela regra única de metas: o realizado parcial de hoje é
  // extrapolado para o dia cheio antes de virar base da média diária.
  const monthProjection = calculateMonthProjection({ revenueMonth, revenueDay, referenceDate });
  const projectionPct = monthlyGoal > 0 ? (monthProjection.value * 100) / monthlyGoal : 0;

  const dynamicDailyTarget = calculateDailyTarget(monthlyGoal, revenueMonth, referenceDate);
  const dayProjection = calculateProjection({
    current: revenueDay,
    periodicity: 'daily',
    referenceDate,
  });

  return {
    revenueDay,
    revenueMonth,
    ticketAverageDay: qtdDay > 0 ? revenueDay / qtdDay : 0,
    monthlyGoal,
    shouldHaveUntilDate,
    dynamicDailyTarget,
    progressPct: monthlyGoal > 0 ? (revenueMonth * 100) / monthlyGoal : 0,
    expectedPct: monthlyGoal > 0 ? (shouldHaveUntilDate * 100) / monthlyGoal : 0,
    projectionMonth: monthProjection.value,
    projectionPct,
    projectionStatus: monthProjection.suppressed ? getProjectionStatus(null) : getProjectionStatus(projectionPct),
    projectionSuppressed: monthProjection.suppressed,
    projectionHint: `Base de ${monthProjection.elapsedOperationalDays.toFixed(2)} de ${monthProjection.totalOperationalDays.toFixed(2)} dias operacionais (sábado conta meio dia, domingos e feriados não contam).`,
    projectionDay: dayProjection.suppressed ? null : dayProjection.value,
    pacePct: shouldHaveUntilDate > 0 ? (revenueMonth * 100) / shouldHaveUntilDate : 0,
    businessDaysElapsed: operationalDays.elapsed,
    businessDaysInMonth: operationalDays.total,
    businessDaysRemaining: operationalDays.remaining,
  };
};

const loadCollaboratorGoals = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  if (members.length <= 0) return new Map<string, { target: number; feegowAlias: string | null }>();

  const employeeIds = members.map((member) => member.employeeId).filter(Boolean);
  const collaboratorNames = members.map((member) => member.fullName).filter(Boolean);
  const params: Array<string | number> = [referenceDate, referenceDate];
  const unitSql = buildFinancialUnitClause('clinic_unit', unit.key, params);

  const employeePlaceholders = employeeIds.map(() => '?').join(',');
  const collaboratorPlaceholders = collaboratorNames.map(() => '?').join(',');
  const rows = await db.query(
    `
      SELECT employee_id, collaborator, COALESCE(SUM(target_value), 0) AS total
      FROM goals_config
      WHERE linked_kpi_id = 'revenue'
        AND periodicity = 'monthly'
        AND start_date <= ?
        AND end_date >= ?
        AND UPPER(COALESCE(TRIM(scope), '')) = 'CLINIC'
        ${unitSql}
        AND (
          ${employeeIds.length > 0 ? `employee_id IN (${employeePlaceholders})` : '0 = 1'}
          OR ${collaboratorNames.length > 0 ? `collaborator IN (${collaboratorPlaceholders})` : '0 = 1'}
        )
      GROUP BY employee_id, collaborator
    `,
    [...params, ...employeeIds, ...collaboratorNames],
  );

  // Além do alvo, guardamos o nome que a meta usa para identificar a pessoa no
  // Feegow. Ele costuma divergir do cadastro (ex.: "Teodorio" x "TEODORO") e é
  // a única ponte confiável entre o colaborador e o faturamento.
  const byMember = new Map<string, { target: number; feegowAlias: string | null }>();
  for (const member of members) {
    const match = (rows as DbRow[]).find(
      (row) =>
        clean(row.employee_id) === member.employeeId ||
        normalizeHumanText(row.collaborator) === normalizeHumanText(member.fullName),
    );
    byMember.set(member.employeeId, {
      target: toNumber(match?.total),
      feegowAlias: clean(match?.collaborator) || null,
    });
  }
  return byMember;
};

const getCollaboratorColumn = async (db: DbInterface) => {
  if (cachedCollaboratorColumn !== undefined) return cachedCollaboratorColumn;
  try {
    const rows = await db.query(
      IS_MYSQL
        ? `
          SELECT COLUMN_NAME AS name
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = ?
          ORDER BY ORDINAL_POSITION
        `
        : 'PRAGMA table_info(faturamento_analitico)',
      IS_MYSQL ? ['faturamento_analitico'] : [],
    );
    const names = (rows as DbRow[])
      .map((row) => clean(IS_MYSQL ? row.name : (row.name ?? row[1] ?? row[0])))
      .filter(Boolean);

    const exactCandidates = ['usuario_da_conta', 'usuário_da_conta', 'usuario_que_agendou', 'usuário_que_agendou'];
    for (const candidate of exactCandidates) {
      if (names.includes(candidate)) {
        cachedCollaboratorColumn = candidate;
        return cachedCollaboratorColumn;
      }
    }

    const normalizedCandidates = ['usuario_da_conta', 'usuario_que_agendou'].map(normalizeHumanText);
    cachedCollaboratorColumn =
      names.find((name) => normalizedCandidates.includes(normalizeHumanText(name))) || null;
    return cachedCollaboratorColumn;
  } catch (error) {
    console.warn('[CHECKLIST_RECEPCAO] Nao foi possivel detectar coluna de colaborador em faturamento_analitico:', error);
    cachedCollaboratorColumn = null;
    return cachedCollaboratorColumn;
  }
};

type CollaboratorRevenueRow = { collaboratorName: string; total: number; totalDay: number };

const loadCollaboratorRevenueRows = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
): Promise<CollaboratorRevenueRow[]> => {
  if (members.length <= 0) return [];

  const collaboratorColumn = await getCollaboratorColumn(db);
  if (!collaboratorColumn) return [];

  // O realizado do dia sai da mesma varredura do mês, sem query adicional.
  const params: Array<string | number> = [referenceDate, monthStart(referenceDate), referenceDate];
  const unitSql = buildFinancialUnitClause('unidade', unit.key, params);
  const collaboratorIdentifier = quoteIdentifier(collaboratorColumn);
  const rows = await db.query(
    `
      SELECT
        TRIM(COALESCE(${collaboratorIdentifier}, '')) AS collaborator_name,
        COALESCE(SUM(total_pago), 0) AS total,
        COALESCE(SUM(CASE WHEN ${SQL_DATE_ANALITICO} = ? THEN total_pago ELSE 0 END), 0) AS total_day
      FROM faturamento_analitico
      WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ?
        ${unitSql}
        ${CLINIC_REVENUE_EXCLUSION}
        AND COALESCE(TRIM(${collaboratorIdentifier}), '') <> ''
      GROUP BY TRIM(COALESCE(${collaboratorIdentifier}, ''))
    `,
    params,
  ).catch(() => []);

  return (rows as DbRow[]).map((row) => ({
    collaboratorName: clean(row.collaborator_name),
    total: toNumber(row.total),
    totalDay: toNumber(row.total_day),
  }));
};

const loadCollaboratorMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  // As duas consultas seguem em paralelo; o casamento por nome acontece depois,
  // já com a meta em mãos, para poder usar o alias que ela declara.
  const [goalMap, revenueRows] = await Promise.all([
    loadCollaboratorGoals(db, referenceDate, unit, members),
    loadCollaboratorRevenueRows(db, referenceDate, unit, members),
  ]);

  return members.map((member) => {
    const goal = goalMap.get(member.employeeId) || { target: 0, feegowAlias: null };
    const monthlyGoal = goal.target;

    // O nome do cadastro nem sempre bate com o do Feegow (uma letra de
    // diferença já zera o indicador em silêncio). A meta do colaborador guarda
    // o nome usado no Feegow, então ele entra como identificador alternativo.
    const matched = revenueRows.filter(
      (row) =>
        namesLookEquivalent(row.collaboratorName, member.fullName) ||
        (goal.feegowAlias ? namesLookEquivalent(row.collaboratorName, goal.feegowAlias) : false),
    );
    const revenueMonth = matched.reduce((sum, row) => sum + row.total, 0);
    const revenueDay = matched.reduce((sum, row) => sum + row.totalDay, 0);
    const dynamicDailyTarget = calculateDailyTarget(monthlyGoal, revenueMonth, referenceDate);

    return {
      employeeId: member.employeeId,
      userId: member.userId,
      fullName: member.fullName,
      monthlyGoal,
      revenueDay,
      revenueMonth,
      dynamicDailyTarget,
      // Sem meta diária a perseguir (sem meta mensal, ou mensal já batida) não
      // existe percentual: a UI mostra "—" em vez de um zero enganoso.
      dailyProgressPct: dynamicDailyTarget > 0 ? (revenueDay * 100) / dynamicDailyTarget : null,
      progressPct: monthlyGoal > 0 ? (revenueMonth * 100) / monthlyGoal : 0,
      // Distingue "faturou zero" de "não encontrei esta pessoa no faturamento".
      revenueMatched: matched.length > 0,
      feegowAlias: goal.feegowAlias,
    };
  });
};

const loadConfirmationMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  isHistorical: boolean,
) => {
  const targetDate = shiftDate(referenceDate, 1);
  const params: Array<string | number> = [targetDate];
  const unitSql = buildFinancialUnitClause('unit_name', unit.key, params);

  if (isHistorical) {
    const snapshotParams: Array<string | number> = [targetDate, referenceDate];
    const snapshotUnitSql = buildFinancialUnitClause('unit_name', unit.key, snapshotParams);
    const rows = await db.query(
      `
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN is_confirmed_d1 = 1 THEN 1 ELSE 0 END) AS confirmed
        FROM ${APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE}
        WHERE target_date = ?
          AND snapshot_business_date = ?
          ${snapshotUnitSql}
      `,
      snapshotParams,
    );
    const total = toInt(rows[0]?.total);
    const confirmed = toInt(rows[0]?.confirmed);
    if (total > 0) {
      return {
        targetDate,
        total,
        confirmed,
        ratePct: total > 0 ? (confirmed * 100) / total : 0,
        source: 'snapshot' as const,
      };
    }
  }

  const liveRows = await db.query(
    `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status_id = ${SNAPSHOT_CONFIRMED_STATUS_ID} THEN 1 ELSE 0 END) AS confirmed
      FROM feegow_appointments
      WHERE substr(date, 1, 10) = ?
        ${unitSql}
    `,
    params,
  );

  const total = toInt(liveRows[0]?.total);
  const confirmed = toInt(liveRows[0]?.confirmed);
  return {
    targetDate,
    total,
    confirmed,
    ratePct: total > 0 ? (confirmed * 100) / total : 0,
    source: isHistorical ? ('snapshot-fallback' as const) : ('live' as const),
  };
};

const loadPostConsultMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  // O filtro de unidade da lib de pós-consulta compara o texto exato de
  // faturamento_analitico.unidade (ex.: "SHOPPING CAMPINAS"), que não é igual
  // ao label da unidade financeira ("Campinas Shopping"). Por isso buscamos sem
  // filtro de unidade e resolvemos a unidade aqui, onde os apelidos são conhecidos.
  const baseRows = await listPostConsultExportRows(
    normalizePostConsultFilters({
      startDate: referenceDate,
      endDate: referenceDate,
      unit: 'all',
      status: 'all',
      responsible: 'all',
      closed: 'all',
      page: 1,
      pageSize: 200,
    }),
    db,
  ).catch(() => []);

  const unitRows = baseRows.filter((row) => resolveFinancialUnit(row.consultUnit)?.key === unit.key);

  // Equipe local: mesmo critério de equivalência de nomes usado no faturamento individual.
  const rows = members.length > 0
    ? unitRows.filter((row) => members.some((member) => namesLookEquivalent(row.attendantResponsible, member.fullName)))
    : unitRows;

  const totalEvents = rows.length;
  const totalClosedEvents = rows.filter((row) => row.closed).length;
  const pendingPatients = rows.filter((row) => !row.closed).length;
  const executedProposalValue = rows.reduce((sum, row) => sum + toNumber(row.executedProposalValue), 0);
  return {
    totalEvents,
    totalClosedEvents,
    pendingPatients,
    executedProposalValue,
    conversionRate: totalEvents > 0 ? (totalClosedEvents * 100) / totalEvents : 0,
  };
};

const buildUnitMedicClause = (unit: FinancialUnitDefinition, params: Array<string | number>) => {
  const aliases = unique([unit.label, ...unit.aliases]).filter(Boolean);
  if (aliases.length <= 0) return '';
  params.push(...aliases);
  return ` AND UPPER(TRIM(unidade)) IN (${aliases.map(() => 'UPPER(TRIM(?))').join(', ')})`;
};

const loadWaitMetrics = async (db: DbInterface, referenceDate: string, unit: FinancialUnitDefinition) => {
  const receptionParams: Array<string | number> = [referenceDate];
  const receptionUnitSql = buildFinancialUnitClause('unidade_nome', unit.key, receptionParams);
  const receptionSql = IS_MYSQL
    ? `
      SELECT
        CAST(ROUND(AVG(CASE WHEN dt_atendimento IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, dt_chegada, dt_atendimento) END)) AS SIGNED) AS avg_wait,
        COUNT(CASE WHEN dt_atendimento IS NOT NULL THEN 1 END) AS attended_count
      FROM recepcao_historico
      WHERE dia_referencia = ?
        ${receptionUnitSql}
    `
    : `
      SELECT
        CAST(ROUND(AVG(CASE WHEN dt_atendimento IS NOT NULL THEN (julianday(dt_atendimento) - julianday(dt_chegada)) * 1440 END)) AS INTEGER) AS avg_wait,
        COUNT(CASE WHEN dt_atendimento IS NOT NULL THEN 1 END) AS attended_count
      FROM recepcao_historico
      WHERE dia_referencia = ?
        ${receptionUnitSql}
    `;
  const receptionRows = await db.query(receptionSql, receptionParams).catch(() => []);

  const medicParams: Array<string | number> = [referenceDate];
  const medicUnitSql = buildUnitMedicClause(unit, medicParams);
  const medicSql = IS_MYSQL
    ? `
      SELECT
        CAST(ROUND(AVG(CASE WHEN status LIKE 'Finalizado%' THEN espera_minutos END)) AS SIGNED) AS avg_wait,
        COUNT(CASE WHEN status LIKE 'Finalizado%' THEN 1 END) AS attended_count
      FROM espera_medica
      WHERE DATE(updated_at) = ?
        AND espera_minutos IS NOT NULL
        AND espera_minutos BETWEEN 0 AND 240
        ${medicUnitSql}
    `
    : `
      SELECT
        CAST(ROUND(AVG(CASE WHEN status LIKE 'Finalizado%' THEN espera_minutos END)) AS INTEGER) AS avg_wait,
        COUNT(CASE WHEN status LIKE 'Finalizado%' THEN 1 END) AS attended_count
      FROM espera_medica
      WHERE date(updated_at) = ?
        AND espera_minutos IS NOT NULL
        AND espera_minutos BETWEEN 0 AND 240
        ${medicUnitSql}
    `;
  const medicRows = await db.query(medicSql, medicParams).catch(() => []);

  return {
    receptionAverageMinutes: toNumber(receptionRows[0]?.avg_wait),
    receptionAttendedCount: toInt(receptionRows[0]?.attended_count),
    medicAverageMinutes: toNumber(medicRows[0]?.avg_wait),
    medicAttendedCount: toInt(medicRows[0]?.attended_count),
  };
};

const isChecklistTaskPending = (status: string | null | undefined) => CHECKLIST_PENDING_TASK_STATUSES.has(clean(status).toUpperCase());

const isChecklistTaskOverdue = (task: { dueDate: string | null; status: string }, referenceDate: string) =>
  Boolean(task.dueDate && task.dueDate < referenceDate && !CHECKLIST_CLOSED_TASK_STATUSES.has(clean(task.status).toUpperCase()));

const isChecklistTaskDueSoon = (task: { dueDate: string | null; status: string }, referenceDate: string, dueSoonEndDate: string) =>
  Boolean(
    task.dueDate &&
      task.dueDate >= referenceDate &&
      task.dueDate <= dueSoonEndDate &&
      !CHECKLIST_CLOSED_TASK_STATUSES.has(clean(task.status).toUpperCase()),
  );

const compareChecklistTaskItems = (
  left: { dueDate: string | null; priority: string; protocolId: string },
  right: { dueDate: string | null; priority: string; protocolId: string },
) => {
  const leftDueDate = clean(left.dueDate) || '9999-12-31';
  const rightDueDate = clean(right.dueDate) || '9999-12-31';
  if (leftDueDate !== rightDueDate) return leftDueDate.localeCompare(rightDueDate);

  const leftPriority = CHECKLIST_TASK_PRIORITY_RANK[clean(left.priority).toUpperCase()] ?? 999;
  const rightPriority = CHECKLIST_TASK_PRIORITY_RANK[clean(right.priority).toUpperCase()] ?? 999;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;

  return clean(left.protocolId).localeCompare(clean(right.protocolId), 'pt-BR', { numeric: true });
};

const mapChecklistTaskDetail = (task: {
  id: string;
  protocolId: string;
  title: string;
  description: string;
  dueDate: string | null;
}): RecepcaoChecklistTaskDetail => ({
  taskId: clean(task.id),
  protocolId: clean(task.protocolId),
  title: clean(task.title) || 'Sem título',
  description: clean(task.description).replace(/\s+/g, ' ') || 'Sem descrição',
  dueDate: clean(task.dueDate) || null,
});

const loadTaskMetrics = async (db: DbInterface, leaderUserId: string | null, referenceDate: string) => {
  if (!leaderUserId) {
    return {
      pendingTasks: 0,
      overdueTasks: 0,
      dueNext7DaysTasks: 0,
      awaitingApprovalTasks: 0,
      overdueItems: [],
      dueSoonItems: [],
    };
  }

  const dueSoonEndDate = shiftDate(referenceDate, 7);
  const tasks = await listTasks(
    db,
    { userId: leaderUserId, canViewAll: true },
    { assigneeUserId: leaderUserId, includeCanceled: true },
  ).catch(() => []);

  const pendingTasks = tasks.filter((task) => isChecklistTaskPending(task.status));
  const overdueItems = pendingTasks.filter((task) => isChecklistTaskOverdue(task, referenceDate)).sort(compareChecklistTaskItems);
  const dueSoonItems = pendingTasks.filter((task) => isChecklistTaskDueSoon(task, referenceDate, dueSoonEndDate)).sort(compareChecklistTaskItems);
  const awaitingApprovalTasks = pendingTasks.filter((task) => clean(task.status).toUpperCase() === 'AGUARDANDO_APROVACAO');

  return {
    pendingTasks: pendingTasks.length,
    overdueTasks: overdueItems.length,
    dueNext7DaysTasks: dueSoonItems.length,
    awaitingApprovalTasks: awaitingApprovalTasks.length,
    overdueItems: overdueItems.map(mapChecklistTaskDetail),
    dueSoonItems: dueSoonItems.map(mapChecklistTaskDetail),
  };
};

/**
 * Orçamentos em aberto do mês corrente, do dia 1 até a data de referência.
 * Sem esse recorte a contagem acumulava o ano inteiro e não dizia nada sobre o
 * mês em curso. `feegow_proposals.date` é varchar ISO, então BETWEEN funciona.
 */
const loadProposalMetrics = async (db: DbInterface, referenceDate: string, unit: FinancialUnitDefinition) => {
  const params: Array<string | number> = [monthStart(referenceDate), referenceDate];
  const unitSql = buildFinancialUnitClause('unit_name', unit.key, params);
  const rows = await db.query(
    `
      SELECT COUNT(*) AS total_count, COALESCE(SUM(total_value), 0) AS total_value
      FROM feegow_proposals
      WHERE (status IS NULL OR lower(status) NOT IN ${PROPOSAL_EXEC_STATUSES})
        AND date BETWEEN ? AND ?
        ${unitSql}
    `,
    params,
  );
  return {
    openCount: toInt(rows[0]?.total_count),
    openValue: toNumber(rows[0]?.total_value),
    periodStart: monthStart(referenceDate),
    periodEnd: referenceDate,
  };
};

const loadAbsenceMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  const allowedUnitKeys = new Set<string>([unit.key]);
  const allowedUnitLabels = new Set<string>([unit.label, ...(unit.aliases || [])].map((item) => normalizeFinancialUnitText(item)));
  const scopedMembers = members.filter((member) => {
    if (!Array.isArray(member.units) || member.units.length <= 0) return true;
    return member.units.some((memberUnit) => {
      const resolved = resolveFinancialUnit(memberUnit);
      if (resolved) return allowedUnitKeys.has(resolved.key);
      return allowedUnitLabels.has(normalizeFinancialUnitText(memberUnit));
    });
  });
  const employeeIds = new Set((scopedMembers.length > 0 ? scopedMembers : members).map((member) => member.employeeId).filter(Boolean));
  // Contexto da checklist é o dia de referência, não o mês inteiro.
  const rows = await listPointDailyControlRowsByDateRange(
    db,
    { startDate: referenceDate, endDate: referenceDate },
    {
      ...DEFAULT_POINT_FILTERS,
      unit: 'all',
    },
  ).catch(() => ({ items: [] as Array<Record<string, unknown>> }));

  const filtered = (rows.items || []).filter((row: Record<string, unknown>) =>
    employeeIds.size <= 0 ? true : employeeIds.has(clean(row.employeeId)),
  );

  const relevantRows = filtered
    .filter((row: Record<string, unknown>) => toNumber(row.absenceDays) > 0 || toNumber(row.lateMinutes) > 0)
    .map((row: Record<string, unknown>) => ({
      employeeId: clean(row.employeeId) || null,
      employeeName: clean(row.employeeName),
      absenceDays: toNumber(row.absenceDays),
      lateMinutes: toNumber(row.lateMinutes),
    }))
    .sort((left, right) => right.absenceDays - left.absenceDays || right.lateMinutes - left.lateMinutes)
    .slice(0, 8);

  return {
    trackedEmployees: employeeIds.size > 0 ? employeeIds.size : filtered.length,
    absenceDays: filtered.reduce((sum: number, row: Record<string, unknown>) => sum + toNumber(row.absenceDays), 0),
    lateMinutes: filtered.reduce((sum: number, row: Record<string, unknown>) => sum + toNumber(row.lateMinutes), 0),
    rows: relevantRows,
  };
};

/**
 * Equipamentos parados da unidade. Inclui tanto os que já estão em manutenção
 * quanto os marcados para enviar: dos dois jeitos o equipamento não está
 * disponível para a operação, e o status na tabela distingue os casos.
 */
const EQUIPMENT_MAINTENANCE_STATUSES = ['EM_MANUTENCAO', 'ENVIAR_MANUTENCAO'] as const;

const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  EM_MANUTENCAO: 'Em manutenção',
  ENVIAR_MANUTENCAO: 'Enviar para manutenção',
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  DESCARTADO: 'Descartado',
};

const loadEquipmentMaintenance = async (db: DbInterface, unit: FinancialUnitDefinition) => {
  const params: Array<string | number> = [...EQUIPMENT_MAINTENANCE_STATUSES];
  const unitSql = buildFinancialUnitClause('unit_name', unit.key, params);
  const rows = (await db
    .query(
      `
        SELECT id, description, identification_number, serial_number, operational_status, location_detail, updated_at
        FROM clinic_equipment
        WHERE operational_status IN (${EQUIPMENT_MAINTENANCE_STATUSES.map(() => '?').join(', ')})
          ${unitSql}
        ORDER BY description ASC
        LIMIT 50
      `,
      params,
    )
    .catch(() => [])) as DbRow[];

  const items = rows.map((row) => {
    const status = upper(row.operational_status);
    return {
      equipmentId: clean(row.id),
      name: clean(row.description) || 'Sem descrição',
      identificationNumber: clean(row.identification_number) || '-',
      serialNumber: clean(row.serial_number) || '-',
      operationalStatus: status,
      operationalStatusLabel: EQUIPMENT_STATUS_LABELS[status] || status || '-',
      locationDetail: clean(row.location_detail) || null,
      updatedAt: clean(row.updated_at) || null,
    };
  });

  const lastUpdatedAt = items
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return { items, lastUpdatedAt };
};

/**
 * As consultas dos grupos em risco não dependem dos campos manuais, então
 * rodam junto com o restante do payload. Só a mesclagem com o FCA salvo
 * (mergeRiskGroupManual) precisa esperar o preenchimento do dia.
 */
const loadRiskGroupRows = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
) => {
  const params: Array<string | number> = [referenceDate, referenceDate];
  const unitSql = buildFinancialUnitClause('clinic_unit', unit.key, params);
  const goalRows = await db.query(
    `
      SELECT filter_group, COALESCE(SUM(target_value), 0) AS total
      FROM goals_config
      WHERE linked_kpi_id = 'revenue'
        AND periodicity = 'monthly'
        AND start_date <= ?
        AND end_date >= ?
        AND UPPER(COALESCE(TRIM(scope), '')) = 'CLINIC'
        ${unitSql}
        AND filter_group IS NOT NULL
        AND TRIM(filter_group) <> ''
        AND LOWER(TRIM(filter_group)) <> 'all'
        AND (collaborator IS NULL OR TRIM(collaborator) = '' OR LOWER(TRIM(collaborator)) = 'all')
        AND (team IS NULL OR TRIM(team) = '' OR LOWER(TRIM(team)) = 'all')
        AND (employee_id IS NULL OR TRIM(employee_id) = '')
      GROUP BY filter_group
      ORDER BY filter_group ASC
    `,
    params,
  );

  const actualParams: Array<string | number> = [monthStart(referenceDate), referenceDate];
  const actualUnitSql = buildFinancialUnitClause('unidade', unit.key, actualParams);
  const actualRows = await db.query(
    `
      SELECT grupo, COALESCE(SUM(total_pago), 0) AS total
      FROM faturamento_resumo_diario
      WHERE data_ref BETWEEN ? AND ?
        ${actualUnitSql}
      GROUP BY grupo
    `,
    actualParams,
  ).catch(() => []);

  const actualByGroup = new Map(
    (actualRows as DbRow[]).map((row) => [normalizeHumanText(row.grupo), toNumber(row.total)] as const),
  );

  return (goalRows as DbRow[]).map((row) => {
    const groupName = clean(row.filter_group);
    const monthlyGoal = toNumber(row.total);
    const actualMonth = actualByGroup.get(normalizeHumanText(groupName)) || 0;
    const shouldHaveUntilDate = calculateShouldHaveUntilDate(monthlyGoal, referenceDate);
    return {
      groupName,
      monthlyGoal,
      actualMonth,
      shouldHaveUntilDate,
      progressPct: monthlyGoal > 0 ? (actualMonth * 100) / monthlyGoal : 0,
      atRisk: actualMonth < shouldHaveUntilDate,
    };
  });
};

const mergeRiskGroupManual = (
  rows: Array<Omit<RecepcaoChecklistPayload['riskGroups'][number], 'planAction' | 'fact' | 'cause' | 'action'>>,
  manual: RecepcaoChecklistManualPayload,
): RecepcaoChecklistPayload['riskGroups'] => {
  const manualByGroup = new Map(
    manual.riskGroups.map((entry) => [normalizeHumanText(entry.groupName), entry] as const),
  );
  return rows.map((row) => {
    const saved = manualByGroup.get(normalizeHumanText(row.groupName));
    return {
      ...row,
      planAction: clean(saved?.planAction),
      fact: clean(saved?.fact),
      cause: clean(saved?.cause),
      action: clean(saved?.action),
    };
  });
};

const loadChecklistFreshness = async (
  db: DbInterface,
  args: {
    referenceDate: string;
    unit: FinancialUnitDefinition;
    leaderUserId: string | null;
    readOnly: boolean;
    appointmentsConfirmationSource: 'live' | 'snapshot' | 'snapshot-fallback';
  },
) => {
  const statusesPromise = loadSystemStatusMap(db, [
    ...RECEPCAO_CHECKLIST_REFRESH_SERVICES,
    RECEPCAO_CHECKLIST_REFRESH_SERVICE,
  ]);

  const goalsFreshnessPromise = queryMaxTimestamp(
    db,
    `
      SELECT MAX(COALESCE(updated_at, created_at)) AS updated_at
      FROM goals_config
    `,
    [],
    'Configuração de metas',
  );

  const receptionFreshnessPromise = queryMaxTimestamp(
    db,
    `
      SELECT MAX(updated_at) AS updated_at
      FROM recepcao_historico
      WHERE dia_referencia = ?
    `,
    [args.referenceDate],
    'Histórico de recepção',
  );

  const medicFreshnessPromise = queryMaxTimestamp(
    db,
    IS_MYSQL
      ? `
        SELECT MAX(updated_at) AS updated_at
        FROM espera_medica
        WHERE DATE(updated_at) = ?
      `
      : `
        SELECT MAX(updated_at) AS updated_at
        FROM espera_medica
        WHERE date(updated_at) = ?
      `,
    [args.referenceDate],
    'Espera médica',
  );

  const tasksFreshnessPromise = queryMaxTimestamp(
    db,
    `
      SELECT MAX(t.updated_at) AS updated_at
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE (? = '' OR ta.user_id = ? OR t.created_by = ?)
    `,
    [clean(args.leaderUserId), clean(args.leaderUserId), clean(args.leaderUserId)],
    'Base de tarefas',
  );

  const pointCoveragePromise = db
    .query(
      `
        SELECT
          MAX(COALESCE(finished_at, created_at)) AS updated_at,
          MAX(window_end) AS covered_until
        FROM point_sync_runs
        WHERE status = 'COMPLETED'
      `,
    )
    .catch(() => []);

  const [statuses, goalsFreshness, receptionFreshness, medicFreshness, tasksFreshness, pointCoverageRows] = await Promise.all([
    statusesPromise,
    goalsFreshnessPromise,
    receptionFreshnessPromise,
    medicFreshnessPromise,
    tasksFreshnessPromise,
    pointCoveragePromise,
  ]);

  const revenueFreshness = getServiceFreshness(statuses, 'faturamento', 'Faturamento', args.referenceDate, 24);
  const proposalsFreshness = getServiceFreshness(statuses, 'comercial', 'Propostas e pós-consulta', args.referenceDate, 24);
  const appointmentsFreshness =
    args.appointmentsConfirmationSource === 'snapshot'
      ? getServiceFreshness(statuses, 'appointments_confirmation_snapshot', 'Snapshot D+1 da confirmação', args.referenceDate, 36)
      : getServiceFreshness(statuses, 'appointments', 'Agendamentos Feegow', args.referenceDate, 12);

  const pointCoverage = pointCoverageRows[0] as DbRow | undefined;
  const pointCoveredUntil = clean(pointCoverage?.covered_until) || null;
  const pointFreshness = buildFreshness(
    clean(pointCoverage?.updated_at) || null,
    'Sincronização da base de ponto',
    !!pointCoveredUntil && pointCoveredUntil < args.referenceDate,
  );

  return {
    revenueFreshness,
    goalsFreshness,
    proposalsFreshness,
    appointmentsFreshness:
      args.appointmentsConfirmationSource === 'snapshot-fallback'
        ? buildFreshness(
            appointmentsFreshness.updatedAt,
            appointmentsFreshness.sourceLabel,
            true,
          )
        : appointmentsFreshness,
    receptionFreshness,
    medicFreshness,
    tasksFreshness,
    pointFreshness,
    statuses,
  };
};

const resolveManualFromVersionRow = (row: DbRow | null) => {
  if (!row) return null;
  const payload = safeJsonParse<RecepcaoChecklistVersionStoredPayload>(row.payload_json, {
    manual: normalizeManualPayload(null),
    selectedUnitKey: '',
    snapshot: { mode: 'current', referenceDate: '', summaryGeneratedAt: '' },
  });
  return {
    versionId: clean(row.id) || null,
    createdAt: clean(row.created_at) || null,
    createdByName: clean(row.created_by_name) || null,
    payload,
  };
};

export const buildRecepcaoChecklistPayload = async (
  actor: RecepcaoChecklistActor,
  filters: ConfigFilters,
): Promise<RecepcaoChecklistPayload> => {
  const allConfigs = await listAccessibleConfigs(actor.db, actor);
  const selectedLeaderUserId = actor.isManager ? clean(filters.leaderUserId) || null : null;
  const configs =
    actor.isManager && selectedLeaderUserId
      ? allConfigs.filter((item) => item.leaderUserId === selectedLeaderUserId)
      : allConfigs;
  const config = resolveConfigForActor(configs, actor, filters);
  const today = toSaoPauloDate();
  // O modo pedido só serve para resolver a data padrão quando nenhuma é enviada.
  // O modo devolvido é sempre derivado da data, para rótulo e recorte nunca
  // discordarem (era o que produzia "D-1 congelado" com a data de hoje).
  const requestedViewMode: ViewMode = clean(filters.viewMode) === 'd1' ? 'd1' : 'current';
  const referenceDate = resolveReferenceDate(today, requestedViewMode, filters.referenceDate);
  const readOnly = resolveReadOnly(referenceDate, today);
  const isHistorical = resolveIsHistorical(referenceDate, today);
  const viewMode: ViewMode = isHistorical ? 'd1' : 'current';
  const unit = resolveUnitForConfig(config, filters.unitKey);
  const selectedUnit = unit || listFinancialUnits()[0];
  const suggestedConfigPromise = config ? Promise.resolve(null) : loadSuggestedConfig(actor.db, actor.userId);
  const optionsPromise = actor.isManager && !config ? loadOptions(actor.db) : Promise.resolve(null);
  const versionRowPromise = config
    ? queryLatestFillRow(actor.db, {
        configId: config.id,
        unitKey: selectedUnit.key,
        referenceDate,
      })
    : Promise.resolve(null);
  const legacyManualPromise = queryLegacyManualFallback(actor.db, selectedUnit.key).catch(() => null);
  const unitMetricsPromise = loadUnitFinancialMetrics(actor.db, referenceDate, selectedUnit);
  const collaboratorsPromise = loadCollaboratorMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []);
  const appointmentsConfirmationPromise = loadConfirmationMetrics(actor.db, referenceDate, selectedUnit, isHistorical);
  const postConsultPromise = loadPostConsultMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []);
  const waitsPromise = loadWaitMetrics(actor.db, referenceDate, selectedUnit);
  const tasksPromise = loadTaskMetrics(actor.db, config?.leaderUserId || null, referenceDate);
  const proposalsPromise = loadProposalMetrics(actor.db, referenceDate, selectedUnit);
  const absencesPromise = loadAbsenceMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []);
  const equipmentPromise = loadEquipmentMaintenance(actor.db, selectedUnit);
  const riskGroupRowsPromise = loadRiskGroupRows(actor.db, referenceDate, selectedUnit);
  const freshnessPromise = loadChecklistFreshness(actor.db, {
    referenceDate,
    unit: selectedUnit,
    leaderUserId: config?.leaderUserId || null,
    readOnly,
    appointmentsConfirmationSource: isHistorical ? 'snapshot' : 'live',
  });

  const [
    suggestedConfig,
    checklistOptions,
    versionRow,
    legacyManual,
    unitMetrics,
    collaborators,
    appointmentsConfirmation,
    postConsult,
    waits,
    tasks,
    proposals,
    absences,
    equipment,
    riskGroupRows,
    freshness,
  ] = await Promise.all([
    suggestedConfigPromise,
    optionsPromise,
    versionRowPromise,
    legacyManualPromise,
    unitMetricsPromise,
    collaboratorsPromise,
    appointmentsConfirmationPromise,
    postConsultPromise,
    waitsPromise,
    tasksPromise,
    proposalsPromise,
    absencesPromise,
    equipmentPromise,
    riskGroupRowsPromise,
    freshnessPromise,
  ]);
  const suggestedConfigDraft =
    actor.isManager && !config && suggestedConfig && checklistOptions
      ? buildSuggestedConfigInput(checklistOptions, suggestedConfig)
      : null;
  const selectedVersion = config ? resolveManualFromVersionRow(versionRow) : null;

  const manual =
    selectedVersion?.payload?.manual
    || (!isHistorical && legacyManual ? normalizeLegacyManual(legacyManual) : normalizeManualPayload(null));

  const source = resolveFreezeSource({
    hasSelectedVersion: !!selectedVersion,
    isHistorical,
    hasLegacyManual: !!legacyManual,
  });

  const teamProduction = {
    resolveMonthlyTarget: manual.resolveMonthlyTarget,
    resolveActual: manual.resolveActual,
    resolveDynamicDailyTarget: calculateDailyTarget(manual.resolveMonthlyTarget, manual.resolveActual, referenceDate),
    resolveProgressPct: manual.resolveMonthlyTarget > 0 ? (manual.resolveActual * 100) / manual.resolveMonthlyTarget : 0,
    checkupMonthlyTarget: manual.checkupMonthlyTarget,
    checkupActual: manual.checkupActual,
    checkupDynamicDailyTarget: calculateDailyTarget(manual.checkupMonthlyTarget, manual.checkupActual, referenceDate),
    checkupProgressPct: manual.checkupMonthlyTarget > 0 ? (manual.checkupActual * 100) / manual.checkupMonthlyTarget : 0,
  };

  const riskGroups = mergeRiskGroupManual(riskGroupRows, manual);
  const google = {
    ratingTarget: GOOGLE_RATING_TARGET,
    ratingActual: manual.googleRating,
    ratingProgressPct: GOOGLE_RATING_TARGET > 0 ? (manual.googleRating * 100) / GOOGLE_RATING_TARGET : 0,
    newReviewsCount: manual.googleNewReviewsCount,
  };
  const unitRevenueFreshness = freshness.revenueFreshness;
  const goalsFreshness = freshness.goalsFreshness;
  const unitDerivedFreshness = mergeFreshness([unitRevenueFreshness, goalsFreshness], 'Faturamento e metas');
  const collaboratorFreshness = mergeFreshness([unitRevenueFreshness, goalsFreshness], 'Faturamento individual e metas');
  const riskGroupsFreshness = mergeFreshness([unitRevenueFreshness, goalsFreshness], 'Grupos de faturamento e metas');
  const appointmentsFreshness =
    appointmentsConfirmation.source === 'snapshot'
      ? getServiceFreshness(freshness.statuses, 'appointments_confirmation_snapshot', 'Snapshot D+1 da confirmação', referenceDate, 36)
      : appointmentsConfirmation.source === 'snapshot-fallback'
        ? buildFreshness(
            getServiceFreshness(freshness.statuses, 'appointments', 'Agendamentos Feegow', referenceDate, 12).updatedAt,
            'Agendamentos Feegow',
            true,
          )
        : getServiceFreshness(freshness.statuses, 'appointments', 'Agendamentos Feegow', referenceDate, 12);

  return {
    generatedAt: toSaoPauloDateTime(),
    today,
    previousBusinessDate: previousBusinessDate(today),
    access: {
      isManager: actor.isManager,
    },
    selectedLeaderUserId,
    availableLeaderFilters: unique(
      allConfigs
        .map((item) => JSON.stringify({ userId: item.leaderUserId, name: item.leaderName }))
        .filter(Boolean),
    ).map((item) => JSON.parse(item) as { userId: string; name: string }),
    viewMode,
    referenceDate,
    readOnly,
    isHistorical,
    selectedUnitKey: selectedUnit.key,
    selectedUnitLabel: selectedUnit.label,
    config,
    availableConfigs: configs.map((item) => ({
      id: item.id,
      name: item.name,
      leaderName: item.leaderName,
      units: item.units,
      isActive: item.isActive,
    })),
    availableScopes: allConfigs
      .flatMap((item) =>
        item.units.map((unitKey) => {
          const scopeUnit = getFinancialUnitByKey(unitKey);
          return {
            configId: item.id,
            unitKey: scopeUnit?.key || unitKey,
            unitLabel: scopeUnit?.label || unitKey,
            configName: item.name,
            leaderName: item.leaderName,
          };
        }),
      )
      .sort((left, right) => left.unitLabel.localeCompare(right.unitLabel, 'pt-BR', { sensitivity: 'base' })),
    availableUnits: (() => {
      // União das unidades habilitadas nas configurações acessíveis; sem
      // configuração, oferece todas para permitir o bootstrap.
      const enabled = new Set(configs.flatMap((item) => item.units));
      const units = listFinancialUnits().map((item) => ({ key: item.key, label: item.label }));
      const scoped = units.filter((item) => enabled.has(item.key));
      return scoped.length > 0 ? scoped : units;
    })(),
    suggestedConfig,
    suggestedConfigDraft,
    lastSave: selectedVersion
      ? { savedAt: selectedVersion.createdAt, savedByName: selectedVersion.createdByName }
      : null,
    manual,
    freezeMetadata: {
      isFrozen: isHistorical,
      source,
    },
    metrics: {
      unit: {
        ...unitMetrics,
        freshness: {
          revenueDay: unitRevenueFreshness,
          revenueMonth: unitRevenueFreshness,
          ticketAverageDay: unitRevenueFreshness,
          monthlyGoal: goalsFreshness,
          shouldHaveUntilDate: unitDerivedFreshness,
          dynamicDailyTarget: unitDerivedFreshness,
        },
      },
      collaborators,
      collaboratorsFreshness: collaboratorFreshness,
      teamProduction,
      appointmentsConfirmation: {
        ...appointmentsConfirmation,
        freshness: appointmentsFreshness,
      },
      postConsult: {
        ...postConsult,
        freshness: freshness.proposalsFreshness,
      },
      waits: {
        ...waits,
        freshness: {
          reception: freshness.receptionFreshness,
          medic: freshness.medicFreshness,
        },
      },
      tasks: {
        ...tasks,
        freshness: freshness.tasksFreshness,
      },
      proposals: {
        ...proposals,
        freshness: freshness.proposalsFreshness,
      },
      absences: {
        ...absences,
        freshness: freshness.pointFreshness,
      },
      google,
      equipmentMaintenance: {
        items: equipment.items,
        freshness: buildFreshness(equipment.lastUpdatedAt, 'Cadastro de equipamentos'),
      },
    },
    riskGroups,
    riskGroupsFreshness,
  };
};

/** Nome de exibição do autor do salvamento, para o log de preenchimentos. */
const resolveActorDisplayName = async (db: DbInterface, userId: string) => {
  const rows = await db
    .query('SELECT name FROM users WHERE id = ? LIMIT 1', [userId])
    .catch(() => []);
  return clean((rows as DbRow[])[0]?.name) || userId;
};

const describeNumber = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const summarizeRiskGroups = (groups: RecepcaoChecklistRiskManual[]) =>
  groups.filter((group) => clean(group.planAction) || clean(group.fact) || clean(group.cause) || clean(group.action));

/**
 * Traduz a diferença entre dois preenchimentos em frases curtas para o log.
 * Sem preenchimento anterior, descreve o que foi informado pela primeira vez.
 */
const describeManualChanges = (
  previous: RecepcaoChecklistManualPayload | null,
  current: RecepcaoChecklistManualPayload,
): string[] => {
  const changes: string[] = [];
  const changedNumber = (label: string, key: keyof RecepcaoChecklistManualPayload, formatted?: (value: number) => string) => {
    const currentValue = Number(current[key] as number) || 0;
    const previousValue = previous ? Number(previous[key] as number) || 0 : null;
    if (previousValue === currentValue) return;
    if (previousValue === null && currentValue === 0) return;
    const format = formatted || describeNumber;
    changes.push(previousValue === null ? `${label}: ${format(currentValue)}` : `${label}: ${format(previousValue)} → ${format(currentValue)}`);
  };
  const changedText = (label: string, key: keyof RecepcaoChecklistManualPayload) => {
    const currentValue = clean(current[key] as string);
    const previousValue = previous ? clean(previous[key] as string) : '';
    if (currentValue === previousValue) return;
    if (!previousValue && !currentValue) return;
    if (!currentValue) {
      changes.push(`${label} removido`);
      return;
    }
    changes.push(previous && previousValue ? `${label} atualizado` : `${label} preenchido`);
  };

  changedNumber('Meta Resolve', 'resolveMonthlyTarget');
  changedNumber('Realizado Resolve', 'resolveActual');
  changedNumber('Meta Check-up', 'checkupMonthlyTarget');
  changedNumber('Realizado Check-up', 'checkupActual');
  changedNumber('Nota Google', 'googleRating', (value) => value.toFixed(1).replace('.', ','));
  changedNumber('Novas avaliações Google', 'googleNewReviewsCount');
  changedText('Status de NF', 'nfOpenStatus');
  changedText('Status de contas', 'accountsOpenStatus');
  changedText('Pendências da unidade', 'pendingNotes');
  changedText('Observações gerais', 'generalNotes');

  const currentRecollections = (current.recollections || []).length;
  const previousRecollections = previous ? (previous.recollections || []).length : null;
  if (previousRecollections !== currentRecollections && !(previousRecollections === null && currentRecollections === 0)) {
    changes.push(
      previousRecollections === null
        ? `Recoletas: ${currentRecollections}`
        : `Recoletas: ${previousRecollections} → ${currentRecollections}`,
    );
  }

  const currentFilledGroups = summarizeRiskGroups(current.riskGroups || []);
  const previousByGroup = new Map(
    (previous?.riskGroups || []).map((group) => [normalizeHumanText(group.groupName), group] as const),
  );
  const touchedGroups = currentFilledGroups.filter((group) => {
    const before = previousByGroup.get(normalizeHumanText(group.groupName));
    if (!before) return true;
    return (
      clean(before.planAction) !== clean(group.planAction) ||
      clean(before.fact) !== clean(group.fact) ||
      clean(before.cause) !== clean(group.cause) ||
      clean(before.action) !== clean(group.action)
    );
  });
  if (touchedGroups.length > 0) {
    const names = touchedGroups.slice(0, 3).map((group) => group.groupName).join(', ');
    const rest = touchedGroups.length > 3 ? ` e mais ${touchedGroups.length - 3}` : '';
    changes.push(`FCA de grupo em risco: ${names}${rest}`);
  }

  return changes;
};

export const listRecepcaoChecklistHistory = async (
  actor: RecepcaoChecklistActor,
  filters: { configId?: string | null; unitKey?: string | null; limit?: number },
): Promise<RecepcaoChecklistHistoryEntry[]> => {
  const configs = await listAccessibleConfigs(actor.db, actor);
  const config = configs.find((item) => item.id === clean(filters.configId)) || configs[0] || null;
  const unit = getFinancialUnitByKey(clean(filters.unitKey));
  if (!config || !unit) return [];

  const limit = Math.min(Math.max(Math.floor(Number(filters.limit) || 40), 1), 200);
  const rows = (await actor.db
    .query(
      `
        SELECT id, reference_date, unit_key, created_at, created_by_name, payload_json
        FROM recepcao_checklist_versions
        WHERE config_id = ?
          AND unit_key = ?
        ORDER BY reference_date DESC, created_at DESC
        LIMIT ${limit}
      `,
      [config.id, unit.key],
    )
    .catch(() => [])) as DbRow[];

  const latestByDate = new Set<string>();
  return rows.map((row) => {
    const referenceDate = clean(row.reference_date);
    const isLatestForDate = !latestByDate.has(referenceDate);
    latestByDate.add(referenceDate);

    const current = resolveManualFromVersionRow(row)?.payload.manual || normalizeManualPayload(null);
    // O anterior é o salvamento imediatamente mais antigo da MESMA data.
    const previousRow = rows.find(
      (candidate) =>
        clean(candidate.reference_date) === referenceDate &&
        clean(candidate.created_at) < clean(row.created_at),
    );
    const previous = previousRow ? resolveManualFromVersionRow(previousRow)?.payload.manual || null : null;
    const changes = describeManualChanges(previous, current);

    return {
      id: clean(row.id),
      referenceDate,
      unitKey: clean(row.unit_key),
      savedAt: clean(row.created_at) || null,
      savedByName: clean(row.created_by_name) || null,
      changes: changes.length > 0 ? changes : ['Salvo sem alteração nos campos manuais'],
      isLatestForDate,
    };
  });
};

type SaveFillInput = {
  configId: string;
  unitKey: string;
  /** Data de negócio do preenchimento. Padrão: hoje. Não aceita data futura. */
  referenceDate?: string | null;
  manual: Partial<RecepcaoChecklistManualPayload>;
};

/**
 * Grava o preenchimento manual do dia. Cada salvamento acrescenta uma linha,
 * preservando o log de auditoria, mas a página sempre lê a mais recente da data.
 */
export const saveRecepcaoChecklistFill = async (
  actor: RecepcaoChecklistActor,
  input: SaveFillInput,
) => {
  const configId = clean(input.configId);
  const unit = getFinancialUnitByKey(input.unitKey || '');
  if (!configId || !unit) {
    const error = new Error('Configuração e unidade são obrigatórias.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const configs = await listAccessibleConfigs(actor.db, actor);
  const config = configs.find((item) => item.id === configId);
  if (!config) {
    const error = new Error('Configuração da checklist não encontrada para este acesso.') as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  const today = toSaoPauloDate();
  const requestedDate = parseIsoDate(clean(input.referenceDate)) || today;
  if (requestedDate > today) {
    const error = new Error('Não é possível preencher a checklist de uma data futura.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const isHistorical = requestedDate < today;
  // Parte do preenchimento anterior daquela data, para que salvar um campo não
  // apague os demais.
  const payload = await buildRecepcaoChecklistPayload(actor, {
    configId,
    unitKey: unit.key,
    viewMode: isHistorical ? 'd1' : 'current',
    referenceDate: requestedDate,
  });

  const manual = normalizeManualPayload({
    ...payload.manual,
    ...input.manual,
  });

  const versionId = randomUUID();
  const createdAt = toSaoPauloDateTime();
  const storedPayload: RecepcaoChecklistVersionStoredPayload = {
    manual,
    selectedUnitKey: unit.key,
    snapshot: {
      mode: isHistorical ? 'd1' : 'current',
      referenceDate: requestedDate,
      summaryGeneratedAt: payload.generatedAt,
    },
  };

  await actor.db.execute(
    `
      INSERT INTO recepcao_checklist_versions (
        id, config_id, reference_date, unit_key, view_mode, created_at,
        created_by_user_id, created_by_name, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      versionId,
      config.id,
      requestedDate,
      unit.key,
      isHistorical ? 'd1' : 'current',
      createdAt,
      actor.userId,
      await resolveActorDisplayName(actor.db, actor.userId),
      JSON.stringify(storedPayload),
    ],
  );

  invalidateCache('admin:');
  return { id: versionId };
};

type SaveConfigInput = {
  id?: string | null;
  name?: string | null;
  leaderUserId: string;
  leaderEmployeeId?: string | null;
  leaderName?: string | null;
  units: string[];
  teamEmployeeIds: string[];
  isActive?: boolean;
};

/** Equipe já persistida na configuração, usada para não perder membros fora das opções atuais. */
const loadConfigTeamMembers = async (db: DbInterface, configId: string): Promise<RecepcaoChecklistTeamMember[]> => {
  if (!configId) return [];
  const rows = await db
    .query('SELECT team_members_json FROM recepcao_checklist_configs WHERE id = ? LIMIT 1', [configId])
    .catch(() => []);
  return normalizeTeamMembers((rows as DbRow[])[0]?.team_members_json);
};

export const saveRecepcaoChecklistConfig = async (
  actor: RecepcaoChecklistActor,
  input: SaveConfigInput,
) => {
  if (!actor.isManager) {
    const error = new Error('Somente a gerência pode editar a configuração local da checklist.') as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  const options = await loadOptions(actor.db);
  const leader = options.leaders.find((item) => item.userId === clean(input.leaderUserId));
  if (!leader) {
    const error = new Error('Selecione um líder válido para esta checklist.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const requestedIds = unique(input.teamEmployeeIds.map((item) => clean(item)).filter(Boolean));
  const matchedMembers = options.teamMembers.filter((item) => requestedIds.includes(item.employeeId));

  // Um colaborador que saiu da lista de opções (inativado, sem cadastro ativo no
  // momento do salvamento) não pode sumir da equipe em silêncio: a configuração
  // preserva o que já estava salvo, senão a líder precisaria recadastrar a equipe.
  const matchedIds = new Set(matchedMembers.map((item) => item.employeeId));
  const previousMembers = clean(input.id) ? await loadConfigTeamMembers(actor.db, clean(input.id)) : [];
  const preservedMembers = previousMembers.filter(
    (item) => requestedIds.includes(item.employeeId) && !matchedIds.has(item.employeeId),
  );
  const teamMembers = [...matchedMembers, ...preservedMembers].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, 'pt-BR', { sensitivity: 'base' }),
  );

  const units = unique(
    input.units
      .map((item) => getFinancialUnitByKey(item)?.key || '')
      .filter(Boolean),
  );
  if (units.length <= 0) {
    const error = new Error('Selecione ao menos uma unidade.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const now = toSaoPauloDateTime();
  const id = clean(input.id) || randomUUID();
  await actor.db.execute(
    `
      INSERT INTO recepcao_checklist_configs (
        id, name, leader_user_id, leader_employee_id, leader_name,
        units_json, team_members_json, is_active, created_at, created_by, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        leader_user_id = excluded.leader_user_id,
        leader_employee_id = excluded.leader_employee_id,
        leader_name = excluded.leader_name,
        units_json = excluded.units_json,
        team_members_json = excluded.team_members_json,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `,
    [
      id,
      clean(input.name) || `Checklist ${leader.name}`,
      leader.userId,
      leader.employeeId,
      clean(input.leaderName) || leader.name,
      JSON.stringify(units),
      JSON.stringify(teamMembers),
      input.isActive === false ? 0 : 1,
      now,
      actor.userId,
      now,
      actor.userId,
    ],
  );

  invalidateCache('admin:');
  return id;
};

export const createSuggestedRecepcaoChecklistConfig = async (actor: RecepcaoChecklistActor) => {
  if (!actor.isManager) {
    const error = new Error('Somente a gerência pode inicializar a configuração local da checklist.') as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  const [options, suggestedConfig] = await Promise.all([
    loadOptions(actor.db),
    loadSuggestedConfig(actor.db, actor.userId),
  ]);
  const draft = buildSuggestedConfigInput(options, suggestedConfig);
  if (!draft) {
    const error = new Error('Não foi possível gerar uma configuração sugerida a partir do colaborador vinculado.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const existingConfigs = await listAccessibleConfigs(actor.db, actor);
  const existing = existingConfigs.find((item) => item.leaderUserId === draft.leaderUserId);
  if (existing) {
    return { id: existing.id, draft };
  }

  const id = await saveRecepcaoChecklistConfig(actor, draft);
  return { id, draft };
};

export const listRecepcaoChecklistConfigsWithOptions = async (actor: RecepcaoChecklistActor) => {
  const [configs, options, suggestedConfig] = await Promise.all([
    listAccessibleConfigs(actor.db, actor),
    loadOptions(actor.db),
    loadSuggestedConfig(actor.db, actor.userId),
  ]);

  return {
    configs,
    options,
    suggestedConfig,
    suggestedConfigDraft: actor.isManager ? buildSuggestedConfigInput(options, suggestedConfig) : null,
  };
};

const pdfColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const value = expanded.padEnd(6, '0').slice(0, 6);
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
};

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArcPath = (centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const measureTextWidth = (font: PDFFont, size: number, text: string) =>
  font.widthOfTextAtSize(pdfSafeText(text), size);

const formatPdfDateBr = (value: string | null | undefined) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
};

const formatPdfDateTimeBr = (value: string | null | undefined) => {
  const raw = clean(value);
  if (!raw) return 'Sem atualização registrada';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}-03:00`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatPdfFreshness = (freshness?: RecepcaoChecklistMetricFreshness | null) => {
  if (!freshness) return '';
  const timestamp = formatPdfDateTimeBr(freshness.updatedAt);
  return freshness.stale ? `Atualizado em ${timestamp} • desatualizado` : `Atualizado em ${timestamp}`;
};

const drawCenteredText = (
  page: PDFPage,
  text: string,
  options: { x: number; y: number; width: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> },
) => {
  const safeText = pdfSafeText(text);
  const textWidth = measureTextWidth(options.font, options.size, safeText);
  page.drawText(safeText, {
    x: options.x + Math.max(0, (options.width - textWidth) / 2),
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color,
  });
};

const wrapPdfText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const splitLongToken = (token: string) => {
    if (measureTextWidth(font, size, token) <= maxWidth) return [token];
    const parts: string[] = [];
    let currentPart = '';
    Array.from(token).forEach((char) => {
      const candidate = `${currentPart}${char}`;
      if (!currentPart || measureTextWidth(font, size, candidate) <= maxWidth) {
        currentPart = candidate;
        return;
      }
      parts.push(currentPart);
      currentPart = char;
    });
    if (currentPart) parts.push(currentPart);
    return parts;
  };

  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const parts = splitLongToken(word);
    parts.forEach((part) => {
      const candidate = currentLine ? `${currentLine} ${part}` : part;
      if (measureTextWidth(font, size, candidate) <= maxWidth || !currentLine) {
        currentLine = candidate;
        return;
      }
      lines.push(currentLine);
      currentLine = part;
    });
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

/**
 * Corta um texto já quebrado em linhas para caber em `maxLines`, marcando o
 * corte com reticências. Usado para que um campo livre muito longo (descrição
 * de tarefa, nome de configuração) não empurre o layout do PDF.
 */
const capPdfLines = (lines: string[], maxLines: number, font: PDFFont, size: number, maxWidth: number) => {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;

  const capped = lines.slice(0, maxLines);
  const lastIndex = capped.length - 1;
  let truncated = `${capped[lastIndex]}...`;
  while (truncated.length > 4 && measureTextWidth(font, size, truncated) > maxWidth) {
    truncated = `${truncated.slice(0, -4)}...`;
  }
  capped[lastIndex] = truncated;
  return capped;
};

const measurePdfLinesHeight = (lines: string[], lineHeight: number) => lines.length * lineHeight;

const drawArcSegmentsPdf = (
  page: PDFPage,
  args: {
    centerX: number;
    centerY: number;
    radius: number;
    startAngle: number;
    endAngle: number;
    color: ReturnType<typeof rgb>;
    thickness: number;
    opacity?: number;
    segments?: number;
  },
) => {
  const segments = Math.max(6, args.segments || Math.round(Math.abs(args.endAngle - args.startAngle) / 3));
  for (let index = 0; index < segments; index += 1) {
    const fromAngle = args.startAngle + ((args.endAngle - args.startAngle) * index) / segments;
    const toAngle = args.startAngle + ((args.endAngle - args.startAngle) * (index + 1)) / segments;
    const start = polarToCartesian(args.centerX, args.centerY, args.radius, fromAngle);
    const end = polarToCartesian(args.centerX, args.centerY, args.radius, toAngle);
    page.drawLine({
      start,
      end,
      color: args.color,
      thickness: args.thickness,
      opacity: args.opacity ?? 1,
    });
  }
};

const drawTextLinesTop = (
  page: PDFPage,
  args: {
    x: number;
    topY: number;
    width: number;
    lines: string[];
    font: PDFFont;
    size: number;
    color: ReturnType<typeof rgb>;
    lineHeight?: number;
  },
) => {
  const lineHeight = args.lineHeight || args.size + 3;
  args.lines.forEach((rawLine, index) => {
    const line = pdfSafeText(rawLine);
    page.drawText(line, {
      x: args.x,
      y: args.topY - args.size - index * lineHeight,
      size: args.size,
      font: args.font,
      color: args.color,
      maxWidth: args.width,
    });
  });
  return args.lines.length * lineHeight;
};

const drawWrappedTextTop = (
  page: PDFPage,
  args: {
    x: number;
    topY: number;
    width: number;
    text: string;
    font: PDFFont;
    size: number;
    color: ReturnType<typeof rgb>;
    lineHeight?: number;
  },
) => {
  const lines = wrapPdfText(args.text, args.font, args.size, args.width);
  return {
    lines,
    height: drawTextLinesTop(page, { ...args, lines }),
  };
};

const drawMetricCardPdf = (
  page: PDFPage,
  args: {
    x: number;
    topY: number;
    width: number;
    height: number;
    title: string;
    value: string;
    helper?: string;
    footer?: string;
    regular: PDFFont;
    bold: PDFFont;
  },
) => {
  const cardBottom = args.topY - args.height;
  const innerWidth = args.width - 24;
  const titleLines = wrapPdfText(args.title.toUpperCase(), args.bold, 8.5, innerWidth).slice(0, 2);
  const titleLineHeight = 10;
  const titleHeight = measurePdfLinesHeight(titleLines, titleLineHeight);
  const footerLines = args.footer ? wrapPdfText(args.footer, args.regular, 7.5, innerWidth).slice(0, 2) : [];
  const footerLineHeight = 9;
  const footerHeight = measurePdfLinesHeight(footerLines, footerLineHeight);
  const helperLines = args.helper ? wrapPdfText(args.helper, args.regular, 8.5, innerWidth).slice(0, 3) : [];
  const helperLineHeight = 10;
  const helperHeight = measurePdfLinesHeight(helperLines, helperLineHeight);

  let valueSize = args.value.length > 28 ? 12.5 : args.value.length > 18 ? 14 : args.value.length > 12 ? 16 : 18;
  let valueLineHeight = valueSize + 2;
  let valueLines = wrapPdfText(args.value, args.bold, valueSize, innerWidth).slice(0, 3);
  const valueTopBoundary = args.topY - 12 - titleHeight - 8;
  const valueBottomBoundary = cardBottom + 12 + footerHeight + (footerHeight > 0 ? 6 : 0) + helperHeight + (helperHeight > 0 ? 8 : 0);
  // Sem piso artificial: se o espaço real é pequeno, o valor encolhe e é
  // truncado, nunca invade a área do título.
  const valueAvailableHeight = Math.max(0, valueTopBoundary - valueBottomBoundary);
  while (valueSize > 10) {
    valueLines = wrapPdfText(args.value, args.bold, valueSize, innerWidth).slice(0, 3);
    valueLineHeight = valueSize + 2;
    if (measurePdfLinesHeight(valueLines, valueLineHeight) <= valueAvailableHeight) break;
    valueSize -= 0.5;
  }

  const maxValueLines = Math.max(1, Math.floor(valueAvailableHeight / valueLineHeight));
  valueLines = capPdfLines(valueLines, maxValueLines, args.bold, valueSize, innerWidth);

  const valueHeight = measurePdfLinesHeight(valueLines, valueLineHeight);
  const valueTopY = Math.min(
    valueTopBoundary,
    valueBottomBoundary + valueHeight + Math.max(0, (valueAvailableHeight - valueHeight) / 2),
  );

  page.drawRectangle({
    x: args.x,
    y: cardBottom,
    width: args.width,
    height: args.height,
    color: pdfColor('#FFFFFF'),
    borderColor: pdfColor('#D9E2EF'),
    borderWidth: 0.8,
  });

  const innerX = args.x + 12;
  drawTextLinesTop(page, {
    x: innerX,
    topY: args.topY - 12,
    width: innerWidth,
    lines: titleLines,
    font: args.bold,
    size: 8.5,
    color: pdfColor('#64748B'),
    lineHeight: titleLineHeight,
  });
  drawTextLinesTop(page, {
    x: innerX,
    topY: valueTopY,
    width: innerWidth,
    lines: valueLines,
    font: args.bold,
    size: valueSize,
    color: pdfColor('#0F172A'),
    lineHeight: valueLineHeight,
  });

  if (helperLines.length > 0) {
    drawTextLinesTop(page, {
      x: innerX,
      topY: cardBottom + 12 + footerHeight + (footerHeight > 0 ? 6 : 0) + helperHeight,
      width: innerWidth,
      lines: helperLines,
      font: args.regular,
      size: 8.5,
      color: pdfColor('#475569'),
      lineHeight: helperLineHeight,
    });
  }

  if (footerLines.length > 0) {
    drawTextLinesTop(page, {
      x: innerX,
      topY: cardBottom + 12 + footerHeight,
      width: innerWidth,
      lines: footerLines,
      font: args.regular,
      size: 7.5,
      color: pdfColor('#94A3B8'),
      lineHeight: footerLineHeight,
    });
  }
};

const drawGaugePdf = (
  page: PDFPage,
  args: {
    x: number;
    topY: number;
    width: number;
    height: number;
    title: string;
    value: number;
    max: number;
    valueLabel: string;
    helper: string;
    freshness?: string;
    regular: PDFFont;
    bold: PDFFont;
  },
) => {
  const ratio = args.max > 0 ? Math.max(0, Math.min(1, args.value / args.max)) : 0;
  const cardLeft = args.x;
  const cardBottom = args.topY - args.height;
  const cardWidth = args.width;
  const cardHeight = args.height;
  const centerX = cardLeft + cardWidth / 2;
  const centerY = cardBottom + cardHeight * 0.57;
  const radius = Math.min(cardWidth * 0.34, cardHeight * 0.32);
  const arcWidth = Math.max(8, radius * 0.15);
  const titleSize = 10;
  const valueSize = args.valueLabel.length > 12 ? 15 : 17;
  const valuePlateWidth = Math.max(78, Math.min(cardWidth - 26, args.valueLabel.length * 8.5 + 18));
  const progressAngle = 180 - ratio * 180;
  const gaugeZones = [
    { startAngle: 180, endAngle: 126, active: pdfColor('#EF4444'), track: pdfColor('#FECACA') },
    { startAngle: 126, endAngle: 72, active: pdfColor('#F59E0B'), track: pdfColor('#FDE68A') },
    { startAngle: 72, endAngle: 0, active: pdfColor('#34A853'), track: pdfColor('#C7E5D0') },
  ];

  page.drawRectangle({
    x: cardLeft,
    y: cardBottom,
    width: cardWidth,
    height: cardHeight,
    borderColor: pdfColor('#D9E2EF'),
    borderWidth: 0.8,
    color: pdfColor('#FFFFFF'),
    borderOpacity: 1,
  });

  for (let index = 0; index <= 10; index += 1) {
    const angle = 180 - (index / 10) * 180;
    const outer = polarToCartesian(centerX, centerY, radius + 11, angle);
    const inner = polarToCartesian(centerX, centerY, radius + (index % 5 === 0 ? 3 : 7), angle);
    page.drawLine({
      start: { x: inner.x, y: inner.y },
      end: { x: outer.x, y: outer.y },
      color: pdfColor('#94A3B8'),
      thickness: index % 5 === 0 ? 1.4 : 0.8,
      opacity: index % 5 === 0 ? 0.9 : 0.55,
    });
  }

  gaugeZones.forEach((zone) => {
    drawArcSegmentsPdf(page, {
      centerX,
      centerY,
      radius,
      startAngle: zone.startAngle,
      endAngle: zone.endAngle,
      color: zone.track,
      thickness: arcWidth,
      opacity: 1,
    });
  });
  gaugeZones.forEach((zone) => {
    if (progressAngle >= zone.startAngle) return;
    const activeEndAngle = progressAngle <= zone.endAngle ? zone.endAngle : progressAngle;
    drawArcSegmentsPdf(page, {
      centerX,
      centerY,
      radius,
      startAngle: zone.startAngle,
      endAngle: activeEndAngle,
      color: zone.active,
      thickness: arcWidth,
      opacity: 1,
    });
  });

  const pointerAngle = progressAngle;
  const pointerEnd = polarToCartesian(centerX, centerY, radius - 8, pointerAngle);
  page.drawLine({
    start: { x: centerX, y: centerY },
    end: { x: pointerEnd.x, y: pointerEnd.y },
    color: pdfColor('#17213A'),
    thickness: 3.2,
  });
  page.drawCircle({ x: centerX, y: centerY, size: 5.8, color: pdfColor('#17213A') });

  // O bloco de texto do rodapé é empilhado de baixo para cima: quando o helper
  // ou o carimbo de atualização quebram em duas linhas, tudo sobe junto em vez
  // de um escrever por cima do outro.
  const freshnessLines = args.freshness ? wrapPdfText(args.freshness, args.regular, 7.5, cardWidth - 22).slice(0, 2) : [];
  const helperLines = wrapPdfText(args.helper, args.regular, 8.5, cardWidth - 22).slice(0, 2);
  const freshnessLineHeight = 8;
  const helperLineHeight = 10;

  let baselineY = cardBottom + 8;
  for (let index = freshnessLines.length - 1; index >= 0; index -= 1) {
    drawCenteredText(page, freshnessLines[index], {
      x: cardLeft + 11,
      y: baselineY,
      width: cardWidth - 22,
      size: 7.5,
      font: args.regular,
      color: pdfColor('#94A3B8'),
    });
    baselineY += freshnessLineHeight;
  }

  if (freshnessLines.length > 0) baselineY += 2;

  for (let index = helperLines.length - 1; index >= 0; index -= 1) {
    drawCenteredText(page, helperLines[index], {
      x: cardLeft + 11,
      y: baselineY,
      width: cardWidth - 22,
      size: 8.5,
      font: args.regular,
      color: pdfColor('#64748B'),
    });
    baselineY += helperLineHeight;
  }

  const titleBaselineY = baselineY + 2;
  drawCenteredText(page, args.title.toUpperCase(), {
    x: cardLeft + 10,
    y: titleBaselineY,
    width: cardWidth - 20,
    size: titleSize,
    font: args.bold,
    color: pdfColor('#64748B'),
  });

  const plateBottomY = titleBaselineY + titleSize + 6;
  page.drawRectangle({
    x: centerX - valuePlateWidth / 2,
    y: plateBottomY,
    width: valuePlateWidth,
    height: 24,
    color: pdfColor('#FFFFFF'),
    opacity: 0.98,
  });
  drawCenteredText(page, args.valueLabel, {
    x: centerX - valuePlateWidth / 2,
    y: plateBottomY + 7,
    width: valuePlateWidth,
    size: valueSize,
    font: args.bold,
    color: pdfColor('#17213A'),
  });
};

export const buildRecepcaoChecklistPdf = async (payload: RecepcaoChecklistPayload) => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Checklist Recepção - ${payload.selectedUnitLabel}`);
  pdfDoc.setAuthor('Consultare Hub');

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [841.89, 595.28];
  const margin = 28;
  const contentWidth = pageSize[0] - margin * 2;
  const headerHeight = 56;
  const footerHeight = 22;
  const rowGap = 12;
  const lightText = pdfColor('#64748B');
  const mutedText = pdfColor('#94A3B8');
  const darkText = pdfColor('#0F172A');
  const cardBorder = pdfColor('#D9E2EF');
  let page = pdfDoc.addPage(pageSize);
  let pageIndex = 1;
  let cursorY = 0;

  const drawPageHeader = () => {
    page.drawRectangle({
      x: 0,
      y: pageSize[1] - headerHeight,
      width: pageSize[0],
      height: headerHeight,
      color: pdfColor('#17407E'),
    });
    page.drawText(pdfSafeText('Checklist Recepção'), {
      x: margin,
      y: pageSize[1] - 26,
      size: 18,
      font: bold,
      color: pdfColor('#FFFFFF'),
    });
    page.drawText(
      pdfSafeText(
        `${payload.selectedUnitLabel} • ${payload.isHistorical ? 'Recorte histórico' : 'Dia corrente'} • ${formatPdfDateBr(payload.referenceDate)}`,
      ),
      {
        x: margin,
        y: pageSize[1] - 42,
        size: 9,
        font: regular,
        color: pdfColor('#E2E8F0'),
      },
    );
    page.drawText(pdfSafeText(`Página ${pageIndex}`), {
      x: pageSize[0] - margin - measureTextWidth(regular, 9, `Página ${pageIndex}`),
      y: 10,
      size: 9,
      font: regular,
      color: mutedText,
    });
    cursorY = pageSize[1] - headerHeight - 16;
  };

  const addPage = () => {
    page = pdfDoc.addPage(pageSize);
    pageIndex += 1;
    drawPageHeader();
  };

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < footerHeight) {
      addPage();
    }
  };

  const addVerticalGap = (height: number) => {
    cursorY -= height;
  };

  const drawSectionTitle = (title: string, subtitle?: string) => {
    if (!clean(title) && !clean(subtitle)) return;
    ensureSpace(42);
    if (clean(title)) {
      drawTextLinesTop(page, {
        x: margin,
        topY: cursorY,
        width: contentWidth,
        lines: [title],
        font: bold,
        size: 14,
        color: darkText,
        lineHeight: 16,
      });
      cursorY -= 20;
    }
    if (clean(subtitle)) {
      const subtitleLines = wrapPdfText(subtitle || '', regular, 8.5, contentWidth);
      cursorY -= drawTextLinesTop(page, {
        x: margin,
        topY: cursorY,
        width: contentWidth,
        lines: subtitleLines,
        font: regular,
        size: 8.5,
        color: lightText,
        lineHeight: 10,
      });
    }
    cursorY -= 8;
  };

  const drawGaugeGrid = (
    title: string,
    subtitle: string,
    gauges: Array<{
      title: string;
      value: number;
      max: number;
      valueLabel: string;
      helper: string;
      freshness?: RecepcaoChecklistMetricFreshness;
    }>,
    columns: number,
    cardHeight: number,
  ) => {
    drawSectionTitle(title, subtitle);
    const gap = 12;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    for (let index = 0; index < gauges.length; index += columns) {
      const rowItems = gauges.slice(index, index + columns);
      ensureSpace(cardHeight + 4);
      const rowTopY = cursorY;
      rowItems.forEach((gauge, itemIndex) => {
        drawGaugePdf(page, {
          x: margin + itemIndex * (cardWidth + gap),
          topY: rowTopY,
          width: cardWidth,
          height: cardHeight,
          title: gauge.title,
          value: gauge.value,
          max: gauge.max || 1,
          valueLabel: gauge.valueLabel,
          helper: gauge.helper,
          freshness: formatPdfFreshness(gauge.freshness),
          regular,
          bold,
        });
      });
      cursorY -= cardHeight + rowGap;
    }
  };

  const drawMetricCardGrid = (
    title: string,
    subtitle: string,
    items: Array<{ title: string; value: string; helper?: string; footer?: string }>,
    columns: number,
    cardHeight: number,
  ) => {
    drawSectionTitle(title, subtitle);
    const gap = 12;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    for (let index = 0; index < items.length; index += columns) {
      const rowItems = items.slice(index, index + columns);
      ensureSpace(cardHeight + 4);
      const rowTopY = cursorY;
      rowItems.forEach((item, itemIndex) => {
        drawMetricCardPdf(page, {
          x: margin + itemIndex * (cardWidth + gap),
          topY: rowTopY,
          width: cardWidth,
          height: cardHeight,
          title: item.title,
          value: item.value,
          helper: item.helper,
          footer: item.footer,
          regular,
          bold,
        });
      });
      cursorY -= cardHeight + rowGap;
    }
  };

  const drawTable = <T,>(
    args: {
      title: string;
      subtitle?: string;
      columns: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center'; render: (row: T) => string }>;
      rows: T[];
      emptyMessage: string;
    },
  ) => {
    drawSectionTitle(args.title, args.subtitle);
    const drawHeader = () => {
      ensureSpace(26);
      page.drawRectangle({
        x: margin,
        y: cursorY - 24,
        width: contentWidth,
        height: 24,
        color: pdfColor('#F8FAFC'),
        borderColor: cardBorder,
        borderWidth: 0.8,
      });
      let x = margin;
      args.columns.forEach((column) => {
        const labelWidth = Math.max(12, column.width - 10);
        const [labelLine] = capPdfLines(wrapPdfText(column.label, bold, 8.5, labelWidth), 1, bold, 8.5, labelWidth);
        page.drawText(pdfSafeText(labelLine || ''), {
          x: x + 6,
          y: cursorY - 15,
          size: 8.5,
          font: bold,
          color: lightText,
        });
        x += column.width;
      });
      cursorY -= 24;
    };

    if (args.rows.length <= 0) {
      ensureSpace(40);
      page.drawRectangle({
        x: margin,
        y: cursorY - 36,
        width: contentWidth,
        height: 36,
        color: pdfColor('#FFFFFF'),
        borderColor: cardBorder,
        borderWidth: 0.8,
      });
      page.drawText(pdfSafeText(args.emptyMessage), {
        x: margin + 10,
        y: cursorY - 22,
        size: 9,
        font: regular,
        color: lightText,
      });
      cursorY -= 48;
      return;
    }

    drawHeader();

    args.rows.forEach((row) => {
      const cellLines = args.columns.map((column) =>
        wrapPdfText(column.render(row) || '-', regular, 8.5, Math.max(12, column.width - 10)),
      );
      const rowHeight = Math.max(24, ...cellLines.map((lines) => lines.length * 10 + 10));
      if (cursorY - rowHeight < footerHeight) {
        addPage();
        drawSectionTitle(args.title, args.subtitle);
        drawHeader();
      }
      page.drawRectangle({
        x: margin,
        y: cursorY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: pdfColor('#FFFFFF'),
        borderColor: cardBorder,
        borderWidth: 0.6,
      });
      let x = margin;
      args.columns.forEach((column, columnIndex) => {
        const lines = cellLines[columnIndex];
        lines.forEach((line, lineIndex) => {
          const textWidth = measureTextWidth(regular, 8.5, line);
          let textX = x + 6;
          if (column.align === 'right') textX = x + column.width - textWidth - 6;
          if (column.align === 'center') textX = x + Math.max(0, (column.width - textWidth) / 2);
          page.drawText(line, {
            x: textX,
            y: cursorY - 16 - lineIndex * 10,
            size: 8.5,
            font: regular,
            color: darkText,
          });
        });
        x += column.width;
      });
      cursorY -= rowHeight;
    });
    cursorY -= 12;
  };

  const drawNotesBlock = (title: string, text: string) => {
    if (!clean(text)) return;
    const lines = wrapPdfText(text, regular, 9, contentWidth - 18);
    const blockHeight = Math.max(54, lines.length * 11 + 22);
    ensureSpace(blockHeight);
    page.drawRectangle({
      x: margin,
      y: cursorY - blockHeight,
      width: contentWidth,
      height: blockHeight,
      color: pdfColor('#FFFFFF'),
      borderColor: cardBorder,
      borderWidth: 0.8,
    });
    drawTextLinesTop(page, {
      x: margin + 10,
      topY: cursorY - 10,
      width: contentWidth - 20,
      lines: [title],
      font: bold,
      size: 10,
      color: darkText,
      lineHeight: 12,
    });
    drawTextLinesTop(page, {
      x: margin + 10,
      topY: cursorY - 28,
      width: contentWidth - 20,
      lines,
      font: regular,
      size: 9,
      color: lightText,
      lineHeight: 11,
    });
    cursorY -= blockHeight + 12;
  };

  const drawTaskDetailsList = (title: string, items: RecepcaoChecklistTaskDetail[], emptyMessage: string) => {
    drawSectionTitle(title);
    if (items.length <= 0) {
      drawNotesBlock(title, emptyMessage);
      return;
    }

    items.forEach((item) => {
      const textWidth = contentWidth - 20;
      const titleLines = capPdfLines(wrapPdfText(item.title, bold, 9.5, textWidth), TASK_TITLE_MAX_LINES, bold, 9.5, textWidth);
      // A descrição vem de campo livre e já apareceu com mais de 2 mil caracteres.
      // Sem teto, um único item ocupa meia página (ou estoura a página inteira).
      const descriptionLines = capPdfLines(
        wrapPdfText(item.description || 'Sem descrição', regular, 8.5, textWidth),
        TASK_DESCRIPTION_MAX_LINES,
        regular,
        8.5,
        textWidth,
      );
      const titleHeight = measurePdfLinesHeight(titleLines, 12);
      const descriptionHeight = measurePdfLinesHeight(descriptionLines, 10);
      const blockHeight = Math.max(54, 24 + titleHeight + descriptionHeight);
      ensureSpace(blockHeight);
      page.drawRectangle({
        x: margin,
        y: cursorY - blockHeight,
        width: contentWidth,
        height: blockHeight,
        color: pdfColor('#FFFFFF'),
        borderColor: cardBorder,
        borderWidth: 0.8,
      });
      drawTextLinesTop(page, {
        x: margin + 10,
        topY: cursorY - 10,
        width: contentWidth - 20,
        lines: titleLines,
        font: bold,
        size: 9.5,
        color: darkText,
        lineHeight: 12,
      });
      drawTextLinesTop(page, {
        x: margin + 10,
        topY: cursorY - 14 - titleHeight,
        width: contentWidth - 20,
        lines: descriptionLines,
        font: regular,
        size: 8.5,
        color: lightText,
        lineHeight: 10,
      });
      cursorY -= blockHeight + 10;
    });
  };

  const drawRiskGroupBlock = (group: RecepcaoChecklistPayload['riskGroups'][number]) => {
    const sections = [
      {
        lines: wrapPdfText(
          `Meta mensal: ${formatCurrency(group.monthlyGoal)} • Realizado: ${formatCurrency(group.actualMonth)} • Deveria até a data: ${formatCurrency(group.shouldHaveUntilDate)} • Progresso: ${formatPercent(group.progressPct)}`,
          regular,
          8.5,
          contentWidth - 20,
        ),
        lineHeight: 10,
        font: regular,
        size: 8.5,
        color: darkText,
      },
      {
        lines: wrapPdfText(`Plano de ação: ${group.planAction || '-'}`, regular, 8.5, contentWidth - 20),
        lineHeight: 10,
        font: regular,
        size: 8.5,
        color: lightText,
      },
      {
        lines: wrapPdfText(`Fato: ${group.fact || '-'}`, regular, 8.5, contentWidth - 20),
        lineHeight: 10,
        font: regular,
        size: 8.5,
        color: lightText,
      },
      {
        lines: wrapPdfText(`Causa: ${group.cause || '-'}`, regular, 8.5, contentWidth - 20),
        lineHeight: 10,
        font: regular,
        size: 8.5,
        color: lightText,
      },
      {
        lines: wrapPdfText(`Ação: ${group.action || '-'}`, regular, 8.5, contentWidth - 20),
        lineHeight: 10,
        font: regular,
        size: 8.5,
        color: lightText,
      },
    ];
    const titleLines = wrapPdfText(group.groupName, bold, 10.5, contentWidth - 20).slice(0, 3);
    const titleHeight = measurePdfLinesHeight(titleLines, 12);
    const sectionsHeight = sections.reduce((total, section) => total + measurePdfLinesHeight(section.lines, section.lineHeight) + 6, 0);
    const blockHeight = Math.max(86, 22 + titleHeight + sectionsHeight);

    ensureSpace(blockHeight);
    page.drawRectangle({
      x: margin,
      y: cursorY - blockHeight,
      width: contentWidth,
      height: blockHeight,
      color: group.atRisk ? pdfColor('#FFF7ED') : pdfColor('#FFFFFF'),
      borderColor: group.atRisk ? pdfColor('#FDBA74') : cardBorder,
      borderWidth: 0.8,
    });

    let blockCursorTop = cursorY - 10;
    drawTextLinesTop(page, {
      x: margin + 10,
      topY: blockCursorTop,
      width: contentWidth - 20,
      lines: titleLines,
      font: bold,
      size: 10.5,
      color: darkText,
      lineHeight: 12,
    });
    blockCursorTop -= titleHeight + 6;

    sections.forEach((section) => {
      drawTextLinesTop(page, {
        x: margin + 10,
        topY: blockCursorTop,
        width: contentWidth - 20,
        lines: section.lines,
        font: section.font,
        size: section.size,
        color: section.color,
        lineHeight: section.lineHeight,
      });
      blockCursorTop -= measurePdfLinesHeight(section.lines, section.lineHeight) + 6;
    });

    cursorY -= blockHeight + 12;
  };

  drawPageHeader();

  drawMetricCardGrid(
    'Contexto e resumo',
    'Visão geral da unidade, da configuração local e do recorte exportado.',
    [
      {
        title: 'Configuração local',
        value: payload.config?.name || 'Sem configuracao',
        helper: `Líder: ${payload.config?.leaderName || '-'}`,
        footer: `Equipe local: ${payload.config?.teamMembers.length || 0} colaborador(es) • Gerado em ${formatPdfDateTimeBr(payload.generatedAt)}`,
      },
      {
        title: 'Faturamento do dia',
        value: formatCurrency(payload.metrics.unit.revenueDay),
        helper: `Ticket médio: ${formatCurrency(payload.metrics.unit.ticketAverageDay)}`,
        footer: formatPdfFreshness(payload.metrics.unit.freshness.revenueDay),
      },
      {
        title: 'Faturamento no mês',
        value: formatCurrency(payload.metrics.unit.revenueMonth),
        helper: `Meta mensal: ${formatCurrency(payload.metrics.unit.monthlyGoal)}`,
        footer: formatPdfFreshness(payload.metrics.unit.freshness.revenueMonth),
      },
      {
        title: 'Orcamentos em aberto',
        value: String(payload.metrics.proposals.openCount),
        helper: `${formatCurrency(payload.metrics.proposals.openValue)} • ${formatPdfDateBr(payload.metrics.proposals.periodStart)} a ${formatPdfDateBr(payload.metrics.proposals.periodEnd)}`,
        footer: formatPdfFreshness(payload.metrics.proposals.freshness),
      },
    ],
    4,
    104,
  );

  drawGaugeGrid(
    'Faturamento da unidade',
    `Velocímetros principais da unidade, no mesmo padrão do painel, para ${formatPdfDateBr(payload.referenceDate)}. ${payload.metrics.unit.projectionHint} Deveria até a data: ${formatCurrency(payload.metrics.unit.shouldHaveUntilDate)}.`,
    [
      {
        title: 'Faturamento mensal',
        value: payload.metrics.unit.revenueMonth,
        max: payload.metrics.unit.monthlyGoal || 1,
        valueLabel: formatCompactCurrency(payload.metrics.unit.revenueMonth),
        helper: `${formatCurrency(payload.metrics.unit.revenueMonth)} / ${formatCurrency(payload.metrics.unit.monthlyGoal)}`,
        freshness: payload.metrics.unit.freshness.revenueMonth,
      },
      {
        title: 'Faturamento diário',
        value: payload.metrics.unit.revenueDay,
        max: payload.metrics.unit.dynamicDailyTarget || 1,
        valueLabel: formatCompactCurrency(payload.metrics.unit.revenueDay),
        helper: `${formatCurrency(payload.metrics.unit.revenueDay)} / ${formatCurrency(payload.metrics.unit.dynamicDailyTarget)}`,
        freshness: payload.metrics.unit.freshness.revenueDay,
      },
      {
        title: 'Projeção do mês',
        value: payload.metrics.unit.projectionSuppressed ? payload.metrics.unit.revenueMonth : payload.metrics.unit.projectionMonth,
        max: payload.metrics.unit.monthlyGoal || 1,
        valueLabel: payload.metrics.unit.projectionSuppressed ? '-' : formatPercent(payload.metrics.unit.projectionPct),
        // O helper do gauge cabe em duas linhas: valores compactos evitam corte.
        helper: `Proj. ${formatCompactCurrency(payload.metrics.unit.projectionMonth)} / Meta ${formatCompactCurrency(payload.metrics.unit.monthlyGoal)} • Ritmo: ${formatPercent(payload.metrics.unit.pacePct)} do esperado`,
        freshness: payload.metrics.unit.freshness.shouldHaveUntilDate,
      },
      {
        title: 'Google',
        value: payload.metrics.google.ratingActual,
        max: payload.metrics.google.ratingTarget || 1,
        valueLabel: payload.metrics.google.ratingActual.toFixed(1).replace('.', ','),
        helper: `${payload.metrics.google.ratingActual.toFixed(1).replace('.', ',')} / ${payload.metrics.google.ratingTarget.toFixed(1).replace('.', ',')}`,
      },
    ],
    4,
    182,
  );

  drawGaugeGrid(
    'Equipe comercial e assistencial',
    'Confirmação D+1 e metas gerais manuais de Resolve e Check-up.',
    [
      {
        title: 'Confirmação D+1',
        value: payload.metrics.appointmentsConfirmation.ratePct,
        max: 100,
        valueLabel: formatPercent(payload.metrics.appointmentsConfirmation.ratePct),
        helper: `${payload.metrics.appointmentsConfirmation.confirmed}/${payload.metrics.appointmentsConfirmation.total} confirmados`,
        freshness: payload.metrics.appointmentsConfirmation.freshness,
      },
      {
        title: 'Meta geral Resolve',
        value: payload.metrics.teamProduction.resolveActual,
        max: payload.metrics.teamProduction.resolveMonthlyTarget || 1,
        valueLabel: String(payload.metrics.teamProduction.resolveActual),
        helper: `${payload.metrics.teamProduction.resolveActual}/${payload.metrics.teamProduction.resolveMonthlyTarget}`,
      },
      {
        title: 'Meta geral Check-up',
        value: payload.metrics.teamProduction.checkupActual,
        max: payload.metrics.teamProduction.checkupMonthlyTarget || 1,
        valueLabel: String(payload.metrics.teamProduction.checkupActual),
        helper: `${payload.metrics.teamProduction.checkupActual}/${payload.metrics.teamProduction.checkupMonthlyTarget}`,
      },
    ],
    3,
    190,
  );

  drawMetricCardGrid(
    'Operação',
    'Indicadores complementares da operação e da liderança.',
    [
      {
        title: 'Pós-consulta equipe',
        value: formatPercent(payload.metrics.postConsult.conversionRate),
        helper: `${payload.metrics.postConsult.totalClosedEvents}/${payload.metrics.postConsult.totalEvents} fechados em ${formatPdfDateBr(payload.referenceDate)}`,
        footer: formatPdfFreshness(payload.metrics.postConsult.freshness),
      },
      {
        title: 'Espera recepção',
        value: `${payload.metrics.waits.receptionAverageMinutes} min`,
        helper: `${payload.metrics.waits.receptionAttendedCount} atendidos`,
        footer: formatPdfFreshness(payload.metrics.waits.freshness.reception),
      },
      {
        title: 'Espera médico',
        value: `${payload.metrics.waits.medicAverageMinutes} min`,
        helper: `${payload.metrics.waits.medicAttendedCount} atendidos`,
        footer: formatPdfFreshness(payload.metrics.waits.freshness.medic),
      },
      {
        title: 'Tarefas da líder',
        value: String(payload.metrics.tasks.overdueTasks),
        helper: `${payload.metrics.tasks.dueNext7DaysTasks} vencem em 7 dias`,
        footer: formatPdfFreshness(payload.metrics.tasks.freshness),
      },
    ],
    4,
    92,
  );

  drawSectionTitle('Tarefas da liderança', formatPdfFreshness(payload.metrics.tasks.freshness));
  drawTaskDetailsList(
    'Tarefas vencidas',
    payload.metrics.tasks.overdueItems,
    'Nenhuma tarefa vencida foi encontrada para a líder neste recorte.',
  );
  drawTaskDetailsList(
    'Tarefas a vencer em 7 dias',
    payload.metrics.tasks.dueSoonItems,
    'Nenhuma tarefa a vencer nos próximos 7 dias foi encontrada para a líder neste recorte.',
  );

  drawTable(
    {
      title: 'Faturamento por colaborador',
      subtitle: `Realizado no dia refere-se a ${formatPdfDateBr(payload.referenceDate)}. Prog. diário compara o realizado do dia com a meta diária dinâmica; prog. mensal compara o acumulado do mês com a meta mensal. ${formatPdfFreshness(payload.metrics.collaboratorsFreshness)}`.trim(),
      columns: [
        { label: 'Colaborador', width: contentWidth * 0.26, render: (row) => row.fullName },
        { label: 'Meta mensal', width: contentWidth * 0.13, align: 'right', render: (row) => formatCurrency(row.monthlyGoal) },
        { label: 'Realizado no dia', width: contentWidth * 0.13, align: 'right', render: (row) => formatCurrency(row.revenueDay) },
        { label: 'Realizado no mês', width: contentWidth * 0.14, align: 'right', render: (row) => formatCurrency(row.revenueMonth) },
        { label: 'Meta diária', width: contentWidth * 0.13, align: 'right', render: (row) => formatCurrency(row.dynamicDailyTarget) },
        {
          label: 'Prog. diário',
          width: contentWidth * 0.105,
          align: 'right',
          render: (row) => (row.dailyProgressPct === null ? '-' : formatPercent(row.dailyProgressPct)),
        },
        { label: 'Prog. mensal', width: contentWidth * 0.105, align: 'right', render: (row) => formatPercent(row.progressPct) },
      ],
      rows: payload.metrics.collaborators,
      emptyMessage: 'Nenhum colaborador foi configurado na equipe local desta checklist.',
    },
  );

  drawMetricCardGrid(
    'Faltas e atrasos',
    `Somente o dia de referência (${formatPdfDateBr(payload.referenceDate)}) para a equipe local configurada.`,
    [
      {
        title: 'Faltas no dia',
        value: String(payload.metrics.absences.absenceDays),
        helper: `${payload.metrics.absences.trackedEmployees} colaborador(es) monitorados`,
        footer: formatPdfFreshness(payload.metrics.absences.freshness),
      },
      {
        title: 'Atrasos no dia',
        value: `${payload.metrics.absences.lateMinutes} min`,
        helper: `${payload.metrics.absences.rows.length} colaborador(es) com ocorrência`,
        footer: formatPdfFreshness(payload.metrics.absences.freshness),
      },
    ],
    2,
    92,
  );

  drawTable(
    {
      title: 'Detalhamento de faltas e atrasos',
      subtitle: `Dia ${formatPdfDateBr(payload.referenceDate)}. ${formatPdfFreshness(payload.metrics.absences.freshness)}`.trim(),
      columns: [
        { label: 'Colaborador', width: contentWidth * 0.56, render: (row) => row.employeeName },
        { label: 'Faltas', width: contentWidth * 0.18, align: 'right', render: (row) => String(row.absenceDays) },
        { label: 'Atrasos', width: contentWidth * 0.26, align: 'right', render: (row) => `${row.lateMinutes} min` },
      ],
      rows: payload.metrics.absences.rows,
      emptyMessage: 'Nenhuma falta ou atraso foi encontrado para a equipe local no dia de referencia.',
    },
  );

  drawTable(
    {
      title: 'Equipamentos em manutenção',
      subtitle: `Equipamentos da unidade fora de operação, do cadastro de equipamentos. ${formatPdfFreshness(payload.metrics.equipmentMaintenance.freshness)}`.trim(),
      columns: [
        {
          label: 'Equipamento',
          width: contentWidth * 0.4,
          render: (row) => (row.locationDetail ? `${row.name} (${row.locationDetail})` : row.name),
        },
        { label: 'Identificação', width: contentWidth * 0.17, render: (row) => row.identificationNumber },
        { label: 'Série', width: contentWidth * 0.21, render: (row) => row.serialNumber },
        { label: 'Status operacional', width: contentWidth * 0.22, render: (row) => row.operationalStatusLabel },
      ],
      rows: payload.metrics.equipmentMaintenance.items,
      emptyMessage: 'Nenhum equipamento desta unidade esta em manutencao.',
    },
  );

  drawSectionTitle('Pendencias e validacoes', 'Campos manuais salvos no preenchimento do dia e observacoes da unidade.');
  drawMetricCardGrid(
    '',
    '',
    [
      { title: 'NF em aberto', value: payload.manual.nfOpenStatus || '-', helper: 'Status manual' },
      { title: 'Contas em aberto', value: payload.manual.accountsOpenStatus || '-', helper: 'Status manual' },
      { title: 'Novas avaliacoes Google', value: String(payload.manual.googleNewReviewsCount), helper: 'Contagem manual' },
      { title: 'Recoletas', value: String(payload.manual.recollectionCount), helper: 'Contagem automatica a partir da lista' },
    ],
    4,
    86,
  );
  drawNotesBlock('Pendencias da unidade', payload.manual.pendingNotes);
  drawNotesBlock('Observacoes gerais', payload.manual.generalNotes);

  drawSectionTitle('Recoletas', 'Lista completa das recoletas registradas nesta versao.');
  if ((payload.manual.recollections || []).length <= 0) {
    drawNotesBlock('Recoletas', 'Nenhuma recoleta registrada.');
  } else {
    payload.manual.recollections.forEach((entry, index) => {
      drawNotesBlock(`Recoleta ${index + 1}`, entry.notes || '-');
    });
  }

  drawSectionTitle(
    'Grupos de faturamento em risco',
    `Os grupos em amarelo estão em risco: o realizado acumulado no mês está abaixo do valor que o grupo deveria ter alcançado até a data de referência. ${formatPdfFreshness(payload.riskGroupsFreshness)}`.trim(),
  );
  if (payload.riskGroups.length <= 0) {
    drawNotesBlock('Grupos em risco', 'Nenhum grupo com meta mensal configurada foi encontrado para esta unidade.');
  } else {
    payload.riskGroups.forEach(drawRiskGroupBlock);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};
