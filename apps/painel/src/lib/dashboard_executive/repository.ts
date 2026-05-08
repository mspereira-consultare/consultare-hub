import { createHash, randomUUID } from 'crypto';
import { runInTransaction, type DbInterface } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';
import { getEmployeeDashboard } from '@/lib/colaboradores/repository';
import { getQmsOverviewMetrics } from '@/lib/qms/metrics_repository';
import { listRecruitmentDashboard } from '@/lib/recrutamento/repository';
import { getSurveillanceSummary } from '@/lib/vigilancia_sanitaria/repository';
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
  ExecutiveIndicator,
  ExecutiveIndicatorStatus,
  ExecutiveLiveHeartbeat,
  ExecutiveLiveOperations,
  ExecutiveMetricsPayload,
  ExecutiveProfileDefinition,
  ExecutiveProfileKey,
  ExecutiveProfileRule,
  ExecutiveProfileWidgetConfig,
  ExecutivePriority,
  ExecutiveProfilePreviewRow,
  ExecutiveResolvedProfile,
  ExecutiveScope,
  ExecutiveScopeResolutionSource,
  ExecutiveSnapshot,
  ExecutiveSnapshotStatus,
  ExecutiveTrend,
  ExecutiveUserOverride,
  ExecutiveWidgetDefinition,
  ExecutiveWidgetKey,
} from '@/lib/dashboard_executive/types';

const EXECUTIVE_AREAS: ExecutiveAreaKey[] = ['financeiro', 'comercial', 'operacao', 'pessoas', 'qualidade'];
const SUMMARY_TABLE = 'faturamento_resumo_diario';
const ANALITICO_TABLE = 'faturamento_analitico';
const SQL_DATE_ANALITICO =
  (String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL)
    ? `(CASE WHEN INSTR(data_do_pagamento, '/') > 0 THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2)) ELSE data_do_pagamento END)`
    : `(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)`;
const WON_STATUSES = ['executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago'];
const CRITICAL_WAIT_MINUTES = 30;

let tablesEnsured = false;

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
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

const unique = (values: string[]) => Array.from(new Set(values.map((item) => clean(item)).filter(Boolean)));
const normalizeSearch = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const isWidgetKey = (value: string): value is ExecutiveWidgetKey =>
  EXECUTIVE_WIDGET_DEFINITIONS.some((widget) => widget.key === value);
const isProfileKey = (value: string): value is ExecutiveProfileKey =>
  EXECUTIVE_PROFILE_DEFINITIONS.some((profile) => profile.key === value);

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

const serializeScopeInput = (scope: ExecutiveScope) => ({
  userId: scope.userId,
  areas: scope.areas,
  departments: scope.departments,
  teams: scope.teams,
  units: scope.units,
  profileKey: scope.profileKey,
  visibleWidgetKeys: scope.visibleWidgetKeys,
  resolutionSource: scope.resolutionSource,
  matchedRuleId: scope.matchedRuleId,
});

const serializeScopeHash = (scope: Omit<ExecutiveScope, 'updatedAt' | 'updatedBy'>) =>
  createHash('sha256').update(JSON.stringify(scope)).digest('hex');

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
  const resolutionSource = (clean(raw?.resolutionSource) || 'legacy_scope') as ExecutiveScopeResolutionSource;
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
    matchedRuleId: clean(raw?.matchedRuleId) || null,
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

const parseRuleRow = (row: any): ExecutiveProfileRule => ({
  id: clean(row.id),
  profileKey: clean(row.profile_key) as ExecutiveProfileKey,
  department: clean(row.department) || null,
  jobTitle: clean(row.job_title) || null,
  units: parseJsonArray(row.units_json),
  isActive: toBool(row.is_active),
  updatedAt: clean(row.updated_at) || null,
  updatedBy: clean(row.updated_by) || null,
});

const parseOverrideRow = (row: any): ExecutiveUserOverride => ({
  userId: clean(row.user_id),
  profileKey: isProfileKey(clean(row.profile_key)) ? (clean(row.profile_key) as ExecutiveProfileKey) : null,
  visibleWidgetKeys: parseJsonArray(row.widget_keys_json).filter(isWidgetKey),
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
  matchedRuleId: string | null
): ExecutiveResolvedProfile => ({
  profileKey,
  visibleWidgetKeys,
  resolutionSource,
  matchedRuleId,
});

const parseSnapshotRow = (row: any): ExecutiveSnapshot => {
  const metrics = JSON.parse(clean(row.metrics_json) || '{}') as ExecutiveMetricsPayload;
  if (!metrics.profile) {
    metrics.profile = buildResolvedProfile(
      isProfileKey(clean((metrics.scope as any)?.profileKey)) ? (clean((metrics.scope as any)?.profileKey) as ExecutiveProfileKey) : null,
      Array.isArray((metrics.scope as any)?.visibleWidgetKeys)
        ? ((metrics.scope as any).visibleWidgetKeys as string[]).filter(isWidgetKey)
        : [],
      ((metrics.scope as any)?.resolutionSource as ExecutiveScopeResolutionSource) || 'legacy_scope',
      clean((metrics.scope as any)?.matchedRuleId) || null
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
    CREATE TABLE IF NOT EXISTS dashboard_executive_profile_rules (
      id VARCHAR(64) PRIMARY KEY,
      profile_key VARCHAR(80) NOT NULL,
      department VARCHAR(180) NULL,
      job_title VARCHAR(180) NULL,
      units_json LONGTEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_executive_user_overrides (
      user_id VARCHAR(64) PRIMARY KEY,
      profile_key VARCHAR(80) NULL,
      widget_keys_json LONGTEXT NULL,
      departments_json LONGTEXT NULL,
      teams_json LONGTEXT NULL,
      units_json LONGTEXT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NULL,
      updated_by VARCHAR(64) NULL
    )
  `);

  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_snapshots_user_scope ON dashboard_executive_snapshots (user_id, scope_hash)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_snapshots_created_at ON dashboard_executive_snapshots (created_at)');
  } catch {}
  try {
    await db.execute('CREATE INDEX idx_dashboard_executive_profile_rules_profile ON dashboard_executive_profile_rules (profile_key, is_active)');
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

export const listExecutiveProfileRules = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT id, profile_key, department, job_title, units_json, is_active, updated_at, updated_by
    FROM dashboard_executive_profile_rules
    ORDER BY updated_at DESC, id DESC
    `
  );
  return rows.map(parseRuleRow);
};

export const listExecutiveUserOverrides = async (db: DbInterface) => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT user_id, profile_key, widget_keys_json, departments_json, teams_json, units_json, is_active, updated_at, updated_by
    FROM dashboard_executive_user_overrides
    ORDER BY updated_at DESC, user_id ASC
    `
  );
  return rows.map(parseOverrideRow);
};

export const getExecutiveConfigurationSnapshot = async (db: DbInterface): Promise<ExecutiveConfigurationSnapshot> => {
  const [profiles, widgets, profileWidgets, rules, overrides] = await Promise.all([
    listExecutiveProfiles(db),
    listExecutiveWidgets(db),
    listExecutiveProfileWidgets(db),
    listExecutiveProfileRules(db),
    listExecutiveUserOverrides(db),
  ]);
  return { profiles, widgets, profileWidgets, rules, overrides };
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

  const normalizedRules = input.rules
    .filter((item) => profilesByKey.has(item.profileKey))
    .map((item) => ({
      id: clean(item.id) || randomUUID(),
      profileKey: item.profileKey,
      department: clean(item.department) || null,
      jobTitle: clean(item.jobTitle) || null,
      units: unique(item.units || []),
      isActive: item.isActive !== false,
    }));

  const normalizedOverrides = input.overrides
    .filter((item) => clean(item.userId))
    .map((item) => ({
      userId: clean(item.userId),
      profileKey: item.profileKey && profilesByKey.has(item.profileKey) ? item.profileKey : null,
      visibleWidgetKeys: unique(item.visibleWidgetKeys || []).filter(isWidgetKey),
      departments: unique(item.departments || []),
      teams: unique(item.teams || []),
      units: unique(item.units || []),
      isActive: item.isActive !== false && Boolean(item.profileKey),
    }))
    .filter((item) => item.isActive && item.profileKey);

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

    await txDb.execute('DELETE FROM dashboard_executive_profile_rules');
    for (const item of normalizedRules) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_profile_rules
          (id, profile_key, department, job_title, units_json, is_active, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.id,
          item.profileKey,
          item.department,
          item.jobTitle,
          JSON.stringify(item.units),
          item.isActive ? 1 : 0,
          timestamp,
          updatedBy,
        ]
      );
    }

    await txDb.execute('DELETE FROM dashboard_executive_user_overrides');
    for (const item of normalizedOverrides) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_user_overrides
          (user_id, profile_key, widget_keys_json, departments_json, teams_json, units_json, is_active, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [
          item.userId,
          item.profileKey,
          JSON.stringify(item.visibleWidgetKeys),
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
      e.job_title,
      e.units_json
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
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
      jobTitle: null,
      units: [] as string[],
    };
  }
  return {
    userId,
    employeeId: clean(row.employee_id) || null,
    department: clean(row.employee_department) || clean(row.user_department) || null,
    jobTitle: clean(row.job_title) || null,
    units: parseJsonArray(row.units_json),
  };
};

export const resolveExecutiveProfile = async (db: DbInterface, userId: string): Promise<ExecutiveResolvedProfile> => {
  await ensureExecutiveTables(db);

  const overrideRows = await db.query(
    `
    SELECT user_id, profile_key, widget_keys_json, departments_json, teams_json, units_json, is_active, updated_at, updated_by
    FROM dashboard_executive_user_overrides
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );
  const override = overrideRows[0] ? parseOverrideRow(overrideRows[0]) : null;
  if (override?.isActive && override.profileKey) {
    const fallbackWidgetKeys = await getProfileVisibleWidgetKeys(db, override.profileKey);
    return buildResolvedProfile(
      override.profileKey,
      override.visibleWidgetKeys.length ? override.visibleWidgetKeys : fallbackWidgetKeys,
      'user_override',
      null
    );
  }

  const identity = await getUserIdentityForExecutiveProfile(db, userId);
  const rules = await listExecutiveProfileRules(db);
  const normalizedDepartment = normalizeSearch(identity.department);
  const normalizedJobTitle = normalizeSearch(identity.jobTitle);
  const normalizedUnits = identity.units.map(normalizeSearch);

  const matchedRule = rules
    .filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.department && normalizeSearch(rule.department) !== normalizedDepartment) return false;
      if (rule.jobTitle && normalizeSearch(rule.jobTitle) !== normalizedJobTitle) return false;
      if (rule.units.length) {
        const ruleUnits = rule.units.map(normalizeSearch);
        return normalizedUnits.some((unit) => ruleUnits.includes(unit));
      }
      return true;
    })
    .sort((a, b) => {
      const aScore = (a.department ? 2 : 0) + (a.jobTitle ? 2 : 0) + (a.units.length ? 1 : 0);
      const bScore = (b.department ? 2 : 0) + (b.jobTitle ? 2 : 0) + (b.units.length ? 1 : 0);
      return bScore - aScore;
    })[0];

  if (matchedRule) {
    return buildResolvedProfile(
      matchedRule.profileKey,
      await getProfileVisibleWidgetKeys(db, matchedRule.profileKey),
      'profile_rule',
      matchedRule.id
    );
  }

  return buildResolvedProfile(null, [], 'unconfigured', null);
};

export const listExecutiveProfilePreview = async (db: DbInterface): Promise<ExecutiveProfilePreviewRow[]> => {
  await ensureExecutiveTables(db);
  const rows = await db.query(
    `
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.role,
      u.status,
      u.department AS user_department,
      e.department AS employee_department,
      e.job_title,
      e.units_json
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
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
        profileKey: resolved.profileKey,
        profileLabel: resolved.profileKey ? profileMap.get(resolved.profileKey) || null : null,
        resolutionSource: resolved.resolutionSource,
        matchedRuleId: resolved.matchedRuleId,
      } satisfies ExecutiveProfilePreviewRow;
    })
  );

  return previewRows;
};

export const getExecutiveScope = async (db: DbInterface, userId: string): Promise<ExecutiveScope> => {
  await ensureExecutiveTables(db);
  const [rows, overrideRows, resolvedProfile] = await Promise.all([
    db.query('SELECT * FROM dashboard_executive_scopes WHERE user_id = ? LIMIT 1', [userId]),
    db.query(
      `
      SELECT user_id, profile_key, widget_keys_json, departments_json, teams_json, units_json, is_active, updated_at, updated_by
      FROM dashboard_executive_user_overrides
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    ),
    resolveExecutiveProfile(db, userId),
  ]);
  const row = rows[0];
  const override = overrideRows[0] ? parseOverrideRow(overrideRows[0]) : null;
  const departments = override?.isActive && override.departments.length
    ? override.departments
    : row
      ? parseJsonArray(row.departments_json)
      : [];
  const teams = override?.isActive && override.teams.length
    ? override.teams
    : row
      ? parseJsonArray(row.teams_json)
      : [];
  const units = override?.isActive && override.units.length
    ? override.units
    : row
      ? parseJsonArray(row.units_json)
      : [];
  const areas = row ? (parseJsonArray(row.areas_json) as ExecutiveAreaKey[]) : [];

  return normalizeScope(userId, {
    areas,
    departments,
    teams,
    units,
    profileKey: resolvedProfile.profileKey,
    visibleWidgetKeys: resolvedProfile.visibleWidgetKeys,
    resolutionSource: resolvedProfile.resolutionSource,
    matchedRuleId: resolvedProfile.matchedRuleId,
    updatedAt: clean(row?.updated_at) || override?.updatedAt || null,
    updatedBy: clean(row?.updated_by) || override?.updatedBy || null,
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

    if (scope.profileKey) {
      await txDb.execute(
        `
        INSERT INTO dashboard_executive_user_overrides
          (user_id, profile_key, widget_keys_json, departments_json, teams_json, units_json, is_active, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          profile_key = excluded.profile_key,
          widget_keys_json = excluded.widget_keys_json,
          departments_json = excluded.departments_json,
          teams_json = excluded.teams_json,
          units_json = excluded.units_json,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
        `,
        [
          userId,
          scope.profileKey,
          JSON.stringify(scope.visibleWidgetKeys),
          JSON.stringify(scope.departments),
          JSON.stringify(scope.teams),
          JSON.stringify(scope.units),
          scope.updatedAt,
          scope.updatedBy,
        ]
      );
    } else {
      await txDb.execute(
        `
        DELETE FROM dashboard_executive_user_overrides
        WHERE user_id = ?
        `,
        [userId]
      );
    }
  });

  return getExecutiveScope(db, userId);
};

const buildExecutiveMetrics = async (db: DbInterface, scope: ExecutiveScope): Promise<ExecutiveMetricsPayload> => {
  const profile = buildResolvedProfile(
    scope.profileKey,
    scope.visibleWidgetKeys,
    scope.resolutionSource,
    scope.matchedRuleId
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

  return {
    generatedAt: new Date().toISOString(),
    scope: serializeScopeInput({ ...scope, areas: allowedAreas }),
    profile,
    overallStatus: worstStatus(areas.map((area) => area.status)),
    executiveSummary: buildExecutiveSummary(areas),
    aiStatus: 'PENDING_PHASE_2',
    areas,
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
