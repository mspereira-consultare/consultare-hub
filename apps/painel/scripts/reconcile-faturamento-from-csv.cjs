#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const CSV_TO_DB_COLUMN = {
  'Data de Referência': 'data_de_referência',
  'Data do Pagamento': 'data_do_pagamento',
  'Data Removida': 'data_removida',
  'Forma de Pagamento': 'forma_de_pagamento',
  Tipo: 'tipo',
  Desconto: 'desconto',
  'Acréscimo': 'acréscimo',
  'Valor Produzido': 'valor_produzido',
  'Total Bruto': 'total_bruto',
  'Total Pago': 'total_pago',
  Paciente: 'paciente',
  Procedimento: 'procedimento',
  CPF: 'cpf',
  'Tipo do Procedimento': 'tipo_do_procedimento',
  'Usuário que agendou': 'usuário_que_agendou',
  Grupo: 'grupo',
  'Usuário da conta': 'usuario_da_conta',
  Unidade: 'unidade',
  Quantidade: 'quantidade',
  Prontuário: 'prontuário',
  Matrícula: 'matrícula',
};

const COLUMN_TYPES = {
  'data_de_referência': 'TEXT',
  data_do_pagamento: 'TEXT',
  data_removida: 'TEXT',
  forma_de_pagamento: 'TEXT',
  tipo: 'TEXT',
  desconto: 'DOUBLE',
  'acréscimo': 'DOUBLE',
  valor_produzido: 'DOUBLE',
  total_bruto: 'DOUBLE',
  total_pago: 'DOUBLE',
  paciente: 'TEXT',
  procedimento: 'TEXT',
  cpf: 'TEXT',
  tipo_do_procedimento: 'TEXT',
  'usuário_que_agendou': 'TEXT',
  grupo: 'TEXT',
  usuario_da_conta: 'TEXT',
  unidade: 'TEXT',
  quantidade: 'DOUBLE',
  'prontuário': 'DOUBLE',
  'matrícula': 'TEXT',
  updated_at: 'TEXT',
};

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return raw;
}

function parseNumber(value) {
  const raw = clean(value);
  if (!raw) return null;
  let normalized = raw.replace(/\s+/g, '');
  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');
  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(content, delimiter = ';') {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentValue);
      if (currentRow.some((item) => clean(item) !== '')) rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += ch;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((item) => clean(item) !== '')) rows.push(currentRow);
  }

  return rows;
}

function resolveMysqlUrl() {
  const internal = String(process.env.MYSQL_URL || '').trim();
  const publicUrl = String(process.env.MYSQL_PUBLIC_URL || '').trim();
  if (!internal && !publicUrl) return '';
  const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  if (internal) {
    try {
      const host = new URL(internal).hostname.toLowerCase();
      if (host.endsWith('.railway.internal') && !isRailwayRuntime && publicUrl) return publicUrl;
    } catch {
      return internal || publicUrl;
    }
  }
  return internal || publicUrl;
}

function quoteIdentifier(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function normalizeAnaliticoDateSql(columnName = 'data_do_pagamento') {
  return `
    CASE
      WHEN INSTR(${columnName}, '/') > 0
        THEN CONCAT(SUBSTR(${columnName}, 7, 4), '-', SUBSTR(${columnName}, 4, 2), '-', SUBSTR(${columnName}, 1, 2))
      ELSE ${columnName}
    END
  `;
}

function buildRecords(csvPath) {
  let content = fs.readFileSync(csvPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const rows = parseCsv(content, ';');
  if (rows.length <= 1) throw new Error('CSV sem dados suficientes para reconciliar o faturamento.');

  const [header, ...dataRows] = rows;
  const headerIndex = new Map(header.map((name, index) => [clean(name), index]));

  const records = [];
  for (const dataRow of dataRows) {
    const record = {};
    for (const [csvColumn, dbColumn] of Object.entries(CSV_TO_DB_COLUMN)) {
      const index = headerIndex.get(csvColumn);
      const rawValue = index == null ? '' : dataRow[index];
      if (['desconto', 'acréscimo', 'valor_produzido', 'total_bruto', 'total_pago', 'quantidade', 'prontuário'].includes(dbColumn)) {
        record[dbColumn] = parseNumber(rawValue);
      } else if (['data_de_referência', 'data_do_pagamento', 'data_removida'].includes(dbColumn)) {
        record[dbColumn] = normalizeDate(rawValue);
      } else {
        record[dbColumn] = clean(rawValue) || null;
      }
    }
    records.push(record);
  }

  return records.filter((record) => clean(record.data_do_pagamento));
}

async function ensureColumns(conn, requiredColumns) {
  const [existingRows] = await conn.query('SHOW COLUMNS FROM faturamento_analitico');
  const existing = new Set((existingRows || []).map((row) => String(row.Field || '').trim()).filter(Boolean));
  for (const column of requiredColumns) {
    if (existing.has(column)) continue;
    const type = COLUMN_TYPES[column] || 'TEXT';
    await conn.execute(`ALTER TABLE faturamento_analitico ADD COLUMN ${quoteIdentifier(column)} ${type}`);
  }
}

async function ensureDailySummaryTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS faturamento_resumo_diario (
      data_ref VARCHAR(191) NOT NULL,
      unidade VARCHAR(191) NOT NULL,
      grupo VARCHAR(191) NOT NULL,
      procedimento VARCHAR(191) NOT NULL,
      procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
      total_pago DOUBLE,
      qtd BIGINT,
      updated_at TEXT,
      PRIMARY KEY (data_ref, unidade, grupo, procedimento_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureMonthlySummaryTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
      month_ref VARCHAR(191) NOT NULL,
      unidade VARCHAR(191) NOT NULL,
      grupo VARCHAR(191) NOT NULL,
      procedimento VARCHAR(191) NOT NULL,
      procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
      total_pago DOUBLE,
      qtd BIGINT,
      updated_at TEXT,
      PRIMARY KEY (month_ref, unidade, grupo, procedimento_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function refreshDailySummary(conn, startDate, endDate) {
  await ensureDailySummaryTable(conn);
  await conn.execute('DELETE FROM faturamento_resumo_diario WHERE data_ref BETWEEN ? AND ?', [startDate, endDate]);
  const dateExpr = normalizeAnaliticoDateSql('data_do_pagamento');
  await conn.execute(
    `
    INSERT INTO faturamento_resumo_diario (
      data_ref, unidade, grupo, procedimento, procedimento_key, total_pago, qtd, updated_at
    )
    SELECT
      ${dateExpr} AS data_ref,
      COALESCE(TRIM(unidade), '') AS unidade,
      COALESCE(TRIM(grupo), '') AS grupo,
      COALESCE(TRIM(procedimento), '') AS procedimento,
      MIN(MD5(COALESCE(TRIM(procedimento), ''))) AS procedimento_key,
      SUM(total_pago) AS total_pago,
      COUNT(*) AS qtd,
      NOW() AS updated_at
    FROM faturamento_analitico
    WHERE ${dateExpr} BETWEEN ? AND ?
    GROUP BY data_ref, unidade, grupo, procedimento
    `,
    [startDate, endDate]
  );
}

function getMonthRange(startDate, endDate) {
  const months = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  current.setDate(1);
  while (current <= end) {
    months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

async function refreshMonthlySummary(conn, startDate, endDate) {
  await ensureMonthlySummaryTable(conn);
  const months = getMonthRange(startDate, endDate);
  if (!months.length) return;

  for (const monthRef of months) {
    await conn.execute('DELETE FROM faturamento_resumo_mensal WHERE month_ref = ?', [monthRef]);
    await conn.execute(
      `
      INSERT INTO faturamento_resumo_mensal (
        month_ref, unidade, grupo, procedimento, procedimento_key, total_pago, qtd, updated_at
      )
      SELECT
        SUBSTR(data_ref, 1, 7) AS month_ref,
        unidade,
        grupo,
        procedimento,
        MIN(procedimento_key) AS procedimento_key,
        SUM(total_pago) AS total_pago,
        SUM(qtd) AS qtd,
        NOW() AS updated_at
      FROM faturamento_resumo_diario
      WHERE data_ref BETWEEN ? AND ?
      GROUP BY month_ref, unidade, grupo, procedimento
      `,
      [`${monthRef}-01`, `${monthRef}-31`]
    );
  }
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error('Uso: node apps/painel/scripts/reconcile-faturamento-from-csv.cjs "/caminho/arquivo.csv"');
  }

  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');
  }

  const records = buildRecords(path.resolve(csvPath));
  if (!records.length) {
    throw new Error('Nenhum registro válido encontrado no CSV.');
  }

  const dates = records.map((record) => clean(record.data_do_pagamento)).filter(Boolean).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const conn = await mysql.createConnection({
    uri: mysqlUrl,
    ssl: ['0', 'false', 'no'].includes(String(process.env.MYSQL_FORCE_SSL || '').toLowerCase())
      ? undefined
      : { rejectUnauthorized: false },
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 30000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  const columns = [
    'data_de_referência',
    'data_do_pagamento',
    'data_removida',
    'forma_de_pagamento',
    'tipo',
    'desconto',
    'acréscimo',
    'valor_produzido',
    'total_bruto',
    'total_pago',
    'paciente',
    'procedimento',
    'cpf',
    'tipo_do_procedimento',
    'usuário_que_agendou',
    'grupo',
    'usuario_da_conta',
    'unidade',
    'quantidade',
    'prontuário',
    'matrícula',
    'updated_at',
  ];

  try {
    await conn.beginTransaction();
    await ensureColumns(conn, columns);

    await conn.execute(
      `
      DELETE FROM faturamento_analitico
      WHERE (
        CASE
          WHEN INSTR(data_do_pagamento, '/') > 0
            THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2))
          ELSE data_do_pagamento
        END
      ) BETWEEN ? AND ?
      `,
      [startDate, endDate]
    );

    const sql = `
      INSERT INTO faturamento_analitico (${columns.map(quoteIdentifier).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `;

    for (let index = 0; index < records.length; index += 250) {
      const chunk = records.slice(index, index + 250);
      for (const record of chunk) {
        const values = columns.map((column) => (column === 'updated_at' ? now : record[column] ?? null));
        await conn.execute(sql, values);
      }
    }

    await refreshDailySummary(conn, startDate, endDate);
    await refreshMonthlySummary(conn, startDate, endDate);

    const [countRows] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM faturamento_analitico
      WHERE (${normalizeAnaliticoDateSql('data_do_pagamento')}) BETWEEN ? AND ?
      `,
      [startDate, endDate]
    );
    const insertedCount = Number((countRows && countRows[0] && countRows[0].total) || 0);

    await conn.commit();
    console.log(
      JSON.stringify(
        {
          file: path.resolve(csvPath),
          replacedRange: { startDate, endDate },
          insertedRows: records.length,
          persistedRows: insertedCount,
          refreshedSummaries: ['faturamento_resumo_diario', 'faturamento_resumo_mensal'],
        },
        null,
        2
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha na reconciliação do faturamento por CSV:', error?.message || error);
  process.exit(1);
});
