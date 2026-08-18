import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
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
  type FinancialUnitDefinition,
} from '@/lib/financial_units';
import { calculateKpi } from '@/lib/kpi_engine';
import { DEFAULT_POINT_FILTERS } from '@/lib/point/filters';
import { listPointDailyControlRowsByDateRange } from '@/lib/point/repository';
import { listPostConsultExportRows, normalizePostConsultFilters } from '@/lib/post_consulta/repository';
import { invalidateCache } from '@/lib/api_cache';
import { getTaskDashboardSummary } from '@consultare/core/tasks/repository';

const PROPOSAL_EXEC_STATUSES = "('executada','aprovada pelo cliente','ganho','realizado','concluido','pago')";
const IS_MYSQL =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const GOOGLE_RATING_TARGET = 4.7;

type ViewMode = 'current' | 'd1';

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
  pendingNotes: string;
  generalNotes: string;
  riskGroups: RecepcaoChecklistRiskManual[];
};

export type RecepcaoChecklistVersionSummary = {
  id: string;
  referenceDate: string;
  unitKey: string;
  createdAt: string | null;
  createdByName: string | null;
  viewMode: ViewMode;
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
  access: {
    isManager: boolean;
  };
  viewMode: ViewMode;
  referenceDate: string;
  readOnly: boolean;
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
  suggestedConfig: {
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
  } | null;
  versionSelectedId: string | null;
  versions: RecepcaoChecklistVersionSummary[];
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
      businessDaysElapsed: number;
      businessDaysInMonth: number;
      businessDaysRemaining: number;
    };
    collaborators: Array<{
      employeeId: string;
      userId: string | null;
      fullName: string;
      monthlyGoal: number;
      revenueMonth: number;
      dynamicDailyTarget: number;
      progressPct: number;
    }>;
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
    };
    postConsult: {
      totalEvents: number;
      totalClosedEvents: number;
      pendingPatients: number;
      executedProposalValue: number;
      conversionRate: number;
    };
    waits: {
      receptionAverageMinutes: number;
      receptionAttendedCount: number;
      medicAverageMinutes: number;
      medicAttendedCount: number;
    };
    tasks: {
      pendingTasks: number;
      overdueTasks: number;
      dueNext7DaysTasks: number;
      awaitingApprovalTasks: number;
    };
    proposals: {
      openCount: number;
      openValue: number;
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
    };
    google: {
      ratingTarget: number;
      ratingActual: number;
      ratingProgressPct: number;
      newReviewsCount: number;
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
};

type ConfigFilters = {
  configId?: string | null;
  unitKey?: string | null;
  viewMode?: string | null;
  referenceDate?: string | null;
  versionId?: string | null;
};

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

const normalizeHumanText = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInt = (value: unknown) => Math.max(0, Math.floor(toNumber(value)));

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

const parseIsoDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null);

const shiftDate = (dateIso: string, deltaDays: number) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const isBusinessDay = (dateIso: string) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  const weekday = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1)).getUTCDay();
  return weekday !== 0;
};

const monthStart = (dateIso: string) => `${dateIso.slice(0, 7)}-01`;

const monthEnd = (dateIso: string) => {
  const [year, month] = dateIso.slice(0, 7).split('-').map(Number);
  const date = new Date(Date.UTC(year || 0, month || 1, 0));
  return date.toISOString().slice(0, 10);
};

const countBusinessDays = (startDate: string, endDate: string) => {
  if (endDate < startDate) return 0;
  let cursor = startDate;
  let total = 0;
  while (cursor <= endDate) {
    if (isBusinessDay(cursor)) total += 1;
    cursor = shiftDate(cursor, 1);
  }
  return total;
};

const previousBusinessDate = (dateIso: string) => {
  let cursor = shiftDate(dateIso, -1);
  while (!isBusinessDay(cursor)) cursor = shiftDate(cursor, -1);
  return cursor;
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

const normalizeManualPayload = (value: Partial<RecepcaoChecklistManualPayload> | null | undefined): RecepcaoChecklistManualPayload => ({
  resolveMonthlyTarget: toInt(value?.resolveMonthlyTarget),
  resolveActual: toInt(value?.resolveActual),
  checkupMonthlyTarget: toInt(value?.checkupMonthlyTarget),
  checkupActual: toInt(value?.checkupActual),
  nfOpenStatus: clean(value?.nfOpenStatus),
  accountsOpenStatus: clean(value?.accountsOpenStatus),
  googleRating: Number(toNumber(value?.googleRating).toFixed(2)),
  googleNewReviewsCount: toInt(value?.googleNewReviewsCount),
  recollectionCount: toInt(value?.recollectionCount),
  recollectionNotes: clean(value?.recollectionNotes).slice(0, 4000),
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

export const ensureRecepcaoChecklistSchema = async (db: DbInterface) => {
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
  await safeAddColumn(db, `ALTER TABLE recepcao_checklist_configs ADD COLUMN team_members_json LONGTEXT NOT NULL DEFAULT '[]'`);
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

const listAccessibleConfigs = async (db: DbInterface, actor: RecepcaoChecklistActor) => {
  const where = actor.isManager ? '' : 'WHERE leader_user_id = ?';
  const params = actor.isManager ? [] : [actor.userId];
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
  const requested = clean(filters.configId);
  if (requested) {
    const found = configs.find((config) => config.id === requested);
    if (found) return found;
  }
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

const queryVersionSummaries = async (db: DbInterface, configId: string, unitKey: string) => {
  const rows = await db.query(
    `
      SELECT id, reference_date, unit_key, created_at, created_by_name, view_mode
      FROM recepcao_checklist_versions
      WHERE config_id = ?
        AND unit_key = ?
      ORDER BY reference_date DESC, created_at DESC
      LIMIT 120
    `,
    [configId, unitKey],
  );
  return (rows as DbRow[]).map(
    (row): RecepcaoChecklistVersionSummary => ({
      id: clean(row.id),
      referenceDate: clean(row.reference_date),
      unitKey: clean(row.unit_key),
      createdAt: clean(row.created_at) || null,
      createdByName: clean(row.created_by_name) || null,
      viewMode: clean(row.view_mode) === 'd1' ? 'd1' : 'current',
    }),
  );
};

const queryVersionRow = async (
  db: DbInterface,
  args: { configId: string; unitKey: string; referenceDate: string; versionId?: string | null },
) => {
  if (clean(args.versionId)) {
    const rows = await db.query(
      `
        SELECT *
        FROM recepcao_checklist_versions
        WHERE id = ?
          AND config_id = ?
          AND unit_key = ?
        LIMIT 1
      `,
      [clean(args.versionId), args.configId, args.unitKey],
    );
    if (rows.length > 0) return rows[0] as DbRow;
  }

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

const calculateDailyTarget = (monthlyGoal: number, currentValue: number, referenceDate: string) => {
  const remaining = Math.max(0, monthlyGoal - currentValue);
  const daysRemaining = countBusinessDays(referenceDate, monthEnd(referenceDate));
  if (daysRemaining <= 0) return remaining;
  return remaining / daysRemaining;
};

const loadUnitFinancialMetrics = async (db: DbInterface, referenceDate: string, unit: FinancialUnitDefinition) => {
  const dayParams: Array<string | number> = [referenceDate];
  const unitDaySql = buildFinancialUnitClause('unidade', unit.key, dayParams);
  const dayRows = await db.query(
    `
      SELECT COALESCE(SUM(total_pago), 0) AS total_pago, COALESCE(SUM(qtd), 0) AS qtd
      FROM faturamento_resumo_diario
      WHERE data_ref = ? ${unitDaySql}
    `,
    dayParams,
  );

  const monthParams: Array<string | number> = [monthStart(referenceDate), referenceDate];
  const unitMonthSql = buildFinancialUnitClause('unidade', unit.key, monthParams);
  const monthRows = await db.query(
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
  const goalRows = await db.query(
    `
      SELECT COALESCE(SUM(target_value), 0) AS total
      FROM goals_config
      WHERE ${commonGoalFilter} ${goalUnitSql}
    `,
    goalUnitParams,
  );

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
  const businessDaysElapsed = countBusinessDays(monthStart(referenceDate), referenceDate);
  const businessDaysInMonth = countBusinessDays(monthStart(referenceDate), monthEnd(referenceDate));
  const businessDaysRemaining = countBusinessDays(referenceDate, monthEnd(referenceDate));
  const shouldHaveUntilDate = businessDaysInMonth > 0 ? (monthlyGoal * businessDaysElapsed) / businessDaysInMonth : 0;

  return {
    revenueDay,
    revenueMonth,
    ticketAverageDay: qtdDay > 0 ? revenueDay / qtdDay : 0,
    monthlyGoal,
    shouldHaveUntilDate,
    dynamicDailyTarget: calculateDailyTarget(monthlyGoal, revenueMonth, referenceDate),
    progressPct: monthlyGoal > 0 ? (revenueMonth * 100) / monthlyGoal : 0,
    expectedPct: monthlyGoal > 0 ? (shouldHaveUntilDate * 100) / monthlyGoal : 0,
    businessDaysElapsed,
    businessDaysInMonth,
    businessDaysRemaining,
  };
};

const loadCollaboratorGoals = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  if (members.length <= 0) return new Map<string, number>();

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

  const byMember = new Map<string, number>();
  for (const member of members) {
    const match = (rows as DbRow[]).find(
      (row) =>
        clean(row.employee_id) === member.employeeId ||
        normalizeHumanText(row.collaborator) === normalizeHumanText(member.fullName),
    );
    byMember.set(member.employeeId, toNumber(match?.total));
  }
  return byMember;
};

const loadCollaboratorMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  const goalMap = await loadCollaboratorGoals(db, referenceDate, unit, members);
  const startDate = monthStart(referenceDate);

  return Promise.all(
    members.map(async (member) => {
      const monthlyGoal = goalMap.get(member.employeeId) || 0;
      const revenueMonth = await calculateKpi('revenue', startDate, referenceDate, {
        unit_filter: unit.label,
        collaborator: member.fullName,
        employee_id: member.employeeId,
      })
        .then((result) => toNumber(result.currentValue))
        .catch(() => 0);

      return {
        employeeId: member.employeeId,
        userId: member.userId,
        fullName: member.fullName,
        monthlyGoal,
        revenueMonth,
        dynamicDailyTarget: calculateDailyTarget(monthlyGoal, revenueMonth, referenceDate),
        progressPct: monthlyGoal > 0 ? (revenueMonth * 100) / monthlyGoal : 0,
      };
    }),
  );
};

const loadConfirmationMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  readOnly: boolean,
) => {
  const targetDate = shiftDate(referenceDate, 1);
  const params: Array<string | number> = [targetDate];
  const unitSql = buildFinancialUnitClause('unit_name', unit.key, params);

  if (readOnly) {
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
    source: readOnly ? ('snapshot-fallback' as const) : ('live' as const),
  };
};

const buildTeamNameSet = (members: RecepcaoChecklistTeamMember[]) =>
  new Set(members.map((member) => normalizeHumanText(member.fullName)).filter(Boolean));

const loadPostConsultMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  const baseRows = await listPostConsultExportRows(
    normalizePostConsultFilters({
      startDate: monthStart(referenceDate),
      endDate: referenceDate,
      unit: unit.label,
      status: 'all',
      responsible: 'all',
      closed: 'all',
      page: 1,
      pageSize: 200,
    }),
    db,
  ).catch(() => []);

  const teamNames = buildTeamNameSet(members);
  const rows = teamNames.size > 0
    ? baseRows.filter((row) => teamNames.has(normalizeHumanText(row.attendantResponsible)))
    : baseRows;

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

const loadTaskMetrics = async (db: DbInterface, leaderUserId: string | null) => {
  if (!leaderUserId) {
    return {
      pendingTasks: 0,
      overdueTasks: 0,
      dueNext7DaysTasks: 0,
      awaitingApprovalTasks: 0,
    };
  }

  const summary = await getTaskDashboardSummary(
    db,
    { userId: leaderUserId, canViewAll: true },
    { assigneeUserId: leaderUserId, includeCanceled: true },
  ).catch(() => null);

  return {
    pendingTasks: toInt(summary?.totalTasks),
    overdueTasks: toInt(summary?.overdueTasks),
    dueNext7DaysTasks: toInt(summary?.dueSoonTasks),
    awaitingApprovalTasks: toInt(summary?.awaitingApprovalTasks),
  };
};

const loadProposalMetrics = async (db: DbInterface, unit: FinancialUnitDefinition) => {
  const params: Array<string | number> = [];
  const unitSql = buildFinancialUnitClause('unit_name', unit.key, params);
  const rows = await db.query(
    `
      SELECT COUNT(*) AS total_count, COALESCE(SUM(total_value), 0) AS total_value
      FROM feegow_proposals
      WHERE (status IS NULL OR lower(status) NOT IN ${PROPOSAL_EXEC_STATUSES})
        ${unitSql}
    `,
    params,
  );
  return {
    openCount: toInt(rows[0]?.total_count),
    openValue: toNumber(rows[0]?.total_value),
  };
};

const loadAbsenceMetrics = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  members: RecepcaoChecklistTeamMember[],
) => {
  const employeeIds = new Set(members.map((member) => member.employeeId).filter(Boolean));
  const rows = await listPointDailyControlRowsByDateRange(
    db,
    { startDate: monthStart(referenceDate), endDate: referenceDate },
    {
      ...DEFAULT_POINT_FILTERS,
      unit: unit.label,
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
    trackedEmployees: filtered.length,
    absenceDays: filtered.reduce((sum: number, row: Record<string, unknown>) => sum + toNumber(row.absenceDays), 0),
    lateMinutes: filtered.reduce((sum: number, row: Record<string, unknown>) => sum + toNumber(row.lateMinutes), 0),
    rows: relevantRows,
  };
};

const loadRiskGroups = async (
  db: DbInterface,
  referenceDate: string,
  unit: FinancialUnitDefinition,
  unitMetrics: RecepcaoChecklistPayload['metrics']['unit'],
  manual: RecepcaoChecklistManualPayload,
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

  const manualByGroup = new Map(
    manual.riskGroups.map((entry) => [normalizeHumanText(entry.groupName), entry] as const),
  );
  const actualByGroup = new Map(
    (actualRows as DbRow[]).map((row) => [normalizeHumanText(row.grupo), toNumber(row.total)] as const),
  );

  return (goalRows as DbRow[]).map((row) => {
    const groupName = clean(row.filter_group);
    const monthlyGoal = toNumber(row.total);
    const actualMonth = actualByGroup.get(normalizeHumanText(groupName)) || 0;
    const shouldHaveUntilDate =
      unitMetrics.businessDaysInMonth > 0 ? (monthlyGoal * unitMetrics.businessDaysElapsed) / unitMetrics.businessDaysInMonth : 0;
    const saved = manualByGroup.get(normalizeHumanText(groupName));
    return {
      groupName,
      monthlyGoal,
      actualMonth,
      shouldHaveUntilDate,
      progressPct: monthlyGoal > 0 ? (actualMonth * 100) / monthlyGoal : 0,
      atRisk: actualMonth < shouldHaveUntilDate,
      planAction: clean(saved?.planAction),
      fact: clean(saved?.fact),
      cause: clean(saved?.cause),
      action: clean(saved?.action),
    };
  });
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
  const configs = await listAccessibleConfigs(actor.db, actor);
  const config = resolveConfigForActor(configs, actor, filters);
  const today = toSaoPauloDate();
  const viewMode: ViewMode = clean(filters.viewMode) === 'd1' ? 'd1' : 'current';
  const referenceDate = parseIsoDate(clean(filters.referenceDate))
    || (viewMode === 'd1' ? previousBusinessDate(today) : today);
  const readOnly = viewMode === 'd1';
  const unit = resolveUnitForConfig(config, filters.unitKey);
  const selectedUnit = unit || listFinancialUnits()[0];

  const versions = config ? await queryVersionSummaries(actor.db, config.id, selectedUnit.key) : [];
  const selectedVersion = config
    ? resolveManualFromVersionRow(
        await queryVersionRow(actor.db, {
          configId: config.id,
          unitKey: selectedUnit.key,
          referenceDate,
          versionId: filters.versionId,
        }),
      )
    : null;
  const legacyManual = await queryLegacyManualFallback(actor.db, selectedUnit.key).catch(() => null);

  const manual =
    selectedVersion?.payload?.manual
    || (!readOnly && legacyManual ? normalizeLegacyManual(legacyManual) : normalizeManualPayload(null));

  const source: RecepcaoChecklistPayload['freezeMetadata']['source'] = selectedVersion
    ? 'version'
    : !readOnly && legacyManual
      ? 'legacy-fallback'
      : 'live-fallback';

  const unitMetrics = await loadUnitFinancialMetrics(actor.db, referenceDate, selectedUnit);
  const collaborators = await loadCollaboratorMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []);
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
  const [appointmentsConfirmation, postConsult, waits, tasks, proposals, absences] = await Promise.all([
    loadConfirmationMetrics(actor.db, referenceDate, selectedUnit, readOnly),
    loadPostConsultMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []),
    loadWaitMetrics(actor.db, referenceDate, selectedUnit),
    loadTaskMetrics(actor.db, config?.leaderUserId || null),
    loadProposalMetrics(actor.db, selectedUnit),
    loadAbsenceMetrics(actor.db, referenceDate, selectedUnit, config?.teamMembers || []),
  ]);

  const riskGroups = await loadRiskGroups(actor.db, referenceDate, selectedUnit, unitMetrics, manual);
  const google = {
    ratingTarget: GOOGLE_RATING_TARGET,
    ratingActual: manual.googleRating,
    ratingProgressPct: GOOGLE_RATING_TARGET > 0 ? (manual.googleRating * 100) / GOOGLE_RATING_TARGET : 0,
    newReviewsCount: manual.googleNewReviewsCount,
  };

  return {
    generatedAt: toSaoPauloDateTime(),
    today,
    access: {
      isManager: actor.isManager,
    },
    viewMode,
    referenceDate,
    readOnly,
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
    availableUnits: listFinancialUnits().map((item) => ({ key: item.key, label: item.label })),
    suggestedConfig: config ? null : await loadSuggestedConfig(actor.db, actor.userId),
    versionSelectedId: selectedVersion?.versionId || null,
    versions,
    manual,
    freezeMetadata: {
      isFrozen: readOnly,
      source,
    },
    metrics: {
      unit: unitMetrics,
      collaborators,
      teamProduction,
      appointmentsConfirmation,
      postConsult,
      waits,
      tasks,
      proposals,
      absences,
      google,
    },
    riskGroups,
  };
};

type SaveVersionInput = {
  configId: string;
  unitKey: string;
  manual: Partial<RecepcaoChecklistManualPayload>;
};

export const saveRecepcaoChecklistVersion = async (
  actor: RecepcaoChecklistActor,
  input: SaveVersionInput,
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
  const payload = await buildRecepcaoChecklistPayload(actor, {
    configId,
    unitKey: unit.key,
    viewMode: 'current',
    referenceDate: today,
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
      mode: 'current',
      referenceDate: today,
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
      today,
      unit.key,
      'current',
      createdAt,
      actor.userId,
      actor.scope?.matchedGroupLabel || actor.userId,
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

  const teamMembers = options.teamMembers.filter((item) => input.teamEmployeeIds.includes(item.employeeId));
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
  };
};

const collectPdfBuffer = async (doc: InstanceType<typeof PDFDocument>) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Uint8Array | Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

const drawGauge = (
  doc: InstanceType<typeof PDFDocument>,
  args: { x: number; y: number; radius: number; label: string; value: number; max: number; helper: string },
) => {
  const gaugeDoc = doc as InstanceType<typeof PDFDocument> & {
    arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => InstanceType<typeof PDFDocument>;
  };
  const progress = args.max > 0 ? Math.max(0, Math.min(1, args.value / args.max)) : 0;
  const endAngle = 180 - progress * 180;

  gaugeDoc
    .save()
    .lineWidth(10)
    .strokeColor('#E2E8F0')
    .arc(args.x, args.y, args.radius, 180, 0)
    .stroke();

  gaugeDoc
    .lineWidth(10)
    .strokeColor(progress >= 1 ? '#15803D' : progress >= 0.7 ? '#0F766E' : '#B45309')
    .arc(args.x, args.y, args.radius, 180, endAngle)
    .stroke()
    .restore();

  doc.fontSize(10).fillColor('#475569').text(args.label, args.x - args.radius, args.y + 18, {
    width: args.radius * 2,
    align: 'center',
  });
  doc.fontSize(14).fillColor('#0F172A').text(formatPercent(progress * 100), args.x - args.radius, args.y - 8, {
    width: args.radius * 2,
    align: 'center',
  });
  doc.fontSize(8).fillColor('#64748B').text(args.helper, args.x - args.radius, args.y + 34, {
    width: args.radius * 2,
    align: 'center',
  });
};

export const buildRecepcaoChecklistPdf = async (payload: RecepcaoChecklistPayload) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.info.Title = `Checklist Recepcao - ${payload.selectedUnitLabel}`;
  doc.info.Author = 'Consultare Hub';

  doc.rect(36, 36, 523, 42).fill('#17407E');
  doc.fillColor('#FFFFFF').fontSize(18).text('Checklist Recepcao', 48, 49);
  doc.fontSize(10).text(`${payload.selectedUnitLabel} | ${payload.viewMode === 'd1' ? 'D-1' : 'Hoje'} | ${payload.referenceDate}`, 48, 66);

  doc.moveDown(2.4);
  doc.fillColor('#0F172A').fontSize(11).text(`Configuracao: ${payload.config?.name || 'Sem configuracao'}`);
  doc.fontSize(10).fillColor('#475569').text(`Lider: ${payload.config?.leaderName || '-'}`);
  doc.text(`Gerado em: ${payload.generatedAt}`);

  drawGauge(doc, {
    x: 110,
    y: 180,
    radius: 48,
    label: 'Faturamento mensal',
    value: payload.metrics.unit.revenueMonth,
    max: payload.metrics.unit.monthlyGoal || 1,
    helper: `${formatCurrency(payload.metrics.unit.revenueMonth)} / ${formatCurrency(payload.metrics.unit.monthlyGoal)}`,
  });
  drawGauge(doc, {
    x: 300,
    y: 180,
    radius: 48,
    label: 'Deveria ate hoje',
    value: payload.metrics.unit.revenueMonth,
    max: payload.metrics.unit.shouldHaveUntilDate || 1,
    helper: `${formatCurrency(payload.metrics.unit.shouldHaveUntilDate)} previsto`,
  });
  drawGauge(doc, {
    x: 490,
    y: 180,
    radius: 48,
    label: 'Google',
    value: payload.metrics.google.ratingActual,
    max: payload.metrics.google.ratingTarget || 1,
    helper: `${payload.metrics.google.ratingActual.toFixed(1).replace('.', ',')} / ${payload.metrics.google.ratingTarget.toFixed(1).replace('.', ',')}`,
  });

  doc.y = 260;
  doc.fontSize(12).fillColor('#0F172A').text('Resumo operacional', 36, doc.y);
  doc.moveDown(0.6);
  const summaryLines = [
    `Faturamento do dia: ${formatCurrency(payload.metrics.unit.revenueDay)}`,
    `Ticket medio do dia: ${formatCurrency(payload.metrics.unit.ticketAverageDay)}`,
    `Meta diaria dinamica: ${formatCurrency(payload.metrics.unit.dynamicDailyTarget)}`,
    `Confirmacao D+1: ${formatPercent(payload.metrics.appointmentsConfirmation.ratePct)} (${payload.metrics.appointmentsConfirmation.confirmed}/${payload.metrics.appointmentsConfirmation.total})`,
    `Pos-consulta equipe: ${formatPercent(payload.metrics.postConsult.conversionRate)} (${payload.metrics.postConsult.totalClosedEvents}/${payload.metrics.postConsult.totalEvents})`,
    `Espera recepcao: ${payload.metrics.waits.receptionAverageMinutes} min`,
    `Espera medico: ${payload.metrics.waits.medicAverageMinutes} min`,
    `Orcamentos em aberto: ${payload.metrics.proposals.openCount} | ${formatCurrency(payload.metrics.proposals.openValue)}`,
    `Tarefas vencidas / proximos 7 dias: ${payload.metrics.tasks.overdueTasks} / ${payload.metrics.tasks.dueNext7DaysTasks}`,
    `Faltas / atrasos: ${payload.metrics.absences.absenceDays} dias | ${payload.metrics.absences.lateMinutes} min`,
  ];
  summaryLines.forEach((line) => {
    doc.fontSize(10).fillColor('#334155').text(`- ${line}`, { width: 520 });
  });

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#0F172A').text('Campos manuais');
  [
    `NF em aberto: ${payload.manual.nfOpenStatus || '-'}`,
    `Contas em aberto: ${payload.manual.accountsOpenStatus || '-'}`,
    `Resolve: ${payload.manual.resolveActual}/${payload.manual.resolveMonthlyTarget}`,
    `Check-up: ${payload.manual.checkupActual}/${payload.manual.checkupMonthlyTarget}`,
    `Novas avaliacoes Google: ${payload.manual.googleNewReviewsCount}`,
    `Recoletas: ${payload.manual.recollectionCount}`,
  ].forEach((line) => {
    doc.fontSize(10).fillColor('#334155').text(`- ${line}`, { width: 520 });
  });

  if (payload.manual.pendingNotes) {
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#0F172A').text('Pendencias:');
    doc.fontSize(9).fillColor('#475569').text(payload.manual.pendingNotes, { width: 520 });
  }

  if (payload.riskGroups.length > 0) {
    doc.addPage({ margin: 36 });
    doc.fontSize(16).fillColor('#0F172A').text('Grupos de faturamento em risco');
    doc.moveDown(0.8);
    payload.riskGroups.forEach((group) => {
      doc.fontSize(11).fillColor('#0F172A').text(group.groupName);
      doc.fontSize(9).fillColor('#475569').text(
        `Meta: ${formatCurrency(group.monthlyGoal)} | Realizado: ${formatCurrency(group.actualMonth)} | Previsto ate a data: ${formatCurrency(group.shouldHaveUntilDate)}`,
      );
      if (group.planAction || group.fact || group.cause || group.action) {
        doc.fontSize(9).text(`Plano: ${group.planAction || '-'}`);
        doc.text(`Fato: ${group.fact || '-'}`);
        doc.text(`Causa: ${group.cause || '-'}`);
        doc.text(`Acao: ${group.action || '-'}`);
      }
      doc.moveDown(0.8);
    });
  }

  return collectPdfBuffer(doc);
};
