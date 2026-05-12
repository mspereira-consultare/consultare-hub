require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DEFAULT_PERIOD_REF = '2026-04';
const DEFAULT_CSV_PATH =
  '/Users/matheussp/Downloads/Planilha_Pagamentos_Medicos.xlsx - Repasse 30_05.csv';
const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  'planejamentos/repasses/relatorio_auditoria_repasses_2026-04.md'
);

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEmails(value) {
  const matches = String(value == null ? '' : value)
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return Array.from(new Set(matches || []));
}

function parseMoney(value) {
  const raw = clean(value);
  if (!raw) return 0;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  } else {
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot >= 0) {
      const decimals = normalized.length - lastDot - 1;
      if (decimals === 3) normalized = normalized.replace(/\./g, '');
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function formatMoney(value) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  return numeric.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, '_');
}

function loadCsvRows(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) throw new Error('CSV sem linhas suficientes para auditoria.');

  const header = parseCsvLine(lines[0]).map((item) => normalizeHeader(item));
  const rows = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);
    const row = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      row[header[columnIndex]] = values[columnIndex] == null ? '' : values[columnIndex];
    }

    const professionalName = clean(row.PROFISSIONAL);
    if (!professionalName) continue;

    rows.push({
      rowNumber: lineIndex + 1,
      emailRaw: clean(row.E_MAIL),
      emails: extractEmails(row.E_MAIL),
      professionalName,
      unitName: clean(row.UNIDADE_DE_EMISSAO_DA_NF),
      producaoValue: parseMoney(row.PRODUCAO),
      examesValue: parseMoney(row.EXAMES),
      porcentagemValue: parseMoney(row.PORCENTAGEM),
      totalValue: parseMoney(row.TOTAL),
      nfStatus: clean(row.NF),
    });
  }

  return rows;
}

function getMysqlUrl() {
  const internal = clean(process.env.MYSQL_URL);
  const publicUrl = clean(process.env.MYSQL_PUBLIC_URL);

  if (!internal && publicUrl) return publicUrl;
  if (!internal) return '';

  try {
    const parsed = new URL(internal);
    const host = clean(parsed.hostname).toLowerCase();
    const isInternalHost = host.endsWith('.railway.internal');
    const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
    if (isInternalHost && !isRailwayRuntime && publicUrl) return publicUrl;
  } catch {}

  return internal;
}

async function createDbConnection() {
  const url = getMysqlUrl();
  if (!url) throw new Error('MYSQL_URL ou MYSQL_PUBLIC_URL nao configurada.');

  const parsed = new URL(url);
  const sslMode = clean(parsed.searchParams.get('sslmode')).toLowerCase();
  const disableSslByUrl = sslMode === 'disable' || sslMode === 'false';
  const forceSslEnv = clean(process.env.MYSQL_FORCE_SSL).toLowerCase();
  const disableSslByEnv = forceSslEnv === '0' || forceSslEnv === 'false' || forceSslEnv === 'no';

  return mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || '3306'),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent((parsed.pathname || '').replace(/^\//, '')),
    ssl: !(disableSslByUrl || disableSslByEnv) ? { rejectUnauthorized: false } : undefined,
  });
}

function indexValues(map, key, value) {
  if (!key) return;
  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
}

function unique(values) {
  return Array.from(new Set(values));
}

function mapConsolidacaoStatus(value) {
  const normalized = clean(value).toUpperCase();
  if (normalized === 'SUCCESS') return 'SUCCESS';
  if (normalized === 'NO_DATA') return 'NO_DATA';
  if (normalized === 'SKIPPED_NOT_IN_FILTER' || normalized === 'SKIPPED_AMBIGUOUS_NAME') return 'SKIPPED';
  if (normalized === 'ERROR') return 'ERROR';
  return 'NOT_PROCESSED';
}

async function fetchPanelData(connection, periodRef) {
  const [professionals] = await connection.query(
    `
      SELECT id, name, email, payment_minimum_text
      FROM professionals
      WHERE is_active = 1
      ORDER BY name ASC
    `
  );

  const [repasseProfessionals] = await connection.query(
    `
      SELECT DISTINCT professional_id, professional_name
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ? AND is_active = 1
    `,
    [periodRef]
  );

  const [consolidadoProfessionals] = await connection.query(
    `
      SELECT DISTINCT professional_id, professional_name
      FROM feegow_repasse_consolidado
      WHERE period_ref = ? AND is_active = 1
    `,
    [periodRef]
  );

  const professionalMap = new Map();
  const paymentMinimumByProfessional = new Map();
  const emailByProfessional = new Map();

  for (const row of professionals) {
    const id = clean(row.id);
    const name = clean(row.name);
    if (!id || !name) continue;
    professionalMap.set(id, name);
    paymentMinimumByProfessional.set(id, clean(row.payment_minimum_text) || null);
    emailByProfessional.set(id, clean(row.email).toLowerCase() || null);
  }

  for (const row of repasseProfessionals) {
    const id = clean(row.professional_id);
    const name = clean(row.professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  for (const row of consolidadoProfessionals) {
    const id = clean(row.professional_id);
    const name = clean(row.professional_name);
    if (!id || !name || professionalMap.has(id)) continue;
    professionalMap.set(id, name);
  }

  const professionalPairs = Array.from(professionalMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  const professionalIds = professionalPairs.map((pair) => pair.id);

  const itemsById = new Map();
  if (!professionalIds.length) return { itemsById, professionalPairs, emailByProfessional };

  const placeholders = professionalIds.map(() => '?').join(', ');

  const [aggregateRows] = await connection.query(
    `
      SELECT
        professional_id,
        COUNT(*) AS rows_count,
        COALESCE(SUM(detail_repasse_value), 0) AS total_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN 1 ELSE 0 END), 0) AS consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'CONSOLIDADO' THEN detail_repasse_value ELSE 0 END), 0) AS consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('NAO_CONSOLIDADO', 'OUTRO', 'SEM_DETALHE') THEN 1 ELSE 0 END), 0) AS nao_consolidado_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) IN ('NAO_CONSOLIDADO', 'OUTRO', 'SEM_DETALHE') THEN detail_repasse_value ELSE 0 END), 0) AS nao_consolidado_value,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN 1 ELSE 0 END), 0) AS nao_recebido_qty,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(detail_status, '')) = 'NAO_RECEBIDO' THEN detail_repasse_value ELSE 0 END), 0) AS nao_recebido_value
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
      GROUP BY professional_id
    `,
    [periodRef, ...professionalIds]
  );

  const [duplicateRows] = await connection.query(
    `
      SELECT
        professional_id,
        COUNT(*) AS duplicate_case_count,
        COALESCE(SUM(rows_count), 0) AS duplicate_rows_count,
        COALESCE(SUM(total_value), 0) AS duplicate_total_value
      FROM (
        SELECT
          professional_id,
          execution_date,
          patient_name,
          procedure_name,
          detail_repasse_value,
          COUNT(*) AS rows_count,
          COALESCE(SUM(detail_repasse_value), 0) AS total_value
        FROM feegow_repasse_a_conferir
        WHERE period_ref = ?
          AND is_active = 1
          AND professional_id IN (${placeholders})
        GROUP BY professional_id, execution_date, patient_name, procedure_name, detail_repasse_value
        HAVING COUNT(*) > 1
      ) duplicated
      GROUP BY professional_id
    `,
    [periodRef, ...professionalIds]
  );

  const [zeroRows] = await connection.query(
    `
      SELECT
        professional_id,
        COUNT(*) AS zero_repasse_rows_count,
        COALESCE(SUM(detail_repasse_value), 0) AS zero_repasse_total_value
      FROM feegow_repasse_a_conferir
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
        AND ABS(COALESCE(detail_repasse_value, 0) - 0.01) < 0.0001
      GROUP BY professional_id
    `,
    [periodRef, ...professionalIds]
  );

  const [consolidadoRows] = await connection.query(
    `
      SELECT
        professional_id,
        COUNT(*) AS rows_count,
        COALESCE(SUM(repasse_value), 0) AS total_consolidado
      FROM feegow_repasse_consolidado
      WHERE period_ref = ?
        AND is_active = 1
        AND professional_id IN (${placeholders})
      GROUP BY professional_id
    `,
    [periodRef, ...professionalIds]
  );

  const [latestRows] = await connection.query(
    `
      SELECT
        i.professional_id,
        i.status,
        i.error_message,
        i.updated_at,
        j.created_at AS job_created_at
      FROM repasse_consolidacao_job_items i
      INNER JOIN repasse_consolidacao_jobs j ON j.id = i.job_id
      WHERE j.period_ref = ?
        AND i.professional_id IN (${placeholders})
      ORDER BY j.created_at DESC, i.updated_at DESC
    `,
    [periodRef, ...professionalIds]
  );

  const [manualRows] = await connection.query(
    `
      SELECT professional_id, repasse_final_value, produtividade_value
      FROM repasse_fechamento_manual
      WHERE period_ref = ?
        AND professional_id IN (${placeholders})
    `,
    [periodRef, ...professionalIds]
  );

  const aggregateByProfessional = new Map();
  const duplicateByProfessional = new Map();
  const zeroByProfessional = new Map();
  const consolidadoByProfessional = new Map();
  const latestByProfessional = new Map();
  const manualByProfessional = new Map();

  for (const row of aggregateRows) {
    aggregateByProfessional.set(clean(row.professional_id), {
      rowsCount: Number(row.rows_count) || 0,
      totalValue: Number(row.total_value) || 0,
      consolidadoQty: Number(row.consolidado_qty) || 0,
      consolidadoValue: Number(row.consolidado_value) || 0,
      naoConsolidadoQty: Number(row.nao_consolidado_qty) || 0,
      naoConsolidadoValue: Number(row.nao_consolidado_value) || 0,
      naoRecebidoQty: Number(row.nao_recebido_qty) || 0,
      naoRecebidoValue: Number(row.nao_recebido_value) || 0,
    });
  }

  for (const row of duplicateRows) {
    duplicateByProfessional.set(clean(row.professional_id), {
      caseCount: Number(row.duplicate_case_count) || 0,
      rowsCount: Number(row.duplicate_rows_count) || 0,
      totalValue: Number(row.duplicate_total_value) || 0,
    });
  }

  for (const row of zeroRows) {
    zeroByProfessional.set(clean(row.professional_id), {
      rowsCount: Number(row.zero_repasse_rows_count) || 0,
      totalValue: Number(row.zero_repasse_total_value) || 0,
    });
  }

  for (const row of consolidadoRows) {
    consolidadoByProfessional.set(clean(row.professional_id), {
      rowsCount: Number(row.rows_count) || 0,
      totalValue: Number(row.total_consolidado) || 0,
    });
  }

  for (const row of latestRows) {
    const professionalId = clean(row.professional_id);
    if (!professionalId || latestByProfessional.has(professionalId)) continue;
    latestByProfessional.set(professionalId, {
      status: mapConsolidacaoStatus(row.status),
      errorMessage: clean(row.error_message) || null,
      updatedAt: clean(row.updated_at) || null,
    });
  }

  for (const row of manualRows) {
    manualByProfessional.set(clean(row.professional_id), {
      repasseFinalValue:
        row.repasse_final_value === null || row.repasse_final_value === undefined
          ? null
          : Number(row.repasse_final_value),
      produtividadeValue:
        row.produtividade_value === null || row.produtividade_value === undefined
          ? null
          : Number(row.produtividade_value),
    });
  }

  for (const pair of professionalPairs) {
    const aggregate = aggregateByProfessional.get(pair.id) || {
      rowsCount: 0,
      totalValue: 0,
      consolidadoQty: 0,
      consolidadoValue: 0,
      naoConsolidadoQty: 0,
      naoConsolidadoValue: 0,
      naoRecebidoQty: 0,
      naoRecebidoValue: 0,
    };
    const consolidado = consolidadoByProfessional.get(pair.id) || {
      rowsCount: 0,
      totalValue: 0,
    };
    const duplicateAttendance = duplicateByProfessional.get(pair.id) || {
      caseCount: 0,
      rowsCount: 0,
      totalValue: 0,
    };
    const zeroRepasse = zeroByProfessional.get(pair.id) || {
      rowsCount: 0,
      totalValue: 0,
    };
    const manual = manualByProfessional.get(pair.id);
    const latest = latestByProfessional.get(pair.id);

    const repasseFinalOverride =
      manual && manual.repasseFinalValue !== null && manual.repasseFinalValue !== undefined
        ? Number(manual.repasseFinalValue) || 0
        : null;
    const produtividadeValue =
      manual && manual.produtividadeValue !== null && manual.produtividadeValue !== undefined
        ? Number(manual.produtividadeValue) || 0
        : 0;
    const repasseFinalValue = repasseFinalOverride === null ? consolidado.totalValue : repasseFinalOverride;
    const percentualProdutividadeValue = produtividadeValue * 0.05;
    const totalFinalValue = repasseFinalValue + percentualProdutividadeValue;
    const status = latest
      ? latest.status
      : consolidado.rowsCount > 0 || aggregate.rowsCount > 0
        ? 'SUCCESS'
        : 'NOT_PROCESSED';
    const divergenciaValue = consolidado.totalValue - aggregate.consolidadoValue;

    itemsById.set(pair.id, {
      professionalId: pair.id,
      professionalName: pair.name,
      email: emailByProfessional.get(pair.id) || null,
      paymentMinimumText: paymentMinimumByProfessional.get(pair.id) || null,
      status,
      rowsCount: consolidado.rowsCount,
      totalValue: consolidado.totalValue,
      consolidadoQty: aggregate.consolidadoQty,
      consolidadoValue: aggregate.consolidadoValue,
      naoConsolidadoQty: aggregate.naoConsolidadoQty,
      naoConsolidadoValue: aggregate.naoConsolidadoValue,
      naoRecebidoQty: aggregate.naoRecebidoQty,
      naoRecebidoValue: aggregate.naoRecebidoValue,
      repasseTotalConsolidadoTabela: consolidado.totalValue,
      repasseTotalConsolidadoAConferir: aggregate.consolidadoValue,
      hasDivergencia: Math.abs(divergenciaValue) > 0.01,
      divergenciaValue,
      repasseFinalValue,
      produtividadeValue,
      percentualProdutividadeValue,
      totalFinalValue,
      duplicateAttendanceCaseCount: duplicateAttendance.caseCount,
      duplicateAttendanceQty: duplicateAttendance.rowsCount,
      duplicateAttendanceValue: duplicateAttendance.totalValue,
      hasPossibleDuplicateAttendances: duplicateAttendance.caseCount > 0,
      zeroRepasseQty: zeroRepasse.rowsCount,
      zeroRepasseValue: zeroRepasse.totalValue,
      hasZeroRepasseAlert: zeroRepasse.rowsCount > 0,
      hasRepasseFinalOverride: repasseFinalOverride !== null,
      lastProcessedAt: latest ? latest.updatedAt : null,
      errorMessage: status === 'ERROR' ? latest.errorMessage || null : null,
    });
  }

  return { itemsById, professionalPairs, emailByProfessional };
}

function scoreCandidate(sheetName, panelName) {
  const normalizedSheet = normalizeText(sheetName);
  const normalizedPanel = normalizeText(panelName);
  if (!normalizedSheet || !normalizedPanel) return 0;
  if (normalizedSheet === normalizedPanel) return 1_000;
  if (normalizedPanel.includes(normalizedSheet) || normalizedSheet.includes(normalizedPanel)) return 900;

  const sheetTokens = normalizedSheet.split(' ').filter(Boolean);
  const panelTokens = new Set(normalizedPanel.split(' ').filter(Boolean));
  let overlap = 0;
  for (const token of sheetTokens) {
    if (panelTokens.has(token)) overlap += 1;
  }
  return overlap * 100 - Math.abs(normalizedSheet.length - normalizedPanel.length);
}

function buildAlerts(item, options = {}) {
  const includeManualOverride = options.includeManualOverride === true;
  const alerts = [];
  if (!item) return alerts;
  if (item.hasDivergencia) {
    alerts.push(`divergencia painel ${formatMoney(item.divergenciaValue)}`);
  }
  if (item.hasPossibleDuplicateAttendances) {
    alerts.push(
      `${item.duplicateAttendanceCaseCount} caso(s) com possivel duplicidade (${item.duplicateAttendanceQty} linhas)`
    );
  }
  if (item.hasZeroRepasseAlert) {
    alerts.push(`${item.zeroRepasseQty} linha(s) com repasse 0,01`);
  }
  if (item.naoConsolidadoQty > 0) {
    alerts.push(`${item.naoConsolidadoQty} linha(s) nao consolidadas`);
  }
  if (item.naoRecebidoQty > 0) {
    alerts.push(`${item.naoRecebidoQty} linha(s) nao recebidas`);
  }
  if (item.status === 'ERROR' || item.status === 'SKIPPED') {
    alerts.push(`status ${item.status}`);
  }
  if (includeManualOverride && item.hasRepasseFinalOverride) {
    alerts.push('fechamento manual');
  }
  return alerts;
}

function compareRows(sheetRows, panelItemsById) {
  const panelItems = Array.from(panelItemsById.values());
  const emailIndex = new Map();
  const nameIndex = new Map();

  for (const item of panelItems) {
    if (item.email) indexValues(emailIndex, clean(item.email).toLowerCase(), item.professionalId);
    indexValues(nameIndex, normalizeText(item.professionalName), item.professionalId);
  }

  const matchedPanelIds = new Set();
  const matchedRows = [];
  const valueMismatches = [];
  const missingRows = [];
  const ambiguousRows = [];
  const panelAlerts = [];

  for (const row of sheetRows) {
    const exactNameKey = normalizeText(row.professionalName);
    const emailMatches = unique(row.emails.flatMap((email) => emailIndex.get(email) || []));
    const nameMatches = unique(nameIndex.get(exactNameKey) || []);

    let matchedId = null;
    let matchReason = '';
    let ambiguous = [];
    const matchNotes = [];

    if (emailMatches.length === 1 && nameMatches.length === 1 && emailMatches[0] !== nameMatches[0]) {
      matchedId = nameMatches[0];
      matchReason = 'nome';
      const conflictingItem = panelItemsById.get(emailMatches[0]);
      if (conflictingItem) {
        matchNotes.push(`email da planilha aponta para outro cadastro: ${conflictingItem.professionalName}`);
      }
    } else if (emailMatches.length === 1) {
      matchedId = emailMatches[0];
      matchReason = 'email';
    } else if (emailMatches.length > 1) {
      const intersected = emailMatches.filter((id) => nameMatches.includes(id));
      if (intersected.length === 1) {
        matchedId = intersected[0];
        matchReason = 'email+nome';
      } else {
        ambiguous = emailMatches;
      }
    }

    if (!matchedId && nameMatches.length === 1) {
      matchedId = nameMatches[0];
      matchReason = matchReason || 'nome';
    } else if (!matchedId && nameMatches.length > 1) {
      ambiguous = nameMatches;
    }

    if (!matchedId && ambiguous.length) {
      ambiguousRows.push({
        row,
        candidates: ambiguous.map((id) => panelItemsById.get(id)).filter(Boolean),
      });
      continue;
    }

    if (!matchedId) {
      const suggestions = panelItems
        .map((item) => ({
          item,
          score: scoreCandidate(row.professionalName, item.professionalName),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)
        .map((entry) => entry.item);
      missingRows.push({ row, suggestions });
      continue;
    }

    const item = panelItemsById.get(matchedId);
    matchedPanelIds.add(matchedId);

    const diffs = {
      producao: toCents(row.producaoValue) - toCents(item.repasseFinalValue),
      exames: toCents(row.examesValue) - toCents(item.produtividadeValue),
      porcentagem: toCents(row.porcentagemValue) - toCents(item.percentualProdutividadeValue),
      total: toCents(row.totalValue) - toCents(item.totalFinalValue),
    };

    const hasValueMismatch =
      Math.abs(diffs.producao) > 1 ||
      Math.abs(diffs.exames) > 1 ||
      Math.abs(diffs.porcentagem) > 1 ||
      Math.abs(diffs.total) > 1;

    const notes = [];
    if (row.nfStatus) notes.push(`NF: ${row.nfStatus}`);
    if (matchNotes.length) notes.push(...matchNotes);
    if (matchReason === 'email' && exactNameKey !== normalizeText(item.professionalName)) {
      notes.push(`nome divergente no cadastro do painel: ${item.professionalName}`);
    }
    const alerts = buildAlerts(item, { includeManualOverride: true });
    if (alerts.length) notes.push(...alerts);

    const matchRecord = {
      row,
      item,
      matchReason,
      diffs,
      notes,
      matchNotes,
      meaningfulAlerts: buildAlerts(item),
    };

    matchedRows.push(matchRecord);

    if (hasValueMismatch) {
      valueMismatches.push(matchRecord);
    } else if (matchRecord.meaningfulAlerts.length || matchNotes.length) {
      panelAlerts.push(matchRecord);
    }
  }

  const panelOnly = panelItems
    .filter((item) => !matchedPanelIds.has(item.professionalId))
    .filter(
      (item) =>
        toCents(item.repasseFinalValue) !== 0 ||
        toCents(item.produtividadeValue) !== 0 ||
        toCents(item.totalFinalValue) !== 0
    )
    .sort((left, right) => toCents(right.totalFinalValue) - toCents(left.totalFinalValue));

  valueMismatches.sort((left, right) => Math.abs(right.diffs.total) - Math.abs(left.diffs.total));
  panelAlerts.sort((left, right) => right.item.totalFinalValue - left.item.totalFinalValue);

  return {
    matchedRows,
    valueMismatches,
    missingRows,
    ambiguousRows,
    panelOnly,
    panelAlerts,
  };
}

function buildMarkdownReport({
  periodRef,
  csvPath,
  generatedAt,
  sheetRows,
  comparison,
}) {
  const lines = [];
  const matchedCount = comparison.matchedRows.length;
  const comparedTotalSheet = comparison.matchedRows.reduce((acc, entry) => acc + entry.row.totalValue, 0);
  const comparedTotalPanel = comparison.matchedRows.reduce((acc, entry) => acc + entry.item.totalFinalValue, 0);
  const mismatchTotalDelta = comparison.valueMismatches.reduce(
    (acc, entry) => acc + Math.abs(entry.diffs.total) / 100,
    0
  );

  lines.push(`# Auditoria de repasses ${periodRef}`);
  lines.push('');
  lines.push(`- Arquivo analisado: \`${csvPath}\``);
  lines.push(`- Competencia analisada no painel: \`${periodRef}\``);
  lines.push(`- Gerado em: ${formatDateTime(generatedAt)}`);
  lines.push('');
  lines.push('## Regra de comparacao');
  lines.push('');
  lines.push('- `PRODUCAO` da planilha foi comparada com `repasseFinalValue` do painel.');
  lines.push('- `EXAMES` da planilha foi comparada com `produtividadeValue` do painel.');
  lines.push('- `PORCENTAGEM` da planilha foi comparada com `percentualProdutividadeValue` do painel.');
  lines.push('- `TOTAL` da planilha foi comparada com `totalFinalValue` do painel.');
  lines.push('- O painel calcula `totalFinalValue = repasseFinalValue + (produtividadeValue * 0.05)`.');
  lines.push('');
  lines.push('## Resumo executivo');
  lines.push('');
  lines.push(`- Linhas na planilha: ${sheetRows.length}`);
  lines.push(`- Correspondencias automaticas: ${matchedCount}`);
  lines.push(`- Divergencias de valor: ${comparison.valueMismatches.length}`);
  lines.push(`- Linhas da planilha sem correspondencia no painel: ${comparison.missingRows.length}`);
  lines.push(`- Linhas da planilha com correspondencia ambigua: ${comparison.ambiguousRows.length}`);
  lines.push(`- Profissionais com valor no painel e ausentes da planilha: ${comparison.panelOnly.length}`);
  lines.push(`- Profissionais com alertas internos relevantes no painel e valores batendo: ${comparison.panelAlerts.length}`);
  lines.push(`- Total da planilha nas linhas comparadas: ${formatMoney(comparedTotalSheet)}`);
  lines.push(`- Total do painel nas linhas comparadas: ${formatMoney(comparedTotalPanel)}`);
  lines.push(`- Soma absoluta das diferencas de TOTAL: ${formatMoney(mismatchTotalDelta)}`);
  lines.push('');

  lines.push('## Divergencias de valor');
  lines.push('');
  if (!comparison.valueMismatches.length) {
    lines.push('Nenhuma divergencia de valor encontrada nas linhas com correspondencia automatica.');
    lines.push('');
  } else {
    lines.push(
      '| Planilha | Painel | Match | Producao planilha | Producao painel | Exames planilha | Exames painel | % planilha | % painel | Total planilha | Total painel | Delta total | Observacoes |'
    );
    lines.push(
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
    );
    for (const entry of comparison.valueMismatches) {
      lines.push(
        `| ${entry.row.professionalName} | ${entry.item.professionalName} | ${entry.matchReason} | ${formatMoney(
          entry.row.producaoValue
        )} | ${formatMoney(entry.item.repasseFinalValue)} | ${formatMoney(entry.row.examesValue)} | ${formatMoney(
          entry.item.produtividadeValue
        )} | ${formatMoney(entry.row.porcentagemValue)} | ${formatMoney(
          entry.item.percentualProdutividadeValue
        )} | ${formatMoney(entry.row.totalValue)} | ${formatMoney(entry.item.totalFinalValue)} | ${formatMoney(
          Math.abs(entry.diffs.total) / 100
        )} | ${entry.notes.join('; ') || '-'} |`
      );
    }
    lines.push('');
  }

  lines.push('## Linhas da planilha sem correspondencia no painel');
  lines.push('');
  if (!comparison.missingRows.length) {
    lines.push('Todas as linhas da planilha tiveram ao menos uma correspondencia automatica no painel.');
    lines.push('');
  } else {
    lines.push('| Linha CSV | Profissional na planilha | Email(s) | Total planilha | NF | Sugestoes no painel |');
    lines.push('| ---: | --- | --- | ---: | --- | --- |');
    for (const entry of comparison.missingRows) {
      lines.push(
        `| ${entry.row.rowNumber} | ${entry.row.professionalName} | ${
          entry.row.emails.join(', ') || '-'
        } | ${formatMoney(entry.row.totalValue)} | ${entry.row.nfStatus || '-'} | ${
          entry.suggestions.map((item) => item.professionalName).join(' / ') || '-'
        } |`
      );
    }
    lines.push('');
  }

  lines.push('## Linhas da planilha com correspondencia ambigua');
  lines.push('');
  if (!comparison.ambiguousRows.length) {
    lines.push('Nenhuma correspondencia ambigua encontrada.');
    lines.push('');
  } else {
    lines.push('| Linha CSV | Profissional na planilha | Email(s) | Candidatos no painel |');
    lines.push('| ---: | --- | --- | --- |');
    for (const entry of comparison.ambiguousRows) {
      lines.push(
        `| ${entry.row.rowNumber} | ${entry.row.professionalName} | ${
          entry.row.emails.join(', ') || '-'
        } | ${entry.candidates.map((item) => item.professionalName).join(' / ')} |`
      );
    }
    lines.push('');
  }

  lines.push('## Profissionais com valor no painel e ausentes da planilha');
  lines.push('');
  if (!comparison.panelOnly.length) {
    lines.push('Nao foram encontrados profissionais com valores no painel que estejam ausentes na planilha.');
    lines.push('');
  } else {
    lines.push('| Painel | Email | Producao painel | Exames painel | % painel | Total painel | Alertas |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (const item of comparison.panelOnly) {
      lines.push(
        `| ${item.professionalName} | ${item.email || '-'} | ${formatMoney(item.repasseFinalValue)} | ${formatMoney(
          item.produtividadeValue
        )} | ${formatMoney(item.percentualProdutividadeValue)} | ${formatMoney(item.totalFinalValue)} | ${
          buildAlerts(item).join('; ') || '-'
        } |`
      );
    }
    lines.push('');
  }

  lines.push('## Alertas internos do painel em linhas que bateram com a planilha');
  lines.push('');
  if (!comparison.panelAlerts.length) {
    lines.push('Nenhum alerta interno relevante foi encontrado entre as linhas que bateram com a planilha.');
    lines.push('');
  } else {
    lines.push('| Planilha | Painel | Total conferido | Alertas |');
    lines.push('| --- | --- | ---: | --- |');
    for (const entry of comparison.panelAlerts) {
      const reportAlerts = entry.meaningfulAlerts.length ? entry.meaningfulAlerts : entry.matchNotes;
      lines.push(
        `| ${entry.row.professionalName} | ${entry.item.professionalName} | ${formatMoney(
          entry.item.totalFinalValue
        )} | ${reportAlerts.join('; ') || '-'} |`
      );
    }
    lines.push('');
  }

  lines.push('## Observacoes tecnicas');
  lines.push('');
  lines.push('- Esta auditoria usa a base do proprio painel para a competencia `2026-04`.');
  lines.push('- O painel lista profissionais a partir de `professionals`, `feegow_repasse_consolidado` e `feegow_repasse_a_conferir`.');
  lines.push('- Quando existe registro em `repasse_fechamento_manual`, o `repasseFinalValue` e a `produtividadeValue` podem ser sobrescritos manualmente.');
  lines.push('- O alerta `divergencia painel` indica diferenca entre `feegow_repasse_consolidado` e a soma consolidada de `feegow_repasse_a_conferir`.');
  lines.push('- O alerta de duplicidade sinaliza grupos com mesmo profissional, data de execucao, paciente, procedimento e valor de repasse repetidos em `feegow_repasse_a_conferir`.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const periodRef = clean(process.argv[2]) || DEFAULT_PERIOD_REF;
  const csvPath = path.resolve(clean(process.argv[3]) || DEFAULT_CSV_PATH);
  const reportPath = path.resolve(clean(process.argv[4]) || DEFAULT_REPORT_PATH);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Arquivo CSV nao encontrado: ${csvPath}`);
  }

  const sheetRows = loadCsvRows(csvPath);
  const connection = await createDbConnection();

  try {
    const panelData = await fetchPanelData(connection, periodRef);
    const comparison = compareRows(sheetRows, panelData.itemsById);
    const markdown = buildMarkdownReport({
      periodRef,
      csvPath,
      generatedAt: new Date().toISOString(),
      sheetRows,
      comparison,
    });

    fs.writeFileSync(reportPath, markdown, 'utf8');

    console.log(JSON.stringify({
      periodRef,
      csvPath,
      reportPath,
      sheetRows: sheetRows.length,
      matchedRows: comparison.matchedRows.length,
      valueMismatches: comparison.valueMismatches.length,
      missingRows: comparison.missingRows.length,
      ambiguousRows: comparison.ambiguousRows.length,
      panelOnly: comparison.panelOnly.length,
      panelAlerts: comparison.panelAlerts.length,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
