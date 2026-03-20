import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';

export class MarketingFunilValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type MarketingJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

type DateRange = {
  periodRef: string;
  startDate: string;
  endDate: string;
};

export type MarketingFunilFilters = {
  periodRef?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  brand?: unknown;
  campaign?: unknown;
  source?: unknown;
  medium?: unknown;
  channelGroup?: unknown;
  device?: unknown;
  landingPage?: unknown;
  crmBoard?: unknown;
  crmSource?: unknown;
  crmService?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

type MarketingFunilFilterKey = 'brand' | 'campaign' | 'source' | 'medium' | 'channelGroup';

type MarketingFunilFilterOption = {
  value: string;
  label: string;
};

let tablesEnsured = false;
// Regra de negocio atual do modulo: para marketing/funil, considerar somente o quadro CRC.
const CRM_DEFAULT_BOARD_KEYS = ['crc'] as const;

const clean = (value: unknown) => String(value ?? '').trim();

const safeNum = (value: unknown) => {
  const raw = clean(value).replace(',', '.');
  const parsed = Number(raw || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeInt = (value: unknown) => {
  const parsed = Number.parseInt(clean(value || 0), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nowIso = () => new Date().toISOString();

const MARKETING_VALID_APPOINTMENT_STATUSES = [1, 2, 3, 4, 7] as const;

const MARKETING_APPOINTMENT_STATUS_LABELS: Record<number, string> = {
  1: 'Marcado - não confirmado',
  2: 'Em andamento',
  3: 'Atendido',
  4: 'Em atendimento/aguardando',
  7: 'Marcado - confirmado',
};

const getAnalyticsDateExpr = (columnName: string) => {
  const identifier = quoteIdentifier(columnName);
  if (isMysqlProvider()) {
    return `(CASE WHEN INSTR(${identifier}, '/') > 0 THEN CONCAT(SUBSTR(${identifier}, 7, 4), '-', SUBSTR(${identifier}, 4, 2), '-', SUBSTR(${identifier}, 1, 2)) ELSE SUBSTR(${identifier}, 1, 10) END)`;
  }
  return `(CASE WHEN instr(${identifier}, '/') > 0 THEN substr(${identifier}, 7, 4) || '-' || substr(${identifier}, 4, 2) || '-' || substr(${identifier}, 1, 2) ELSE substr(${identifier}, 1, 10) END)`;
};

const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: unknown; code?: unknown };
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '').toUpperCase();
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_DUP_KEYNAME' ||
      msg.includes('duplicate') ||
      msg.includes('already exists')
    ) {
      return;
    }
    throw error;
  }
};

const hasColumn = async (db: DbInterface, tableName: string, columnName: string) => {
  const rows = await db.query(`PRAGMA table_info(${tableName})`);
  return (rows || []).some((row) => clean((row as Record<string, unknown>).name).toLowerCase() === columnName.toLowerCase());
};

const ensureColumn = async (
  db: DbInterface,
  tableName: string,
  columnName: string,
  columnDefSql: string
) => {
  if (await hasColumn(db, tableName, columnName)) return;
  await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefSql}`);
};

const normalizeDate = (value: unknown, fieldName: string) => {
  const raw = clean(value);
  if (!raw) throw new MarketingFunilValidationError(`Campo ${fieldName} obrigatorio.`);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new MarketingFunilValidationError(`Campo ${fieldName} invalido. Use YYYY-MM-DD.`);
  }
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) {
    throw new MarketingFunilValidationError(`Campo ${fieldName} invalido.`);
  }
  return raw;
};

const getSaoPauloParts = (input = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year') || '1970'),
    month: Number(map.get('month') || '01'),
    day: Number(map.get('day') || '01'),
  };
};

const getPreviousMonthRange = (): DateRange => {
  const nowParts = getSaoPauloParts();
  let year = nowParts.year;
  let month = nowParts.month - 1;
  if (month <= 0) {
    month = 12;
    year -= 1;
  }
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    periodRef: `${year}-${mm}`,
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
};

const getRangeFromPeriod = (periodRefRaw: unknown): DateRange => {
  const periodRef = clean(periodRefRaw);
  const match = periodRef.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new MarketingFunilValidationError('periodRef invalido. Use YYYY-MM.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new MarketingFunilValidationError('periodRef invalido. Mes deve estar entre 01 e 12.');
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodRef,
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
};

const normalizeDateRange = (filters: MarketingFunilFilters): DateRange => {
  const hasStart = clean(filters.startDate).length > 0;
  const hasEnd = clean(filters.endDate).length > 0;

  if (hasStart || hasEnd) {
    const startDate = normalizeDate(filters.startDate, 'startDate');
    const endDate = normalizeDate(filters.endDate, 'endDate');
    if (startDate > endDate) {
      throw new MarketingFunilValidationError('Data inicial nao pode ser maior que data final.');
    }
    return {
      periodRef: `${startDate.slice(0, 7)}`,
      startDate,
      endDate,
    };
  }

  if (clean(filters.periodRef)) {
    return getRangeFromPeriod(filters.periodRef);
  }

  return getPreviousMonthRange();
};

const normalizePage = (value: unknown) => {
  const page = Number.parseInt(clean(value || 1), 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return page;
};

const normalizePageSize = (value: unknown) => {
  const pageSize = Number.parseInt(clean(value || 50), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) return 50;
  return Math.min(pageSize, 500);
};

const normalizeTextFilter = (value: unknown) => clean(value);

const quoteIdentifier = (value: string) => {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
  const escaped = value.replace(/[`"]/g, '');
  return isMysqlProvider() ? `\`${escaped}\`` : `"${escaped.replace(/"/g, '""')}"`;
};

const mapJob = (row: Record<string, unknown>) => {
  let scope: Record<string, unknown> = {};
  try {
    scope = JSON.parse(clean(row.scope_json) || '{}');
  } catch {
    scope = {};
  }

  return {
    id: clean(row.id),
    status: clean(row.status).toUpperCase() as MarketingJobStatus,
    periodRef: clean(row.period_ref),
    startDate: clean(row.start_date),
    endDate: clean(row.end_date),
    scope,
    requestedBy: clean(row.requested_by),
    errorMessage: clean(row.error_message) || null,
    createdAt: clean(row.created_at),
    startedAt: clean(row.started_at) || null,
    finishedAt: clean(row.finished_at) || null,
    updatedAt: clean(row.updated_at),
  };
};

const buildFactWhere = (
  filters: MarketingFunilFilters,
  options: {
    alias?: string;
    ignoreKeys?: MarketingFunilFilterKey[];
    exactMatch?: boolean;
  } = {}
) => {
  const range = normalizeDateRange(filters);
  const alias = options.alias ? `${options.alias}.` : '';
  const ignoreKeys = new Set(options.ignoreKeys || []);
  const useExactMatch = options.exactMatch ?? true;
  const where = [`${alias}date_ref >= ?`, `${alias}date_ref <= ?`];
  const params: unknown[] = [range.startDate, range.endDate];

  const brand = normalizeTextFilter(filters.brand);
  if (brand && !ignoreKeys.has('brand')) {
    where.push(`${alias}brand_slug = ?`);
    params.push(brand.toLowerCase());
  }

  const campaign = normalizeTextFilter(filters.campaign);
  if (campaign && !ignoreKeys.has('campaign')) {
    where.push(
      useExactMatch
        ? `LOWER(COALESCE(${alias}campaign_name, '')) = ?`
        : `LOWER(COALESCE(${alias}campaign_name, '')) LIKE ?`
    );
    params.push(useExactMatch ? campaign.toLowerCase() : `%${campaign.toLowerCase()}%`);
  }

  const source = normalizeTextFilter(filters.source);
  if (source && !ignoreKeys.has('source')) {
    where.push(
      useExactMatch
        ? `LOWER(COALESCE(${alias}source, '')) = ?`
        : `LOWER(COALESCE(${alias}source, '')) LIKE ?`
    );
    params.push(useExactMatch ? source.toLowerCase() : `%${source.toLowerCase()}%`);
  }

  const medium = normalizeTextFilter(filters.medium);
  if (medium && !ignoreKeys.has('medium')) {
    where.push(
      useExactMatch
        ? `LOWER(COALESCE(${alias}medium, '')) = ?`
        : `LOWER(COALESCE(${alias}medium, '')) LIKE ?`
    );
    params.push(useExactMatch ? medium.toLowerCase() : `%${medium.toLowerCase()}%`);
  }

  const channelGroup = normalizeTextFilter(filters.channelGroup);
  if (channelGroup && !ignoreKeys.has('channelGroup')) {
    where.push(
      useExactMatch
        ? `LOWER(COALESCE(${alias}session_default_channel_group, '')) = ?`
        : `LOWER(COALESCE(${alias}session_default_channel_group, '')) LIKE ?`
    );
    params.push(useExactMatch ? channelGroup.toLowerCase() : `%${channelGroup.toLowerCase()}%`);
  }

  return { range, where, params };
};

const buildMainWhere = (filters: MarketingFunilFilters) => buildFactWhere(filters);

const listDistinctFactOptions = async (
  db: DbInterface,
  filters: MarketingFunilFilters,
  columnName: string,
  ignoreKeys: MarketingFunilFilterKey[]
): Promise<MarketingFunilFilterOption[]> => {
  const { where, params } = buildFactWhere(filters, { alias: 'f', ignoreKeys });
  const identifier = quoteIdentifier(columnName);
  const rows = await db.query(
    `
    SELECT option_value
    FROM (
      SELECT DISTINCT TRIM(COALESCE(f.${identifier}, '')) AS option_value
      FROM fact_marketing_funnel_daily f
      WHERE ${where.join(' AND ')}
        AND TRIM(COALESCE(f.${identifier}, '')) <> ''
    ) options
    ORDER BY LOWER(option_value) ASC
    `,
    params
  );

  return (rows || [])
    .map((raw) => clean((raw as Record<string, unknown>).option_value))
    .filter(Boolean)
    .map((value) => ({ value, label: value }));
};

export const ensureMarketingFunilTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS marketing_funnel_jobs (
      id VARCHAR(64) PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      period_ref VARCHAR(7) NOT NULL,
      start_date VARCHAR(10) NOT NULL,
      end_date VARCHAR(10) NOT NULL,
      scope_json LONGTEXT,
      requested_by VARCHAR(64) NOT NULL,
      error_message TEXT,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_mkt_funnel_jobs_status ON marketing_funnel_jobs(status)');
  await safeExecute(db, 'CREATE INDEX idx_mkt_funnel_jobs_created ON marketing_funnel_jobs(created_at)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS marketing_funnel_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      ads_customer_id VARCHAR(64),
      ga4_property_id VARCHAR(64),
      status VARCHAR(20) NOT NULL,
      records_read INTEGER NOT NULL DEFAULT 0,
      records_written INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_mkt_funnel_item_job ON marketing_funnel_job_items(job_id)');
  await safeExecute(db, 'CREATE INDEX idx_mkt_funnel_item_status ON marketing_funnel_job_items(status)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_marketing_funnel_daily (
      id VARCHAR(64) PRIMARY KEY,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      unit_key VARCHAR(120) NOT NULL,
      specialty_key VARCHAR(120) NOT NULL,
      channel_key VARCHAR(120) NOT NULL,
      campaign_key VARCHAR(160) NOT NULL,
      campaign_name VARCHAR(255),
      source VARCHAR(120),
      medium VARCHAR(120),
      attribution_rule VARCHAR(80),
      spend DECIMAL(14,2) NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      ctr DECIMAL(10,4) NOT NULL DEFAULT 0,
      cpc DECIMAL(14,4) NOT NULL DEFAULT 0,
      leads INTEGER NOT NULL DEFAULT 0,
      cpl DECIMAL(14,4) NOT NULL DEFAULT 0,
      appointments INTEGER,
      revenue DECIMAL(14,2),
      show_rate DECIMAL(10,4),
      source_last_sync_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'sessions', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'total_users', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'new_users', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'engaged_sessions', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'engagement_rate', 'DECIMAL(10,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'avg_session_duration_sec', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'page_views', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'event_count', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'session_default_channel_group', 'VARCHAR(120)');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'interactions', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'conversions', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'all_conversions', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'conversions_value', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'fact_marketing_funnel_daily', 'cost_per_conversion', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await safeExecute(
    db,
    'CREATE UNIQUE INDEX ux_fact_mkt_funnel_key ON fact_marketing_funnel_daily(date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key)'
  );
  await safeExecute(db, 'CREATE INDEX idx_fact_mkt_date_brand ON fact_marketing_funnel_daily(date_ref, brand_slug)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_marketing_funnel_daily_device (
      id VARCHAR(64) PRIMARY KEY,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      campaign_key VARCHAR(160) NOT NULL,
      campaign_name VARCHAR(255),
      device VARCHAR(60) NOT NULL,
      spend DECIMAL(14,2) NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      conversions DECIMAL(14,4) NOT NULL DEFAULT 0,
      all_conversions DECIMAL(14,4) NOT NULL DEFAULT 0,
      source_last_sync_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(
    db,
    'CREATE UNIQUE INDEX ux_fact_mkt_device_key ON fact_marketing_funnel_daily_device(date_ref, brand_slug, campaign_key, device)'
  );
  await safeExecute(db, 'CREATE INDEX idx_fact_mkt_device_date_brand ON fact_marketing_funnel_daily_device(date_ref, brand_slug)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_marketing_funnel_daily_landing_page (
      id VARCHAR(64) PRIMARY KEY,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      campaign_key VARCHAR(160) NOT NULL,
      campaign_name VARCHAR(255),
      source VARCHAR(120),
      medium VARCHAR(120),
      landing_page TEXT NOT NULL,
      sessions INTEGER NOT NULL DEFAULT 0,
      total_users INTEGER NOT NULL DEFAULT 0,
      new_users INTEGER NOT NULL DEFAULT 0,
      engaged_sessions INTEGER NOT NULL DEFAULT 0,
      leads INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      source_last_sync_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_fact_mkt_landing_date_brand ON fact_marketing_funnel_daily_landing_page(date_ref, brand_slug)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_marketing_funnel_daily_channel (
      id VARCHAR(64) PRIMARY KEY,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      campaign_key VARCHAR(160) NOT NULL,
      campaign_name VARCHAR(255),
      channel_group VARCHAR(120) NOT NULL,
      sessions INTEGER NOT NULL DEFAULT 0,
      users INTEGER NOT NULL DEFAULT 0,
      leads INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      source_last_sync_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(
    db,
    'CREATE UNIQUE INDEX ux_fact_mkt_channel_key ON fact_marketing_funnel_daily_channel(date_ref, brand_slug, campaign_key, channel_group)'
  );
  await safeExecute(db, 'CREATE INDEX idx_fact_mkt_channel_date_brand ON fact_marketing_funnel_daily_channel(date_ref, brand_slug)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinia_crm_boards (
      id VARCHAR(64) PRIMARY KEY,
      brand_id VARCHAR(64),
      title VARCHAR(255) NOT NULL,
      board_key VARCHAR(160) NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      columns_count INTEGER NOT NULL DEFAULT 0,
      payload_json LONGTEXT,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_clinia_crm_boards_key ON clinia_crm_boards(board_key)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_clinia_crm_pipeline_daily (
      id VARCHAR(64) PRIMARY KEY,
      snapshot_date VARCHAR(10) NOT NULL,
      board_id VARCHAR(64) NOT NULL,
      board_title VARCHAR(255),
      column_id VARCHAR(64) NOT NULL,
      column_title VARCHAR(255),
      crm_source_key VARCHAR(120) NOT NULL,
      service_key VARCHAR(160) NOT NULL,
      open_items_count INTEGER NOT NULL DEFAULT 0,
      open_items_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(
    db,
    'CREATE UNIQUE INDEX ux_fact_clinia_crm_pipeline_daily ON fact_clinia_crm_pipeline_daily(snapshot_date, board_id, column_id, crm_source_key, service_key)'
  );
  await safeExecute(db, 'CREATE INDEX idx_fact_clinia_crm_pipeline_board_day ON fact_clinia_crm_pipeline_daily(snapshot_date, board_id)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_clinia_crm_lead_created_daily (
      id VARCHAR(64) PRIMARY KEY,
      created_date VARCHAR(10) NOT NULL,
      board_id VARCHAR(64) NOT NULL,
      board_title VARCHAR(255),
      crm_source_key VARCHAR(120) NOT NULL,
      service_key VARCHAR(160) NOT NULL,
      items_created_count INTEGER NOT NULL DEFAULT 0,
      items_created_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(
    db,
    'CREATE UNIQUE INDEX ux_fact_clinia_crm_lead_created_daily ON fact_clinia_crm_lead_created_daily(created_date, board_id, crm_source_key, service_key)'
  );
  await safeExecute(db, 'CREATE INDEX idx_fact_clinia_crm_lead_created_board_day ON fact_clinia_crm_lead_created_daily(created_date, board_id)');

  if (isMysqlProvider()) {
    await safeExecute(db, 'ALTER TABLE marketing_funnel_jobs MODIFY COLUMN id VARCHAR(64) NOT NULL');
  }

  tablesEnsured = true;
};

const buildCampaignAggregationSelect = () => `
  SELECT
    campaign_key,
    MAX(COALESCE(NULLIF(TRIM(campaign_name), ''), 'Sem campanha')) AS campaign_name,
    MAX(COALESCE(source, '')) AS source,
    MAX(COALESCE(medium, '')) AS medium,
    MAX(COALESCE(session_default_channel_group, '')) AS session_default_channel_group,
    SUM(spend) AS spend,
    SUM(impressions) AS impressions,
    SUM(clicks) AS clicks,
    SUM(sessions) AS sessions,
    SUM(total_users) AS total_users,
    SUM(new_users) AS new_users,
    SUM(engaged_sessions) AS engaged_sessions,
    SUM(page_views) AS page_views,
    SUM(event_count) AS event_count,
    SUM(leads) AS leads,
    SUM(interactions) AS interactions,
    SUM(conversions) AS conversions,
    SUM(all_conversions) AS all_conversions,
    SUM(conversions_value) AS conversions_value,
    MAX(source_last_sync_at) AS source_last_sync_at
  FROM fact_marketing_funnel_daily
`;

type CrmBoardScopeItem = {
  boardId: string;
  boardTitle: string;
  boardKey: string;
};

const isConsultareBrandScope = (brandRaw: unknown) => {
  const brand = normalizeTextFilter(brandRaw).toLowerCase();
  return !brand || brand === 'consultare';
};

const getMarketingFunilAppointmentsSummary = async (db: DbInterface, filters: MarketingFunilFilters) => {
  if (!isConsultareBrandScope(filters.brand)) {
    return {
      totalValid: 0,
      byStatus: MARKETING_VALID_APPOINTMENT_STATUSES.map((statusId) => ({
        statusId,
        statusLabel: MARKETING_APPOINTMENT_STATUS_LABELS[statusId],
        count: 0,
      })),
    };
  }

  const range = normalizeDateRange(filters);
  const rows = await db.query(
    `
    SELECT
      status_id,
      COUNT(DISTINCT appointment_id) AS total
    FROM feegow_appointments
    WHERE SUBSTR(scheduled_at, 1, 10) >= ?
      AND SUBSTR(scheduled_at, 1, 10) <= ?
      AND status_id IN (${MARKETING_VALID_APPOINTMENT_STATUSES.map(() => '?').join(', ')})
    GROUP BY status_id
    `,
    [range.startDate, range.endDate, ...MARKETING_VALID_APPOINTMENT_STATUSES]
  );

  const byStatusMap = new Map<number, number>();
  for (const raw of rows || []) {
    const row = raw as Record<string, unknown>;
    byStatusMap.set(safeInt(row.status_id), safeInt(row.total));
  }

  const byStatus = MARKETING_VALID_APPOINTMENT_STATUSES.map((statusId) => ({
    statusId,
    statusLabel: MARKETING_APPOINTMENT_STATUS_LABELS[statusId],
    count: byStatusMap.get(statusId) || 0,
  }));

  return {
    totalValid: byStatus.reduce((acc, item) => acc + item.count, 0),
    byStatus,
  };
};

const getMarketingFunilRevenueSummary = async (db: DbInterface, filters: MarketingFunilFilters) => {
  if (!isConsultareBrandScope(filters.brand)) {
    return {
      total: 0,
      dateBasis: 'data_de_referência',
    };
  }

  const range = normalizeDateRange(filters);
  const referenceDateExpr = getAnalyticsDateExpr('data_de_referência');
  const rows = await db.query(
    `
    SELECT COALESCE(SUM(total_pago), 0) AS total
    FROM faturamento_analitico
    WHERE ${referenceDateExpr} >= ?
      AND ${referenceDateExpr} <= ?
    `,
    [range.startDate, range.endDate]
  );

  return {
    total: safeNum((rows?.[0] as Record<string, unknown>)?.total),
    dateBasis: 'data_de_referência',
  };
};

const getCrmBoardScope = async (db: DbInterface, filters: MarketingFunilFilters) => {
  if (!isConsultareBrandScope(filters.brand)) {
    return [] as CrmBoardScopeItem[];
  }

  const crmBoard = normalizeTextFilter(filters.crmBoard).toLowerCase();
  const where = [`LOWER(board_key) IN (${CRM_DEFAULT_BOARD_KEYS.map(() => '?').join(', ')})`];
  const params: unknown[] = [...CRM_DEFAULT_BOARD_KEYS];

  if (crmBoard) {
    where.push('(LOWER(id) = ? OR LOWER(board_key) = ? OR LOWER(title) LIKE ?)');
    params.push(crmBoard, crmBoard, `%${crmBoard}%`);
  }

  const rows = await db.query(
    `
    SELECT id, title, board_key
    FROM clinia_crm_boards
    WHERE ${where.join(' AND ')}
    ORDER BY title ASC
    `,
    params
  );

  return (rows || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      boardId: clean(row.id),
      boardTitle: clean(row.title),
      boardKey: clean(row.board_key),
    };
  });
};

const buildCrmWhere = (
  alias: string,
  boardScope: CrmBoardScopeItem[],
  filters: MarketingFunilFilters,
  options: { dateField?: string; snapshotDate?: string | null } = {}
) => {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.dateField) {
    const range = normalizeDateRange(filters);
    where.push(`${alias}.${options.dateField} >= ?`, `${alias}.${options.dateField} <= ?`);
    params.push(range.startDate, range.endDate);
  }

  if (options.snapshotDate) {
    where.push(`${alias}.snapshot_date = ?`);
    params.push(options.snapshotDate);
  }

  if (!boardScope.length) {
    where.push('1 = 0');
    return { where, params };
  }

  where.push(`${alias}.board_id IN (${boardScope.map(() => '?').join(', ')})`);
  params.push(...boardScope.map((item) => item.boardId));

  const crmSource = normalizeTextFilter(filters.crmSource).toLowerCase();
  if (crmSource) {
    where.push(`LOWER(${alias}.crm_source_key) LIKE ?`);
    params.push(`%${crmSource}%`);
  }

  const crmService = normalizeTextFilter(filters.crmService).toLowerCase();
  if (crmService) {
    where.push(`LOWER(${alias}.service_key) LIKE ?`);
    params.push(`%${crmService}%`);
  }

  return { where, params };
};

const toDerivedMetrics = (row: Record<string, unknown>) => {
  const spend = safeNum(row.spend);
  const impressions = safeInt(row.impressions);
  const clicks = safeInt(row.clicks);
  const sessions = safeInt(row.sessions);
  const engagedSessions = safeInt(row.engaged_sessions);
  const leads = safeInt(row.leads);
  const conversions = safeNum(row.conversions);
  return {
    spend,
    impressions,
    clicks,
    sessions,
    engagedSessions,
    leads,
    conversions,
    ctr: impressions > 0 ? (clicks * 100) / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpl: leads > 0 ? spend / leads : 0,
    costPerConversion: conversions > 0 ? spend / conversions : 0,
    engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
  };
};

export const createMarketingFunnelJob = async (
  db: DbInterface,
  input: {
    periodRef?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    brand?: unknown;
    account?: unknown;
  },
  actorUserId: string
) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(input);
  const id = randomUUID().replace(/-/g, '');
  const now = nowIso();
  const brand = normalizeTextFilter(input.brand).toLowerCase();
  const account = normalizeTextFilter(input.account);

  await db.execute(
    `
    INSERT INTO marketing_funnel_jobs (
      id, status, period_ref, start_date, end_date, scope_json, requested_by,
      error_message, created_at, started_at, finished_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      'PENDING',
      range.periodRef,
      range.startDate,
      range.endDate,
      JSON.stringify({ brand: brand || null, account: account || null }),
      clean(actorUserId) || 'unknown',
      null,
      now,
      null,
      null,
      now,
    ]
  );

  const rows = await db.query('SELECT * FROM marketing_funnel_jobs WHERE id = ? LIMIT 1', [id]);
  return mapJob((rows?.[0] as Record<string, unknown>) || {});
};

export const getLatestMarketingFunnelJob = async (
  db: DbInterface,
  filters: Pick<MarketingFunilFilters, 'periodRef' | 'startDate' | 'endDate' | 'brand'>
) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const brand = normalizeTextFilter(filters.brand).toLowerCase();
  const rows = await db.query(
    `
    SELECT *
    FROM marketing_funnel_jobs
    ORDER BY created_at DESC
    LIMIT 50
    `
  );

  for (const raw of rows || []) {
    const row = mapJob(raw as Record<string, unknown>);
    if (row.startDate !== range.startDate || row.endDate !== range.endDate) continue;
    const scopeBrand = clean((row.scope as Record<string, unknown>).brand).toLowerCase();
    if (brand && scopeBrand && scopeBrand !== brand) continue;
    if (brand && !scopeBrand) continue;
    return row;
  }

  return null;
};

export const getMarketingFunilCrmSummary = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const boardScope = await getCrmBoardScope(db, filters);
  const range = normalizeDateRange(filters);

  if (!boardScope.length) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      boardScope: [],
      leadsCreatedCount: 0,
      leadsCreatedValue: 0,
      pipelineSnapshotDate: null,
      pipelineItemsCount: 0,
      pipelineItemsValue: 0,
      lastSyncAt: null,
    };
  }

  const leadWhere = buildCrmWhere('f', boardScope, filters, { dateField: 'created_date' });
  const leadRows = await db.query(
    `
    SELECT
      SUM(items_created_count) AS leads_created_count,
      SUM(items_created_value) AS leads_created_value,
      MAX(updated_at) AS last_sync_at
    FROM fact_clinia_crm_lead_created_daily f
    WHERE ${leadWhere.where.join(' AND ')}
    `,
    leadWhere.params
  );
  const leadBase = (leadRows?.[0] as Record<string, unknown>) || {};

  const snapshotWhere = buildCrmWhere('f', boardScope, filters);
  const snapshotRows = await db.query(
    `
    SELECT MAX(snapshot_date) AS snapshot_date
    FROM fact_clinia_crm_pipeline_daily f
    WHERE ${snapshotWhere.where.join(' AND ')}
      AND f.snapshot_date <= ?
    `,
    [...snapshotWhere.params, range.endDate]
  );
  const pipelineSnapshotDate = clean((snapshotRows?.[0] as Record<string, unknown>)?.snapshot_date) || null;

  let pipelineItemsCount = 0;
  let pipelineItemsValue = 0;
  let pipelineLastSyncAt: string | null = null;

  if (pipelineSnapshotDate) {
    const pipelineWhere = buildCrmWhere('f', boardScope, filters, { snapshotDate: pipelineSnapshotDate });
    const pipelineRows = await db.query(
      `
      SELECT
        SUM(open_items_count) AS pipeline_items_count,
        SUM(open_items_value) AS pipeline_items_value,
        MAX(updated_at) AS last_sync_at
      FROM fact_clinia_crm_pipeline_daily f
      WHERE ${pipelineWhere.where.join(' AND ')}
      `,
      pipelineWhere.params
    );
    const pipelineBase = (pipelineRows?.[0] as Record<string, unknown>) || {};
    pipelineItemsCount = safeInt(pipelineBase.pipeline_items_count);
    pipelineItemsValue = safeNum(pipelineBase.pipeline_items_value);
    pipelineLastSyncAt = clean(pipelineBase.last_sync_at) || null;
  }

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    boardScope,
    leadsCreatedCount: safeInt(leadBase.leads_created_count),
    leadsCreatedValue: safeNum(leadBase.leads_created_value),
    pipelineSnapshotDate,
    pipelineItemsCount,
    pipelineItemsValue,
    lastSyncAt: pipelineLastSyncAt || clean(leadBase.last_sync_at) || null,
  };
};

export const getMarketingFunnelSummary = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const { range, where, params } = buildMainWhere(filters);

  const rows = await db.query(
    `
    SELECT
      COUNT(DISTINCT campaign_key) AS campaigns,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(sessions) AS sessions,
      SUM(total_users) AS total_users,
      SUM(new_users) AS new_users,
      SUM(engaged_sessions) AS engaged_sessions,
      SUM(page_views) AS page_views,
      SUM(event_count) AS event_count,
      SUM(leads) AS leads,
      SUM(interactions) AS interactions,
      SUM(conversions) AS conversions,
      SUM(all_conversions) AS all_conversions,
      SUM(conversions_value) AS conversions_value,
      MAX(source_last_sync_at) AS last_sync_at
    FROM fact_marketing_funnel_daily
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  const base = ((rows?.[0] as Record<string, unknown>) || {});
  const derived = toDerivedMetrics(base);
  const [crm, appointments, revenue] = await Promise.all([
    getMarketingFunilCrmSummary(db, filters),
    getMarketingFunilAppointmentsSummary(db, filters),
    getMarketingFunilRevenueSummary(db, filters),
  ]);

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    campaigns: safeInt(base.campaigns),
    spend: derived.spend,
    impressions: derived.impressions,
    clicks: derived.clicks,
    ctr: derived.ctr,
    cpc: derived.cpc,
    sessions: derived.sessions,
    totalUsers: safeInt(base.total_users),
    newUsers: safeInt(base.new_users),
    engagedSessions: derived.engagedSessions,
    engagementRate: derived.engagementRate,
    pageViews: safeInt(base.page_views),
    eventCount: safeInt(base.event_count),
    leads: derived.leads,
    cpl: derived.cpl,
    interactions: safeInt(base.interactions),
    conversions: derived.conversions,
    allConversions: safeNum(base.all_conversions),
    conversionsValue: safeNum(base.conversions_value),
    costPerConversion: derived.costPerConversion,
    lastSyncAt: clean(base.last_sync_at) || null,
    appointments,
    revenue,
    crm,
  };
};

export const listMarketingFunnelCampaigns = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const { range, where, params } = buildMainWhere(filters);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const baseSql = `${buildCampaignAggregationSelect()} WHERE ${where.join(' AND ')} GROUP BY campaign_key`;
  const countRows = await db.query(`SELECT COUNT(*) AS total FROM (${baseSql}) AS campaigns_count`, params);
  const total = safeInt((countRows?.[0] as Record<string, unknown>)?.total);

  const rows = await db.query(
    `
    ${baseSql}
    ORDER BY spend DESC, campaign_name ASC
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    page,
    pageSize,
    total,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const derived = toDerivedMetrics(row);
      return {
        campaignKey: clean(row.campaign_key),
        campaignName: clean(row.campaign_name) || 'Sem campanha',
        source: clean(row.source),
        medium: clean(row.medium),
        sessionDefaultChannelGroup: clean(row.session_default_channel_group),
        spend: derived.spend,
        impressions: derived.impressions,
        clicks: derived.clicks,
        ctr: derived.ctr,
        cpc: derived.cpc,
        sessions: derived.sessions,
        totalUsers: safeInt(row.total_users),
        newUsers: safeInt(row.new_users),
        engagedSessions: derived.engagedSessions,
        engagementRate: derived.engagementRate,
        pageViews: safeInt(row.page_views),
        eventCount: safeInt(row.event_count),
        leads: derived.leads,
        cpl: derived.cpl,
        interactions: safeInt(row.interactions),
        conversions: derived.conversions,
        allConversions: safeNum(row.all_conversions),
        conversionsValue: safeNum(row.conversions_value),
        costPerConversion: derived.costPerConversion,
        lastSyncAt: clean(row.source_last_sync_at) || null,
      };
    }),
  };
};

export const listMarketingFunnelChannels = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const { range, where, params } = buildMainWhere(filters);

  const rows = await db.query(
    `
    SELECT
      session_default_channel_group AS channel_group,
      SUM(sessions) AS sessions,
      SUM(total_users) AS users,
      SUM(leads) AS leads,
      SUM(event_count) AS event_count,
      MAX(source_last_sync_at) AS last_sync_at
    FROM fact_marketing_funnel_daily
    WHERE ${where.join(' AND ')}
      AND TRIM(COALESCE(session_default_channel_group, '')) <> ''
    GROUP BY session_default_channel_group
    ORDER BY sessions DESC, session_default_channel_group ASC
    `,
    params
  );

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        channelGroup: clean(row.channel_group) || 'Sem grupo',
        sessions: safeInt(row.sessions),
        users: safeInt(row.users),
        leads: safeInt(row.leads),
        eventCount: safeInt(row.event_count),
        lastSyncAt: clean(row.last_sync_at) || null,
      };
    }),
  };
};

export const listMarketingFunnelFilterOptions = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);

  const [campaigns, sources, media, channelGroups] = await Promise.all([
    listDistinctFactOptions(db, filters, 'campaign_name', ['campaign']),
    listDistinctFactOptions(db, filters, 'source', ['source']),
    listDistinctFactOptions(db, filters, 'medium', ['medium']),
    listDistinctFactOptions(db, filters, 'session_default_channel_group', ['channelGroup']),
  ]);

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    campaigns,
    sources,
    media,
    channelGroups,
  };
};

export const listMarketingFunilCrmBoards = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const boardScope = await getCrmBoardScope(db, filters);

  if (!boardScope.length) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      pipelineSnapshotDate: null,
      items: [],
    };
  }

  const leadWhere = buildCrmWhere('f', boardScope, filters, { dateField: 'created_date' });
  const leadRows = await db.query(
    `
    SELECT
      f.board_id,
      MAX(COALESCE(NULLIF(TRIM(b.title), ''), NULLIF(TRIM(f.board_title), ''), 'Sem board')) AS board_title,
      MAX(COALESCE(NULLIF(TRIM(b.board_key), ''), 'unknown')) AS board_key,
      SUM(f.items_created_count) AS leads_created_count,
      SUM(f.items_created_value) AS leads_created_value,
      MAX(f.updated_at) AS last_sync_at
    FROM fact_clinia_crm_lead_created_daily f
    LEFT JOIN clinia_crm_boards b ON b.id = f.board_id
    WHERE ${leadWhere.where.join(' AND ')}
    GROUP BY f.board_id
    `,
    leadWhere.params
  );

  const snapshotWhere = buildCrmWhere('f', boardScope, filters);
  const snapshotRows = await db.query(
    `
    SELECT MAX(snapshot_date) AS snapshot_date
    FROM fact_clinia_crm_pipeline_daily f
    WHERE ${snapshotWhere.where.join(' AND ')}
      AND f.snapshot_date <= ?
    `,
    [...snapshotWhere.params, range.endDate]
  );
  const pipelineSnapshotDate = clean((snapshotRows?.[0] as Record<string, unknown>)?.snapshot_date) || null;

  let pipelineByBoard = new Map<string, Record<string, unknown>>();
  if (pipelineSnapshotDate) {
    const pipelineWhere = buildCrmWhere('f', boardScope, filters, { snapshotDate: pipelineSnapshotDate });
    const pipelineRows = await db.query(
      `
      SELECT
        f.board_id,
        MAX(COALESCE(NULLIF(TRIM(b.title), ''), NULLIF(TRIM(f.board_title), ''), 'Sem board')) AS board_title,
        MAX(COALESCE(NULLIF(TRIM(b.board_key), ''), 'unknown')) AS board_key,
        SUM(f.open_items_count) AS pipeline_items_count,
        SUM(f.open_items_value) AS pipeline_items_value,
        MAX(f.updated_at) AS last_sync_at
      FROM fact_clinia_crm_pipeline_daily f
      LEFT JOIN clinia_crm_boards b ON b.id = f.board_id
      WHERE ${pipelineWhere.where.join(' AND ')}
      GROUP BY f.board_id
      `,
      pipelineWhere.params
    );
    pipelineByBoard = new Map(
      (pipelineRows || []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return [clean(row.board_id), row];
      })
    );
  }

  const leadByBoard = new Map(
    (leadRows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return [clean(row.board_id), row];
    })
  );

  const items = boardScope.map((board) => {
    const leadRow = leadByBoard.get(board.boardId) || {};
    const pipelineRow = pipelineByBoard.get(board.boardId) || {};
    return {
      boardId: board.boardId,
      boardTitle: clean((leadRow as Record<string, unknown>).board_title || (pipelineRow as Record<string, unknown>).board_title) || board.boardTitle,
      boardKey: clean((leadRow as Record<string, unknown>).board_key || (pipelineRow as Record<string, unknown>).board_key) || board.boardKey,
      leadsCreatedCount: safeInt((leadRow as Record<string, unknown>).leads_created_count),
      leadsCreatedValue: safeNum((leadRow as Record<string, unknown>).leads_created_value),
      pipelineItemsCount: safeInt((pipelineRow as Record<string, unknown>).pipeline_items_count),
      pipelineItemsValue: safeNum((pipelineRow as Record<string, unknown>).pipeline_items_value),
      lastSyncAt:
        clean((pipelineRow as Record<string, unknown>).last_sync_at) ||
        clean((leadRow as Record<string, unknown>).last_sync_at) ||
        null,
    };
  });

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    pipelineSnapshotDate,
    items,
  };
};

export const listMarketingFunilCrmPipeline = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const boardScope = await getCrmBoardScope(db, filters);

  if (!boardScope.length) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      snapshotDate: null,
      items: [],
    };
  }

  const snapshotWhere = buildCrmWhere('f', boardScope, filters);
  const snapshotRows = await db.query(
    `
    SELECT MAX(snapshot_date) AS snapshot_date
    FROM fact_clinia_crm_pipeline_daily f
    WHERE ${snapshotWhere.where.join(' AND ')}
      AND f.snapshot_date <= ?
    `,
    [...snapshotWhere.params, range.endDate]
  );
  const snapshotDate = clean((snapshotRows?.[0] as Record<string, unknown>)?.snapshot_date) || null;

  if (!snapshotDate) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      snapshotDate: null,
      items: [],
    };
  }

  const pipelineWhere = buildCrmWhere('f', boardScope, filters, { snapshotDate });
  const rows = await db.query(
    `
    SELECT
      f.board_id,
      MAX(COALESCE(NULLIF(TRIM(b.title), ''), NULLIF(TRIM(f.board_title), ''), 'Sem board')) AS board_title,
      MAX(COALESCE(NULLIF(TRIM(b.board_key), ''), 'unknown')) AS board_key,
      f.column_id,
      MAX(COALESCE(NULLIF(TRIM(f.column_title), ''), 'Sem coluna')) AS column_title,
      f.crm_source_key,
      f.service_key,
      SUM(f.open_items_count) AS pipeline_items_count,
      SUM(f.open_items_value) AS pipeline_items_value,
      MAX(f.updated_at) AS last_sync_at
    FROM fact_clinia_crm_pipeline_daily f
    LEFT JOIN clinia_crm_boards b ON b.id = f.board_id
    WHERE ${pipelineWhere.where.join(' AND ')}
    GROUP BY f.board_id, f.column_id, f.crm_source_key, f.service_key
    ORDER BY pipeline_items_count DESC, board_title ASC, column_title ASC
    `,
    pipelineWhere.params
  );

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    snapshotDate,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        boardId: clean(row.board_id),
        boardTitle: clean(row.board_title),
        boardKey: clean(row.board_key),
        columnId: clean(row.column_id),
        columnTitle: clean(row.column_title),
        crmSourceKey: clean(row.crm_source_key) || 'unknown',
        serviceKey: clean(row.service_key) || 'unknown',
        pipelineItemsCount: safeInt(row.pipeline_items_count),
        pipelineItemsValue: safeNum(row.pipeline_items_value),
        lastSyncAt: clean(row.last_sync_at) || null,
      };
    }),
  };
};

export const listMarketingFunnelCampaignDevices = async (
  db: DbInterface,
  campaignKey: string,
  filters: MarketingFunilFilters
) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const where = ['date_ref >= ?', 'date_ref <= ?', 'campaign_key = ?'];
  const params: unknown[] = [range.startDate, range.endDate, clean(campaignKey)];

  const brand = normalizeTextFilter(filters.brand).toLowerCase();
  if (brand) {
    where.push('brand_slug = ?');
    params.push(brand);
  }

  const device = normalizeTextFilter(filters.device);
  if (device) {
    where.push('LOWER(device) LIKE ?');
    params.push(`%${device.toLowerCase()}%`);
  }

  const rows = await db.query(
    `
    SELECT
      device,
      MAX(COALESCE(NULLIF(TRIM(campaign_name), ''), 'Sem campanha')) AS campaign_name,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      SUM(all_conversions) AS all_conversions,
      MAX(source_last_sync_at) AS last_sync_at
    FROM fact_marketing_funnel_daily_device
    WHERE ${where.join(' AND ')}
    GROUP BY device
    ORDER BY spend DESC, device ASC
    `,
    params
  );

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const spend = safeNum(row.spend);
      const impressions = safeInt(row.impressions);
      const clicks = safeInt(row.clicks);
      return {
        campaignKey: clean(campaignKey),
        campaignName: clean(row.campaign_name) || 'Sem campanha',
        device: clean(row.device) || 'UNKNOWN',
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks * 100) / impressions : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        conversions: safeNum(row.conversions),
        allConversions: safeNum(row.all_conversions),
        lastSyncAt: clean(row.last_sync_at) || null,
      };
    }),
  };
};

export const listMarketingFunnelCampaignLandingPages = async (
  db: DbInterface,
  campaignKey: string,
  filters: MarketingFunilFilters
) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const where = ['date_ref >= ?', 'date_ref <= ?', 'campaign_key = ?'];
  const params: unknown[] = [range.startDate, range.endDate, clean(campaignKey)];

  const brand = normalizeTextFilter(filters.brand).toLowerCase();
  if (brand) {
    where.push('brand_slug = ?');
    params.push(brand);
  }

  const source = normalizeTextFilter(filters.source);
  if (source) {
    where.push('LOWER(source) LIKE ?');
    params.push(`%${source.toLowerCase()}%`);
  }

  const medium = normalizeTextFilter(filters.medium);
  if (medium) {
    where.push('LOWER(medium) LIKE ?');
    params.push(`%${medium.toLowerCase()}%`);
  }

  const landingPage = normalizeTextFilter(filters.landingPage);
  if (landingPage) {
    where.push('LOWER(landing_page) LIKE ?');
    params.push(`%${landingPage.toLowerCase()}%`);
  }

  const rows = await db.query(
    `
    SELECT
      landing_page,
      MAX(COALESCE(NULLIF(TRIM(campaign_name), ''), 'Sem campanha')) AS campaign_name,
      MAX(COALESCE(source, '')) AS source,
      MAX(COALESCE(medium, '')) AS medium,
      SUM(sessions) AS sessions,
      SUM(total_users) AS total_users,
      SUM(new_users) AS new_users,
      SUM(engaged_sessions) AS engaged_sessions,
      SUM(leads) AS leads,
      SUM(event_count) AS event_count,
      MAX(source_last_sync_at) AS last_sync_at
    FROM fact_marketing_funnel_daily_landing_page
    WHERE ${where.join(' AND ')}
    GROUP BY landing_page
    ORDER BY sessions DESC, landing_page ASC
    `,
    params
  );

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const sessions = safeInt(row.sessions);
      const engagedSessions = safeInt(row.engaged_sessions);
      return {
        campaignKey: clean(campaignKey),
        campaignName: clean(row.campaign_name) || 'Sem campanha',
        landingPage: clean(row.landing_page),
        source: clean(row.source),
        medium: clean(row.medium),
        sessions,
        totalUsers: safeInt(row.total_users),
        newUsers: safeInt(row.new_users),
        engagedSessions,
        engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
        leads: safeInt(row.leads),
        eventCount: safeInt(row.event_count),
        lastSyncAt: clean(row.last_sync_at) || null,
      };
    }),
  };
};
