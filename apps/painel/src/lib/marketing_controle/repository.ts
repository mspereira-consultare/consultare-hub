import type { DbInterface } from '@/lib/db';
import {
  createMarketingFunnelJob,
  getLatestMarketingFunnelJob,
  getMarketingFunilSourceStatus,
} from '@/lib/marketing_funil/repository';

export class MarketingControleValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type MarketingControleBrand = 'consultare' | 'resolve';

export type MarketingControleFilters = {
  monthRef?: unknown;
  brand?: unknown;
};

type MarketingControleBucketKey = 'week1' | 'week2' | 'week3' | 'week4' | 'monthly';

type MarketingControleBucket = {
  key: MarketingControleBucketKey;
  label: string;
  startDate: string;
  endDate: string;
};

type MarketingDailyRow = {
  dateRef: string;
  spend: number;
  impressions: number;
  clicks: number;
  totalUsers: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  pageViews: number;
  leads: number;
  conversions: number;
  conversionsValue: number;
  durationWeighted: number;
};

type CliniaDailyRow = {
  dateRef: string;
  contactsReceived: number;
  newContactsReceived: number;
  appointmentsConverted: number;
};

type BucketTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  totalUsers: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  pageViews: number;
  leads: number;
  conversions: number;
  conversionsValue: number;
  durationWeighted: number;
  contactsReceived: number;
  newContactsReceived: number;
  appointmentsConverted: number;
};

type MarketingControleValueFormat = 'integer' | 'currency' | 'percentage' | 'duration' | 'multiplier';

type MarketingControleGridRow = {
  key: string;
  label: string;
  format: MarketingControleValueFormat;
  week1: number | null;
  week2: number | null;
  week3: number | null;
  week4: number | null;
  monthly: number | null;
};

type MarketingControleGridSection = {
  key: string;
  title: string;
  subtitle: string;
  availability: 'available' | 'planned';
  rows: MarketingControleGridRow[];
};

type MarketingControleSummaryCards = {
  visitors: number;
  whatsappClicks: number;
  cliniaNewContacts: number;
  cliniaAppointments: number;
  googleSpend: number;
  costPerNewContact: number | null;
  costPerAppointment: number | null;
};

type NormalizedFilters = {
  brand: MarketingControleBrand;
  monthRef: string;
  startDate: string;
  endDate: string;
  buckets: MarketingControleBucket[];
};

export const MARKETING_CONTROLE_BRAND_OPTIONS: Array<{ value: MarketingControleBrand; label: string }> = [
  { value: 'consultare', label: 'Consultare' },
  { value: 'resolve', label: 'Resolve' },
];

const PLANNED_SECTIONS: Array<Pick<MarketingControleGridSection, 'key' | 'title' | 'subtitle'>> = [
  {
    key: 'facebook-organico',
    title: 'Facebook orgânico',
    subtitle: 'Bloco reservado para a camada orgânica do Facebook.',
  },
  {
    key: 'instagram-organico',
    title: 'Instagram orgânico',
    subtitle: 'Bloco reservado para a camada orgânica do Instagram.',
  },
  {
    key: 'linkedin-organico',
    title: 'LinkedIn orgânico',
    subtitle: 'Bloco reservado para a camada orgânica do LinkedIn.',
  },
  {
    key: 'email-marketing',
    title: 'E-mail marketing',
    subtitle: 'Bloco reservado para disparos, entregabilidade e conversões por e-mail.',
  },
  {
    key: 'google-meu-negocio',
    title: 'Google Meu Negócio',
    subtitle: 'Bloco reservado para desempenho local e perfil da empresa.',
  },
  {
    key: 'seo-semrush',
    title: 'SEO técnico / SEMrush',
    subtitle: 'Bloco reservado para monitoramento técnico e ganho orgânico.',
  },
];

const clean = (value: unknown) => String(value ?? '').trim();

const safeNum = (value: unknown) => {
  const normalized = clean(value).replace(',', '.');
  const parsed = Number(normalized || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeInt = (value: unknown) => {
  const parsed = Number.parseInt(clean(value || 0), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getSaoPauloToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year') || '1970'),
    month: Number(map.get('month') || '01'),
  };
};

const getCurrentMonthRef = () => {
  const today = getSaoPauloToday();
  return `${today.year}-${String(today.month).padStart(2, '0')}`;
};

const normalizeMonthRef = (value: unknown) => {
  const raw = clean(value) || getCurrentMonthRef();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new MarketingControleValidationError('monthRef invalido. Use YYYY-MM.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new MarketingControleValidationError('monthRef invalido. Mes deve estar entre 01 e 12.');
  }

  const mm = String(month).padStart(2, '0');
  const endDate = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  return {
    monthRef: `${year}-${mm}`,
    startDate: `${year}-${mm}-01`,
    endDate,
  };
};

const normalizeBrand = (value: unknown): MarketingControleBrand => {
  const raw = clean(value).toLowerCase();
  if (!raw) return 'consultare';
  if (raw === 'consultare' || raw === 'resolve') return raw;
  throw new MarketingControleValidationError('Marca invalida. Use consultare ou resolve.');
};

const shiftDate = (dateIso: string, days: number) => {
  const parsed = new Date(`${dateIso}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const buildBuckets = (startDate: string, endDate: string): MarketingControleBucket[] => {
  const monthStart = startDate;
  const week1End = shiftDate(monthStart, 6);
  const week2Start = shiftDate(monthStart, 7);
  const week2End = shiftDate(monthStart, 13);
  const week3Start = shiftDate(monthStart, 14);
  const week3End = shiftDate(monthStart, 20);
  const week4Start = shiftDate(monthStart, 21);

  return [
    { key: 'week1', label: 'Semana 1', startDate: monthStart, endDate: week1End },
    { key: 'week2', label: 'Semana 2', startDate: week2Start, endDate: week2End },
    { key: 'week3', label: 'Semana 3', startDate: week3Start, endDate: week3End },
    { key: 'week4', label: 'Semana 4', startDate: week4Start, endDate },
    { key: 'monthly', label: 'Mensal', startDate, endDate },
  ];
};

export const normalizeMarketingControleFilters = (filters: MarketingControleFilters): NormalizedFilters => {
  const month = normalizeMonthRef(filters.monthRef);
  const brand = normalizeBrand(filters.brand);
  return {
    brand,
    monthRef: month.monthRef,
    startDate: month.startDate,
    endDate: month.endDate,
    buckets: buildBuckets(month.startDate, month.endDate),
  };
};

const getMissingTableMessage = (error: unknown) =>
  String((error as { message?: unknown })?.message || '').toLowerCase();

const queryRowsSafe = async (db: DbInterface, sql: string, params: unknown[]) => {
  try {
    return await db.query(sql, params);
  } catch (error: unknown) {
    const message = getMissingTableMessage(error);
    if (message.includes('no such table') || message.includes("doesn't exist") || message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};

const listMarketingDaily = async (db: DbInterface, filters: NormalizedFilters): Promise<MarketingDailyRow[]> => {
  const rows = await queryRowsSafe(
    db,
    `
      SELECT
        date_ref,
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(total_users) AS total_users,
        SUM(new_users) AS new_users,
        SUM(sessions) AS sessions,
        SUM(engaged_sessions) AS engaged_sessions,
        SUM(page_views) AS page_views,
        SUM(leads) AS leads,
        SUM(conversions) AS conversions,
        SUM(conversions_value) AS conversions_value,
        SUM(COALESCE(avg_session_duration_sec, 0) * COALESCE(sessions, 0)) AS duration_weighted
      FROM fact_marketing_funnel_daily
      WHERE date_ref BETWEEN ? AND ?
        AND brand_slug = ?
      GROUP BY date_ref
      ORDER BY date_ref ASC
    `,
    [filters.startDate, filters.endDate, filters.brand]
  );

  return (rows || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      dateRef: clean(row.date_ref),
      spend: safeNum(row.spend),
      impressions: safeInt(row.impressions),
      clicks: safeInt(row.clicks),
      totalUsers: safeInt(row.total_users),
      newUsers: safeInt(row.new_users),
      sessions: safeInt(row.sessions),
      engagedSessions: safeInt(row.engaged_sessions),
      pageViews: safeInt(row.page_views),
      leads: safeInt(row.leads),
      conversions: safeNum(row.conversions),
      conversionsValue: safeNum(row.conversions_value),
      durationWeighted: safeNum(row.duration_weighted),
    };
  });
};

const listCliniaGoogleDaily = async (db: DbInterface, filters: NormalizedFilters): Promise<CliniaDailyRow[]> => {
  const rows = await queryRowsSafe(
    db,
    `
      SELECT
        date_ref,
        SUM(contacts_received) AS contacts_received,
        SUM(new_contacts_received) AS new_contacts_received,
        SUM(appointments_converted) AS appointments_converted
      FROM fact_clinia_ads_daily
      WHERE date_ref BETWEEN ? AND ?
        AND brand_slug = ?
        AND LOWER(COALESCE(origin, '')) = 'google'
      GROUP BY date_ref
      ORDER BY date_ref ASC
    `,
    [filters.startDate, filters.endDate, filters.brand]
  );

  return (rows || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      dateRef: clean(row.date_ref),
      contactsReceived: safeInt(row.contacts_received),
      newContactsReceived: safeInt(row.new_contacts_received),
      appointmentsConverted: safeInt(row.appointments_converted),
    };
  });
};

const initBucketTotals = (): BucketTotals => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  totalUsers: 0,
  newUsers: 0,
  sessions: 0,
  engagedSessions: 0,
  pageViews: 0,
  leads: 0,
  conversions: 0,
  conversionsValue: 0,
  durationWeighted: 0,
  contactsReceived: 0,
  newContactsReceived: 0,
  appointmentsConverted: 0,
});

const buildDateList = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = shiftDate(current, 1);
  }
  return dates;
};

const accumulateBucket = (
  marketingByDate: Map<string, MarketingDailyRow>,
  cliniaByDate: Map<string, CliniaDailyRow>,
  startDate: string,
  endDate: string
): BucketTotals => {
  const totals = initBucketTotals();
  for (const dateRef of buildDateList(startDate, endDate)) {
    const marketing = marketingByDate.get(dateRef);
    if (marketing) {
      totals.spend += marketing.spend;
      totals.impressions += marketing.impressions;
      totals.clicks += marketing.clicks;
      totals.totalUsers += marketing.totalUsers;
      totals.newUsers += marketing.newUsers;
      totals.sessions += marketing.sessions;
      totals.engagedSessions += marketing.engagedSessions;
      totals.pageViews += marketing.pageViews;
      totals.leads += marketing.leads;
      totals.conversions += marketing.conversions;
      totals.conversionsValue += marketing.conversionsValue;
      totals.durationWeighted += marketing.durationWeighted;
    }

    const clinia = cliniaByDate.get(dateRef);
    if (clinia) {
      totals.contactsReceived += clinia.contactsReceived;
      totals.newContactsReceived += clinia.newContactsReceived;
      totals.appointmentsConverted += clinia.appointmentsConverted;
    }
  }

  return totals;
};

const nullableDivision = (numerator: number, denominator: number) => {
  if (!denominator) return null;
  return numerator / denominator;
};

const percentDivision = (numerator: number, denominator: number) => {
  if (!denominator) return null;
  return (numerator * 100) / denominator;
};

const buildRow = (
  key: string,
  label: string,
  format: MarketingControleValueFormat,
  selector: (totals: BucketTotals) => number | null,
  bucketTotals: Record<MarketingControleBucketKey, BucketTotals>
): MarketingControleGridRow => ({
  key,
  label,
  format,
  week1: selector(bucketTotals.week1),
  week2: selector(bucketTotals.week2),
  week3: selector(bucketTotals.week3),
  week4: selector(bucketTotals.week4),
  monthly: selector(bucketTotals.monthly),
});

const buildAvailableSections = (
  bucketTotals: Record<MarketingControleBucketKey, BucketTotals>
): MarketingControleGridSection[] => [
  {
    key: 'kpis-principais',
    title: 'KPIs principais',
    subtitle: 'Leitura mensal com foco em tráfego, intenção e avanços do Google.',
    availability: 'available',
    rows: [
      buildRow('site-visitors', 'Visitantes do site', 'integer', (totals) => totals.totalUsers, bucketTotals),
      buildRow('whatsapp-clicks', 'Cliques em WhatsApp', 'integer', (totals) => totals.leads, bucketTotals),
      buildRow(
        'clinia-new-contacts',
        'Novos contatos Clinia (Google)',
        'integer',
        (totals) => totals.newContactsReceived,
        bucketTotals
      ),
      buildRow(
        'clinia-appointments',
        'Agendamentos Clinia (Google)',
        'integer',
        (totals) => totals.appointmentsConverted,
        bucketTotals
      ),
      buildRow('google-spend', 'Investimento Google Ads', 'currency', (totals) => totals.spend, bucketTotals),
      buildRow(
        'cost-per-contact',
        'Custo por novo contato',
        'currency',
        (totals) => nullableDivision(totals.spend, totals.newContactsReceived),
        bucketTotals
      ),
      buildRow(
        'cost-per-appointment',
        'Custo por agendamento',
        'currency',
        (totals) => nullableDivision(totals.spend, totals.appointmentsConverted),
        bucketTotals
      ),
    ],
  },
  {
    key: 'google-ads',
    title: 'Google Ads',
    subtitle: 'Métrica de verba, clique, conversão e eficiência da camada paga.',
    availability: 'available',
    rows: [
      buildRow('impressions', 'Impressões', 'integer', (totals) => totals.impressions, bucketTotals),
      buildRow('clicks', 'Cliques', 'integer', (totals) => totals.clicks, bucketTotals),
      buildRow('ctr', 'CTR', 'percentage', (totals) => percentDivision(totals.clicks, totals.impressions), bucketTotals),
      buildRow('avg-cpc', 'CPC médio', 'currency', (totals) => nullableDivision(totals.spend, totals.clicks), bucketTotals),
      buildRow('conversions', 'Conversões', 'integer', (totals) => totals.conversions, bucketTotals),
      buildRow('conversion-value', 'Valor de conversão', 'currency', (totals) => totals.conversionsValue, bucketTotals),
      buildRow(
        'conversion-value-per-cost',
        'Valor conv. / custo',
        'multiplier',
        (totals) => nullableDivision(totals.conversionsValue, totals.spend),
        bucketTotals
      ),
    ],
  },
  {
    key: 'site-ga4',
    title: 'Site / GA4',
    subtitle: 'Comportamento de navegação do site no período selecionado.',
    availability: 'available',
    rows: [
      buildRow('ga4-users', 'Usuários', 'integer', (totals) => totals.totalUsers, bucketTotals),
      buildRow('ga4-new-users', 'Novos usuários', 'integer', (totals) => totals.newUsers, bucketTotals),
      buildRow('ga4-sessions', 'Sessões', 'integer', (totals) => totals.sessions, bucketTotals),
      buildRow('ga4-engaged-sessions', 'Sessões engajadas', 'integer', (totals) => totals.engagedSessions, bucketTotals),
      buildRow(
        'ga4-engagement-rate',
        'Taxa de engajamento',
        'percentage',
        (totals) => percentDivision(totals.engagedSessions, totals.sessions),
        bucketTotals
      ),
      buildRow(
        'ga4-avg-duration',
        'Duração média',
        'duration',
        (totals) => nullableDivision(totals.durationWeighted, totals.sessions),
        bucketTotals
      ),
      buildRow('ga4-pageviews', 'Page views', 'integer', (totals) => totals.pageViews, bucketTotals),
    ],
  },
];

export const getMarketingControleSummary = async (db: DbInterface, filters: MarketingControleFilters) => {
  const normalized = normalizeMarketingControleFilters(filters);
  const [marketingRows, cliniaRows, latestJob] = await Promise.all([
    listMarketingDaily(db, normalized),
    listCliniaGoogleDaily(db, normalized),
    getLatestMarketingFunnelJob(db, { periodRef: normalized.monthRef, brand: normalized.brand }),
  ]);

  const marketingByDate = new Map(marketingRows.map((row) => [row.dateRef, row]));
  const cliniaByDate = new Map(cliniaRows.map((row) => [row.dateRef, row]));
  const monthlyTotals = accumulateBucket(marketingByDate, cliniaByDate, normalized.startDate, normalized.endDate);

  const cards: MarketingControleSummaryCards = {
    visitors: monthlyTotals.totalUsers,
    whatsappClicks: monthlyTotals.leads,
    cliniaNewContacts: monthlyTotals.newContactsReceived,
    cliniaAppointments: monthlyTotals.appointmentsConverted,
    googleSpend: monthlyTotals.spend,
    costPerNewContact: nullableDivision(monthlyTotals.spend, monthlyTotals.newContactsReceived),
    costPerAppointment: nullableDivision(monthlyTotals.spend, monthlyTotals.appointmentsConverted),
  };

  return {
    monthRef: normalized.monthRef,
    brand: normalized.brand,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    hasAnyData: marketingRows.length > 0 || cliniaRows.length > 0,
    cards,
    latestJob,
  };
};

export const getMarketingControleGrid = async (db: DbInterface, filters: MarketingControleFilters) => {
  const normalized = normalizeMarketingControleFilters(filters);
  const [marketingRows, cliniaRows] = await Promise.all([
    listMarketingDaily(db, normalized),
    listCliniaGoogleDaily(db, normalized),
  ]);

  const marketingByDate = new Map(marketingRows.map((row) => [row.dateRef, row]));
  const cliniaByDate = new Map(cliniaRows.map((row) => [row.dateRef, row]));

  const bucketTotals = normalized.buckets.reduce((acc, bucket) => {
    acc[bucket.key] = accumulateBucket(marketingByDate, cliniaByDate, bucket.startDate, bucket.endDate);
    return acc;
  }, {} as Record<MarketingControleBucketKey, BucketTotals>);

  const sections: MarketingControleGridSection[] = [
    ...buildAvailableSections(bucketTotals),
    ...PLANNED_SECTIONS.map((section) => ({
      ...section,
      availability: 'planned' as const,
      rows: [],
    })),
  ];

  return {
    monthRef: normalized.monthRef,
    brand: normalized.brand,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    columns: normalized.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
    })),
    sections,
  };
};

export const getMarketingControleSourceStatus = async (db: DbInterface) => getMarketingFunilSourceStatus(db);

export const createMarketingControleRefreshJob = async (
  db: DbInterface,
  filters: MarketingControleFilters,
  userId: string
) => {
  const normalized = normalizeMarketingControleFilters(filters);
  return createMarketingFunnelJob(
    db,
    {
      periodRef: normalized.monthRef,
      brand: normalized.brand,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
    },
    userId
  );
};
