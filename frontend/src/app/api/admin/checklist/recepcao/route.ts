import { NextResponse } from 'next/server';
import { createSign } from 'crypto';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 15000;
const DEFAULT_SHEET_ID = '1YAIN9_OoqDyhMrJK27zZG8oHTaQ6e_3P-bYA-a4AxmI';
const DEFAULT_SHEET_RANGE = 'Respostas ao formulário 1!A:F';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const PROPOSAL_EXEC_STATUSES = "('executada','aprovada pelo cliente','ganho','realizado','concluido','pago')";

type CsvRecord = string[];

type UnitConfig = {
  key: string;
  label: string;
  dbCandidates: string[];
  sheetCandidates: string[];
};

type RecepcaoChecklistPayload = {
  dateRef: string;
  reportTimestamp: string;
  unitKey: string;
  unitLabel: string;
  faturamentoDia: number;
  faturamentoMes: number;
  ticketMedioDia: number;
  metaMensal: number;
  percentualMetaAtingida: number;
  metaResolveTarget: number;
  metaResolveRealizado: number;
  metaCheckupTarget: number;
  metaCheckupRealizado: number;
  orcamentosEmAberto: number;
  notasFiscaisEmitidas: string;
  contasEmAbertoStatus: string;
  confirmacoesAmanhaPct: number;
  confirmacoesAmanhaTotal: number;
  confirmacoesAmanhaConfirmadas: number;
  googleRating: string;
  googleComentarios: string;
  pendenciasUrgentes: string;
  situacoesCriticas: string;
  situacaoPrazo: string;
  situacaoResponsavel: string;
  acoesRealizadas: string;
  reportText: string;
  sources: {
    sheetOk: boolean;
    sheetError?: string;
  };
};

type SheetCountResult =
  | { resolveCount: number; checkupCount: number; ok: true }
  | { resolveCount: number; checkupCount: number; ok: false; error: string };

const UNITS: UnitConfig[] = [
  {
    key: 'campinas_shopping',
    label: 'Campinas Shopping',
    dbCandidates: ['Campinas Shopping', 'Shopping Campinas', 'Shop. Campinas'],
    sheetCandidates: ['Campinas Shopping', 'Shopping Campinas'],
  },
  {
    key: 'centro_cambui',
    label: 'Centro Cambui',
    dbCandidates: ['Centro Cambui', 'Centro Cambuí', 'Centro'],
    sheetCandidates: ['Centro Cambui', 'Centro Cambuí', 'Centro'],
  },
  {
    key: 'ouro_verde',
    label: 'Ouro Verde',
    dbCandidates: ['Ouro Verde'],
    sheetCandidates: ['Ouro Verde'],
  },
  {
    key: 'resolve',
    label: 'Resolve',
    dbCandidates: [
      'Resolve',
      'Resolvesaude',
      'ResolveSaude',
      'ResolveSaúde',
      'Resolvecard Gestão De Beneficos E Meios De Pagamentos',
      'RESOLVECARD GESTÃO DE BENEFICOS E MEIOS DE PAGAMENTOS',
    ],
    sheetCandidates: ['Resolve', 'Resolvesaude', 'ResolveSaude', 'Resolve Saúde'],
  },
];

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const unitByKey = (keyRaw: string | null) => {
  const key = normalizeText(keyRaw || '').replace(/\s+/g, '_');
  const found = UNITS.find((u) => normalizeText(u.key) === key || u.key === keyRaw);
  return found || UNITS[0];
};

const unitKeyFromValue = (value: string) => {
  const norm = normalizeText(value);
  for (const unit of UNITS) {
    const allCandidates = [unit.label, ...unit.dbCandidates, ...unit.sheetCandidates];
    if (allCandidates.some((candidate) => normalizeText(candidate) === norm)) {
      return unit.key;
    }
  }
  return '';
};

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
  return {
    yyyy: byType.get('year') || '1970',
    mm: byType.get('month') || '01',
    dd: byType.get('day') || '01',
    hh: byType.get('hour') || '00',
    mi: byType.get('minute') || '00',
    ss: byType.get('second') || '00',
  };
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

const getTomorrowIsoBr = () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(tomorrow);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const toNumber = (v: any) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const toInt = (v: any) => Math.max(0, Math.floor(toNumber(v)));

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(value));

const formatPercent = (value: number) => `${toNumber(value).toFixed(1).replace('.', ',')}%`;

const buildInClause = (column: string, values: string[], params: any[]) => {
  const clean = values
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 0);
  if (clean.length === 0) return '';
  const placeholders = clean.map(() => '?').join(',');
  params.push(...clean.map((v) => v.toUpperCase()));
  return ` AND UPPER(TRIM(${column})) IN (${placeholders})`;
};

const ensureChecklistTable = async (db: any) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recepcao_checklist_daily (
      date_ref VARCHAR(10) NOT NULL,
      unit_key VARCHAR(50) NOT NULL,
      meta_resolve_target INTEGER DEFAULT 0,
      meta_checkup_target INTEGER DEFAULT 0,
      nf_status VARCHAR(20) DEFAULT '',
      contas_status VARCHAR(20) DEFAULT '',
      google_rating VARCHAR(32) DEFAULT '',
      google_comments TEXT,
      pendencias_urgentes TEXT,
      situacoes_criticas TEXT,
      situacao_prazo VARCHAR(10),
      situacao_responsavel VARCHAR(120),
      acoes_realizadas TEXT,
      updated_at TEXT,
      PRIMARY KEY (date_ref, unit_key)
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
      row = [];
      current = '';
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
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
};

const findHeaderIndex = (header: string[], keywords: string[]) => {
  const idx = header.findIndex((h) => keywords.some((k) => h.includes(k)));
  return idx >= 0 ? idx : -1;
};

const extractSheetCounts = (rows: CsvRecord[], todayBr: string, unit: UnitConfig) => {
  if (!rows || rows.length === 0) return { resolveCount: 0, checkupCount: 0 };

  const header = (rows[0] || []).map((h) => normalizeText(String(h || '')));
  const idxUnit = findHeaderIndex(header, ['qual sua unidade', 'unidade']) >= 0 ? findHeaderIndex(header, ['qual sua unidade', 'unidade']) : 2;
  const idxService = findHeaderIndex(header, ['qual servico', 'servico']) >= 0 ? findHeaderIndex(header, ['qual servico', 'servico']) : 3;
  const idxDate = findHeaderIndex(header, ['data']) >= 0 ? findHeaderIndex(header, ['data']) : 5;

  let resolveCount = 0;
  let checkupCount = 0;

  for (const row of rows.slice(1)) {
    const rowDate = normalizeSheetDate(String(row[idxDate] || ''));
    if (rowDate !== todayBr) continue;

    const rowUnitKey = unitKeyFromValue(String(row[idxUnit] || ''));
    if (rowUnitKey !== unit.key) continue;

    const service = normalizeText(String(row[idxService] || ''));
    if (service.includes('resolve')) {
      resolveCount += 1;
    } else if (service.includes('check up') || service.includes('checkup')) {
      checkupCount += 1;
    }
  }

  return { resolveCount, checkupCount };
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

const countFromPrivateSheet = async (sheetId: string, range: string, todayBr: string, unit: UnitConfig): Promise<SheetCountResult> => {
  const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || '').trim();
  if (!clientEmail || !privateKey) {
    return { resolveCount: 0, checkupCount: 0, ok: false, error: 'Service Account nao configurada.' };
  }
  try {
    const token = await getGoogleAccessToken(clientEmail, privateKey);
    let values = await fetchSheetValues(sheetId, range, token);
    if ((!values || values.length === 0) && !range.includes('!')) {
      const firstTab = await getFirstSheetTitle(sheetId, token);
      values = await fetchSheetValues(sheetId, `${firstTab}!${range}`, token);
    }
    const result = extractSheetCounts(values, todayBr, unit);
    return { ...result, ok: true };
  } catch (error: any) {
    return { resolveCount: 0, checkupCount: 0, ok: false, error: String(error?.message || error) };
  }
};

const countFromPublicCsv = async (sheetId: string, todayBr: string, unit: UnitConfig): Promise<SheetCountResult> => {
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
      const result = extractSheetCounts(rows, todayBr, unit);
      return { ...result, ok: true };
    } catch (error: any) {
      lastError = String(error?.message || error);
    }
  }
  return { resolveCount: 0, checkupCount: 0, ok: false, error: lastError || 'Falha ao ler planilha' };
};

const buildReportText = (p: RecepcaoChecklistPayload) => {
  return [
    `CHECKLIST DIARIO - UNIDADE ${p.unitLabel.toUpperCase()} (${p.dateRef})`,
    `Horario: ${p.reportTimestamp}`,
    `Financeiro`,
    `Faturamento do dia: ${formatCurrency(p.faturamentoDia)}`,
    `Faturamento acumulado no mes: ${formatCurrency(p.faturamentoMes)}`,
    `% da meta atingida: ${formatPercent(p.percentualMetaAtingida)}`,
    `Meta Resolve: ${p.metaResolveRealizado}/${p.metaResolveTarget}`,
    `Meta Check-up: ${p.metaCheckupRealizado}/${p.metaCheckupTarget}`,
    `Ticket medio: ${formatCurrency(p.ticketMedioDia)}`,
    `Orcamentos em aberto: ${formatCurrency(p.orcamentosEmAberto)}`,
    `Notas fiscais emitidas: ${p.notasFiscaisEmitidas || '-'}`,
    `Contas em aberto: ${p.contasEmAbertoStatus || '-'}`,
    `Confirmacao das agendas do dia seguinte: ${formatPercent(p.confirmacoesAmanhaPct)} (${p.confirmacoesAmanhaConfirmadas}/${p.confirmacoesAmanhaTotal})`,
    `Avaliacao no Google e comentarios: ${p.googleRating || '-'}${p.googleComentarios ? ` | ${p.googleComentarios}` : ''}`,
    `Pendencias Urgentes: ${p.pendenciasUrgentes || '-'}`,
    `Situacoes criticas a resolver: ${p.situacoesCriticas || '-'}${p.situacaoPrazo ? ` | Prazo: ${p.situacaoPrazo}` : ''}${p.situacaoResponsavel ? ` | Responsavel: ${p.situacaoResponsavel}` : ''}`,
    `Acoes realizadas: ${p.acoesRealizadas || '-'}`,
  ].join('\n');
};

const loadChecklist = async (requestUrl: string) => {
  const db = getDbConnection();
  await ensureChecklistTable(db);

  const url = new URL(requestUrl);
  const unit = unitByKey(url.searchParams.get('unit'));

  const todayIso = getTodayIsoBr();
  const todayBr = getTodayBr();
  const nowBr = getNowBr();
  const monthRef = todayIso.slice(0, 7);
  const tomorrowIso = getTomorrowIsoBr();

  const persistedRows = await db.query(
    `
    SELECT *
    FROM recepcao_checklist_daily
    WHERE date_ref = ? AND unit_key = ?
    `,
    [todayIso, unit.key]
  );
  const persisted = persistedRows[0] || {};

  const revenueDayParams: any[] = [todayIso];
  const revenueDaySql = buildInClause('unidade', unit.dbCandidates, revenueDayParams);
  const dayRows = await db.query(
    `
    SELECT COALESCE(SUM(total_pago), 0) as total_pago, COALESCE(SUM(qtd), 0) as qtd
    FROM faturamento_resumo_diario
    WHERE data_ref = ? ${revenueDaySql}
    `,
    revenueDayParams
  );
  const faturamentoDia = toNumber(dayRows[0]?.total_pago);
  const qtdDia = toNumber(dayRows[0]?.qtd);
  const ticketMedioDia = qtdDia > 0 ? faturamentoDia / qtdDia : 0;

  const revenueMonthParams: any[] = [monthRef];
  const revenueMonthSql = buildInClause('unidade', unit.dbCandidates, revenueMonthParams);
  const monthRows = await db.query(
    `
    SELECT COALESCE(SUM(total_pago), 0) as total_pago
    FROM faturamento_resumo_mensal
    WHERE month_ref = ? ${revenueMonthSql}
    `,
    revenueMonthParams
  );
  const faturamentoMes = toNumber(monthRows[0]?.total_pago);

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

  const goalUnitParams: any[] = [todayIso, todayIso];
  const goalUnitSql = buildInClause('clinic_unit', unit.dbCandidates, goalUnitParams);
  const goalUnitRows = await db.query(
    `
    SELECT COALESCE(SUM(target_value), 0) as total
    FROM goals_config
    WHERE ${commonGoalFilter} ${goalUnitSql}
    `,
    goalUnitParams
  );
  let metaMensal = toNumber(goalUnitRows[0]?.total);
  if (metaMensal <= 0) {
    const goalFallbackRows = await db.query(
      `
      SELECT COALESCE(SUM(target_value), 0) as total
      FROM goals_config
      WHERE ${commonGoalFilter}
        AND (clinic_unit IS NULL OR TRIM(clinic_unit) = '' OR LOWER(TRIM(clinic_unit)) = 'all')
      `,
      [todayIso, todayIso]
    );
    metaMensal = toNumber(goalFallbackRows[0]?.total);
  }

  const percentualMetaAtingida = metaMensal > 0 ? (faturamentoMes / metaMensal) * 100 : 0;

  const proposalParams: any[] = [];
  const proposalUnitSql = buildInClause('unit_name', unit.dbCandidates, proposalParams);
  const proposalRows = await db.query(
    `
    SELECT COALESCE(SUM(total_value), 0) as total
    FROM feegow_proposals
    WHERE (status IS NULL OR lower(status) NOT IN ${PROPOSAL_EXEC_STATUSES}) ${proposalUnitSql}
    `,
    proposalParams
  );
  const orcamentosEmAberto = toNumber(proposalRows[0]?.total);

  const tomorrowParams: any[] = [tomorrowIso];
  const tomorrowUnitSql = buildInClause('unit_name', unit.dbCandidates, tomorrowParams);
  const tomorrowRows = await db.query(
    `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status_id = 7 THEN 1 ELSE 0 END) as confirmados
    FROM feegow_appointments
    WHERE substr(date, 1, 10) = ? ${tomorrowUnitSql}
    `,
    tomorrowParams
  );
  const confirmacoesAmanhaTotal = toInt(tomorrowRows[0]?.total);
  const confirmacoesAmanhaConfirmadas = toInt(tomorrowRows[0]?.confirmados);
  const confirmacoesAmanhaPct =
    confirmacoesAmanhaTotal > 0 ? (confirmacoesAmanhaConfirmadas * 100) / confirmacoesAmanhaTotal : 0;

  const sheetId = String(process.env.CHECKLIST_RECEPCAO_SHEET_ID || DEFAULT_SHEET_ID).trim();
  const sheetRange = String(process.env.CHECKLIST_RECEPCAO_SHEET_RANGE || DEFAULT_SHEET_RANGE).trim();
  const preferPrivate = String(process.env.CHECKLIST_RECEPCAO_SHEET_PRIVATE || '1').trim() !== '0';
  let sheetResult: SheetCountResult;
  if (preferPrivate) {
    const privateResult = await countFromPrivateSheet(sheetId, sheetRange, todayBr, unit);
    if (privateResult.ok) {
      sheetResult = privateResult;
    } else {
      const fallback = await countFromPublicCsv(sheetId, todayBr, unit);
      sheetResult = fallback.ok
        ? fallback
        : { resolveCount: 0, checkupCount: 0, ok: false, error: `${privateResult.error}; fallback CSV: ${fallback.error}` };
    }
  } else {
    sheetResult = await countFromPublicCsv(sheetId, todayBr, unit);
  }

  const payload: RecepcaoChecklistPayload = {
    dateRef: todayIso,
    reportTimestamp: nowBr,
    unitKey: unit.key,
    unitLabel: unit.label,
    faturamentoDia,
    faturamentoMes,
    ticketMedioDia,
    metaMensal,
    percentualMetaAtingida,
    metaResolveTarget: toInt(persisted.meta_resolve_target),
    metaResolveRealizado: sheetResult.resolveCount,
    metaCheckupTarget: toInt(persisted.meta_checkup_target),
    metaCheckupRealizado: sheetResult.checkupCount,
    orcamentosEmAberto,
    notasFiscaisEmitidas: String(persisted.nf_status || '').trim(),
    contasEmAbertoStatus: String(persisted.contas_status || '').trim(),
    confirmacoesAmanhaPct,
    confirmacoesAmanhaTotal,
    confirmacoesAmanhaConfirmadas,
    googleRating: String(persisted.google_rating || '').trim(),
    googleComentarios: String(persisted.google_comments || '').trim(),
    pendenciasUrgentes: String(persisted.pendencias_urgentes || '').trim(),
    situacoesCriticas: String(persisted.situacoes_criticas || '').trim(),
    situacaoPrazo: String(persisted.situacao_prazo || '').trim(),
    situacaoResponsavel: String(persisted.situacao_responsavel || '').trim(),
    acoesRealizadas: String(persisted.acoes_realizadas || '').trim(),
    reportText: '',
    sources: {
      sheetOk: sheetResult.ok,
      sheetError: sheetResult.ok ? undefined : sheetResult.error,
    },
  };

  payload.reportText = buildReportText(payload);
  return payload;
};

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const data = await withCache(cacheKey, CACHE_TTL_MS, () => loadChecklist(request.url));
    return NextResponse.json({ status: 'success', data, units: UNITS.map((u) => ({ key: u.key, label: u.label })) });
  } catch (error: any) {
    console.error('Erro API Checklist Recepcao:', error);
    return NextResponse.json({ status: 'error', error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const unit = unitByKey(String(body?.unitKey || ''));
    const db = getDbConnection();
    await ensureChecklistTable(db);

    const todayIso = getTodayIsoBr();
    const updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    await db.execute(
      `
      INSERT INTO recepcao_checklist_daily (
        date_ref, unit_key, meta_resolve_target, meta_checkup_target,
        nf_status, contas_status, google_rating, google_comments,
        pendencias_urgentes, situacoes_criticas, situacao_prazo, situacao_responsavel,
        acoes_realizadas, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date_ref, unit_key) DO UPDATE SET
        meta_resolve_target = excluded.meta_resolve_target,
        meta_checkup_target = excluded.meta_checkup_target,
        nf_status = excluded.nf_status,
        contas_status = excluded.contas_status,
        google_rating = excluded.google_rating,
        google_comments = excluded.google_comments,
        pendencias_urgentes = excluded.pendencias_urgentes,
        situacoes_criticas = excluded.situacoes_criticas,
        situacao_prazo = excluded.situacao_prazo,
        situacao_responsavel = excluded.situacao_responsavel,
        acoes_realizadas = excluded.acoes_realizadas,
        updated_at = excluded.updated_at
      `,
      [
        todayIso,
        unit.key,
        toInt(body?.metaResolveTarget),
        toInt(body?.metaCheckupTarget),
        String(body?.notasFiscaisEmitidas || '').trim(),
        String(body?.contasEmAbertoStatus || '').trim(),
        String(body?.googleRating || '').trim(),
        String(body?.googleComentarios || '').trim(),
        String(body?.pendenciasUrgentes || '').trim(),
        String(body?.situacoesCriticas || '').trim(),
        String(body?.situacaoPrazo || '').trim(),
        String(body?.situacaoResponsavel || '').trim(),
        String(body?.acoesRealizadas || '').trim(),
        updatedAt,
      ]
    );

    invalidateCache('admin:');
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao salvar Checklist Recepcao:', error);
    return NextResponse.json({ status: 'error', error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

