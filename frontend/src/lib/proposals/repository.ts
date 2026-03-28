import { getDbConnection, type DbInterface } from '@/lib/db';
import {
  AWAITING_CLIENT_APPROVAL_STATUS,
  PROPOSAL_CONVERSION_REASONS_BY_STATUS,
  PROPOSAL_CONVERSION_STATUSES,
  type ProposalConversionReason,
  type ProposalConversionStatus,
} from '@/lib/proposals/constants';
const FEEGOW_BASE_URL = 'https://api.feegow.com/v1/api';
const CONTACT_CACHE_STALE_DAYS = 30;
const CONTACT_HYDRATION_CONCURRENCY = 8;

export type ProposalFilters = {
  startDate: string;
  endDate: string;
  unit: string;
  status: string;
};

export type ProposalDetailFilters = ProposalFilters & {
  detailStatus: string;
  search: string;
  conversion: string;
  responsible: string;
  professional: string;
  page: number;
  pageSize: number;
};

export type ProposalFollowupUserOption = {
  value: string;
  label: string;
};

export type ProposalFollowupOptions = {
  users: ProposalFollowupUserOption[];
  conversionStatuses: Array<{ value: ProposalConversionStatus; label: string }>;
  conversionReasonsByStatus: Record<string, Array<{ value: ProposalConversionReason; label: string }>>;
};

export type ProposalFilterOptions = {
  availableUnits: string[];
  availableStatuses: string[];
  availableProfessionals: string[];
};

export type ProposalFollowupUpdateInput = {
  proposalId: number;
  conversionStatus: ProposalConversionStatus;
  conversionReason: ProposalConversionReason | null;
  responsibleUserId: string | null;
  updatedByUserId: string;
  updatedByUserName: string;
};

export type ProposalProcedureDetail = {
  name: string;
  value: number;
};

export type ProposalDetailRow = {
  proposalId: number;
  proposalDate: string;
  status: string;
  unitName: string;
  professionalName: string;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  procedureSummary: string;
  procedureCount: number;
  proceduresDetailed: ProposalProcedureDetail[];
  proceduresDetailedText: string;
  totalValue: number;
  proposalLastUpdate: string | null;
  conversionStatus: ProposalConversionStatus;
  conversionStatusLabel: string;
  conversionReason: ProposalConversionReason | null;
  conversionReasonLabel: string | null;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
};

export type ProposalDetailResult = {
  rows: ProposalDetailRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  detailStatusApplied: string;
};

type CachedContactRow = {
  patient_id?: number | string | null;
  patient_name?: string | null;
  phone_primary?: string | null;
  email_primary?: string | null;
  cpf?: string | null;
  updated_at?: string | null;
};

type FeegowPatientContact = {
  patientId: number;
  patientName: string;
  phonePrimary: string;
  emailPrimary: string;
  cpf: string;
};

type RawProposalRow = {
  proposal_id?: number | string;
  date?: string | null;
  status?: string | null;
  unit_name?: string | null;
  professional_name?: string | null;
  total_value?: number | string | null;
  proposal_last_update?: string | null;
  patient_id?: number | string | null;
  items_json?: string | null;
  patient_name?: string | null;
  phone_primary?: string | null;
  email_primary?: string | null;
  conversion_status?: string | null;
  conversion_reason?: string | null;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  updated_by_user_name?: string | null;
  followup_updated_at?: string | null;
};

const normalizeString = (value: unknown) => String(value || '').trim();
const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const proposalConversionStatusMap = new Map(PROPOSAL_CONVERSION_STATUSES.map((item) => [item.value, item.label]));
const proposalConversionReasonMap = new Map(
  Object.values(PROPOSAL_CONVERSION_REASONS_BY_STATUS).flat().map((item) => [item.value, item.label]),
);
const allowedConversionStatuses = new Set(PROPOSAL_CONVERSION_STATUSES.map((item) => item.value));
const allowedConversionReasonsByStatus = Object.fromEntries(
  Object.entries(PROPOSAL_CONVERSION_REASONS_BY_STATUS).map(([status, items]) => [status, new Set(items.map((item) => item.value))]),
) as Record<string, Set<string>>;

const normalizeDateParam = (value: string | null | undefined, fallback: string) => {
  const raw = normalizeString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
};

const normalizeProposalConversionStatus = (value: unknown): ProposalConversionStatus => {
  const raw = normalizeString(value).toUpperCase();
  return allowedConversionStatuses.has(raw as ProposalConversionStatus) ? (raw as ProposalConversionStatus) : 'PENDENTE';
};

const normalizeProposalConversionReason = (
  status: ProposalConversionStatus,
  value: unknown,
): ProposalConversionReason | null => {
  const raw = normalizeString(value).toUpperCase();
  if (!raw) return null;
  const allowedReasons = allowedConversionReasonsByStatus[status];
  if (!allowedReasons || !allowedReasons.has(raw)) return null;
  return raw as ProposalConversionReason;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const listColumnNames = async (db: DbInterface, tableName: string) => {
  const rows = await db.query(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row: any) => normalizeString(row?.name || row?.COLUMN_NAME)).filter(Boolean));
};

const ensureColumn = async (db: DbInterface, tableName: string, columnName: string, definition: string) => {
  const columns = await listColumnNames(db, tableName);
  if (columns.has(columnName)) return;
  await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

export const ensureProposalsSupportTables = async (db: DbInterface = getDbConnection()) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS feegow_patient_contacts_cache (
      patient_id BIGINT PRIMARY KEY,
      patient_name TEXT,
      phone_primary TEXT,
      email_primary TEXT,
      cpf TEXT,
      updated_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS proposal_followup_control (
      proposal_id BIGINT PRIMARY KEY,
      conversion_status VARCHAR(40) NULL,
      conversion_reason VARCHAR(64) NULL,
      responsible_user_id VARCHAR(64) NULL,
      responsible_user_name TEXT NULL,
      updated_by_user_id VARCHAR(64) NULL,
      updated_by_user_name TEXT NULL,
      updated_at TEXT NULL
    )
  `);

  await ensureColumn(db, 'feegow_proposals', 'patient_id', 'BIGINT');
  await ensureColumn(db, 'feegow_proposals', 'proposal_last_update', 'TEXT');
};

const getTodayRef = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
};

export const normalizeProposalFilters = (params: URLSearchParams | Record<string, unknown>): ProposalFilters => {
  const today = getTodayRef();
  const startDate = normalizeDateParam(getParam(params, 'startDate'), today);
  const endDate = normalizeDateParam(getParam(params, 'endDate'), startDate);
  return {
    startDate,
    endDate,
    unit: normalizeString(getParam(params, 'unit')) || 'all',
    status: normalizeString(getParam(params, 'status')) || 'all',
  };
};

export const normalizeProposalDetailFilters = (
  params: URLSearchParams | Record<string, unknown>,
  base?: ProposalFilters,
): ProposalDetailFilters => {
  const filters = base || normalizeProposalFilters(params);
  const page = clamp(normalizeNumber(getParam(params, 'page')) || 1, 1, 999999);
  const pageSize = clamp(normalizeNumber(getParam(params, 'pageSize')) || 25, 10, 200);
  return {
    ...filters,
    detailStatus: normalizeString(getParam(params, 'detailStatus')),
    search: normalizeString(getParam(params, 'search')),
    conversion: normalizeString(getParam(params, 'conversion')) || 'all',
    responsible: normalizeString(getParam(params, 'responsible')) || 'all',
    professional: normalizeString(getParam(params, 'professional')) || 'all',
    page,
    pageSize,
  };
};

const getParam = (params: URLSearchParams | Record<string, unknown>, key: string) => {
  if (params instanceof URLSearchParams) return params.get(key);
  const raw = params[key];
  return raw == null ? null : String(raw);
};

export const resolveProposalDetailStatus = (status: string, detailStatus: string) => {
  if (normalizeString(status) && normalizeString(status).toLowerCase() !== 'all') {
    return normalizeString(status);
  }
  if (normalizeString(detailStatus)) return normalizeString(detailStatus);
  return AWAITING_CLIENT_APPROVAL_STATUS;
};

const buildProposalWhere = (filters: ProposalDetailFilters | ProposalFilters, detailStatusApplied?: string) => {
  let where = 'WHERE p.date BETWEEN ? AND ?';
  const params: any[] = [filters.startDate, filters.endDate];

  if (normalizeString(filters.unit).toLowerCase() !== 'all') {
    where += " AND UPPER(TRIM(COALESCE(p.unit_name, ''))) = UPPER(TRIM(?))";
    params.push(filters.unit);
  }

  const statusToApply = detailStatusApplied ?? (normalizeString(filters.status).toLowerCase() !== 'all' ? filters.status : '');
  if (normalizeString(statusToApply)) {
    where += " AND LOWER(TRIM(COALESCE(p.status, ''))) = LOWER(TRIM(?))";
    params.push(statusToApply);
  }

  if ('conversion' in filters && normalizeString(filters.conversion).toLowerCase() !== 'all') {
    where += " AND UPPER(TRIM(COALESCE(NULLIF(f.conversion_status, ''), 'PENDENTE'))) = UPPER(TRIM(?))";
    params.push(filters.conversion);
  }

  if ('responsible' in filters && normalizeString(filters.responsible).toLowerCase() !== 'all') {
    where += " AND TRIM(COALESCE(f.responsible_user_id, '')) = TRIM(?)";
    params.push(filters.responsible);
  }

  if ('professional' in filters && normalizeString(filters.professional).toLowerCase() !== 'all') {
    where += " AND UPPER(TRIM(COALESCE(p.professional_name, ''))) = UPPER(TRIM(?))";
    params.push(filters.professional);
  }

  return { where, params };
};

const buildSearchClause = (search: string) => {
  const normalized = normalizeString(search);
  if (!normalized) return { sql: '', params: [] as any[] };
  const pattern = `%${normalized.toUpperCase()}%`;
  return {
    sql: `
      AND (
        UPPER(COALESCE(c.patient_name, '')) LIKE ?
        OR UPPER(COALESCE(c.phone_primary, '')) LIKE ?
        OR UPPER(COALESCE(c.email_primary, '')) LIKE ?
        OR UPPER(COALESCE(p.professional_name, '')) LIKE ?
        OR UPPER(COALESCE(p.unit_name, '')) LIKE ?
        OR UPPER(COALESCE(p.items_json, '')) LIKE ?
        OR UPPER(COALESCE(f.responsible_user_name, '')) LIKE ?
        OR UPPER(COALESCE(f.updated_by_user_name, '')) LIKE ?
      )
    `,
    params: [pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern],
  };
};

export const listProposalFilterOptions = async (
  filters: ProposalFilters,
  db: DbInterface = getDbConnection(),
): Promise<ProposalFilterOptions> => {
  await ensureProposalsSupportTables(db);

  const unitsParams: any[] = [filters.startDate, filters.endDate];
  let unitsWhere = 'WHERE date BETWEEN ? AND ?';
  if (normalizeString(filters.status).toLowerCase() !== 'all') {
    unitsWhere += " AND LOWER(TRIM(COALESCE(status, ''))) = LOWER(TRIM(?))";
    unitsParams.push(filters.status);
  }

  const statusesParams: any[] = [filters.startDate, filters.endDate];
  let statusesWhere = 'WHERE date BETWEEN ? AND ?';
  if (normalizeString(filters.unit).toLowerCase() !== 'all') {
    statusesWhere += " AND UPPER(TRIM(COALESCE(unit_name, ''))) = UPPER(TRIM(?))";
    statusesParams.push(filters.unit);
  }

  const professionalsParams: any[] = [filters.startDate, filters.endDate];
  let professionalsWhere = 'WHERE date BETWEEN ? AND ?';
  if (normalizeString(filters.unit).toLowerCase() !== 'all') {
    professionalsWhere += " AND UPPER(TRIM(COALESCE(unit_name, ''))) = UPPER(TRIM(?))";
    professionalsParams.push(filters.unit);
  }
  if (normalizeString(filters.status).toLowerCase() !== 'all') {
    professionalsWhere += " AND LOWER(TRIM(COALESCE(status, ''))) = LOWER(TRIM(?))";
    professionalsParams.push(filters.status);
  }

  const [unitRows, statusRows, professionalRows] = await Promise.all([
    db.query(
      `
        SELECT DISTINCT TRIM(unit_name) AS unit_name
        FROM feegow_proposals
        ${unitsWhere}
          AND unit_name IS NOT NULL
          AND TRIM(unit_name) <> ''
        ORDER BY unit_name
      `,
      unitsParams,
    ),
    db.query(
      `
        SELECT DISTINCT TRIM(status) AS status
        FROM feegow_proposals
        ${statusesWhere}
          AND status IS NOT NULL
          AND TRIM(status) <> ''
        ORDER BY status
      `,
      statusesParams,
    ),
    db.query(
      `
        SELECT DISTINCT TRIM(professional_name) AS professional_name
        FROM feegow_proposals
        ${professionalsWhere}
          AND professional_name IS NOT NULL
          AND TRIM(professional_name) <> ''
        ORDER BY professional_name
      `,
      professionalsParams,
    ),
  ]);

  return {
    availableUnits: unitRows
      .map((row: any) => normalizeString(row?.unit_name))
      .filter(Boolean),
    availableStatuses: statusRows
      .map((row: any) => normalizeString(row?.status))
      .filter(Boolean),
    availableProfessionals: professionalRows
      .map((row: any) => normalizeString(row?.professional_name))
      .filter(Boolean),
  };
};

const parseItemsJson = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return [] as Array<{ nome?: string; valor?: number }>;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const summarizeProcedures = (itemsJson: unknown) => {
  const items = parseItemsJson(itemsJson);
  const names = items.map((item) => normalizeString(item?.nome)).filter(Boolean);
  return {
    summary: names.join(' | '),
    count: names.length,
  };
};

const buildProcedureDetails = (itemsJson: unknown): ProposalProcedureDetail[] =>
  parseItemsJson(itemsJson)
    .map((item) => ({
      name: normalizeString(item?.nome),
      value: normalizeNumber(item?.valor),
    }))
    .filter((item) => item.name);

const buildDetailedProceduresText = (procedures: ProposalProcedureDetail[]) =>
  procedures.length === 0
    ? ''
    : procedures
        .map((item) =>
          item.value > 0
            ? `${item.name} (${item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
            : item.name,
        )
        .join(' | ');

const nowTimestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const parseCachedContactTimestamp = (value: string | null | undefined) => {
  const normalized = normalizeString(value).replace(' ', 'T');
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractPrimaryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeString(entry);
      if (normalized) return normalized;
    }
    return '';
  }
  return normalizeString(value);
};

export const listProposalFollowupOptions = async (db: DbInterface = getDbConnection()): Promise<ProposalFollowupOptions> => {
  await ensureProposalsSupportTables(db);

  const userRows = await db.query(
    `
      SELECT id, name
      FROM users
      WHERE UPPER(TRIM(COALESCE(status, ''))) = 'ATIVO'
      ORDER BY name ASC
    `,
  );

  return {
    users: userRows
      .map((row: any) => ({
        value: normalizeString(row?.id),
        label: normalizeString(row?.name),
      }))
      .filter((item) => item.value && item.label),
    conversionStatuses: [...PROPOSAL_CONVERSION_STATUSES],
    conversionReasonsByStatus: Object.fromEntries(
      Object.entries(PROPOSAL_CONVERSION_REASONS_BY_STATUS).map(([status, items]) => [status, [...items]]),
    ),
  };
};

const fetchPatientContactFromFeegow = async (patientId: number): Promise<FeegowPatientContact | null> => {
  const token = normalizeString(process.env.FEEGOW_ACCESS_TOKEN);
  if (!token || !Number.isFinite(patientId) || patientId <= 0) return null;

  try {
    const url = new URL(`${FEEGOW_BASE_URL}/patient/search`);
    url.searchParams.set('paciente_id', String(patientId));
    url.searchParams.set('photo', '0');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-access-token': token,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const content = payload?.content;
    if (!content || typeof content !== 'object') return null;

    const phonePrimary = extractPrimaryValue(content?.celulares) || extractPrimaryValue(content?.telefones) || extractPrimaryValue(content?.celular);
    const emailPrimary = extractPrimaryValue(content?.email);
    const cpf = normalizeString(content?.documentos?.cpf || content?.cpf);

    return {
      patientId,
      patientName: normalizeString(content?.nome),
      phonePrimary,
      emailPrimary,
      cpf,
    };
  } catch {
    return null;
  }
};

const readCachedContacts = async (db: DbInterface, patientIds: number[]) => {
  if (!patientIds.length) return new Map<number, CachedContactRow>();
  const placeholders = patientIds.map(() => '?').join(',');
  const rows = await db.query(
    `
      SELECT patient_id, patient_name, phone_primary, email_primary, cpf, updated_at
      FROM feegow_patient_contacts_cache
      WHERE patient_id IN (${placeholders})
    `,
    patientIds,
  );
  const map = new Map<number, CachedContactRow>();
  for (const row of rows as CachedContactRow[]) {
    const patientId = normalizeNumber((row as any)?.patient_id);
    if (patientId > 0) map.set(patientId, row);
  }
  return map;
};

const shouldRefreshCachedContact = (row: CachedContactRow | undefined) => {
  if (!row) return true;
  if (!normalizeString(row.patient_name) && !normalizeString(row.phone_primary) && !normalizeString(row.email_primary)) {
    return true;
  }
  const parsed = parseCachedContactTimestamp(row.updated_at);
  if (!parsed) return true;
  const maxAgeMs = CONTACT_CACHE_STALE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - parsed.getTime() > maxAgeMs;
};

const runInChunks = async <TInput, TOutput>(items: TInput[], size: number, worker: (item: TInput) => Promise<TOutput>) => {
  const results: TOutput[] = [];
  for (let idx = 0; idx < items.length; idx += size) {
    const chunk = items.slice(idx, idx + size);
    const chunkResults = await Promise.all(chunk.map((item) => worker(item)));
    results.push(...chunkResults);
  }
  return results;
};

const upsertPatientContacts = async (db: DbInterface, contacts: FeegowPatientContact[]) => {
  for (const contact of contacts) {
    await db.execute(
      `
        INSERT INTO feegow_patient_contacts_cache (
          patient_id,
          patient_name,
          phone_primary,
          email_primary,
          cpf,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(patient_id) DO UPDATE SET
          patient_name = excluded.patient_name,
          phone_primary = excluded.phone_primary,
          email_primary = excluded.email_primary,
          cpf = excluded.cpf,
          updated_at = excluded.updated_at
      `,
      [
        contact.patientId,
        contact.patientName,
        contact.phonePrimary,
        contact.emailPrimary,
        contact.cpf,
        nowTimestamp(),
      ],
    );
  }
};

const hydrateMissingPatientContacts = async (db: DbInterface, patientIds: number[]) => {
  const uniqueIds = Array.from(new Set(patientIds.map((id) => normalizeNumber(id)).filter((id) => id > 0)));
  if (!uniqueIds.length) return new Map<number, CachedContactRow>();

  const cacheMap = await readCachedContacts(db, uniqueIds);
  const idsToFetch = uniqueIds.filter((patientId) => shouldRefreshCachedContact(cacheMap.get(patientId)));

  if (idsToFetch.length > 0) {
    const fetched = await runInChunks(idsToFetch, CONTACT_HYDRATION_CONCURRENCY, async (patientId) => fetchPatientContactFromFeegow(patientId));
    const validContacts = fetched.filter((item): item is FeegowPatientContact => Boolean(item));
    if (validContacts.length > 0) {
      await upsertPatientContacts(db, validContacts);
      const refreshed = await readCachedContacts(db, validContacts.map((item) => item.patientId));
      for (const [patientId, row] of refreshed.entries()) {
        cacheMap.set(patientId, row);
      }
    }
  }

  return cacheMap;
};

const mapProposalRows = (rows: RawProposalRow[]) =>
  rows.map((row) => {
    const procedures = summarizeProcedures(row.items_json);
    const proceduresDetailed = buildProcedureDetails(row.items_json);
    const conversionStatus = normalizeProposalConversionStatus(row.conversion_status);
    const conversionReason = normalizeProposalConversionReason(conversionStatus, row.conversion_reason);
    return {
      proposalId: normalizeNumber(row.proposal_id),
      proposalDate: normalizeString(row.date),
      status: normalizeString(row.status),
      unitName: normalizeString(row.unit_name) || 'Sem unidade',
      professionalName: normalizeString(row.professional_name) || 'Sistema',
      patientId: normalizeNumber(row.patient_id) > 0 ? normalizeNumber(row.patient_id) : null,
      patientName: normalizeString(row.patient_name) || 'Não informado',
      patientPhone: normalizeString(row.phone_primary) || 'Não informado',
      patientEmail: normalizeString(row.email_primary),
      procedureSummary: procedures.summary,
      procedureCount: procedures.count,
      proceduresDetailed,
      proceduresDetailedText: buildDetailedProceduresText(proceduresDetailed),
      totalValue: normalizeNumber(row.total_value),
      proposalLastUpdate: normalizeString(row.proposal_last_update) || null,
      conversionStatus,
      conversionStatusLabel: proposalConversionStatusMap.get(conversionStatus) || 'Pendente',
      conversionReason,
      conversionReasonLabel: conversionReason ? proposalConversionReasonMap.get(conversionReason) || null : null,
      responsibleUserId: normalizeString(row.responsible_user_id) || null,
      responsibleUserName: normalizeString(row.responsible_user_name) || null,
      updatedByUserName: normalizeString(row.updated_by_user_name) || null,
      updatedAt: normalizeString(row.followup_updated_at) || null,
    } satisfies ProposalDetailRow;
  });

const baseDetailSelect = `
  SELECT
    p.proposal_id,
    p.date,
    p.status,
    p.unit_name,
    p.professional_name,
    p.total_value,
    p.proposal_last_update,
    p.patient_id,
    p.items_json,
    c.patient_name,
    c.phone_primary,
    c.email_primary,
    f.conversion_status,
    f.conversion_reason,
    f.responsible_user_id,
    f.responsible_user_name,
    f.updated_by_user_name,
    f.updated_at AS followup_updated_at
  FROM feegow_proposals p
  LEFT JOIN feegow_patient_contacts_cache c ON c.patient_id = p.patient_id
  LEFT JOIN proposal_followup_control f ON f.proposal_id = p.proposal_id
`;

export const upsertProposalFollowup = async (
  input: ProposalFollowupUpdateInput,
  db: DbInterface = getDbConnection(),
) => {
  await ensureProposalsSupportTables(db);

  const proposalId = normalizeNumber(input.proposalId);
  if (proposalId <= 0) {
    const error = new Error('Proposta inválida.');
    (error as any).status = 400;
    throw error;
  }

  const proposalRows = await db.query(`SELECT proposal_id FROM feegow_proposals WHERE proposal_id = ? LIMIT 1`, [proposalId]);
  if (!proposalRows.length) {
    const error = new Error('Proposta não encontrada.');
    (error as any).status = 404;
    throw error;
  }

  const conversionStatus = normalizeProposalConversionStatus(input.conversionStatus);
  const conversionReason = normalizeProposalConversionReason(conversionStatus, input.conversionReason);

  let responsibleUserId = normalizeString(input.responsibleUserId) || null;
  let responsibleUserName: string | null = null;

  if (responsibleUserId) {
    const responsibleRows = await db.query(
      `
        SELECT id, name
        FROM users
        WHERE id = ?
          AND UPPER(TRIM(COALESCE(status, ''))) = 'ATIVO'
        LIMIT 1
      `,
      [responsibleUserId],
    );
    if (!responsibleRows.length) {
      const error = new Error('Responsável inválido ou inativo.');
      (error as any).status = 400;
      throw error;
    }
    responsibleUserId = normalizeString((responsibleRows[0] as any)?.id) || null;
    responsibleUserName = normalizeString((responsibleRows[0] as any)?.name) || null;
  }

  const updatedAt = nowTimestamp();
  await db.execute(
    `
      INSERT INTO proposal_followup_control (
        proposal_id,
        conversion_status,
        conversion_reason,
        responsible_user_id,
        responsible_user_name,
        updated_by_user_id,
        updated_by_user_name,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(proposal_id) DO UPDATE SET
        conversion_status = excluded.conversion_status,
        conversion_reason = excluded.conversion_reason,
        responsible_user_id = excluded.responsible_user_id,
        responsible_user_name = excluded.responsible_user_name,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_by_user_name = excluded.updated_by_user_name,
        updated_at = excluded.updated_at
    `,
    [
      proposalId,
      conversionStatus,
      conversionReason,
      responsibleUserId,
      responsibleUserName,
      normalizeString(input.updatedByUserId) || null,
      normalizeString(input.updatedByUserName) || 'Usuário',
      updatedAt,
    ],
  );

  const refreshed = await db.query(
    `
      ${baseDetailSelect}
      WHERE p.proposal_id = ?
      LIMIT 1
    `,
    [proposalId],
  );

  return mapProposalRows(refreshed as RawProposalRow[])[0] || null;
};

export const listProposalDetails = async (filters: ProposalDetailFilters, db: DbInterface = getDbConnection()): Promise<ProposalDetailResult> => {
  await ensureProposalsSupportTables(db);

  const detailStatusApplied = resolveProposalDetailStatus(filters.status, filters.detailStatus);
  const baseWhere = buildProposalWhere(filters, detailStatusApplied);
  const searchClause = buildSearchClause(filters.search);
  const whereSql = `${baseWhere.where} ${searchClause.sql}`;
  const whereParams = [...baseWhere.params, ...searchClause.params];

  const totalRowsResult = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM feegow_proposals p
      LEFT JOIN feegow_patient_contacts_cache c ON c.patient_id = p.patient_id
      LEFT JOIN proposal_followup_control f ON f.proposal_id = p.proposal_id
      ${whereSql}
    `,
    whereParams,
  );
  const totalRows = normalizeNumber((totalRowsResult[0] as any)?.total);
  const totalPages = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const safePage = clamp(filters.page, 1, totalPages);
  const offset = (safePage - 1) * filters.pageSize;

  let rows = (await db.query(
    `
      ${baseDetailSelect}
      ${whereSql}
      ORDER BY p.date DESC, p.proposal_id DESC
      LIMIT ? OFFSET ?
    `,
    [...whereParams, filters.pageSize, offset],
  )) as RawProposalRow[];

  const missingIds = Array.from(
    new Set(
      rows
        .filter((row) => normalizeNumber(row.patient_id) > 0 && !normalizeString(row.patient_name) && !normalizeString(row.phone_primary))
        .map((row) => normalizeNumber(row.patient_id)),
    ),
  );

  if (missingIds.length > 0) {
    await hydrateMissingPatientContacts(db, missingIds);
    rows = (await db.query(
      `
        ${baseDetailSelect}
        ${whereSql}
        ORDER BY p.date DESC, p.proposal_id DESC
        LIMIT ? OFFSET ?
      `,
      [...whereParams, filters.pageSize, offset],
    )) as RawProposalRow[];
  }

  return {
    rows: mapProposalRows(rows),
    page: safePage,
    pageSize: filters.pageSize,
    totalRows,
    totalPages,
    detailStatusApplied,
  };
};

export const listProposalExportRows = async (filters: ProposalDetailFilters, db: DbInterface = getDbConnection()) => {
  await ensureProposalsSupportTables(db);
  const detailStatusApplied = resolveProposalDetailStatus(filters.status, filters.detailStatus);
  const baseWhere = buildProposalWhere(filters, detailStatusApplied);
  const searchClause = buildSearchClause(filters.search);
  const whereSql = `${baseWhere.where} ${searchClause.sql}`;
  const whereParams = [...baseWhere.params, ...searchClause.params];

  let rows = (await db.query(
    `
      ${baseDetailSelect}
      ${whereSql}
      ORDER BY p.date DESC, p.proposal_id DESC
    `,
    whereParams,
  )) as RawProposalRow[];

  const missingIds = Array.from(
    new Set(
      rows
        .filter((row) => normalizeNumber(row.patient_id) > 0 && !normalizeString(row.patient_name) && !normalizeString(row.phone_primary))
        .map((row) => normalizeNumber(row.patient_id)),
    ),
  );

  if (missingIds.length > 0) {
    await hydrateMissingPatientContacts(db, missingIds);
    rows = (await db.query(
      `
        ${baseDetailSelect}
        ${whereSql}
        ORDER BY p.date DESC, p.proposal_id DESC
      `,
      whereParams,
    )) as RawProposalRow[];
  }

  return {
    rows: mapProposalRows(rows),
    detailStatusApplied,
  };
};

