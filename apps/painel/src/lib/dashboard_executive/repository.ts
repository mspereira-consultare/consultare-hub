import { createHash, randomUUID } from 'crypto';
import { runInTransaction, type DbInterface } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { getAgendaOcupacaoHeartbeat, listAgendaOcupacaoDailyRows } from '@/lib/agenda_ocupacao/repository';
import { getEmployeeDashboard } from '@/lib/colaboradores/repository';
import { getQmsOverviewMetrics } from '@/lib/qms/metrics_repository';
import { listRecruitmentDashboard } from '@/lib/recrutamento/repository';
import { getMarketingControleSummary } from '@/lib/marketing_controle/repository';
import { getMarketingFunnelSummary } from '@/lib/marketing_funil/repository';
import { getSurveillanceSummary } from '@/lib/vigilancia_sanitaria/repository';
import { getTaskDashboardSummary } from '@consultare/core/tasks/repository';
import type { TaskViewerContext } from '@consultare/core/tasks/types';
import {
  EXECUTIVE_PROFILE_DEFINITIONS,
  EXECUTIVE_PROFILE_WIDGET_DEFAULTS,
  EXECUTIVE_WIDGET_DEFINITIONS,
  getWidgetArea,
} from '@/lib/dashboard_executive/catalog';
import type { SurveillanceSummaryFilters } from '@/lib/vigilancia_sanitaria/types';
import type {
  ExecutiveAreaBlock,
  ExecutiveAreaKey,
  ExecutiveConfigurationSnapshot,
  ExecutiveGroupDefinition,
  ExecutiveIndicator,
  ExecutiveIndicatorStatus,
  ExecutiveJobTitleMapping,
  ExecutiveLiveHeartbeat,
  ExecutiveLiveOperations,
  ExecutiveMetricsPayload,
  ExecutiveProfileDefinition,
  ExecutiveProfileKey,
  ExecutiveProfileWidgetConfig,
  ExecutivePriority,
  ExecutiveProfilePreviewRow,
  ExecutiveResolvedProfile,
  ExecutiveScope,
  ExecutiveScopeMode,
  ExecutiveScopeOptions,
  ExecutiveScopeResolutionSource,
  ExecutiveSnapshot,
  ExecutiveSnapshotStatus,
  ExecutiveTrend,
  ExecutiveUserException,
  ExecutiveWidgetDefinition,
  ExecutiveWidgetKey,
  ExecutiveWidgetSnapshot,
  ExecutiveWidgetSnapshotValue,
} from '@/lib/dashboard_executive/types';

const EXECUTIVE_AREAS: ExecutiveAreaKey[] = ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade'];
const SUMMARY_TABLE = 'faturamento_resumo_diario';
const ANALITICO_TABLE = 'faturamento_analitico';
const IS_MYSQL =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const SQL_DATE_ANALITICO =
  IS_MYSQL
    ? `(CASE WHEN INSTR(data_do_pagamento, '/') > 0 THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2)) ELSE data_do_pagamento END)`
    : `(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)`;
const WON_STATUSES = ['executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago'];
const CRITICAL_WAIT_MINUTES = 30;

let tablesEnsured = false;

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (
      message.includes('duplicate column') ||
      message.includes('already exists') ||
      error?.code === 'SQLITE_ERROR' ||
      error?.errno === 1060
    ) {
      return;
    }
    throw error;
  }
};
const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statusRank: Record<ExecutiveIndicatorStatus, number> = {
  DANGER: 3,
  WARNING: 2,
  SUCCESS: 1,
  NO_DATA: 0,
};

const EXECUTIVE_GROUP_SEEDS: Array<Omit<ExecutiveGroupDefinition, 'id' | 'updatedAt' | 'updatedBy'>> = [
  {
    key: 'diretoria',
    label: 'Diretoria',
    description: 'Visão ampla da operação e dos indicadores estratégicos.',
    defaultProfileKey: 'diretoria_gerencia_adm',
    scopeMode: 'unrestricted',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 10,
  },
  {
    key: 'gerencia_operacional',
    label: 'Gerência Operacional',
    description: 'Gestão consolidada da operação com leitura transversal das unidades.',
    defaultProfileKey: 'gerencia_operacional',
    scopeMode: 'employee_units',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 20,
  },
  {
    key: 'lideranca_unidades',
    label: 'Liderança de Unidades',
    description: 'Foco na operação e metas das unidades sob responsabilidade.',
    defaultProfileKey: 'lider_unidades',
    scopeMode: 'employee_units',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 30,
  },
  {
    key: 'lideranca_operacional',
    label: 'Liderança Operacional',
    description: 'Supervisão do fluxo operacional, filas e execução diária.',
    defaultProfileKey: 'lider_operacional',
    scopeMode: 'employee_department_and_units',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 40,
  },
  {
    key: 'agendas',
    label: 'Agendas',
    description: 'Visão operacional de ocupação, mapa e confirmações.',
    defaultProfileKey: 'agendas',
    scopeMode: 'employee_units',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 50,
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    description: 'Visão financeira e contábil.',
    defaultProfileKey: 'financeiro',
    scopeMode: 'employee_department',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 60,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Visão de mídia, campanhas e conversão.',
    defaultProfileKey: 'marketing',
    scopeMode: 'employee_department',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 70,
  },
  {
    key: 'rh',
    label: 'RH',
    description: 'Visão de gestão de pessoas e marcos do colaborador.',
    defaultProfileKey: 'rh',
    scopeMode: 'employee_department',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 80,
  },
  {
    key: 'crc',
    label: 'CRC',
    description: 'Visão de agenda, captação, filas e atendimento ao paciente.',
    defaultProfileKey: 'crc',
    scopeMode: 'employee_department_and_units',
    departments: [],
    teams: [],
    units: [],
    isActive: true,
    sortOrder: 90,
  },
];

const parseJsonArray = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => clean(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const parseUnitsArray = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? unique(parsed.map((item) => clean(item))) : [];
  } catch {
    return [];
  }
};

const unique = (values: string[]) => Array.from(new Set(values.map((item) => clean(item)).filter(Boolean)));
const normalizeSearch = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const NOW = () => new Date().toISOString();
const isWidgetKey = (value: string): value is ExecutiveWidgetKey =>
  EXECUTIVE_WIDGET_DEFINITIONS.some((widget) => widget.key === value);
const isProfileKey = (value: string): value is ExecutiveProfileKey =>
  EXECUTIVE_PROFILE_DEFINITIONS.some((profile) => profile.key === value);
const isScopeMode = (value: string): value is ExecutiveScopeMode =>
  ['unrestricted', 'employee_department', 'employee_units', 'employee_department_and_units', 'custom'].includes(value);

const getSaoPauloParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.get('year') || '1970'),
    month: Number(byType.get('month') || '1'),
    day: Number(byType.get('day') || '1'),
    hour: Number(byType.get('hour') || '0'),
    minute: Number(byType.get('minute') || '0'),
    second: Number(byType.get('second') || '0'),
  };
};

const formatDate = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const getDateRange = () => {
  const now = new Date();
  const today = formatDate(now);
  const parts = getSaoPauloParts(now);
  const spNow = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const weekDay = spNow.getDay();
  const diffToMonday = weekDay === 0 ? -6 : 1 - weekDay;
  const weekStartDate = new Date(spNow);
  weekStartDate.setDate(spNow.getDate() + diffToMonday);
  const monthStartDate = new Date(spNow.getFullYear(), spNow.getMonth(), 1, 12, 0, 0);
  return {
    now,
    today,
    weekStart: formatDate(weekStartDate),
    monthStart: formatDate(monthStartDate),
    monthEndDay: new Date(spNow.getFullYear(), spNow.getMonth() + 1, 0).getDate(),
    currentDayOfMonth: spNow.getDate(),
  };
};

const inferTrend = (current: number | null, reference: number | null): ExecutiveTrend => {
  if (current == null || reference == null) return 'unknown';
  if (current > reference) return 'up';
  if (current < reference) return 'down';
  return 'stable';
};

const worstStatus = (statuses: ExecutiveIndicatorStatus[]): ExecutiveIndicatorStatus => {
  if (!statuses.length) return 'NO_DATA';
  return [...statuses].sort((a, b) => statusRank[b] - statusRank[a])[0];
};

const getVisibleAreasFromWidgets = (widgetKeys: ExecutiveWidgetKey[]) =>
  Array.from(
    new Set(
      widgetKeys
        .map((widgetKey) => getWidgetArea(widgetKey))
        .filter((areaKey): areaKey is ExecutiveAreaKey => EXECUTIVE_AREAS.includes(areaKey))
      )
  );

const getWidgetDefinition = (widgetKey: ExecutiveWidgetKey) =>
  EXECUTIVE_WIDGET_DEFINITIONS.find((item) => item.key === widgetKey) || null;

const getVisibleAvailableWidgets = (widgetKeys: ExecutiveWidgetKey[]) =>
  widgetKeys.filter((widgetKey) => getWidgetDefinition(widgetKey)?.status === 'available');

const serializeScopeInput = (scope: ExecutiveScope) => ({
  userId: scope.userId,
  areas: scope.areas,
  departments: scope.departments,
  teams: scope.teams,
  units: scope.units,
  profileKey: scope.profileKey,
  visibleWidgetKeys: scope.visibleWidgetKeys,
  resolutionSource: scope.resolutionSource,
  matchedGroupId: scope.matchedGroupId,
  matchedGroupKey: scope.matchedGroupKey,
  matchedGroupLabel: scope.matchedGroupLabel,
  configurationIssue: scope.configurationIssue,
});

const serializeScopeHash = (scope: Omit<ExecutiveScope, 'updatedAt' | 'updatedBy'>) =>
  createHash('sha256').update(JSON.stringify(scope)).digest('hex');

const userEmployeeJoinClause = () =>
  IS_MYSQL
    ? "e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci"
    : 'e.id = u.employee_id';

const tableExists = async (db: DbInterface, tableName: string) => {
  try {
    const rows = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [tableName]);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
};

const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);

const formatPercent = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);

const formatPercentCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value || 0);

const buildWidgetValue = (label: string, value: string): ExecutiveWidgetSnapshotValue => ({ label, value });

const buildIndicatorWidget = (
  widgetKey: ExecutiveWidgetKey,
  indicator: ExecutiveIndicator
): ExecutiveWidgetSnapshot | null => {
  const definition = getWidgetDefinition(widgetKey);
  if (!definition) return null;
  return {
    key: definition.key,
    label: definition.label,
    areaKey: definition.areaKey,
    status: indicator.status,
    description: definition.description,
    updatedAt: indicator.sourceUpdatedAt,
    indicator: { ...indicator, label: definition.label },
    values: [],
    note: indicator.note,
  };
};

const buildSummaryWidget = (
  widgetKey: ExecutiveWidgetKey,
  status: ExecutiveIndicatorStatus,
  updatedAt: string | null,
  values: ExecutiveWidgetSnapshotValue[],
  note: string | null
): ExecutiveWidgetSnapshot | null => {
  const definition = getWidgetDefinition(widgetKey);
  if (!definition) return null;
  return {
    key: definition.key,
    label: definition.label,
    areaKey: definition.areaKey,
    status,
    description: definition.description,
    updatedAt,
    indicator: null,
    values,
    note,
  };
};

const unitIdsFromScope = (units: string[]) => {
  const ids = new Set<number>();
  for (const unit of units) {
    const normalized = upper(unit);
    if (normalized.includes('OURO VERDE')) ids.add(2);
    if (normalized.includes('CAMBUI') || normalized.includes('CAMBUÍ')) ids.add(3);
    if (normalized.includes('SHOPPING') || normalized.includes('CAMPINAS SHOPPING')) ids.add(12);
  }
  return Array.from(ids).sort((a, b) => a - b);
};

const normalizeScope = (
  userId: string,
  raw?: Partial<Omit<ExecutiveScope, 'updatedAt' | 'updatedBy'>> & { updatedAt?: string | null; updatedBy?: string | null }
): ExecutiveScope => {
  const allowedAreas = new Set(EXECUTIVE_AREAS);
  const areas = unique((raw?.areas || []).map((item) => clean(item).toLowerCase())).filter((item) =>
    allowedAreas.has(item as ExecutiveAreaKey)
  ) as ExecutiveAreaKey[];
  const visibleWidgetKeys = unique((raw?.visibleWidgetKeys || []).map((item) => clean(item))).filter(isWidgetKey);
  const profileKey = isProfileKey(clean(raw?.profileKey)) ? (clean(raw?.profileKey) as ExecutiveProfileKey) : null;
  const resolutionSource = (clean(raw?.resolutionSource) || 'unconfigured') as ExecutiveScopeResolutionSource;
  const derivedAreas = profileKey && visibleWidgetKeys.length ? getVisibleAreasFromWidgets(visibleWidgetKeys) : [];
  const effectiveAreas = derivedAreas.length ? derivedAreas : areas;

  return {
    userId,
    areas: effectiveAreas.length ? effectiveAreas : [...EXECUTIVE_AREAS],
    departments: unique(raw?.departments || []),
    teams: unique(raw?.teams || []),
    units: unique(raw?.units || []),
    profileKey,
    visibleWidgetKeys,
    resolutionSource,
    matchedGroupId: clean((raw as any)?.matchedGroupId) || null,
    matchedGroupKey: clean((raw as any)?.matchedGroupKey) || null,
    matchedGroupLabel: clean((raw as any)?.matchedGroupLabel) || null,
    configurationIssue: clean((raw as any)?.configurationIssue) || null,
    updatedAt: raw?.updatedAt || null,
    updatedBy: raw?.updatedBy || null,
  };
};

const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = clean(value).toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const parseProfileRow = (row: any): ExecutiveProfileDefinition => ({
  key: clean(row.profile_key) as ExecutiveProfileKey,
  label: clean(row.label),
  description: clean(row.description) || null,
  isActive: toBool(row.is_active),
  sortOrder: toNumber(row.sort_order),
});

const parseWidgetRow = (row: any): ExecutiveWidgetDefinition => ({
  key: clean(row.widget_key) as ExecutiveWidgetKey,
  label: clean(row.label),
  areaKey: clean(row.area_key) as ExecutiveAreaKey,
  status: (clean(row.status) || 'planned') as ExecutiveWidgetDefinition['status'],
  sourceKey: clean(row.source_key) || null,
  description: clean(row.description) || null,
  sortOrder: toNumber(row.sort_order),
});

const parseProfileWidgetRow = (row: any): ExecutiveProfileWidgetConfig => ({
  profileKey: clean(row.profile_key) as ExecutiveProfileKey,
  widgetKey: clean(row.widget_key) as ExecutiveWidgetKey,
  isVisible: toBool(row.is_visible),
  sortOrder: toNumber(row.sort_order),
});

const parseGroupRow = (row: any): ExecutiveGroupDefinition => ({
  id: clean(row.id),
  key: clean(row.group_key),
  label: clean(row.label),
  description: clean(row.description) || null,
  defaultProfileKey: clean(row.default_profile_key) as ExecutiveProfileKey,
  scopeMode: isScopeMode(clean(row.scope_mode)) ? (clean(row.scope_mode) as ExecutiveScopeMode) : 'unrestricted',
  departments: parseJsonArray(row.departments_json),
  teams: parseJsonArray(row.teams_json),
  units: parseJsonArray(row.units_json),
  isActive: toBool(row.is_active),
  sortOrder: toNumber(row.sort_order),
  updatedAt: clean(row.updated_at) || null,
  updatedBy: clean(row.updated_by) || null,
});

const parseJobTitleMappingRow = (row: any): ExecutiveJobTitleMapping => ({
  catalogId: clean(row.catalog_id),
  name: clean(row.name),
  normalizedName: clean(row.normalized_name),
  executiveGroupId: clean(row.executive_group_id) || null,
  executiveGroupKey: clean(row.executive_group_key) || null,
  executiveGroupLabel: clean(row.executive_group_label) || null,
  linkedEmployeesCount: toNumber(row.linked_employees_count),
  linkedUsersCount: toNumber(row.linked_users_count),
  isActive: toBool(row.is_active),
});

const parseExceptionRow = (row: any): ExecutiveUserException => ({
  userId: clean(row.user_id),
  profileKeyOverride: isProfileKey(clean(row.profile_key_override))
    ? (clean(row.profile_key_override) as ExecutiveProfileKey)
    : null,
  addedWidgetKeys: parseJsonArray(row.added_widget_keys_json).filter(isWidgetKey),
  hiddenWidgetKeys: parseJsonArray(row.hidden_widget_keys_json).filter(isWidgetKey),
  scopeModeOverride: isScopeMode(clean(row.scope_mode_override))
    ? (clean(row.scope_mode_override) as ExecutiveScopeMode)
    : null,
  departments: parseJsonArray(row.departments_json),
  teams: parseJsonArray(row.teams_json),
  units: parseJsonArray(row.units_json),
  isActive: toBool(row.is_active),
  updatedAt: clean(row.updated_at) || null,
  updatedBy: clean(row.updated_by) || null,
});

const buildResolvedProfile = (
  profileKey: ExecutiveProfileKey | null,
  visibleWidgetKeys: ExecutiveWidgetKey[],
  resolutionSource: ExecutiveScopeResolutionSource,
  matchedGroupId: string | null,
  matchedGroupKey: string | null,
  matchedGroupLabel: string | null,
  configurationIssue: string | null
): ExecutiveResolvedProfile => ({
  profileKey,
  visibleWidgetKeys,
  resolutionSource,
  matchedGroupId,
  matchedGroupKey,
  matchedGroupLabel,
  configurationIssue,
});

const parseSnapshotRow = (row: any): ExecutiveSnapshot => {
  const metrics = JSON.parse(clean(row.metrics_json) || '{}') as ExecutiveMetricsPayload;
  if (!metrics.profile) {
    metrics.profile = buildResolvedProfile(
      isProfileKey(clean((metrics.scope as any)?.profileKey)) ? (clean((metrics.scope as any)?.profileKey) as ExecutiveProfileKey) : null,
      Array.isArray((metrics.scope as any)?.visibleWidgetKeys)
        ? ((metrics.scope as any).visibleWidgetKeys as string[]).filter(isWidgetKey)
        : [],
      ((metrics.scope as any)?.resolutionSource as ExecutiveScopeResolutionSource) || 'unconfigured',
      clean((metrics.scope as any)?.matchedGroupId) || null,
      clean((metrics.scope as any)?.matchedGroupKey) || null,
      clean((metrics.scope as any)?.matchedGroupLabel) || null,
      clean((metrics.scope as any)?.configurationIssue) || null
    );
  }
  return {
    id: clean(row.id),
    userId: clean(row.user_id),
    scopeHash: clean(row.scope_hash),
    status: (clean(row.status) || 'FAILED') as ExecutiveSnapshotStatus,
    metrics,
    aiSummary: null,
    errorMessage: clean(row.error_message) || null,
    createdAt: clean(row.created_at),
    completedAt: clean(row.completed_at) || null,
    requestedBy: clean(row.requested_by) || null,
  };
};

const getSystemHeartbeats = async (db: DbInterface, names: string[]) => {
  const rows = await db.query(
    `
    SELECT service_name, status, last_run, details
    FROM system_status
    WHERE service_name IN (${names.map(() => '?').join(',')})
    `,
    names
  );
  return rows.map((row: any) => ({
    serviceName: clean(row.service_name),
    status: clean(row.status) || 'UNKNOWN',
    lastRun: clean(row.last_run) || null,
    details: clean(row.details) || null,
  })) as ExecutiveLiveHeartbeat[];
};

const getFinancialTotals = async (db: DbInterface, startDate: string, endDate: string, units: string[]) => {
  const hasSummary = await tableExists(db, SUMMARY_TABLE);
  const tableName = hasSummary ? SUMMARY_TABLE : ANALITICO_TABLE;
  const dateColumn = hasSummary ? 'data_ref' : SQL_DATE_ANALITICO;
  const valueColumn = 'total_pago';
  let where = `${dateColumn} BETWEEN ? AND ?`;
  const params: any[] = [startDate, endDate];

  if (units.length) {
    where += ` AND UPPER(TRIM(unidade)) IN (${units.map(() => 'UPPER(TRIM(?))').join(',')})`;
    params.push(...units);
  }

  const rows = await db.query(
    `
    SELECT
      COALESCE(SUM(${valueColumn}), 0) AS total,
      COUNT(*) AS rows_count
    FROM ${tableName}
    WHERE ${where}
    `,
    params
  );
  return {
    total: toNumber(rows[0]?.total),
    rowsCount: toNumber(rows[0]?.rows_count),
  };
};

const getFinancialGoals = async (db: DbInterface) => {
  const today = formatDate(new Date());
  const goals = await db.query(
    `
    SELECT *
    FROM goals_config
    WHERE start_date <= ?
      AND end_date >= ?
    `,
    [today, today]
  );

  const normalized = goals.filter((goal: any) => {
    const kpi = clean(goal.linked_kpi_id).toLowerCase();
    const name = clean(goal.name).toLowerCase();
    const isBilling = kpi === 'revenue' || name.includes('faturamento') || name.includes('receita');
    const isGlobal =
      (!clean(goal.clinic_unit) || clean(goal.clinic_unit).toLowerCase() === 'all') &&
      (!clean(goal.team) || clean(goal.team).toLowerCase() === 'all') &&
      (!clean(goal.collaborator) || clean(goal.collaborator).toLowerCase() === 'all') &&
      (!clean(goal.filter_group) || clean(goal.filter_group).toLowerCase() === 'all');
    return isBilling && isGlobal;
  });

  return {
    daily: normalized.find((goal: any) => clean(goal.periodicity).toLowerCase() === 'daily') || null,
    monthly: normalized.find((goal: any) => clean(goal.periodicity).toLowerCase() === 'monthly') || null,
  };
};

const getProposalSummary = async (db: DbInterface, startDate: string, endDate: string, units: string[]) => {
  let where = 'date BETWEEN ? AND ?';
  const params: any[] = [startDate, endDate];
  if (units.length) {
    where += ` AND UPPER(TRIM(unit_name)) IN (${units.map(() => 'UPPER(TRIM(?))').join(',')})`;
    params.push(...units);
  }
  const wonInSql = WON_STATUSES.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT
      COUNT(*) AS qtd,
      COALESCE(SUM(total_value), 0) AS valor,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN 1 ELSE 0 END), 0) AS won_qtd,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN (${wonInSql}) THEN total_value ELSE 0 END), 0) AS won_value,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = LOWER(TRIM('Aguardando aprovação do cliente')) THEN 1 ELSE 0 END), 0) AS waiting_qtd
    FROM feegow_proposals
    WHERE ${where}
    `,
    [...WON_STATUSES, ...WON_STATUSES, ...params]
  );
  return {
    qtd: toNumber(rows[0]?.qtd),
    valor: toNumber(rows[0]?.valor),
    wonQtd: toNumber(rows[0]?.won_qtd),
    wonValue: toNumber(rows[0]?.won_value),
    waitingQtd: toNumber(rows[0]?.waiting_qtd),
  };
};

const getMedicLive = async (db: DbInterface, units: string[]) => {
  const activeMaxAgeHours = Math.max(1, Number.parseInt(process.env.MEDIC_API_ACTIVE_MAX_AGE_HOURS || '12', 10) || 12);
  const isMysql = String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
  const activeSql = isMysql
    ? `
      SELECT hash_id, unidade, chegada, espera_minutos, status, updated_at
      FROM espera_medica
      WHERE (status IS NULL OR status NOT LIKE 'Finalizado%')
        AND updated_at IS NOT NULL
        AND updated_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ${activeMaxAgeHours} HOUR), '%Y-%m-%d %H:%i:%s')
    `
    : `
      SELECT hash_id, unidade, chegada, espera_minutos, status, updated_at
      FROM espera_medica
      WHERE (status IS NULL OR status NOT LIKE 'Finalizado%')
        AND updated_at IS NOT NULL
        AND datetime(updated_at) >= datetime('now', '-${activeMaxAgeHours} hours')
    `;
  const activeRows = await db.query(activeSql);
  const today = formatDate(new Date());
  const attendedSql = isMysql
    ? `
      SELECT COUNT(*) AS total
      FROM espera_medica
      WHERE status LIKE 'Finalizado%'
        AND DATE(updated_at) = ?
    `
    : `
      SELECT COUNT(*) AS total
      FROM espera_medica
      WHERE status LIKE 'Finalizado%'
        AND date(updated_at) = ?
    `;
  const attendedRows = await db.query(attendedSql, [today]);

  const filteredRows = units.length
    ? (activeRows as any[]).filter((row) => units.includes(clean(row.unidade)))
    : (activeRows as any[]);
  const queueCount = filteredRows.filter((row) => !upper(row.status).includes('ATENDIMENTO')).length;
  const criticalWaitCount = filteredRows.filter((row) => toNumber(row.espera_minutos) >= CRITICAL_WAIT_MINUTES).length;
  const updatedAt = filteredRows.reduce<string | null>((latest, row: any) => {
    const current = clean(row.updated_at);
    if (!current) return latest;
    if (!latest || current > latest) return current;
    return latest;
  }, null);

  return {
    queueCount,
    criticalWaitCount,
    attendedToday: toNumber(attendedRows[0]?.total),
    updatedAt,
  };
};

const getReceptionLive = async (db: DbInterface, units: string[]) => {
  const today = formatDate(new Date());
  const isMysql = String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
  let unitWhere = '';
  const params: any[] = [today];
  if (units.length) {
    unitWhere = ` AND UPPER(TRIM(unidade_nome)) IN (${units.map(() => 'UPPER(TRIM(?))').join(',')})`;
    params.push(...units);
  }
  const sql = isMysql
    ? `
      SELECT
        COUNT(CASE WHEN dt_atendimento IS NULL AND status NOT LIKE 'Finalizado%' THEN 1 END) AS fila,
        CAST(ROUND(AVG(CASE WHEN dt_atendimento IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, dt_chegada, dt_atendimento) END)) AS SIGNED) AS tempo_medio,
        MAX(updated_at) AS updated_at
      FROM recepcao_historico
      WHERE dia_referencia = ?
      ${unitWhere}
    `
    : `
      SELECT
        COUNT(CASE WHEN dt_atendimento IS NULL AND status NOT LIKE 'Finalizado%' THEN 1 END) AS fila,
        CAST(ROUND(AVG(CASE WHEN dt_atendimento IS NOT NULL THEN (julianday(dt_atendimento) - julianday(dt_chegada)) * 1440 END)) AS INTEGER) AS tempo_medio,
        MAX(updated_at) AS updated_at
      FROM recepcao_historico
      WHERE dia_referencia = ?
      ${unitWhere}
    `;
  const rows = await db.query(sql, params);
  return {
    queueCount: toNumber(rows[0]?.fila),
    averageWaitMinutes: toNumber(rows[0]?.tempo_medio),
    updatedAt: clean(rows[0]?.updated_at) || null,
  };
};

const getWhatsappLive = async (db: DbInterface) => {
  const rows = await db.query(
    `
    SELECT group_id, queue_size, updated_at
    FROM clinia_group_snapshots
    WHERE group_id = '__global__'
    LIMIT 1
    `
  );
  return {
    queueCount: toNumber(rows[0]?.queue_size),
    updatedAt: clean(rows[0]?.updated_at) || null,
  };
};

const getFinanceArea = async (db: DbInterface, scope: ExecutiveScope): Promise<ExecutiveAreaBlock> => {
  const { today, weekStart, monthStart, monthEndDay, currentDayOfMonth } = getDateRange();
  const [day, week, month, goals, heartbeats] = await Promise.all([
    getFinancialTotals(db, today, today, scope.units),
    getFinancialTotals(db, weekStart, today, scope.units),
    getFinancialTotals(db, monthStart, today, scope.units),
    getFinancialGoals(db),
    getSystemHeartbeats(db, ['faturamento']),
  ]);

  const monthProjection = currentDayOfMonth > 0 ? (month.total / currentDayOfMonth) * monthEndDay : month.total;
  const monthTarget = goals.monthly ? Number(goals.monthly.target_value || 0) : null;
  const dayTarget = goals.daily ? Number(goals.daily.target_value || 0) : null;
  const monthStatus: ExecutiveIndicatorStatus =
    monthTarget == null || monthTarget <= 0
      ? 'NO_DATA'
      : month.total >= monthTarget
        ? 'SUCCESS'
        : monthProjection >= monthTarget * 0.9
          ? 'WARNING'
          : 'DANGER';

  const indicators: ExecutiveIndicator[] = [
    {
      areaKey: 'financeiro',
      indicatorKey: 'faturamento_hoje',
      label: 'Faturamento hoje',
      format: 'currency',
      currentValue: day.total,
      dayValue: day.total,
      weekValue: week.total,
      monthValue: month.total,
      targetValue: dayTarget,
      projectionValue: day.total,
      status: day.total > 0 ? 'SUCCESS' : 'WARNING',
      trend: inferTrend(day.total, week.total > 0 ? week.total / Math.max(1, currentDayOfMonth) : 0),
      sourceUpdatedAt: heartbeats[0]?.lastRun || null,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: null,
    },
    {
      areaKey: 'financeiro',
      indicatorKey: 'faturamento_mes',
      label: 'Faturamento do mês',
      format: 'currency',
      currentValue: month.total,
      dayValue: day.total,
      weekValue: week.total,
      monthValue: month.total,
      targetValue: monthTarget,
      projectionValue: monthProjection,
      status: monthStatus,
      trend: inferTrend(monthProjection, monthTarget),
      sourceUpdatedAt: heartbeats[0]?.lastRun || null,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: monthTarget ? `Meta mensal ${formatCurrencyCompact(monthTarget)}` : 'Meta mensal não vinculada.',
    },
  ];

  const summary = monthTarget
    ? `Mês em ${formatCurrencyCompact(month.total)} com projeção de ${formatCurrencyCompact(monthProjection)} frente à meta de ${formatCurrencyCompact(monthTarget)}.`
    : `Mês em ${formatCurrencyCompact(month.total)} sem meta mensal global vinculada para comparação executiva.`;

  return {
    areaKey: 'financeiro',
    label: 'Financeiro',
    summary,
    status: worstStatus(indicators.map((item) => item.status)),
    indicators,
    updatedAt: heartbeats[0]?.lastRun || null,
  };
};

const getCommercialArea = async (db: DbInterface, scope: ExecutiveScope): Promise<ExecutiveAreaBlock> => {
  const { today, weekStart, monthStart, monthEndDay, currentDayOfMonth } = getDateRange();
  const [day, week, month, heartbeats] = await Promise.all([
    getProposalSummary(db, today, today, scope.units),
    getProposalSummary(db, weekStart, today, scope.units),
    getProposalSummary(db, monthStart, today, scope.units),
    getSystemHeartbeats(db, ['comercial']),
  ]);

  const monthProjection = currentDayOfMonth > 0 ? (month.valor / currentDayOfMonth) * monthEndDay : month.valor;
  const approvalRate = month.qtd > 0 ? (month.wonQtd / month.qtd) * 100 : null;
  const waitingStatus: ExecutiveIndicatorStatus =
    month.waitingQtd >= 20 ? 'DANGER' : month.waitingQtd >= 8 ? 'WARNING' : 'SUCCESS';

  const indicators: ExecutiveIndicator[] = [
    {
      areaKey: 'comercial',
      indicatorKey: 'propostas_mes',
      label: 'Valor de propostas no mês',
      format: 'currency',
      currentValue: month.valor,
      dayValue: day.valor,
      weekValue: week.valor,
      monthValue: month.valor,
      targetValue: null,
      projectionValue: monthProjection,
      status: month.valor > 0 ? 'SUCCESS' : 'WARNING',
      trend: inferTrend(month.valor, week.valor),
      sourceUpdatedAt: heartbeats[0]?.lastRun || null,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: `${month.qtd} proposta(s) no mês.`,
    },
    {
      areaKey: 'comercial',
      indicatorKey: 'taxa_ganho',
      label: 'Taxa de ganho no mês',
      format: 'percent',
      currentValue: approvalRate,
      dayValue: null,
      weekValue: null,
      monthValue: approvalRate,
      targetValue: null,
      projectionValue: approvalRate,
      status: approvalRate == null ? 'NO_DATA' : approvalRate >= 40 ? 'SUCCESS' : approvalRate >= 25 ? 'WARNING' : 'DANGER',
      trend: 'unknown',
      sourceUpdatedAt: heartbeats[0]?.lastRun || null,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: `${month.wonQtd} proposta(s) ganhas no mês.`,
    },
    {
      areaKey: 'comercial',
      indicatorKey: 'aguardando_cliente',
      label: 'Aguardando aprovação do cliente',
      format: 'number',
      currentValue: month.waitingQtd,
      dayValue: day.waitingQtd,
      weekValue: week.waitingQtd,
      monthValue: month.waitingQtd,
      targetValue: null,
      projectionValue: null,
      status: waitingStatus,
      trend: inferTrend(month.waitingQtd, week.waitingQtd),
      sourceUpdatedAt: heartbeats[0]?.lastRun || null,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: null,
    },
  ];

  return {
    areaKey: 'comercial',
    label: 'Comercial',
    summary: `O comercial soma ${month.qtd} proposta(s) e ${formatCurrencyCompact(month.valor)} no mês, com ${formatPercent(approvalRate)} de ganho.`,
    status: worstStatus(indicators.map((item) => item.status)),
    indicators,
    updatedAt: heartbeats[0]?.lastRun || null,
  };
};

const getOperationsArea = async (db: DbInterface, scope: ExecutiveScope): Promise<{ area: ExecutiveAreaBlock; live: ExecutiveLiveOperations }> => {
  const [medic, reception, whatsapp, heartbeats] = await Promise.all([
    getMedicLive(db, scope.units),
    getReceptionLive(db, scope.units),
    getWhatsappLive(db),
    getSystemHeartbeats(db, ['clinia', 'monitor_medico', 'monitor_recepcao']),
  ]);

  const indicators: ExecutiveIndicator[] = [
    {
      areaKey: 'operacao',
      indicatorKey: 'fila_medica',
      label: 'Fila médica',
      format: 'number',
      currentValue: medic.queueCount,
      dayValue: medic.queueCount,
      weekValue: null,
      monthValue: null,
      targetValue: null,
      projectionValue: null,
      status: medic.queueCount >= 12 ? 'DANGER' : medic.queueCount >= 6 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: medic.updatedAt,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: `${medic.attendedToday} atendimento(s) concluído(s) hoje.`,
    },
    {
      areaKey: 'operacao',
      indicatorKey: 'fila_recepcao',
      label: 'Fila recepção',
      format: 'number',
      currentValue: reception.queueCount,
      dayValue: reception.queueCount,
      weekValue: null,
      monthValue: null,
      targetValue: null,
      projectionValue: null,
      status: reception.queueCount >= 10 ? 'DANGER' : reception.queueCount >= 5 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: reception.updatedAt,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: `Tempo médio atual ${reception.averageWaitMinutes} min.`,
    },
    {
      areaKey: 'operacao',
      indicatorKey: 'whatsapp_digital',
      label: 'WhatsApp digital',
      format: 'number',
      currentValue: whatsapp.queueCount,
      dayValue: whatsapp.queueCount,
      weekValue: null,
      monthValue: null,
      targetValue: null,
      projectionValue: null,
      status: whatsapp.queueCount >= 25 ? 'DANGER' : whatsapp.queueCount >= 10 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: whatsapp.updatedAt,
      scopeApplied: { units: scope.units, departments: [], teams: [] },
      note: 'Pacientes ativos aguardando atendimento no hub.',
    },
  ];

  return {
    area: {
      areaKey: 'operacao',
      label: 'Operação e Atendimento',
      summary: `Filas atuais: médico ${medic.queueCount}, recepção ${reception.queueCount}, WhatsApp ${whatsapp.queueCount}.`,
      status: worstStatus(indicators.map((item) => item.status)),
      indicators,
      updatedAt: heartbeats[0]?.lastRun || medic.updatedAt || reception.updatedAt || whatsapp.updatedAt,
    },
    live: {
      medicQueue: medic.queueCount,
      receptionQueue: reception.queueCount,
      whatsappQueue: whatsapp.queueCount,
      criticalWaitCount: medic.criticalWaitCount,
      attendedToday: medic.attendedToday,
      averageReceptionWaitMinutes: reception.averageWaitMinutes,
      heartbeats,
    },
  };
};

const getPeopleArea = async (db: DbInterface, scope: ExecutiveScope): Promise<ExecutiveAreaBlock> => {
  const [employees, recruitment] = await Promise.all([
    getEmployeeDashboard(db, {
      status: 'all',
      regime: 'all',
      unit: scope.units.length === 1 ? scope.units[0] : 'all',
      department: scope.departments.length === 1 ? scope.departments[0] : 'all',
    }),
    listRecruitmentDashboard(db),
  ]);

  const indicators: ExecutiveIndicator[] = [
    {
      areaKey: 'pessoas',
      indicatorKey: 'quadro_ativo',
      label: 'Quadro ativo',
      format: 'number',
      currentValue: employees.summary.activeCount,
      dayValue: employees.summary.admissionsThisMonth,
      weekValue: null,
      monthValue: employees.summary.activeCount,
      targetValue: null,
      projectionValue: null,
      status: 'SUCCESS',
      trend: inferTrend(employees.summary.admissionsThisMonth, employees.summary.terminationsThisMonth),
      sourceUpdatedAt: employees.generatedAt,
      scopeApplied: { units: scope.units, departments: scope.departments, teams: scope.teams },
      note: `${employees.summary.preAdmissionCount} em pré-admissão.`,
    },
    {
      areaKey: 'pessoas',
      indicatorKey: 'pendencias_documentais',
      label: 'Pendências de pessoas',
      format: 'number',
      currentValue: employees.summary.documentPendingCount + employees.summary.asoPendingCount + employees.summary.asoExpiredCount,
      dayValue: null,
      weekValue: null,
      monthValue: employees.summary.documentPendingCount,
      targetValue: null,
      projectionValue: null,
      status:
        employees.summary.documentPendingCount + employees.summary.asoPendingCount + employees.summary.asoExpiredCount >= 15
          ? 'DANGER'
          : employees.summary.documentPendingCount + employees.summary.asoPendingCount + employees.summary.asoExpiredCount >= 5
            ? 'WARNING'
            : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: employees.generatedAt,
      scopeApplied: { units: scope.units, departments: scope.departments, teams: scope.teams },
      note: `${employees.summary.documentPendingCount} documental, ${employees.summary.asoExpiredCount} ASO vencido(s).`,
    },
    {
      areaKey: 'pessoas',
      indicatorKey: 'recrutamento',
      label: 'Pipeline de recrutamento',
      format: 'number',
      currentValue: recruitment.summary.activeCandidates,
      dayValue: null,
      weekValue: null,
      monthValue: recruitment.summary.totalCandidates,
      targetValue: null,
      projectionValue: null,
      status:
        recruitment.summary.openJobs > 0 && recruitment.summary.managerPendingCandidates === 0 && recruitment.summary.approvedCandidates === 0
          ? 'WARNING'
          : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: null,
      scopeApplied: { units: scope.units, departments: scope.departments, teams: scope.teams },
      note: `${recruitment.summary.openJobs} vaga(s) aberta(s), ${recruitment.summary.managerPendingCandidates} com gerência.`,
    },
  ];

  return {
    areaKey: 'pessoas',
    label: 'Pessoas',
    summary: `Quadro com ${employees.summary.activeCount} ativos, ${employees.summary.documentPendingCount} pendência(s) documental(is) e ${recruitment.summary.openJobs} vaga(s) aberta(s).`,
    status: worstStatus(indicators.map((item) => item.status)),
    indicators,
    updatedAt: employees.generatedAt,
  };
};

const defaultSurveillanceFilters: SurveillanceSummaryFilters = {
  search: '',
  unit: 'all',
  expirationStatus: 'all',
  validFrom: '',
  validTo: '',
  itemType: 'all',
};

const getQualityArea = async (db: DbInterface): Promise<ExecutiveAreaBlock> => {
  const [qms, surveillance] = await Promise.all([
    getQmsOverviewMetrics(db),
    getSurveillanceSummary(db, defaultSurveillanceFilters),
  ]);

  const overdueActions = qms.audits.overdueActions;
  const expiredItems = surveillance.cards.expiredItems;
  const alertItems = surveillance.cards.alertItems + surveillance.cards.expiringItems;

  const indicators: ExecutiveIndicator[] = [
    {
      areaKey: 'qualidade',
      indicatorKey: 'documentos_qms',
      label: 'Documentos QMS em alerta',
      format: 'number',
      currentValue: qms.documents.aVencer + qms.documents.vencido,
      dayValue: null,
      weekValue: null,
      monthValue: qms.documents.total,
      targetValue: null,
      projectionValue: null,
      status: qms.documents.vencido > 0 ? 'DANGER' : qms.documents.aVencer > 0 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: qms.generatedAt,
      scopeApplied: { units: [], departments: [], teams: [] },
      note: `${qms.documents.vigente} vigente(s).`,
    },
    {
      areaKey: 'qualidade',
      indicatorKey: 'auditorias',
      label: 'Auditorias e ações',
      format: 'number',
      currentValue: qms.audits.abertas + qms.audits.emTratativa,
      dayValue: null,
      weekValue: null,
      monthValue: qms.audits.total,
      targetValue: null,
      projectionValue: null,
      status: overdueActions > 0 ? 'DANGER' : qms.audits.abertas > 0 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: qms.generatedAt,
      scopeApplied: { units: [], departments: [], teams: [] },
      note: `${overdueActions} ação(ões) vencida(s).`,
    },
    {
      areaKey: 'qualidade',
      indicatorKey: 'regulatorio',
      label: 'Riscos regulatórios',
      format: 'number',
      currentValue: expiredItems + alertItems,
      dayValue: null,
      weekValue: null,
      monthValue: surveillance.cards.totalLicenses + surveillance.cards.totalDocuments,
      targetValue: null,
      projectionValue: null,
      status: expiredItems > 0 ? 'DANGER' : alertItems > 0 ? 'WARNING' : 'SUCCESS',
      trend: 'unknown',
      sourceUpdatedAt: qms.generatedAt,
      scopeApplied: { units: [], departments: [], teams: [] },
      note: `${surveillance.cards.totalLicenses} licença(s), ${surveillance.cards.totalDocuments} documento(s).`,
    },
  ];

  return {
    areaKey: 'qualidade',
    label: 'Qualidade',
    summary: `Qualidade com ${qms.audits.abertas + qms.audits.emTratativa} auditoria(s) ativa(s) e ${expiredItems + alertItems} item(ns) regulatório(s) em atenção.`,
    status: worstStatus(indicators.map((item) => item.status)),
    indicators,
    updatedAt: qms.generatedAt,
  };
};

const buildExecutiveSummary = (areas: ExecutiveAreaBlock[]) => {
  if (!areas.length) {
    return 'Sua visão executiva ainda não foi configurada para este cargo ou usuário.';
  }
  const dangerAreas = areas.filter((area) => area.status === 'DANGER');
  const warningAreas = areas.filter((area) => area.status === 'WARNING');
  if (dangerAreas.length) {
    return `A operação exige atenção imediata em ${dangerAreas.map((area) => area.label).join(', ')}.`;
  }
  if (warningAreas.length) {
    return `O painel executivo indica atenção moderada em ${warningAreas.map((area) => area.label).join(', ')}.`;
  }
  return 'Os principais blocos executivos estão estáveis neste momento.';
};

const buildTopPriorities = (areas: ExecutiveAreaBlock[]): ExecutivePriority[] => {
  return areas
    .flatMap((area) =>
      area.indicators
        .filter((indicator) => indicator.status === 'DANGER' || indicator.status === 'WARNING')
        .map((indicator): ExecutivePriority => ({
          areaKey: area.areaKey,
          title: `${area.label}: ${indicator.label}`,
          description: indicator.note || area.summary,
          severity: indicator.status === 'DANGER' ? 'high' : 'medium',
        }))
    )
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
    .slice(0, 5);
};

const buildAppointmentsWhere = (scope: ExecutiveScope, startDate: string, endDate: string) => {
  let whereSql = 'WHERE f.scheduled_at BETWEEN ? AND ?';
  const params: unknown[] = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const unitIds = unitIdsFromScope(scope.units);

  if (unitIds.length) {
    const patternsById: Record<number, string[]> = {
      2: ['OURO VERDE'],
      3: ['CENTRO CAMBUI', 'CENTRO CAMBUÍ'],
      12: ['CAMPINAS SHOPPING', 'SHOPPING CAMPINAS'],
    };
    const patterns = unitIds.flatMap((unitId) => patternsById[unitId] || []);
    if (patterns.length) {
      whereSql += ` AND (${patterns.map(() => 'UPPER(TRIM(f.unit_name)) LIKE ?').join(' OR ')})`;
      params.push(...patterns.map((pattern) => `%${pattern}%`));
    }
  }

  return { whereSql, params };
};

const aggregateAgendaDailyRows = (
  rows: Array<{
    dataRef: string;
    unidadeId: number;
    especialidadeId: number;
    agendamentosCount: number;
    horariosDisponiveisCount: number;
    horariosBloqueadosCount: number;
    capacidadeLiquidaCount: number;
    updatedAt: string;
  }>
) => {
  const total = rows.reduce(
    (acc, row) => {
      acc.agendamentos += toNumber(row.agendamentosCount);
      acc.horariosDisponiveis += toNumber(row.horariosDisponiveisCount);
      acc.horariosBloqueados += toNumber(row.horariosBloqueadosCount);
      acc.capacidadeLiquida += toNumber(row.capacidadeLiquidaCount);
      return acc;
    },
    {
      agendamentos: 0,
      horariosDisponiveis: 0,
      horariosBloqueados: 0,
      capacidadeLiquida: 0,
    }
  );

  return {
    ...total,
    taxaOcupacao: total.capacidadeLiquida > 0 ? (total.agendamentos * 100) / total.capacidadeLiquida : 0,
    especialidades: new Set(rows.map((row) => `${row.unidadeId}-${row.especialidadeId}`)).size,
    updatedAt: rows
      .map((row) => clean(row.updatedAt))
      .filter(Boolean)
      .sort()
      .at(-1) || null,
  };
};

const getAgendaConfirmationWidget = async (db: DbInterface, scope: ExecutiveScope) => {
  const { today, monthStart } = getDateRange();
  const { whereSql, params } = buildAppointmentsWhere(scope, monthStart, today);
  const rows = await db.query(
    `
    SELECT
      COUNT(*) as total_periodo,
      SUM(CASE WHEN status_id IN (3,7) THEN 1 ELSE 0 END) as confirmados_periodo,
      SUM(CASE WHEN f.scheduled_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as total_hoje,
      SUM(CASE WHEN f.scheduled_at BETWEEN ? AND ? AND status_id IN (3,7) THEN 1 ELSE 0 END) as confirmados_hoje
    FROM feegow_appointments f
    ${whereSql}
    `,
    [`${today} 00:00:00`, `${today} 23:59:59`, `${today} 00:00:00`, `${today} 23:59:59`, ...params]
  );
  const heartbeatRows = await getSystemHeartbeats(db, ['appointments', 'agendamentos']);
  const base = rows[0] || {};
  const totalPeriodo = toNumber((base as any).total_periodo);
  const confirmadosPeriodo = toNumber((base as any).confirmados_periodo);
  const totalHoje = toNumber((base as any).total_hoje);
  const confirmadosHoje = toNumber((base as any).confirmados_hoje);
  const taxaPeriodo = totalPeriodo > 0 ? (confirmadosPeriodo * 100) / totalPeriodo : 0;
  const taxaHoje = totalHoje > 0 ? (confirmadosHoje * 100) / totalHoje : 0;
  const status: ExecutiveIndicatorStatus =
    totalPeriodo === 0 ? 'NO_DATA' : taxaPeriodo >= 70 ? 'SUCCESS' : taxaPeriodo >= 50 ? 'WARNING' : 'DANGER';

  return buildSummaryWidget(
    'confirmacao_agendas',
    status,
    heartbeatRows[0]?.lastRun || null,
    [
      buildWidgetValue('Taxa no mês', `${formatPercentCompact(taxaPeriodo)}%`),
      buildWidgetValue('Confirmados', new Intl.NumberFormat('pt-BR').format(confirmadosPeriodo)),
      buildWidgetValue('Hoje', `${confirmadosHoje}/${totalHoje || 0}`),
      buildWidgetValue('Taxa hoje', `${formatPercentCompact(taxaHoje)}%`),
    ],
    totalPeriodo > 0
      ? `${confirmadosPeriodo} agendamento(s) confirmados no período atual considerado pelo dashboard.`
      : 'Ainda não há agendamentos suficientes no período para calcular a taxa de confirmação.'
  );
};

const getAgendaWidgets = async (db: DbInterface, scope: ExecutiveScope) => {
  const { today, weekStart, monthStart } = getDateRange();
  const unitIds = unitIdsFromScope(scope.units);
  const heartbeat = await getAgendaOcupacaoHeartbeat(db);
  const dailyRows = await listAgendaOcupacaoDailyRows(db, {
    startDate: monthStart,
    endDate: today,
    unitId: 'all',
  });

  const scopedRows = unitIds.length ? dailyRows.filter((row) => unitIds.includes(row.unidadeId)) : dailyRows;
  const todayRows = scopedRows.filter((row) => row.dataRef === today);
  const weekRows = scopedRows.filter((row) => row.dataRef >= weekStart);
  const monthRows = scopedRows;

  const todayAggregate = aggregateAgendaDailyRows(todayRows);
  const weekAggregate = aggregateAgendaDailyRows(weekRows);
  const monthAggregate = aggregateAgendaDailyRows(monthRows);

  const occupancyStatus: ExecutiveIndicatorStatus =
    monthAggregate.capacidadeLiquida === 0
      ? 'NO_DATA'
      : monthAggregate.taxaOcupacao >= 80
        ? 'SUCCESS'
        : monthAggregate.taxaOcupacao >= 60
          ? 'WARNING'
          : 'DANGER';

  return [
    buildSummaryWidget(
      'ocupacao_agendas',
      occupancyStatus,
      heartbeat.lastRun || monthAggregate.updatedAt,
      [
        buildWidgetValue('Ocupação', `${formatPercentCompact(monthAggregate.taxaOcupacao)}%`),
        buildWidgetValue('Agendados', new Intl.NumberFormat('pt-BR').format(monthAggregate.agendamentos)),
        buildWidgetValue('Livres', new Intl.NumberFormat('pt-BR').format(monthAggregate.horariosDisponiveis)),
        buildWidgetValue('Bloqueados', new Intl.NumberFormat('pt-BR').format(monthAggregate.horariosBloqueados)),
      ],
      monthAggregate.capacidadeLiquida > 0
        ? `Base ofertável de ${new Intl.NumberFormat('pt-BR').format(monthAggregate.capacidadeLiquida)} horários no mês atual.`
        : 'Ainda não há base de ocupação disponível para o recorte atual.'
    ),
    buildSummaryWidget(
      'mapa_diario_agendas',
      todayAggregate.capacidadeLiquida === 0 ? 'NO_DATA' : occupancyStatus,
      heartbeat.lastRun || todayAggregate.updatedAt,
      [
        buildWidgetValue('Hoje', `${formatPercentCompact(todayAggregate.taxaOcupacao)}%`),
        buildWidgetValue('Agendados', new Intl.NumberFormat('pt-BR').format(todayAggregate.agendamentos)),
        buildWidgetValue('Livres', new Intl.NumberFormat('pt-BR').format(todayAggregate.horariosDisponiveis)),
        buildWidgetValue('Especialidades', new Intl.NumberFormat('pt-BR').format(todayAggregate.especialidades)),
      ],
      todayAggregate.capacidadeLiquida > 0
        ? 'Leitura diária da distribuição da agenda para priorização imediata.'
        : 'Sem mapa diário disponível para a data atual.'
    ),
    buildSummaryWidget(
      'mapa_semanal_agendas',
      weekAggregate.capacidadeLiquida === 0 ? 'NO_DATA' : occupancyStatus,
      heartbeat.lastRun || weekAggregate.updatedAt,
      [
        buildWidgetValue('Semana', `${formatPercentCompact(weekAggregate.taxaOcupacao)}%`),
        buildWidgetValue('Agendados', new Intl.NumberFormat('pt-BR').format(weekAggregate.agendamentos)),
        buildWidgetValue('Livres', new Intl.NumberFormat('pt-BR').format(weekAggregate.horariosDisponiveis)),
        buildWidgetValue('Especialidades', new Intl.NumberFormat('pt-BR').format(weekAggregate.especialidades)),
      ],
      weekAggregate.capacidadeLiquida > 0
        ? 'Consolidado semanal da agenda para leitura de distribuição e capacidade.'
        : 'Sem dados suficientes para montar o mapa semanal no recorte atual.'
    ),
  ].filter(Boolean) as ExecutiveWidgetSnapshot[];
};

const getBirthdaysWidget = async (db: DbInterface, scope: ExecutiveScope) => {
  const employees = await getEmployeeDashboard(db, {
    status: 'all',
    regime: 'all',
    unit: scope.units.length === 1 ? scope.units[0] : 'all',
    department: scope.departments.length === 1 ? scope.departments[0] : 'all',
  });
  const today = getDateRange().today;
  const birthdaysToday = employees.birthdaysThisMonth.filter((person) => clean(person.date).slice(5) === today.slice(5));
  const nextNames = birthdaysToday.slice(0, 3).map((person) => person.fullName);
  const status: ExecutiveIndicatorStatus = birthdaysToday.length ? 'SUCCESS' : 'NO_DATA';

  return buildSummaryWidget(
    'aniversariantes_dia',
    status,
    employees.generatedAt,
    [
      buildWidgetValue('Hoje', new Intl.NumberFormat('pt-BR').format(birthdaysToday.length)),
      buildWidgetValue('Mês', new Intl.NumberFormat('pt-BR').format(employees.birthdaysThisMonth.length)),
      buildWidgetValue('Próx. 30 dias', new Intl.NumberFormat('pt-BR').format(employees.birthdaysNext30.length)),
    ],
    birthdaysToday.length
      ? `Aniversariantes do dia: ${nextNames.join(', ')}${birthdaysToday.length > nextNames.length ? '...' : ''}`
      : 'Nenhum aniversariante dentro do recorte configurado para hoje.'
  );
};

const getMarketingWidgets = async (db: DbInterface) => {
  const currentMonthRef = getDateRange().today.slice(0, 7);
  const [controleSummary, funnelSummary] = await Promise.all([
    getMarketingControleSummary(db, { monthRef: currentMonthRef, brand: 'consultare' }),
    getMarketingFunnelSummary(db, { periodRef: currentMonthRef, brand: 'consultare' }),
  ]);

  const googleStatus: ExecutiveIndicatorStatus =
    !controleSummary.hasAnyData ? 'NO_DATA' : controleSummary.cards.visitors > 0 ? 'SUCCESS' : 'WARNING';
  const adsStatus: ExecutiveIndicatorStatus =
    !controleSummary.hasAnyData ? 'NO_DATA' : controleSummary.cards.googleSpend > 0 ? 'SUCCESS' : 'WARNING';
  const conversionRate = funnelSummary.performanceFunnel.contactToAppointmentRate || 0;
  const conversionStatus: ExecutiveIndicatorStatus =
    !controleSummary.hasAnyData
      ? 'NO_DATA'
      : conversionRate >= 20
        ? 'SUCCESS'
        : conversionRate >= 10
          ? 'WARNING'
          : 'DANGER';

  return [
    buildSummaryWidget(
      'google',
      googleStatus,
      funnelSummary.lastSyncAt,
      [
        buildWidgetValue('Visitantes', new Intl.NumberFormat('pt-BR').format(controleSummary.cards.visitors)),
        buildWidgetValue('Cliques WhatsApp', new Intl.NumberFormat('pt-BR').format(controleSummary.cards.whatsappClicks)),
        buildWidgetValue('Novos contatos', new Intl.NumberFormat('pt-BR').format(controleSummary.cards.cliniaNewContacts)),
      ],
      controleSummary.hasAnyData
        ? 'Leitura consolidada do tráfego e das entradas digitais associadas ao Google.'
        : 'Ainda não há dados consolidados de Google para o mês atual.'
    ),
    buildSummaryWidget(
      'investimento_ads',
      adsStatus,
      funnelSummary.lastSyncAt,
      [
        buildWidgetValue('Investimento', formatCurrencyCompact(controleSummary.cards.googleSpend)),
        buildWidgetValue(
          'Custo por contato',
          controleSummary.cards.costPerNewContact == null ? '—' : formatCurrencyCompact(controleSummary.cards.costPerNewContact)
        ),
        buildWidgetValue(
          'Custo por agendamento',
          controleSummary.cards.costPerAppointment == null ? '—' : formatCurrencyCompact(controleSummary.cards.costPerAppointment)
        ),
      ],
      controleSummary.hasAnyData
        ? 'Resumo financeiro da mídia paga no mês corrente.'
        : 'Sem dados suficientes de investimento em mídia para este período.'
    ),
    buildSummaryWidget(
      'faturamento_campanha_conversao',
      conversionStatus,
      funnelSummary.lastSyncAt,
      [
        buildWidgetValue('Contatos Google', new Intl.NumberFormat('pt-BR').format(funnelSummary.performanceFunnel.googleContactsReceived)),
        buildWidgetValue('Novos contatos', new Intl.NumberFormat('pt-BR').format(funnelSummary.performanceFunnel.googleNewContacts)),
        buildWidgetValue('Agendamentos', new Intl.NumberFormat('pt-BR').format(funnelSummary.performanceFunnel.googleAppointmentsConverted)),
        buildWidgetValue('Conversão', `${formatPercentCompact(conversionRate)}%`),
      ],
      controleSummary.hasAnyData
        ? 'Relaciona investimento, entradas digitais e conversão em agendamentos confirmados pelo funil.'
        : 'Sem base suficiente para calcular a conversão entre campanhas e agendamentos.'
    ),
  ].filter(Boolean) as ExecutiveWidgetSnapshot[];
};

const getTasksWidget = async (db: DbInterface, scope: ExecutiveScope) => {
  const viewer: TaskViewerContext = {
    userId: scope.userId,
    canViewAll: scope.profileKey === 'diretoria_gerencia_adm',
  };
  const summary = await getTaskDashboardSummary(db, viewer);
  const openTasks = summary.byStatus
    .filter((item) => item.status !== 'CONCLUIDA' && item.status !== 'CANCELADA')
    .reduce((total, item) => total + item.count, 0);

  const status: ExecutiveIndicatorStatus =
    summary.overdueTasks > 0
      ? 'DANGER'
      : summary.awaitingApprovalTasks > 0 || summary.dueSoonTasks > 0
        ? 'WARNING'
        : openTasks > 0 || summary.approvedTasks > 0
          ? 'SUCCESS'
          : 'NO_DATA';

  const note =
    viewer.canViewAll
      ? 'Resumo consolidado de tarefas do ambiente inteiro, alinhado com a governança global do painel.'
      : 'Resumo das tarefas visíveis dentro do seu escopo executivo atual.';

  return buildSummaryWidget(
    'tarefas',
    status,
    new Date().toISOString(),
    [
      buildWidgetValue('Abertas', new Intl.NumberFormat('pt-BR').format(openTasks)),
      buildWidgetValue('Vencidas', new Intl.NumberFormat('pt-BR').format(summary.overdueTasks)),
      buildWidgetValue('A vencer', new Intl.NumberFormat('pt-BR').format(summary.dueSoonTasks)),
      buildWidgetValue('Aguardando aprovação', new Intl.NumberFormat('pt-BR').format(summary.awaitingApprovalTasks)),
      buildWidgetValue('Aprovadas', new Intl.NumberFormat('pt-BR').format(summary.approvedTasks)),
    ],
    note
  );
};

const buildExecutiveWidgets = async (
  db: DbInterface,
  scope: ExecutiveScope,
  areas: ExecutiveAreaBlock[]
): Promise<ExecutiveWidgetSnapshot[]> => {
  const indicatorMap = new Map(areas.flatMap((area) => area.indicators).map((indicator) => [indicator.indicatorKey, indicator]));
  const availableKeys = getVisibleAvailableWidgets(scope.visibleWidgetKeys);
  const widgets: ExecutiveWidgetSnapshot[] = [];

  const indicatorKeyMap: Partial<Record<ExecutiveWidgetKey, string>> = {
    faturamento_hoje_meta: 'faturamento_hoje',
    faturamento_mes_meta: 'faturamento_mes',
    propostas_aberto: 'aguardando_cliente',
    demanda_whatsapp: 'whatsapp_digital',
    documentos_equipamentos_vencendo: 'documentos_qms',
  };

  for (const widgetKey of availableKeys) {
    const indicatorKey = indicatorKeyMap[widgetKey];
    if (!indicatorKey) continue;
    const indicator = indicatorMap.get(indicatorKey);
    const widget = indicator ? buildIndicatorWidget(widgetKey, indicator) : null;
    if (widget) widgets.push(widget);
  }

  if (availableKeys.includes('monitoramento_filas')) {
    const liveArea = areas.find((area) => area.areaKey === 'operacao');
    const widget = buildSummaryWidget(
      'monitoramento_filas',
      liveArea?.status || 'NO_DATA',
      liveArea?.updatedAt || null,
      [
        buildWidgetValue('Fila médica', new Intl.NumberFormat('pt-BR').format(indicatorMap.get('fila_medica')?.currentValue || 0)),
        buildWidgetValue('Fila recepção', new Intl.NumberFormat('pt-BR').format(indicatorMap.get('fila_recepcao')?.currentValue || 0)),
        buildWidgetValue('WhatsApp', new Intl.NumberFormat('pt-BR').format(indicatorMap.get('whatsapp_digital')?.currentValue || 0)),
      ],
      'Visão consolidada das filas críticas do momento para priorização operacional.'
    );
    if (widget) widgets.push(widget);
  }

  if (availableKeys.some((key) => ['ocupacao_agendas', 'mapa_diario_agendas', 'mapa_semanal_agendas'].includes(key))) {
    const agendaWidgets = await getAgendaWidgets(db, scope);
    widgets.push(...agendaWidgets.filter((widget) => availableKeys.includes(widget.key)));
  }

  if (availableKeys.includes('confirmacao_agendas')) {
    const confirmationWidget = await getAgendaConfirmationWidget(db, scope);
    if (confirmationWidget) widgets.push(confirmationWidget);
  }

  if (availableKeys.includes('aniversariantes_dia')) {
    const birthdaysWidget = await getBirthdaysWidget(db, scope);
    if (birthdaysWidget) widgets.push(birthdaysWidget);
  }

  if (availableKeys.some((key) => ['google', 'investimento_ads', 'faturamento_campanha_conversao'].includes(key))) {
    const marketingWidgets = await getMarketingWidgets(db);
    widgets.push(...marketingWidgets.filter((widget) => availableKeys.includes(widget.key)));
  }

  if (availableKeys.includes('tarefas')) {
    const tasksWidget = await getTasksWidget(db, scope);
    if (tasksWidget) widgets.push(tasksWidget);
  }

  const definitionOrder = new Map(EXECUTIVE_WIDGET_DEFINITIONS.map((item) => [item.key, item.sortOrder]));
  return widgets.sort((a, b) => (definitionOrder.get(a.key) || 9999) - (definitionOrder.get(b.key) || 9999));
};

export const ensureExecutiveTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_scopes (
      user_id VARCHAR(64) PRIMARY KEY,
      areas_json LONGTEXT NOT NULL,
      departments_json LONGTEXT NULL,
      teams_json LONGTEXT NULL,
      units_json LONGTEXT NULL,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_snapshots (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      scope_hash VARCHAR(128) NOT NULL,
      metrics_json LONGTEXT NOT NULL,
      ai_summary_json LONGTEXT NULL,
      status VARCHAR(20) NOT NULL,
      error_message TEXT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT NULL,
      requested_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_profiles (
      profile_key VARCHAR(80) PRIMARY KEY,
      label VARCHAR(160) NOT NULL,
      description TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_widgets (
      widget_key VARCHAR(80) PRIMARY KEY,
      label VARCHAR(180) NOT NULL,
      area_key VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL,
      source_key VARCHAR(120) NULL,
      description TEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_profile_widgets (
      profile_key VARCHAR(80) NOT NULL,
      widget_key VARCHAR(80) NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (profile_key, widget_key)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_groups (
      id VARCHAR(64) PRIMARY KEY,
      group_key VARCHAR(80) NOT NULL,
      label VARCHAR(160) NOT NULL,
      description TEXT NULL,
      default_profile_key VARCHAR(80) NOT NULL,
      scope_mode VARCHAR(60) NOT NULL DEFAULT 'unrestricted',
      departments_json LONGTEXT NULL,
      teams_json LONGTEXT NULL,
      units_json LONGTEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_user_exceptions (
      user_id VARCHAR(64) PRIMARY KEY,
      profile_key_override VARCHAR(80) NULL,
      added_widget_keys_json LONGTEXT NULL,
      hidden_widget_keys_json LONGTEXT NULL,
      scope_mode_override VARCHAR(60) NULL,
      departments_json LONGTEXT NULL,
      teams_json LONGTEXT NULL,
      units_json LONGTEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE employee_job_titles ADD COLUMN executive_group_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN department_catalog_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE employees ADD COLUMN job_title_catalog_id VARCHAR(64) NULL`);

  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_snapshots_user_scope ON dashboard_executive_snapshots (user_id, scope_hash)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_snapshots_created_at ON dashboard_executive_snapshots (created_at)');
  } catch {}
  try {
    await db.execute('CREATE UNIQUE INDEX idx_dashboard_executive_groups_key ON dashboard_executive_groups (group_key)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_groups_profile ON dashboard_executive_groups (default_profile_key, is_active)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_employee_job_titles_group ON employee_job_titles (executive_group_id)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_employees_department_catalog ON employees (department_catalog_id)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_employees_job_title_catalog ON employees (job_title_catalog_id)');
  } catch {}

  for (const profile of EXECUTIVE_PROFILE_DEFINITIONS) {
    await db.execute(
      `
      INSERT OR IGNORE INTO dashboard_executive_profiles
        (profile_key, label, description, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?)
      `,
      [profile.key, profile.label, profile.description, profile.isActive ? 1 : 0, profile.sortOrder]
    );
  }

  for (const widget of EXECUTIVE_WIDGET_DEFINITIONS) {
    await db.execute(
      `
      INSERT OR IGNORE INTO dashboard_executive_widgets
        (widget_key, label, area_key, status, source_key, description, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `,
      [widget.key, widget.label, widget.areaKey, widget.status, widget.sourceKey, widget.description, widget.sortOrder]
    );
  }

  for (const group of EXECUTIVE_GROUP_SEEDS) {
    await db.execute(
      `
      INSERT OR IGNORE INTO dashboard_executive_groups
        (id, group_key, label, description, default_profile_key, scope_mode, departments_json, teams_json, units_json, is_active, sort_order, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        group.key,
        group.label,
        group.description,
        group.defaultProfileKey,
        group.scopeMode,
        JSON.stringify(group.departments),
        JSON.stringify(group.teams),
        JSON.stringify(group.units),
        group.isActive ? 1 : 0,
        group.sortOrder,
        NOW(),
        null,
      ]
    );
  }

  for (const profileWidget of EXECUTIVE_PROFILE_WIDGET_DEFAULTS) {
    await db.execute(
      `
      INSERT OR IGNORE INTO dashboard_executive_profile_widgets
        (profile_key, widget_key, is_visible, sort_order)
      VALUES (?, ?, ?, ?)
      `,
      [
        profileWidget.profileKey,
        profileWidget.widgetKey,
        profileWidget.isVisible ? 1 : 0,
        profileWidget.sortOrder,
      ]
    );
  }

  tablesEnsured = true;
};

export const listExecutiveProfiles = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT profile_key, label, description, is_active, sort_order
    FROM dashboard_executive_profiles
    ORDER BY sort_order ASC, label ASC
    `
  );
  return rows.map(parseProfileRow);
};

export const listExecutiveWidgets = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT widget_key, label, area_key, status, source_key, description, sort_order
    FROM dashboard_executive_widgets
    WHERE is_active = 1
    ORDER BY sort_order ASC, label ASC
    `
  );
  return rows.map(parseWidgetRow);
};

export const listExecutiveProfileWidgets = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT profile_key, widget_key, is_visible, sort_order
    FROM dashboard_executive_profile_widgets
    ORDER BY profile_key ASC, sort_order ASC
    `
  );
  return rows.map(parseProfileWidgetRow);
};

export const listExecutiveGroups = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT id, group_key, label, description, default_profile_key, scope_mode, departments_json, teams_json, units_json, is_active, sort_order, updated_at, updated_by
    FROM dashboard_executive_groups
    ORDER BY sort_order ASC, label ASC
    `
  );
  return rows.map(parseGroupRow);
};

const syncExecutiveCatalogLinks = async (db: DbInterface) => {
  await db.execute(`
    UPDATE employees e
    LEFT JOIN employee_departments d ON LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(e.department, ''), 'á', 'a'), 'ã', 'a'), 'ç', 'c'))) = LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(d.name, ''), 'á', 'a'), 'ã', 'a'), 'ç', 'c')))
    SET e.department_catalog_id = d.id
    WHERE COALESCE(e.department_catalog_id, '') = '' AND COALESCE(e.department, '') <> ''
  `).catch(() => {});
  await db.execute(`
    UPDATE employees e
    LEFT JOIN employee_job_titles jt ON LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(e.job_title, ''), 'á', 'a'), 'ã', 'a'), 'ç', 'c'))) = LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(jt.name, ''), 'á', 'a'), 'ã', 'a'), 'ç', 'c')))
    SET e.job_title_catalog_id = jt.id
    WHERE COALESCE(e.job_title_catalog_id, '') = '' AND COALESCE(e.job_title, '') <> ''
  `).catch(() => {});
};

export const listExecutiveJobTitleMappings = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  await syncExecutiveCatalogLinks(db);
  const rows = await db.query(
    `
    SELECT
      jt.id AS catalog_id,
      jt.name,
      jt.normalized_name,
      jt.executive_group_id,
      g.group_key AS executive_group_key,
      g.label AS executive_group_label,
      jt.is_active,
      COUNT(DISTINCT e.id) AS linked_employees_count,
      COUNT(DISTINCT u.id) AS linked_users_count
    FROM employee_job_titles jt
    LEFT JOIN dashboard_executive_groups g ON g.id = jt.executive_group_id
    LEFT JOIN employees e ON e.job_title_catalog_id = jt.id
    LEFT JOIN users u ON ${userEmployeeJoinClause()}
    GROUP BY jt.id, jt.name, jt.normalized_name, jt.executive_group_id, g.group_key, g.label, jt.is_active
    ORDER BY jt.name ASC
    `
  );
  return rows.map(parseJobTitleMappingRow);
};

export const listExecutiveUserExceptions = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT user_id, profile_key_override, added_widget_keys_json, hidden_widget_keys_json, scope_mode_override, departments_json, teams_json, units_json, is_active, updated_at, updated_by
    FROM dashboard_executive_user_exceptions
    ORDER BY updated_at DESC, user_id ASC
    `
  );
  return rows.map(parseExceptionRow);
};

export const getExecutiveConfigurationSnapshot = async (db: DbInterface): Promise<ExecutiveConfigurationSnapshot> => {
  const [profiles, widgets, profileWidgets, groups, jobTitles, userExceptions] = await Promise.all([
    listExecutiveProfiles(db),
    listExecutiveWidgets(db),
    listExecutiveProfileWidgets(db),
    listExecutiveGroups(db),
    listExecutiveJobTitleMappings(db),
    listExecutiveUserExceptions(db),
  ]);
  return { profiles, widgets, profileWidgets, groups, jobTitles, userExceptions };
};

export const saveExecutiveConfigurationSnapshot = async (
  db: DbInterface,
  input: ExecutiveConfigurationSnapshot,
  updatedBy: string
) => {
  await ensureExecutiveTables(db);
  const profilesByKey = new Set(EXECUTIVE_PROFILE_DEFINITIONS.map((profile) => profile.key));
  const widgetsByKey = new Set(EXECUTIVE_WIDGET_DEFINITIONS.map((widget) => widget.key));
  const timestamp = new Date().toISOString();

  const normalizedProfileWidgets = input.profileWidgets
    .filter((item) => profilesByKey.has(item.profileKey) && widgetsByKey.has(item.widgetKey))
    .map((item) => ({
      profileKey: item.profileKey,
      widgetKey: item.widgetKey,
      isVisible: Boolean(item.isVisible),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 1000,
    }));

  const normalizedGroups = input.groups
    .filter((item) => clean(item.id) && clean(item.key) && profilesByKey.has(item.defaultProfileKey))
    .map((item) => ({
      id: clean(item.id),
      key: clean(item.key),
      label: clean(item.label) || clean(item.key),
      description: clean(item.description) || null,
      defaultProfileKey: item.defaultProfileKey,
      scopeMode: isScopeMode(clean(item.scopeMode)) ? item.scopeMode : 'unrestricted',
      departments: unique(item.departments || []),
      teams: unique(item.teams || []),
      units: unique(item.units || []),
      isActive: item.isActive !== false,
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0,
    }));

  const normalizedJobTitles = input.jobTitles
    .filter((item) => clean(item.catalogId))
    .map((item) => ({
      catalogId: clean(item.catalogId),
      executiveGroupId: clean(item.executiveGroupId) || null,
    }));

  const normalizedExceptions = input.userExceptions
    .filter((item) => clean(item.userId))
    .map((item) => ({
      userId: clean(item.userId),
      profileKeyOverride: item.profileKeyOverride && profilesByKey.has(item.profileKeyOverride) ? item.profileKeyOverride : null,
      addedWidgetKeys: unique(item.addedWidgetKeys || []).filter(isWidgetKey),
      hiddenWidgetKeys: unique(item.hiddenWidgetKeys || []).filter(isWidgetKey),
      scopeModeOverride: item.scopeModeOverride && isScopeMode(item.scopeModeOverride) ? item.scopeModeOverride : null,
      departments: unique(item.departments || []),
      teams: unique(item.teams || []),
      units: unique(item.units || []),
      isActive: item.isActive !== false,
    }))
    .filter((item) => item.isActive && (item.profileKeyOverride || item.addedWidgetKeys.length || item.hiddenWidgetKeys.length || item.scopeModeOverride));

  await runInTransaction(db, async (txDb) => {
    await txDb.execute('DELETE FROM dashboard_executive_profile_widgets');
    for (const item of normalizedProfileWidgets) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_profile_widgets
          (profile_key, widget_key, is_visible, sort_order)
        VALUES (?, ?, ?, ?)
        `,
        [item.profileKey, item.widgetKey, item.isVisible ? 1 : 0, item.sortOrder]
      );
    }

    await txDb.execute('DELETE FROM dashboard_executive_groups');
    for (const item of normalizedGroups) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_groups
          (id, group_key, label, description, default_profile_key, scope_mode, departments_json, teams_json, units_json, is_active, sort_order, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.id,
          item.key,
          item.label,
          item.description,
          item.defaultProfileKey,
          item.scopeMode,
          JSON.stringify(item.departments),
          JSON.stringify(item.teams),
          JSON.stringify(item.units),
          item.isActive ? 1 : 0,
          item.sortOrder,
          timestamp,
          updatedBy,
        ]
      );
    }

    for (const mapping of normalizedJobTitles) {
      await txDb.execute(`UPDATE employee_job_titles SET executive_group_id = ? WHERE id = ?`, [mapping.executiveGroupId, mapping.catalogId]);
    }

    await txDb.execute('DELETE FROM dashboard_executive_user_exceptions');
    for (const item of normalizedExceptions) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_user_exceptions
          (user_id, profile_key_override, added_widget_keys_json, hidden_widget_keys_json, scope_mode_override, departments_json, teams_json, units_json, is_active, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [
          item.userId,
          item.profileKeyOverride,
          JSON.stringify(item.addedWidgetKeys),
          JSON.stringify(item.hiddenWidgetKeys),
          item.scopeModeOverride,
          JSON.stringify(item.departments),
          JSON.stringify(item.teams),
          JSON.stringify(item.units),
          timestamp,
          updatedBy,
        ]
      );
    }
  });

  return getExecutiveConfigurationSnapshot(db);
};

const getProfileVisibleWidgetKeys = async (db: DbInterface, profileKey: ExecutiveProfileKey) => {
  const rows = await db.query(
    `
    SELECT widget_key
    FROM dashboard_executive_profile_widgets
    WHERE profile_key = ?
      AND is_visible = 1
    ORDER BY sort_order ASC
    `,
    [profileKey]
  );
  return rows.map((row: any) => clean(row.widget_key)).filter(isWidgetKey);
};

const getUserIdentityForExecutiveProfile = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `
    SELECT
      u.id AS user_id,
      u.employee_id,
      u.department AS user_department,
      e.department AS employee_department,
      e.department_catalog_id,
      e.job_title,
      e.job_title_catalog_id,
      e.units_json
    FROM users u
    LEFT JOIN employees e ON ${userEmployeeJoinClause()}
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );
  const row = rows[0];
  if (!row) {
    return {
      userId,
      employeeId: null,
      department: null,
      departmentCatalogId: null,
      jobTitle: null,
      jobTitleCatalogId: null,
      units: [] as string[],
    };
  }
  return {
    userId,
    employeeId: clean(row.employee_id) || null,
    department: clean(row.employee_department) || clean(row.user_department) || null,
    departmentCatalogId: clean(row.department_catalog_id) || null,
    jobTitle: clean(row.job_title) || null,
    jobTitleCatalogId: clean(row.job_title_catalog_id) || null,
    units: parseJsonArray(row.units_json),
  };
};

const resolveGroupScope = (
  group: ExecutiveGroupDefinition,
  identity: Awaited<ReturnType<typeof getUserIdentityForExecutiveProfile>>
) => {
  if (group.scopeMode === 'unrestricted') {
    return { departments: [] as string[], teams: [] as string[], units: [] as string[] };
  }
  if (group.scopeMode === 'employee_department') {
    return { departments: identity.department ? [identity.department] : [], teams: [], units: [] };
  }
  if (group.scopeMode === 'employee_units') {
    return { departments: [], teams: [], units: identity.units };
  }
  if (group.scopeMode === 'employee_department_and_units') {
    return { departments: identity.department ? [identity.department] : [], teams: [], units: identity.units };
  }
  return {
    departments: group.departments,
    teams: group.teams,
    units: group.units,
  };
};

export const resolveExecutiveProfile = async (db: DbInterface, userId: string): Promise<ExecutiveResolvedProfile> => {
  await ensureExecutiveTables(db);

  const [identity, exceptionRows, groups] = await Promise.all([
    getUserIdentityForExecutiveProfile(db, userId),
    db.query(
      `
      SELECT user_id, profile_key_override, added_widget_keys_json, hidden_widget_keys_json, scope_mode_override, departments_json, teams_json, units_json, is_active, updated_at, updated_by
      FROM dashboard_executive_user_exceptions
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    ),
    listExecutiveGroups(db),
  ]);

  if (!identity.employeeId) {
    return buildResolvedProfile(
      null,
      [],
      'unconfigured',
      null,
      null,
      null,
      'Usuário sem colaborador vinculado.'
    );
  }

  if (!identity.jobTitleCatalogId) {
    return buildResolvedProfile(
      null,
      [],
      'unconfigured',
      null,
      null,
      null,
      'Cargo do colaborador sem vínculo com o catálogo mestre.'
    );
  }

  const groupRows = await db.query(
    `
    SELECT
      jt.executive_group_id,
      g.id,
      g.group_key,
      g.label,
      g.default_profile_key
    FROM employee_job_titles jt
    LEFT JOIN dashboard_executive_groups g ON g.id = jt.executive_group_id AND g.is_active = 1
    WHERE jt.id = ?
    LIMIT 1
    `,
    [identity.jobTitleCatalogId]
  );
  const groupRow = groupRows[0];
  if (!clean(groupRow?.executive_group_id) || !clean(groupRow?.id)) {
    return buildResolvedProfile(
      null,
      [],
      'unconfigured',
      null,
      null,
      null,
      'Cargo sem grupo executivo atribuído.'
    );
  }

  const matchedGroup = groups.find((item) => item.id === clean(groupRow.id));
  if (!matchedGroup || !matchedGroup.isActive) {
    return buildResolvedProfile(
      null,
      [],
      'unconfigured',
      clean(groupRow?.id) || null,
      clean(groupRow?.group_key) || null,
      clean(groupRow?.label) || null,
      'Grupo executivo inativo ou inválido.'
    );
  }

  const exception = exceptionRows[0] ? parseExceptionRow(exceptionRows[0]) : null;
  const baseProfileKey = matchedGroup.defaultProfileKey;
  const resolvedProfileKey =
    exception?.isActive && exception.profileKeyOverride ? exception.profileKeyOverride : baseProfileKey;
  const baseWidgetKeys = await getProfileVisibleWidgetKeys(db, resolvedProfileKey);
  const visibleWidgetKeys = unique([
    ...baseWidgetKeys,
    ...((exception?.isActive ? exception.addedWidgetKeys : []) || []),
  ]).filter(isWidgetKey).filter((key) => !(exception?.isActive && exception.hiddenWidgetKeys.includes(key)));

  return buildResolvedProfile(
    resolvedProfileKey,
    visibleWidgetKeys,
    exception?.isActive ? 'user_exception' : 'group_mapping',
    matchedGroup.id,
    matchedGroup.key,
    matchedGroup.label,
    null
  );
};

export const listExecutiveProfilePreview = async (db: DbInterface): Promise<ExecutiveProfilePreviewRow[]> => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.employee_id,
      u.role,
      u.status,
      u.department AS user_department,
      e.department AS employee_department,
        e.job_title,
        e.job_title_catalog_id,
        e.units_json
    FROM users u
    LEFT JOIN employees e ON ${userEmployeeJoinClause()}
    WHERE UPPER(TRIM(COALESCE(u.role, ''))) <> 'INTRANET'
    ORDER BY u.status DESC, u.name ASC
    `
  );

  const profileMap = new Map(EXECUTIVE_PROFILE_DEFINITIONS.map((profile) => [profile.key, profile.label]));
  const previewRows = await Promise.all(
    rows.map(async (row: any) => {
      const userId = clean(row.user_id);
      const role = clean(row.role) || 'OPERADOR';
      const permissions = await loadUserPermissionMatrix(db, userId, role);
      const resolved = await resolveExecutiveProfile(db, userId);

      return {
        userId,
        userName: clean(row.user_name),
        role,
        status: clean(row.status) || 'INATIVO',
        department: clean(row.employee_department) || clean(row.user_department) || null,
        jobTitle: clean(row.job_title) || null,
        units: parseJsonArray(row.units_json),
        hasDashboardAccess: hasPermission(permissions, 'dashboard', 'view', role),
        hasEmployeeLink: Boolean(clean(row.employee_id)),
        jobTitleCatalogId: clean(row.job_title_catalog_id) || null,
        executiveGroupId: resolved.matchedGroupId,
        executiveGroupKey: resolved.matchedGroupKey,
        executiveGroupLabel: resolved.matchedGroupLabel,
        profileKey: resolved.profileKey,
        profileLabel: resolved.profileKey ? profileMap.get(resolved.profileKey) || null : null,
        resolutionSource: resolved.resolutionSource,
        configurationIssue: resolved.configurationIssue,
      } satisfies ExecutiveProfilePreviewRow;
    })
  );

  return previewRows;
};

export const getExecutiveScopeOptions = async (db: DbInterface): Promise<ExecutiveScopeOptions> => {
  await ensureExecutiveTables(db);

  const [departmentRows, jobTitleRows, unitRows, teamRows] = await Promise.all([
    db.query(`
      SELECT DISTINCT TRIM(department) AS value
      FROM employees
      WHERE department IS NOT NULL AND TRIM(department) <> ''
      ORDER BY value ASC
    `),
    db.query(`
      SELECT DISTINCT TRIM(job_title) AS value
      FROM employees
      WHERE job_title IS NOT NULL AND TRIM(job_title) <> ''
      ORDER BY value ASC
    `),
    db.query(`
      SELECT units_json
      FROM employees
      WHERE units_json IS NOT NULL AND TRIM(units_json) <> ''
    `),
    db.query(`
      SELECT DISTINCT TRIM(name) AS value
      FROM teams_master
      WHERE name IS NOT NULL AND TRIM(name) <> ''
      ORDER BY value ASC
    `).catch(() => []),
  ]);

  const departments = unique(departmentRows.map((row: any) => clean(row.value))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const jobTitles = unique(jobTitleRows.map((row: any) => clean(row.value))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const units = unique(unitRows.flatMap((row: any) => parseUnitsArray(row.units_json))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const teams = unique(teamRows.map((row: any) => clean(row.value))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return { departments, jobTitles, units, teams };
};

export const getExecutiveScope = async (db: DbInterface, userId: string): Promise<ExecutiveScope> => {
  await ensureExecutiveTables(db);
  const [rows, resolvedProfile, identity, groups, exceptionRows] = await Promise.all([
    db.query('SELECT * FROM dashboard_executive_scopes WHERE user_id = ? LIMIT 1', [userId]),
    resolveExecutiveProfile(db, userId),
    getUserIdentityForExecutiveProfile(db, userId),
    listExecutiveGroups(db),
    db.query(
      `
      SELECT user_id, profile_key_override, added_widget_keys_json, hidden_widget_keys_json, scope_mode_override, departments_json, teams_json, units_json, is_active, updated_at, updated_by
      FROM dashboard_executive_user_exceptions
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    ),
  ]);
  const row = rows[0];
  const exception = exceptionRows[0] ? parseExceptionRow(exceptionRows[0]) : null;
  const matchedGroup = groups.find((item) => item.id === resolvedProfile.matchedGroupId) || null;
  const groupScope = matchedGroup ? resolveGroupScope(matchedGroup, identity) : { departments: [] as string[], teams: [] as string[], units: [] as string[] };
  const departments =
    exception?.isActive && exception.departments.length
      ? exception.departments
      : groupScope.departments.length
        ? groupScope.departments
        : row
          ? parseJsonArray(row.departments_json)
          : [];
  const teams =
    exception?.isActive && exception.teams.length
      ? exception.teams
      : groupScope.teams.length
        ? groupScope.teams
        : row
          ? parseJsonArray(row.teams_json)
          : [];
  const units =
    exception?.isActive && exception.units.length
      ? exception.units
      : groupScope.units.length
        ? groupScope.units
        : row
          ? parseJsonArray(row.units_json)
          : [];
  const areas = getVisibleAreasFromWidgets(resolvedProfile.visibleWidgetKeys);

  return normalizeScope(userId, {
    areas,
    departments,
    teams,
    units,
    profileKey: resolvedProfile.profileKey,
    visibleWidgetKeys: resolvedProfile.visibleWidgetKeys,
    resolutionSource: resolvedProfile.resolutionSource,
    matchedGroupId: resolvedProfile.matchedGroupId,
    matchedGroupKey: resolvedProfile.matchedGroupKey,
    matchedGroupLabel: resolvedProfile.matchedGroupLabel,
    configurationIssue: resolvedProfile.configurationIssue,
    updatedAt: clean(row?.updated_at) || exception?.updatedAt || null,
    updatedBy: clean(row?.updated_by) || exception?.updatedBy || null,
  });
};

export const saveExecutiveScope = async (
  db: DbInterface,
  userId: string,
  input: Partial<Omit<ExecutiveScope, 'userId' | 'updatedAt' | 'updatedBy'>>,
  updatedBy: string
) => {
  await ensureExecutiveTables(db);
  const scope = normalizeScope(userId, { ...input, updatedBy, updatedAt: new Date().toISOString() });
  await runInTransaction(db, async (txDb) => {
    await txDb.execute(
      `
      INSERT INTO dashboard_executive_scopes
        (user_id, areas_json, departments_json, teams_json, units_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        areas_json = excluded.areas_json,
        departments_json = excluded.departments_json,
        teams_json = excluded.teams_json,
        units_json = excluded.units_json,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
      `,
      [
        userId,
        JSON.stringify(scope.areas),
        JSON.stringify(scope.departments),
        JSON.stringify(scope.teams),
        JSON.stringify(scope.units),
        scope.updatedAt,
        scope.updatedBy,
      ]
    );

  });

  return getExecutiveScope(db, userId);
};

const buildExecutiveMetrics = async (db: DbInterface, scope: ExecutiveScope): Promise<ExecutiveMetricsPayload> => {
  const profile = buildResolvedProfile(
    scope.profileKey,
    scope.visibleWidgetKeys,
    scope.resolutionSource,
    scope.matchedGroupId,
    scope.matchedGroupKey,
    scope.matchedGroupLabel,
    scope.configurationIssue
  );

  if (!scope.profileKey || scope.resolutionSource === 'unconfigured') {
    return {
      generatedAt: new Date().toISOString(),
      scope: serializeScopeInput(scope),
      profile,
      overallStatus: 'NO_DATA',
      executiveSummary: buildExecutiveSummary([]),
      aiStatus: 'PENDING_PHASE_2',
      areas: [],
      widgets: [],
      topPriorities: [],
      liveOperations: {
        medicQueue: 0,
        receptionQueue: 0,
        whatsappQueue: 0,
        criticalWaitCount: 0,
        attendedToday: 0,
        averageReceptionWaitMinutes: 0,
        heartbeats: [],
      },
    };
  }

  const [financeiro, comercial, operacaoBundle, pessoas, qualidade] = await Promise.all([
    getFinanceArea(db, scope),
    getCommercialArea(db, scope),
    getOperationsArea(db, scope),
    getPeopleArea(db, scope),
    getQualityArea(db),
  ]);

  const visibleAreas = getVisibleAreasFromWidgets(scope.visibleWidgetKeys);
  const allowedAreas = visibleAreas.length ? visibleAreas : scope.areas;
  const areas = [financeiro, comercial, operacaoBundle.area, pessoas, qualidade].filter((area) =>
    allowedAreas.includes(area.areaKey)
  );
  const widgets = await buildExecutiveWidgets(db, scope, areas);

  return {
    generatedAt: new Date().toISOString(),
    scope: serializeScopeInput({ ...scope, areas: allowedAreas }),
    profile,
    overallStatus: worstStatus(areas.map((area) => area.status)),
    executiveSummary: buildExecutiveSummary(areas),
    aiStatus: 'PENDING_PHASE_2',
    areas,
    widgets,
    topPriorities: buildTopPriorities(areas),
    liveOperations: operacaoBundle.live,
  };
};

export const getLatestExecutiveSnapshot = async (db: DbInterface, userId: string, scopeHash: string) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM dashboard_executive_snapshots
    WHERE user_id = ?
      AND scope_hash = ?
      AND status = 'COMPLETED'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, scopeHash]
  );
  return rows[0] ? parseSnapshotRow(rows[0]) : null;
};

export const createExecutiveSnapshot = async (
  db: DbInterface,
  userId: string,
  requestedBy: string,
  scope?: ExecutiveScope
): Promise<ExecutiveSnapshot> => {
  await ensureExecutiveTables(db);
  const effectiveScope = scope || (await getExecutiveScope(db, userId));
  const normalizedScope = normalizeScope(userId, effectiveScope);
  const scopeHash = serializeScopeHash(serializeScopeInput(normalizedScope));

  return runInTransaction(db, async (txDb) => {
    const snapshotId = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      const metrics = await buildExecutiveMetrics(txDb, normalizedScope);
      const completedAt = new Date().toISOString();
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_snapshots
          (id, user_id, scope_hash, metrics_json, ai_summary_json, status, error_message, created_at, completed_at, requested_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          snapshotId,
          userId,
          scopeHash,
          JSON.stringify(metrics),
          null,
          'COMPLETED',
          null,
          createdAt,
          completedAt,
          requestedBy,
        ]
      );
      return {
        id: snapshotId,
        userId,
        scopeHash,
        status: 'COMPLETED' as const,
        metrics,
        aiSummary: null,
        errorMessage: null,
        createdAt,
        completedAt,
        requestedBy,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar snapshot executivo.';
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_snapshots
          (id, user_id, scope_hash, metrics_json, ai_summary_json, status, error_message, created_at, completed_at, requested_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [snapshotId, userId, scopeHash, '{}', null, 'FAILED', message, createdAt, null, requestedBy]
      );
      throw error;
    }
  });
};

export const getOrCreateExecutiveSnapshot = async (db: DbInterface, userId: string) => {
  const scope = await getExecutiveScope(db, userId);
  const scopeHash = serializeScopeHash(serializeScopeInput(scope));
  const latest = await getLatestExecutiveSnapshot(db, userId, scopeHash);
  if (latest) return latest;
  return createExecutiveSnapshot(db, userId, userId, scope);
};
