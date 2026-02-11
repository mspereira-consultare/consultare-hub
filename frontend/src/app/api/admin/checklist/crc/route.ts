import { NextResponse } from 'next/server';
import { createSign } from 'crypto';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasPermission, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 15000;
const CENTRAL_GROUP_ID = 'da45d882-5702-439b-8133-3d896d6a8810';
const DEFAULT_SHEET_ID = '1CmeACVoLFsljiRCHojXa0k2V1e9SWsppGUMYuTYcSiQ';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

type CsvRecord = string[];

type ChecklistPayload = {
  dateRef: string;
  reportTimestamp: string;
  metaDia: number;
  agendamentosTotal: number;
  agendamentosCrc: number;
  agendamentosOnline: number;
  ligacoesRealizadas: number;
  solicitacoesWhatsappCrc: number;
  conversaoPct: number;
  taxaAbandono: string;
  tempoMedioEsperaMin: number;
  reportText: string;
  sources: {
    whatsappSheetOk: boolean;
    whatsappSheetError?: string;
    centralWaitUpdatedAt?: string | null;
  };
};

type SheetCountResult = { count: number; ok: true } | { count: number; ok: false; error: string };

const dateParts = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const yyyy = byType.get('year') || '1970';
  const mm = byType.get('month') || '01';
  const dd = byType.get('day') || '01';
  const hh = byType.get('hour') || '00';
  const mi = byType.get('minute') || '00';
  const ss = byType.get('second') || '00';

  return { yyyy, mm, dd, hh, mi, ss };
};

const getTodayIsoBr = () => {
  const { yyyy, mm, dd } = dateParts('America/Sao_Paulo');
  return `${yyyy}-${mm}-${dd}`;
};

const getTodayBr = () => {
  const { yyyy, mm, dd } = dateParts('America/Sao_Paulo');
  return `${dd}/${mm}/${yyyy}`;
};

const getNowBr = () => {
  const { yyyy, mm, dd, hh, mi, ss } = dateParts('America/Sao_Paulo');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
};

const ensureChecklistTable = async (db: any) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS crc_checklist_daily (
      date_ref VARCHAR(10) PRIMARY KEY,
      calls_made INTEGER DEFAULT 0,
      abandon_rate VARCHAR(32) DEFAULT '',
      updated_at TEXT
    )
  `);
};

const parseCsv = (csv: string): CsvRecord[] => {
  const rows: CsvRecord[] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      if (current.length > 0 || row.length > 0) {
        row.push(current);
        rows.push(row.map((v) => v.trim()));
      }
      current = '';
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row.map((v) => v.trim()));
  }

  return rows;
};

const normalizeSheetDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dd = String(Number(slash[1])).padStart(2, '0');
    const mm = String(Number(slash[2])).padStart(2, '0');
    const yyyy = slash[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  return raw;
};

const extractCountFromRows = (rows: CsvRecord[], todayBr: string) => {
  if (!rows || rows.length === 0) return 0;

  const header = (rows[0] || []).map((h) => String(h || '').toLowerCase());
  const dataIndex = Math.max(
    header.findIndex((h) => h === 'data'),
    header.findIndex((h) => h.includes('data'))
  );
  const idx = dataIndex >= 0 ? dataIndex : 0;

  return rows
    .slice(1)
    .filter((r) => normalizeSheetDate(String(r[idx] || '')) === todayBr)
    .length;
};

const b64url = (input: string | Buffer) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const signJwt = (payload: Record<string, any>, privateKey: string) => {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsignedToken}.${b64url(signature)}`;
};

const getGoogleAccessToken = async (clientEmail: string, privateKeyRaw: string) => {
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const assertion = signJwt(
    {
      iss: clientEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp,
    },
    privateKey
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha OAuth Google (${res.status}): ${text.slice(0, 180)}`);
  }

  const json = await res.json();
  const token = String(json?.access_token || '');
  if (!token) throw new Error('OAuth Google sem access_token');
  return token;
};

const fetchSheetValues = async (sheetId: string, range: string, token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API (${res.status}): ${text.slice(0, 180)}`);
  }

  const json = await res.json();
  const values = Array.isArray(json?.values) ? json.values : [];
  return values.map((row: any) => (Array.isArray(row) ? row.map((c) => String(c ?? '')) : []));
};

const getFirstSheetTitle = async (sheetId: string, token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets metadata (${res.status}): ${text.slice(0, 180)}`);
  }

  const json = await res.json();
  const title = String(json?.sheets?.[0]?.properties?.title || '');
  if (!title) throw new Error('Nao foi possivel identificar a aba da planilha');
  return title;
};

const countWhatsappRequestsFromPrivateSheet = async (sheetId: string, todayBr: string): Promise<SheetCountResult> => {
  const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || '').trim();
  const configuredRange = String(process.env.CRC_WHATSAPP_SHEET_RANGE || 'A:C').trim();

  if (!clientEmail || !privateKey) {
    return {
      count: 0,
      ok: false,
      error: 'Service Account nao configurada (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)',
    };
  }

  try {
    const token = await getGoogleAccessToken(clientEmail, privateKey);

    let values = await fetchSheetValues(sheetId, configuredRange, token);
    if ((!values || values.length === 0) && !configuredRange.includes('!')) {
      const firstTab = await getFirstSheetTitle(sheetId, token);
      values = await fetchSheetValues(sheetId, `${firstTab}!${configuredRange}`, token);
    }

    const count = extractCountFromRows(values, todayBr);
    return { count, ok: true };
  } catch (error: any) {
    return { count: 0, ok: false, error: String(error?.message || error) };
  }
};

const countWhatsappRequestsFromSheetCsv = async (sheetId: string, todayBr: string): Promise<SheetCountResult> => {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
  ];

  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        lastError = `HTTP ${res.status} ao acessar planilha`;
        continue;
      }

      const csv = await res.text();
      const rows = parseCsv(csv);
      if (rows.length === 0) return { count: 0, ok: true };

      const count = extractCountFromRows(rows, todayBr);
      return { count, ok: true };
    } catch (error: any) {
      lastError = String(error?.message || error);
    }
  }

  return { count: 0, ok: false, error: lastError || 'Falha ao ler planilha' };
};

const toNumber = (v: any) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const formatPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

const buildReportText = (p: ChecklistPayload) => {
  return [
    `segue o hora x hora CRC: ${p.reportTimestamp}`,
    `Meta do dia: ${p.metaDia}`,
    `Agendamentos total: ${p.agendamentosTotal}`,
    `Agendamento CRC: ${p.agendamentosCrc}`,
    `Agendamento online/Robo: ${p.agendamentosOnline}`,
    `Conversao: ${formatPercent(p.conversaoPct)}`,
    `Abandono: ${p.taxaAbandono || '-'}`,
    `Tempo medio de espera: ${p.tempoMedioEsperaMin} minutos`,
  ].join('\n');
};

const ensureApiPermission = async (action: PermissionAction) => {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) {
    return { allowed: false, status: 401, error: 'Nao autenticado' };
  }

  const role = String(user.role || 'OPERADOR');
  const db = getDbConnection();
  const livePermissions = await loadUserPermissionMatrix(db as any, String(user.id), role);
  const allowed = hasPermission(livePermissions, 'checklist_crc', action, role);

  if (!allowed) {
    return { allowed: false, status: 403, error: 'Sem permissao' };
  }

  return { allowed: true as const };
};

const loadChecklist = async () => {
  const db = getDbConnection();
  await ensureChecklistTable(db);

  const todayIso = getTodayIsoBr();
  const todayBr = getTodayBr();
  const nowBr = getNowBr();
  const dayStart = `${todayIso} 00:00:00`;
  const dayEnd = `${todayIso} 23:59:59`;

  const persistedRows = await db.query(
    `SELECT calls_made, abandon_rate, updated_at FROM crc_checklist_daily WHERE date_ref = ?`,
    [todayIso]
  );
  const persisted = persistedRows[0] || { calls_made: 0, abandon_rate: '', updated_at: null };

  const totalRows = await db.query(
    `SELECT COUNT(*) as total FROM feegow_appointments WHERE scheduled_at BETWEEN ? AND ?`,
    [dayStart, dayEnd]
  );
  const agendamentosTotal = toNumber(totalRows[0]?.total);

  let agendamentosCrc = 0;
  try {
    const crcRows = await db.query(
      `
      SELECT COUNT(DISTINCT f.appointment_id) as total
      FROM feegow_appointments f
      JOIN user_teams ut ON ut.user_name = f.scheduled_by
      JOIN teams_master tm ON tm.id = ut.team_id
      WHERE f.scheduled_at BETWEEN ? AND ?
        AND UPPER(TRIM(tm.name)) = 'CRC'
      `,
      [dayStart, dayEnd]
    );
    agendamentosCrc = toNumber(crcRows[0]?.total);
  } catch {
    agendamentosCrc = 0;
  }

  const onlineRows = await db.query(
    `
    SELECT COUNT(DISTINCT appointment_id) as total
    FROM feegow_appointments
    WHERE scheduled_at BETWEEN ? AND ?
      AND UPPER(TRIM(scheduled_by)) LIKE 'AGENDAMENTO ONLINE%'
    `,
    [dayStart, dayEnd]
  );
  const agendamentosOnline = toNumber(onlineRows[0]?.total);

  const commonGoalFilter = `
    linked_kpi_id = 'agendamentos'
    AND periodicity = 'daily'
    AND start_date <= ?
    AND end_date >= ?
    AND UPPER(COALESCE(TRIM(scope), '')) = 'CLINIC'
    AND (collaborator IS NULL OR TRIM(collaborator) = '' OR LOWER(TRIM(collaborator)) = 'all')
    AND (team IS NULL OR TRIM(team) = '' OR LOWER(TRIM(team)) = 'all')
    AND (filter_group IS NULL OR TRIM(filter_group) = '' OR LOWER(TRIM(filter_group)) = 'all')
  `;

  const metaUnitRows = await db.query(
    `
    SELECT COALESCE(SUM(target_value), 0) as total
    FROM goals_config
    WHERE ${commonGoalFilter}
      AND clinic_unit IS NOT NULL
      AND TRIM(clinic_unit) != ''
      AND LOWER(TRIM(clinic_unit)) != 'all'
    `,
    [todayIso, todayIso]
  );

  let metaDia = toNumber(metaUnitRows[0]?.total);
  if (metaDia <= 0) {
    const metaFallbackRows = await db.query(
      `
      SELECT COALESCE(SUM(target_value), 0) as total
      FROM goals_config
      WHERE ${commonGoalFilter}
        AND (clinic_unit IS NULL OR TRIM(clinic_unit) = '' OR LOWER(TRIM(clinic_unit)) = 'all')
      `,
      [todayIso, todayIso]
    );
    metaDia = toNumber(metaFallbackRows[0]?.total);
  }

  const sheetId = process.env.CRC_WHATSAPP_SHEET_ID || DEFAULT_SHEET_ID;
  const preferPrivate = String(process.env.CRC_WHATSAPP_SHEET_PRIVATE || '1').trim() !== '0';

  let sheetResult: SheetCountResult;
  if (preferPrivate) {
    const privateResult = await countWhatsappRequestsFromPrivateSheet(sheetId, todayBr);
    if (privateResult.ok) {
      sheetResult = privateResult;
    } else {
      const csvFallback = await countWhatsappRequestsFromSheetCsv(sheetId, todayBr);
      sheetResult = csvFallback.ok
        ? csvFallback
        : { count: 0, ok: false, error: `${privateResult.error}; fallback CSV: ${csvFallback.error}` };
    }
  } else {
    sheetResult = await countWhatsappRequestsFromSheetCsv(sheetId, todayBr);
  }

  const solicitacoesWhatsappCrc = sheetResult.count;

  const centralRows = await db.query(
    `
    SELECT avg_wait_seconds, updated_at
    FROM clinia_group_snapshots
    WHERE group_id = ? OR UPPER(TRIM(group_name)) = 'CENTRAL DE RELACIONAMENTO'
    LIMIT 1
    `,
    [CENTRAL_GROUP_ID]
  );

  const avgWaitSeconds = toNumber(centralRows[0]?.avg_wait_seconds);
  const tempoMedioEsperaMin = Math.round(avgWaitSeconds / 60);

  const ligacoesRealizadas = toNumber(persisted.calls_made);
  const taxaAbandono = String(persisted.abandon_rate || '').trim();
  const denominadorConversao = ligacoesRealizadas + solicitacoesWhatsappCrc;
  const conversaoPct = denominadorConversao > 0 ? (agendamentosCrc / denominadorConversao) * 100 : 0;

  const payload: ChecklistPayload = {
    dateRef: todayIso,
    reportTimestamp: nowBr,
    metaDia,
    agendamentosTotal,
    agendamentosCrc,
    agendamentosOnline,
    ligacoesRealizadas,
    solicitacoesWhatsappCrc,
    conversaoPct,
    taxaAbandono,
    tempoMedioEsperaMin,
    reportText: '',
    sources: {
      whatsappSheetOk: sheetResult.ok,
      whatsappSheetError: sheetResult.ok ? undefined : sheetResult.error,
      centralWaitUpdatedAt: centralRows[0]?.updated_at || null,
    },
  };

  payload.reportText = buildReportText(payload);
  return payload;
};

export async function GET(request: Request) {
  try {
    const access = await ensureApiPermission('view');
    if (!access.allowed) {
      return NextResponse.json({ status: 'error', error: access.error }, { status: access.status });
    }
    const cacheKey = buildCacheKey('admin', request.url);
    const data = await withCache(cacheKey, CACHE_TTL_MS, loadChecklist);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro API Checklist CRC:', error);
    return NextResponse.json({ status: 'error', error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await ensureApiPermission('edit');
    if (!access.allowed) {
      return NextResponse.json({ status: 'error', error: access.error }, { status: access.status });
    }
    const body = await request.json().catch(() => ({}));
    const callsMade = toNumber(body?.callsMade);
    const abandonRate = String(body?.abandonRate || '').trim();

    const db = getDbConnection();
    await ensureChecklistTable(db);

    const todayIso = getTodayIsoBr();
    const updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    await db.execute(
      `
      INSERT INTO crc_checklist_daily (date_ref, calls_made, abandon_rate, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date_ref) DO UPDATE SET
        calls_made = excluded.calls_made,
        abandon_rate = excluded.abandon_rate,
        updated_at = excluded.updated_at
      `,
      [todayIso, callsMade, abandonRate, updatedAt]
    );

    invalidateCache('admin:');

    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao salvar Checklist CRC:', error);
    return NextResponse.json({ status: 'error', error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

