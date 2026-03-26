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
  page?: unknown;
  pageSize?: unknown;
};

type MarketingFunilFilterKey = 'brand' | 'campaign' | 'source' | 'medium' | 'channelGroup';

type MarketingFunilFilterOption = {
  value: string;
  label: string;
};

let tablesEnsured = false;
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

const chunkArray = <T>(items: T[], size: number) => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

const CLINIA_ADS_BRAND = 'consultare';

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

const getDateRangeMonthRef = (range: Pick<DateRange, 'startDate' | 'endDate'>) => ({
  startMonth: range.startDate.slice(0, 7),
  endMonth: range.endDate.slice(0, 7),
});

const shiftDate = (dateIso: string, days: number) => {
  const parsed = new Date(`${dateIso}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getPreviousComparableRange = (
  currentRange: DateRange,
  filters: Pick<MarketingFunilFilters, 'periodRef' | 'startDate' | 'endDate'>
): DateRange => {
  const hasCustomRange = clean(filters.startDate).length > 0 || clean(filters.endDate).length > 0;
  if (hasCustomRange) {
    const start = new Date(`${currentRange.startDate}T00:00:00`);
    const end = new Date(`${currentRange.endDate}T00:00:00`);
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const prevEnd = shiftDate(currentRange.startDate, -1);
    const prevStart = shiftDate(prevEnd, -diffDays);
    return {
      periodRef: prevStart.slice(0, 7),
      startDate: prevStart,
      endDate: prevEnd,
    };
  }

  const [yearRaw, monthRaw] = currentRange.periodRef.split('-');
  let year = Number(yearRaw || 0);
  let month = Number(monthRaw || 0) - 1;
  if (month <= 0) {
    month = 12;
    year -= 1;
  }
  return getRangeFromPeriod(`${year}-${String(month).padStart(2, '0')}`);
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
    CREATE TABLE IF NOT EXISTS raw_google_ads_campaign_daily (
      id VARCHAR(64) PRIMARY KEY,
      row_hash VARCHAR(64) NOT NULL,
      sync_job_id VARCHAR(64) NOT NULL,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      ads_customer_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(64),
      campaign_name VARCHAR(255),
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      spend DECIMAL(14,2) NOT NULL DEFAULT 0,
      payload_json LONGTEXT,
      payload_hash VARCHAR(64),
      collected_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'campaign_status', 'VARCHAR(40)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'campaign_primary_status', 'VARCHAR(40)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'campaign_primary_status_reasons_json', 'LONGTEXT');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'bidding_strategy_type', 'VARCHAR(60)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'optimization_score', 'DECIMAL(10,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'advertising_channel_type', 'VARCHAR(60)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'campaign_start_date', 'VARCHAR(10)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'campaign_end_date', 'VARCHAR(10)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'budget_name', 'VARCHAR(255)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'budget_period', 'VARCHAR(40)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'budget_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'currency_code', 'VARCHAR(10)');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'ctr', 'DECIMAL(10,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'average_cpc', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'interactions', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'conversions', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'all_conversions', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'conversions_value', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'raw_google_ads_campaign_daily', 'cost_per_conversion', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
  await safeExecute(db, 'CREATE UNIQUE INDEX ux_raw_ads_row_hash ON raw_google_ads_campaign_daily(row_hash)');
  await safeExecute(db, 'CREATE INDEX idx_raw_ads_date_brand ON raw_google_ads_campaign_daily(date_ref, brand_slug)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinia_ads_jobs (
      id VARCHAR(64) PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      scope_json LONGTEXT,
      requested_by VARCHAR(64) NOT NULL,
      error_message TEXT,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_jobs_status ON clinia_ads_jobs(status)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_jobs_created ON clinia_ads_jobs(created_at)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clinia_ads_job_items (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      source_period VARCHAR(16) NOT NULL,
      status VARCHAR(20) NOT NULL,
      records_read INTEGER NOT NULL DEFAULT 0,
      records_written INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_job_item_job ON clinia_ads_job_items(job_id)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS raw_clinia_ads_contacts (
      event_hash VARCHAR(64) PRIMARY KEY,
      sync_job_id VARCHAR(64) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      source_period VARCHAR(16) NOT NULL,
      date_ref VARCHAR(10) NOT NULL,
      jid VARCHAR(80) NOT NULL,
      origin VARCHAR(64),
      source_id VARCHAR(255),
      source_url LONGTEXT,
      source_url_hash VARCHAR(64) NOT NULL,
      title VARCHAR(255),
      stage VARCHAR(40) NOT NULL,
      created_at VARCHAR(32),
      conversion_time_sec INTEGER NOT NULL DEFAULT 0,
      name VARCHAR(255),
      personal_name VARCHAR(255),
      verified_name VARCHAR(255),
      organization_id VARCHAR(64),
      payload_json LONGTEXT,
      synced_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_raw_date_brand ON raw_clinia_ads_contacts(date_ref, brand_slug)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_raw_origin ON raw_clinia_ads_contacts(origin)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_raw_source ON raw_clinia_ads_contacts(source_id)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_raw_stage ON raw_clinia_ads_contacts(stage)');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fact_clinia_ads_daily (
      id VARCHAR(64) PRIMARY KEY,
      date_ref VARCHAR(10) NOT NULL,
      brand_slug VARCHAR(64) NOT NULL,
      origin VARCHAR(64) NOT NULL,
      source_id VARCHAR(255),
      source_url LONGTEXT,
      source_url_hash VARCHAR(64) NOT NULL,
      title VARCHAR(255),
      contacts_received INTEGER NOT NULL DEFAULT 0,
      new_contacts_received INTEGER NOT NULL DEFAULT 0,
      appointments_converted INTEGER NOT NULL DEFAULT 0,
      conversion_rate DECIMAL(10,4) NOT NULL DEFAULT 0,
      avg_conversion_time_sec DECIMAL(14,2) NOT NULL DEFAULT 0,
      source_last_sync_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `);
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_fact_date_brand ON fact_clinia_ads_daily(date_ref, brand_slug)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_fact_origin ON fact_clinia_ads_daily(origin)');
  await safeExecute(db, 'CREATE INDEX idx_clinia_ads_fact_source ON fact_clinia_ads_daily(source_id)');


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

const isConsultareBrandScope = (brandRaw: unknown) => {
  const brand = normalizeTextFilter(brandRaw).toLowerCase();
  return !brand || brand === CLINIA_ADS_BRAND;
};

type CliniaAdsCoverage = {
  historyStartMonth: string | null;
  historyEndMonth: string | null;
  lastSyncAt: string | null;
  historyAvailable: boolean;
};

const getCliniaAdsCoverage = async (
  db: DbInterface,
  range: Pick<DateRange, 'startDate' | 'endDate'>
): Promise<CliniaAdsCoverage> => {
  const rows = await db.query(
    `
    SELECT
      MIN(date_ref) AS min_date_ref,
      MAX(date_ref) AS max_date_ref,
      MAX(source_last_sync_at) AS last_sync_at
    FROM fact_clinia_ads_daily
    WHERE brand_slug = ?
    `,
    [CLINIA_ADS_BRAND]
  );

  const row = (rows?.[0] as Record<string, unknown>) || {};
  const minDate = clean(row.min_date_ref);
  const maxDate = clean(row.max_date_ref);
  const historyStartMonth = minDate ? minDate.slice(0, 7) : null;
  const historyEndMonth = maxDate ? maxDate.slice(0, 7) : null;
  const selected = getDateRangeMonthRef(range);
  const historyAvailable = Boolean(
    historyStartMonth &&
      historyEndMonth &&
      selected.startMonth >= historyStartMonth &&
      selected.endMonth <= historyEndMonth
  );

  return {
    historyStartMonth,
    historyEndMonth,
    lastSyncAt: clean(row.last_sync_at) || null,
    historyAvailable,
  };
};

const getZeroCliniaAdsSummary = (coverage: CliniaAdsCoverage) => ({
  contactsReceived: 0,
  newContactsReceived: 0,
  appointmentsConverted: 0,
  conversionRate: 0,
  avgConversionTimeSec: 0,
  lastSyncAt: coverage.lastSyncAt,
  prevContactsReceived: 0,
  prevNewContactsReceived: 0,
  prevAppointmentsConverted: 0,
  prevConversionRate: 0,
  historyAvailable: coverage.historyAvailable,
  historyStartMonth: coverage.historyStartMonth,
  historyEndMonth: coverage.historyEndMonth,
});

type CliniaAdsAggregate = {
  contactsReceived: number;
  newContactsReceived: number;
  appointmentsConverted: number;
  conversionRate: number;
  avgConversionTimeSec: number;
  lastSyncAt: string | null;
};

const getZeroCliniaAdsAggregate = (): CliniaAdsAggregate => ({
  contactsReceived: 0,
  newContactsReceived: 0,
  appointmentsConverted: 0,
  conversionRate: 0,
  avgConversionTimeSec: 0,
  lastSyncAt: null,
});

const hasCampaignScopedFilters = (
  filters: Pick<MarketingFunilFilters, 'campaign' | 'source' | 'medium' | 'channelGroup'>
) => [filters.campaign, filters.source, filters.medium, filters.channelGroup].some((value) => clean(value).length > 0);

const getCliniaAdsAggregateForRange = async (
  db: DbInterface,
  range: Pick<DateRange, 'startDate' | 'endDate'>,
  options?: {
    origin?: string;
    includeSourceIds?: string[];
    excludeSourceIds?: string[];
  }
): Promise<CliniaAdsAggregate> => {
  const includeSourceIds = Array.from(
    new Set(
      (options?.includeSourceIds || [])
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean)
    )
  );
  const excludeSourceIds = Array.from(
    new Set(
      (options?.excludeSourceIds || [])
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean)
    )
  );

  if (options?.includeSourceIds && includeSourceIds.length === 0) {
    return getZeroCliniaAdsAggregate();
  }

  const where = ['brand_slug = ?', 'date_ref >= ?', 'date_ref <= ?'];
  const params: unknown[] = [CLINIA_ADS_BRAND, range.startDate, range.endDate];

  if (clean(options?.origin)) {
    where.push('LOWER(COALESCE(origin, \'\')) = ?');
    params.push(clean(options?.origin).toLowerCase());
  }

  if (includeSourceIds.length) {
    where.push(`LOWER(COALESCE(source_id, '')) IN (${includeSourceIds.map(() => '?').join(', ')})`);
    params.push(...includeSourceIds);
  }

  if (excludeSourceIds.length) {
    where.push(`LOWER(COALESCE(source_id, '')) NOT IN (${excludeSourceIds.map(() => '?').join(', ')})`);
    params.push(...excludeSourceIds);
  }

  const rows = await db.query(
    `
    SELECT
      SUM(CASE WHEN stage = 'INTERESTED' THEN 1 ELSE 0 END) AS contacts_received,
      COUNT(DISTINCT CASE WHEN stage = 'INTERESTED' THEN jid ELSE NULL END) AS new_contacts_received,
      SUM(CASE WHEN stage = 'APPOINTMENT' THEN 1 ELSE 0 END) AS appointments_converted,
      AVG(CASE WHEN conversion_time_sec > 0 THEN conversion_time_sec ELSE NULL END) AS avg_conversion_time_sec,
      MAX(synced_at) AS last_sync_at
    FROM raw_clinia_ads_contacts
    WHERE ${where.join(' AND ')}
    `,
    params
  );

  const row = (rows?.[0] as Record<string, unknown>) || {};
  const contactsReceived = safeInt(row.contacts_received);
  const appointmentsConverted = safeInt(row.appointments_converted);
  return {
    contactsReceived,
    newContactsReceived: safeInt(row.new_contacts_received),
    appointmentsConverted,
    conversionRate: contactsReceived > 0 ? (appointmentsConverted * 100) / contactsReceived : 0,
    avgConversionTimeSec: safeNum(row.avg_conversion_time_sec),
    lastSyncAt: clean(row.last_sync_at) || null,
  };
};

const buildPerformanceFunnelSummary = async (
  db: DbInterface,
  filters: MarketingFunilFilters,
  range: DateRange,
  campaignNames: string[]
) => {
  const scopedToCampaigns = hasCampaignScopedFilters(filters);
  const coverage = await getCliniaAdsCoverage(db, range);

  if (!isConsultareBrandScope(filters.brand) || !coverage.historyAvailable) {
    return {
      scopeMode: scopedToCampaigns ? 'filtered-mapped' : 'all-google',
      scopeLabel: scopedToCampaigns
        ? 'Campanhas filtradas e mapeadas ao Clinia Ads'
        : 'Origem Google no Clinia Ads',
      googleContactsReceived: 0,
      googleNewContacts: 0,
      googleAppointmentsConverted: 0,
      costPerNewContact: 0,
      costPerAppointment: 0,
      contactToAppointmentRate: 0,
      diagnostics: {
        googleUnmappedContacts: 0,
        googleUnmappedNewContacts: 0,
        googleUnmappedAppointments: 0,
      },
    };
  }

  const googleOverall = scopedToCampaigns
    ? await getCliniaAdsAggregateForRange(db, range, { origin: 'google', includeSourceIds: campaignNames })
    : await getCliniaAdsAggregateForRange(db, range, { origin: 'google' });

  const unmappedGoogle =
    !scopedToCampaigns && campaignNames.length
      ? await getCliniaAdsAggregateForRange(db, range, { origin: 'google', excludeSourceIds: campaignNames })
      : getZeroCliniaAdsAggregate();

  return {
    scopeMode: scopedToCampaigns ? 'filtered-mapped' : 'all-google',
    scopeLabel: scopedToCampaigns
      ? 'Campanhas filtradas e mapeadas ao Clinia Ads'
      : 'Origem Google no Clinia Ads',
    googleContactsReceived: googleOverall.contactsReceived,
    googleNewContacts: googleOverall.newContactsReceived,
    googleAppointmentsConverted: googleOverall.appointmentsConverted,
    costPerNewContact: 0,
    costPerAppointment: 0,
    contactToAppointmentRate:
      googleOverall.newContactsReceived > 0
        ? (googleOverall.appointmentsConverted * 100) / googleOverall.newContactsReceived
        : 0,
    diagnostics: {
      googleUnmappedContacts: unmappedGoogle.contactsReceived,
      googleUnmappedNewContacts: unmappedGoogle.newContactsReceived,
      googleUnmappedAppointments: unmappedGoogle.appointmentsConverted,
    },
  };
};

const getCliniaAdsCampaignMetrics = async (
  db: DbInterface,
  range: Pick<DateRange, 'startDate' | 'endDate'>
) => {
  const rows = await db.query(
    `
    SELECT
      LOWER(COALESCE(source_id, '')) AS source_id_key,
      MAX(COALESCE(source_id, '')) AS source_id,
      SUM(CASE WHEN stage = 'INTERESTED' THEN 1 ELSE 0 END) AS contacts_received,
      COUNT(DISTINCT CASE WHEN stage = 'INTERESTED' THEN jid ELSE NULL END) AS new_contacts_received,
      SUM(CASE WHEN stage = 'APPOINTMENT' THEN 1 ELSE 0 END) AS appointments_converted
    FROM raw_clinia_ads_contacts
    WHERE brand_slug = ?
      AND origin = 'google'
      AND date_ref >= ?
      AND date_ref <= ?
      AND TRIM(COALESCE(source_id, '')) <> ''
    GROUP BY LOWER(COALESCE(source_id, ''))
    `,
    [CLINIA_ADS_BRAND, range.startDate, range.endDate]
  );

  const metrics = new Map<
    string,
    {
      contactsReceived: number;
      newContactsReceived: number;
      appointmentsConverted: number;
      conversionRate: number;
    }
  >();

  for (const raw of rows || []) {
    const row = raw as Record<string, unknown>;
    const key = clean(row.source_id_key).toLowerCase();
    const contactsReceived = safeInt(row.contacts_received);
    const appointmentsConverted = safeInt(row.appointments_converted);
    metrics.set(key, {
      contactsReceived,
      newContactsReceived: safeInt(row.new_contacts_received),
      appointmentsConverted,
      conversionRate: contactsReceived > 0 ? (appointmentsConverted * 100) / contactsReceived : 0,
    });
  }

  return metrics;
};

type GoogleAdsCampaignSnapshot = {
  campaignStatus: string;
  campaignPrimaryStatus: string;
  campaignPrimaryStatusReasons: string[];
  biddingStrategyType: string;
  optimizationScore: number;
  advertisingChannelType: string;
  campaignStartDate: string | null;
  campaignEndDate: string | null;
  budgetName: string;
  budgetPeriod: string;
  budgetAmount: number;
  currencyCode: string;
  snapshotDate: string | null;
  snapshotUpdatedAt: string | null;
};

const EMPTY_GOOGLE_ADS_SNAPSHOT: GoogleAdsCampaignSnapshot = {
  campaignStatus: '',
  campaignPrimaryStatus: '',
  campaignPrimaryStatusReasons: [],
  biddingStrategyType: '',
  optimizationScore: 0,
  advertisingChannelType: '',
  campaignStartDate: null,
  campaignEndDate: null,
  budgetName: '',
  budgetPeriod: '',
  budgetAmount: 0,
  currencyCode: '',
  snapshotDate: null,
  snapshotUpdatedAt: null,
};

const parseJsonArray = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => clean(item)).filter(Boolean);
    }
  } catch {
    return raw
      .split(';')
      .map((item) => clean(item))
      .filter(Boolean);
  }
  return [];
};

const getGoogleAdsSnapshotMap = async (
  db: DbInterface,
  campaignNames: string[],
  range: Pick<DateRange, 'endDate'>,
  brandRaw?: unknown
) => {
  const uniqueNames = Array.from(
    new Set(
      campaignNames
        .map((value) => clean(value))
        .filter(Boolean)
    )
  );

  const map = new Map<string, GoogleAdsCampaignSnapshot>();
  if (!uniqueNames.length) return map;

  const brand = normalizeTextFilter(brandRaw).toLowerCase();

  for (const chunk of chunkArray(uniqueNames, 100)) {
    const names = chunk.map((value) => value.toLowerCase());
    const placeholders = names.map(() => '?').join(', ');
    const where = ['date_ref <= ?', `LOWER(COALESCE(campaign_name, '')) IN (${placeholders})`];
    const params: unknown[] = [range.endDate, ...names];

    if (brand) {
      where.push('brand_slug = ?');
      params.push(brand);
    }

    const rows = await db.query(
      `
      SELECT
        campaign_name,
        campaign_status,
        campaign_primary_status,
        campaign_primary_status_reasons_json,
        bidding_strategy_type,
        optimization_score,
        advertising_channel_type,
        campaign_start_date,
        campaign_end_date,
        budget_name,
        budget_period,
        budget_amount,
        currency_code,
        date_ref,
        updated_at
      FROM raw_google_ads_campaign_daily
      WHERE ${where.join(' AND ')}
      ORDER BY date_ref DESC, updated_at DESC
      `,
      params
    );

    for (const raw of rows || []) {
      const row = raw as Record<string, unknown>;
      const key = clean(row.campaign_name).toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, {
        campaignStatus: clean(row.campaign_status),
        campaignPrimaryStatus: clean(row.campaign_primary_status),
        campaignPrimaryStatusReasons: parseJsonArray(row.campaign_primary_status_reasons_json),
        biddingStrategyType: clean(row.bidding_strategy_type),
        optimizationScore: safeNum(row.optimization_score),
        advertisingChannelType: clean(row.advertising_channel_type),
        campaignStartDate: clean(row.campaign_start_date) || null,
        campaignEndDate: clean(row.campaign_end_date) || null,
        budgetName: clean(row.budget_name),
        budgetPeriod: clean(row.budget_period),
        budgetAmount: safeNum(row.budget_amount),
        currencyCode: clean(row.currency_code),
        snapshotDate: clean(row.date_ref) || null,
        snapshotUpdatedAt: clean(row.updated_at) || null,
      });
    }
  }

  return map;
};

const toCampaignListItem = (
  row: Record<string, unknown>,
  clinia: {
    contactsReceived: number;
    newContactsReceived: number;
    appointmentsConverted: number;
    conversionRate: number;
  },
  googleAds: GoogleAdsCampaignSnapshot
) => {
  const derived = toDerivedMetrics(row);
  const interactions = safeInt(row.interactions);
  const conversions = safeNum(row.conversions);
  const conversionsValue = safeNum(row.conversions_value);
  const interactionRate = derived.impressions > 0 ? (interactions * 100) / derived.impressions : 0;
  const averageCost = interactions > 0 ? derived.spend / interactions : 0;
  const conversionRate = interactions > 0 ? (conversions * 100) / interactions : 0;
  const conversionsValuePerCost = derived.spend > 0 ? conversionsValue / derived.spend : 0;

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
    interactions,
    interactionRate,
    averageCost,
    conversions,
    conversionRate,
    allConversions: safeNum(row.all_conversions),
    conversionsValue,
    conversionsValuePerCost,
    costPerConversion: derived.costPerConversion,
    cliniaContacts: clinia.contactsReceived,
    cliniaNewContacts: clinia.newContactsReceived,
    cliniaAppointments: clinia.appointmentsConverted,
    cliniaConversionRate: clinia.conversionRate,
    cliniaCostPerContact: clinia.contactsReceived > 0 ? derived.spend / clinia.contactsReceived : 0,
    cliniaCostPerAppointment: clinia.appointmentsConverted > 0 ? derived.spend / clinia.appointmentsConverted : 0,
    campaignStatus: googleAds.campaignStatus,
    campaignPrimaryStatus: googleAds.campaignPrimaryStatus,
    campaignPrimaryStatusReasons: googleAds.campaignPrimaryStatusReasons,
    biddingStrategyType: googleAds.biddingStrategyType,
    optimizationScore: googleAds.optimizationScore,
    advertisingChannelType: googleAds.advertisingChannelType,
    budgetName: googleAds.budgetName,
    budgetPeriod: googleAds.budgetPeriod,
    budgetAmount: googleAds.budgetAmount,
    currencyCode: googleAds.currencyCode || 'BRL',
    campaignStartDate: googleAds.campaignStartDate,
    campaignEndDate: googleAds.campaignEndDate,
    googleAdsSnapshotDate: googleAds.snapshotDate,
    googleAdsSnapshotUpdatedAt: googleAds.snapshotUpdatedAt,
    lastSyncAt: clean(row.source_last_sync_at) || null,
  };
};

const buildGoogleAdsHealthSummary = (
  items: Array<ReturnType<typeof toCampaignListItem>>,
  overall: {
    interactions?: unknown;
    conversions?: unknown;
    conversions_value?: unknown;
    spend?: unknown;
  }
) => {
  const withScore = items.filter((item) => item.optimizationScore > 0);
  const avgOptimizationScore = withScore.length
    ? withScore.reduce((acc, item) => acc + item.optimizationScore, 0) / withScore.length
    : 0;
  const interactions = safeInt(overall.interactions);
  const conversions = safeNum(overall.conversions);
  const conversionsValue = safeNum(overall.conversions_value);
  const spend = safeNum(overall.spend);

  return {
    limitedByBudgetCount: items.filter((item) =>
      item.campaignPrimaryStatusReasons.some((reason) => reason.toUpperCase().includes('BUDGET'))
    ).length,
    pausedCount: items.filter((item) => item.campaignStatus.toUpperCase() === 'PAUSED').length,
    enabledCount: items.filter((item) => item.campaignStatus.toUpperCase() === 'ENABLED').length,
    avgOptimizationScore,
    avgConversionRate: interactions > 0 ? (conversions * 100) / interactions : 0,
    avgConversionsValuePerCost: spend > 0 ? conversionsValue / spend : 0,
  };
};

const getEnrichedCampaignItems = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const { range, where, params } = buildMainWhere(filters);
  const cliniaMetrics = isConsultareBrandScope(filters.brand)
    ? await getCliniaAdsCampaignMetrics(db, range)
    : new Map();

  const rows = await db.query(
    `
    ${buildCampaignAggregationSelect()}
    WHERE ${where.join(' AND ')}
    GROUP BY campaign_key
    ORDER BY spend DESC, campaign_name ASC
    `,
    params
  );

  const campaignNames = (rows || []).map((raw) => clean((raw as Record<string, unknown>).campaign_name));
  const googleAdsSnapshots = await getGoogleAdsSnapshotMap(db, campaignNames, range, filters.brand);

  return {
    range,
    items: (rows || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const clinia = cliniaMetrics.get(clean(row.campaign_name).toLowerCase()) || {
        contactsReceived: 0,
        newContactsReceived: 0,
        appointmentsConverted: 0,
        conversionRate: 0,
      };
      const googleAds = googleAdsSnapshots.get(clean(row.campaign_name).toLowerCase()) || EMPTY_GOOGLE_ADS_SNAPSHOT;
      return toCampaignListItem(row, clinia, googleAds);
    }),
  };
};

const listCliniaAdsByAd = async (
  db: DbInterface,
  range: Pick<DateRange, 'startDate' | 'endDate'>
) => {
  const rows = await db.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(origin), ''), 'unknown') AS origin,
      COALESCE(source_id, '') AS source_id,
      COALESCE(source_url, '') AS source_url,
      COALESCE(NULLIF(TRIM(title), ''), 'Sem título') AS title,
      SUM(CASE WHEN stage = 'INTERESTED' THEN 1 ELSE 0 END) AS contacts_received,
      COUNT(DISTINCT CASE WHEN stage = 'INTERESTED' THEN jid ELSE NULL END) AS new_contacts_received,
      SUM(CASE WHEN stage = 'APPOINTMENT' THEN 1 ELSE 0 END) AS appointments_converted,
      AVG(CASE WHEN conversion_time_sec > 0 THEN conversion_time_sec ELSE NULL END) AS avg_conversion_time_sec
    FROM raw_clinia_ads_contacts
    WHERE brand_slug = ?
      AND date_ref >= ?
      AND date_ref <= ?
    GROUP BY
      COALESCE(NULLIF(TRIM(origin), ''), 'unknown'),
      COALESCE(source_id, ''),
      COALESCE(source_url, ''),
      COALESCE(NULLIF(TRIM(title), ''), 'Sem título')
    ORDER BY contacts_received DESC, appointments_converted DESC, title ASC
    `,
    [CLINIA_ADS_BRAND, range.startDate, range.endDate]
  );

  return (rows || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const contactsReceived = safeInt(row.contacts_received);
    const appointmentsConverted = safeInt(row.appointments_converted);
    return {
      origin: clean(row.origin) || 'unknown',
      sourceId: clean(row.source_id),
      title: clean(row.title) || 'Sem título',
      sourceUrl: clean(row.source_url),
      contactsReceived,
      newContactsReceived: safeInt(row.new_contacts_received),
      appointmentsConverted,
      conversionRate: contactsReceived > 0 ? (appointmentsConverted * 100) / contactsReceived : 0,
      avgConversionTimeSec: safeNum(row.avg_conversion_time_sec),
    };
  });
};

const listCliniaAdsByOrigin = async (
  db: DbInterface,
  range: Pick<DateRange, 'startDate' | 'endDate'>
) => {
  const rows = await db.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(origin), ''), 'unknown') AS origin,
      SUM(CASE WHEN stage = 'INTERESTED' THEN 1 ELSE 0 END) AS contacts_received,
      COUNT(DISTINCT CASE WHEN stage = 'INTERESTED' THEN jid ELSE NULL END) AS new_contacts_received,
      SUM(CASE WHEN stage = 'APPOINTMENT' THEN 1 ELSE 0 END) AS appointments_converted
    FROM raw_clinia_ads_contacts
    WHERE brand_slug = ?
      AND date_ref >= ?
      AND date_ref <= ?
    GROUP BY COALESCE(NULLIF(TRIM(origin), ''), 'unknown')
    ORDER BY contacts_received DESC, origin ASC
    `,
    [CLINIA_ADS_BRAND, range.startDate, range.endDate]
  );

  return (rows || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const contactsReceived = safeInt(row.contacts_received);
    const appointmentsConverted = safeInt(row.appointments_converted);
    return {
      origin: clean(row.origin) || 'unknown',
      contactsReceived,
      newContactsReceived: safeInt(row.new_contacts_received),
      appointmentsConverted,
      conversionRate: contactsReceived > 0 ? (appointmentsConverted * 100) / contactsReceived : 0,
    };
  });
};

const getMarketingFunilCliniaAdsSummary = async (db: DbInterface, filters: MarketingFunilFilters) => {
  const range = normalizeDateRange(filters);
  const coverage = await getCliniaAdsCoverage(db, range);

  if (!isConsultareBrandScope(filters.brand)) {
    return getZeroCliniaAdsSummary({
      ...coverage,
      historyAvailable: false,
    });
  }

  if (!coverage.historyAvailable) {
    return getZeroCliniaAdsSummary(coverage);
  }

  const current = await getCliniaAdsAggregateForRange(db, range);
  const previousRange = getPreviousComparableRange(range, filters);
  const previousCoverage = await getCliniaAdsCoverage(db, previousRange);
  const previous = previousCoverage.historyAvailable
    ? await getCliniaAdsAggregateForRange(db, previousRange)
    : {
        contactsReceived: 0,
        newContactsReceived: 0,
        appointmentsConverted: 0,
        conversionRate: 0,
        avgConversionTimeSec: 0,
        lastSyncAt: null,
      };

  return {
    ...current,
    prevContactsReceived: previous.contactsReceived,
    prevNewContactsReceived: previous.newContactsReceived,
    prevAppointmentsConverted: previous.appointmentsConverted,
    prevConversionRate: previous.conversionRate,
    historyAvailable: coverage.historyAvailable,
    historyStartMonth: coverage.historyStartMonth,
    historyEndMonth: coverage.historyEndMonth,
  };
};

const getSourceStatus = async (db: DbInterface, serviceName: string) => {
  const rows = await db.query(
    `
    SELECT service_name, status, last_run, details
    FROM system_status
    WHERE service_name = ?
    LIMIT 1
    `,
    [serviceName]
  );
  const row = (rows?.[0] as Record<string, unknown>) || {};
  return {
    serviceName,
    status: clean(row.status) || 'UNKNOWN',
    lastRun: clean(row.last_run) || null,
    details: clean(row.details) || null,
  };
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
      dateBasis: 'Faturamento Bruto Anal\u00edtico',
    };
  }

  const range = normalizeDateRange(filters);
  const referenceDateExpr = getAnalyticsDateExpr('data_de_refer\u00eancia');
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
    dateBasis: 'Faturamento Bruto Anal\u00edtico',
  };
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
  const { items: campaignItems } = await getEnrichedCampaignItems(db, filters);
  const googleAdsHealth = buildGoogleAdsHealthSummary(campaignItems, base);
  const performanceFunnelSummary = await buildPerformanceFunnelSummary(
    db,
    filters,
    range,
    campaignItems.map((item) => item.campaignName)
  );
  const spend = derived.spend;
  const [appointments, revenue, cliniaAds] = await Promise.all([
    getMarketingFunilAppointmentsSummary(db, filters),
    getMarketingFunilRevenueSummary(db, filters),
    getMarketingFunilCliniaAdsSummary(db, filters),
  ]);
  const confirmedOrRealizedAppointments =
    (appointments.byStatus.find((item) => item.statusId === 3)?.count || 0) +
    (appointments.byStatus.find((item) => item.statusId === 7)?.count || 0);

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    campaigns: safeInt(base.campaigns),
    spend,
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
    cliniaAds,
    performanceFunnel: {
      scopeMode: performanceFunnelSummary.scopeMode,
      scopeLabel: performanceFunnelSummary.scopeLabel,
      googleSpend: spend,
      googleContactsReceived: performanceFunnelSummary.googleContactsReceived,
      googleNewContacts: performanceFunnelSummary.googleNewContacts,
      googleAppointmentsConverted: performanceFunnelSummary.googleAppointmentsConverted,
      costPerNewContact:
        performanceFunnelSummary.googleNewContacts > 0 ? spend / performanceFunnelSummary.googleNewContacts : 0,
      costPerAppointment:
        performanceFunnelSummary.googleAppointmentsConverted > 0
          ? spend / performanceFunnelSummary.googleAppointmentsConverted
          : 0,
      contactToAppointmentRate: performanceFunnelSummary.contactToAppointmentRate,
    },
    diagnostics: {
      whatsappClicks: derived.leads,
      whatsappCostPerClick: derived.cpl,
      googleUnmappedContacts: performanceFunnelSummary.diagnostics.googleUnmappedContacts,
      googleUnmappedNewContacts: performanceFunnelSummary.diagnostics.googleUnmappedNewContacts,
      googleUnmappedAppointments: performanceFunnelSummary.diagnostics.googleUnmappedAppointments,
    },
    operationalContext: {
      appointmentsValid: appointments.totalValid,
      appointmentsConfirmedOrRealized: confirmedOrRealizedAppointments,
      revenueTotal: revenue.total,
      revenueDateBasis: revenue.dateBasis,
    },
    googleAdsHealth,
  };
};

export const listMarketingFunnelCampaigns = async (db: DbInterface, filters: MarketingFunilFilters) => {
  const { range, items } = await getEnrichedCampaignItems(db, filters);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;
  const total = items.length;
  const pagedItems = items.slice(offset, offset + pageSize);

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    page,
    pageSize,
    total,
    items: pagedItems,
  };
};

export const listMarketingFunilGoogleAdsHealth = async (db: DbInterface, filters: MarketingFunilFilters) => {
  const { range, items } = await getEnrichedCampaignItems(db, filters);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const orderedItems = [...items].sort((left, right) => {
    const leftLimited = left.campaignPrimaryStatusReasons.some((reason) => reason.toUpperCase().includes('BUDGET')) ? 1 : 0;
    const rightLimited = right.campaignPrimaryStatusReasons.some((reason) => reason.toUpperCase().includes('BUDGET')) ? 1 : 0;
    if (leftLimited !== rightLimited) return rightLimited - leftLimited;
    if (left.optimizationScore !== right.optimizationScore) return left.optimizationScore - right.optimizationScore;
    if (left.spend !== right.spend) return right.spend - left.spend;
    return left.campaignName.localeCompare(right.campaignName, 'pt-BR');
  });

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    page,
    pageSize,
    total: orderedItems.length,
    items: orderedItems.slice(offset, offset + pageSize),
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

export const listMarketingFunilCliniaAds = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const coverage = await getCliniaAdsCoverage(db, range);

  if (!isConsultareBrandScope(filters.brand) || !coverage.historyAvailable) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      historyAvailable: isConsultareBrandScope(filters.brand) ? coverage.historyAvailable : false,
      historyStartMonth: coverage.historyStartMonth,
      historyEndMonth: coverage.historyEndMonth,
      items: [],
    };
  }

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    historyAvailable: coverage.historyAvailable,
    historyStartMonth: coverage.historyStartMonth,
    historyEndMonth: coverage.historyEndMonth,
    items: await listCliniaAdsByAd(db, range),
  };
};

export const listMarketingFunilCliniaAdsOrigins = async (db: DbInterface, filters: MarketingFunilFilters) => {
  await ensureMarketingFunilTables(db);
  const range = normalizeDateRange(filters);
  const coverage = await getCliniaAdsCoverage(db, range);

  if (!isConsultareBrandScope(filters.brand) || !coverage.historyAvailable) {
    return {
      periodRef: range.periodRef,
      startDate: range.startDate,
      endDate: range.endDate,
      historyAvailable: isConsultareBrandScope(filters.brand) ? coverage.historyAvailable : false,
      historyStartMonth: coverage.historyStartMonth,
      historyEndMonth: coverage.historyEndMonth,
      items: [],
    };
  }

  return {
    periodRef: range.periodRef,
    startDate: range.startDate,
    endDate: range.endDate,
    historyAvailable: coverage.historyAvailable,
    historyStartMonth: coverage.historyStartMonth,
    historyEndMonth: coverage.historyEndMonth,
    items: await listCliniaAdsByOrigin(db, range),
  };
};

export const getMarketingFunilSourceStatus = async (db: DbInterface) => {
  await ensureMarketingFunilTables(db);
  const [google, cliniaAds, appointments, revenue, googleSyncRows, cliniaSyncRows] = await Promise.all([
    getSourceStatus(db, 'marketing_funnel'),
    getSourceStatus(db, 'clinia_ads'),
    getSourceStatus(db, 'appointments'),
    getSourceStatus(db, 'faturamento'),
    db.query(`SELECT MAX(source_last_sync_at) AS last_sync_at FROM fact_marketing_funnel_daily`),
    db.query(`SELECT MAX(source_last_sync_at) AS last_sync_at FROM fact_clinia_ads_daily WHERE brand_slug = ?`, [CLINIA_ADS_BRAND]),
  ]);

  return {
    google: {
      ...google,
      dataLastSyncAt: clean((googleSyncRows?.[0] as Record<string, unknown>)?.last_sync_at) || null,
    },
    cliniaAds: {
      ...cliniaAds,
      dataLastSyncAt: clean((cliniaSyncRows?.[0] as Record<string, unknown>)?.last_sync_at) || null,
    },
    appointments,
    revenue,
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
