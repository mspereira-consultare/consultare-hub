#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const DEFAULT_TABLES = [
  'goals_config',
  'teams_master',
  'user_teams',
  'integrations_config',
  'clinia_appointment_stats',
  'clinia_chat_stats',
  'espera_medica',
  'recepcao_historico',
  'users',
  'system_status',
  'system_status_backup',
  'faturamento_backfill_checkpoint',
];

function parseArgs(argv) {
  const argMap = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.split('=');
      argMap[k] = v === undefined ? true : v;
    }
  }

  const dryRun = Boolean(argMap['--dry-run']);
  const includeAll = Boolean(argMap['--all-tables']);
  const truncate = Boolean(argMap['--truncate']);
  const batchSize = Math.max(1, Number(argMap['--batch-size'] || 500));
  const tablesFromArg = String(argMap['--tables'] || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const tables = includeAll ? [] : (tablesFromArg.length ? tablesFromArg : DEFAULT_TABLES);
  return { dryRun, includeAll, truncate, batchSize, tables };
}

function normalizeTursoUrl(url) {
  if (!url) return url;
  return url.replace(/^libsql:\/\//i, 'https://').replace(/^wss:\/\//i, 'https://');
}

function mysqlConfigFromUrl(url) {
  const parsed = new URL(url);
  const sslMode = String(parsed.searchParams.get('sslmode') || '').toLowerCase();
  const disableSslByUrl = sslMode === 'disable' || sslMode === 'false';
  const disableSslByEnv = String(process.env.MYSQL_FORCE_SSL || '').toLowerCase() === 'false';
  const useSsl = !(disableSslByUrl || disableSslByEnv);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || '3306'),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent((parsed.pathname || '').replace(/^\//, '')),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    multipleStatements: false,
  };
}

function resolveMysqlUrl() {
  const internal = process.env.MYSQL_URL || '';
  const publicUrl = process.env.MYSQL_PUBLIC_URL || '';
  if (!internal && !publicUrl) return '';

  const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  if (internal) {
    try {
      const host = new URL(internal).hostname.toLowerCase();
      const isInternalHost = host.endsWith('.railway.internal');
      if (isInternalHost && !isRailwayRuntime && publicUrl) {
        console.log('Host MySQL interno detectado fora do Railway. Usando MYSQL_PUBLIC_URL.');
        return publicUrl;
      }
    } catch {
      // no-op
    }
  }
  return internal || publicUrl;
}

function qIdent(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function generateTextPk() {
  return crypto.randomUUID().replace(/-/g, '');
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function tableExistsInMysql(conn, tableName) {
  const [rows] = await conn.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1
    `,
    [tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function getSqliteTables(turso) {
  const rs = await turso.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  return (rs.rows || []).map((r) => String(r.name));
}

async function getSqliteColumns(turso, tableName) {
  const rs = await turso.execute(`PRAGMA table_info(${qIdent(tableName)})`);
  return (rs.rows || [])
    .map((r) => ({
      name: String(r.name),
      type: String(r.type || ''),
      pk: Number(r.pk || 0),
    }))
    .sort((a, b) => a.pk - b.pk);
}

async function getMysqlColumnInfo(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function ensureAutoIncrementIfNeeded(conn, tableName, pkCol) {
  if (!pkCol) return;
  const sqliteType = String(pkCol.type || '').toUpperCase();
  if (!sqliteType.includes('INT')) return;

  const info = await getMysqlColumnInfo(conn, tableName, pkCol.name);
  if (!info) return;

  const extra = String(info.EXTRA || '').toLowerCase();
  if (extra.includes('auto_increment')) return;

  await conn.execute(
    `ALTER TABLE ${qIdent(tableName)} MODIFY ${qIdent(pkCol.name)} BIGINT NOT NULL AUTO_INCREMENT`
  );
  console.log(`  - ${tableName}: coluna ${pkCol.name} ajustada para AUTO_INCREMENT`);
}

async function readTableRowsFromTurso(turso, tableName, columns) {
  const selectCols = columns.map((c) => qIdent(c.name)).join(', ');
  const rs = await turso.execute(`SELECT ${selectCols} FROM ${qIdent(tableName)}`);
  return rs.rows || [];
}

function buildUpsertSql(tableName, columns, pkCols) {
  const names = columns.map((c) => c.name);
  const insertBase = `INSERT INTO ${qIdent(tableName)} (${names.map(qIdent).join(', ')}) VALUES `;
  const valuesTpl = `(${names.map(() => '?').join(', ')})`;
  const nonPkCols = names.filter((n) => !pkCols.includes(n));

  if (pkCols.length > 0 && nonPkCols.length > 0) {
    const updateClause = nonPkCols.map((c) => `${qIdent(c)} = VALUES(${qIdent(c)})`).join(', ');
    return {
      perRowValuesTpl: valuesTpl,
      buildSql: (rowsCount) =>
        `${insertBase}${Array.from({ length: rowsCount }).map(() => valuesTpl).join(', ')} ON DUPLICATE KEY UPDATE ${updateClause}`,
    };
  }

  if (pkCols.length > 0 && nonPkCols.length === 0) {
    return {
      perRowValuesTpl: valuesTpl,
      buildSql: (rowsCount) =>
        `INSERT IGNORE INTO ${qIdent(tableName)} (${names.map(qIdent).join(', ')}) VALUES ${Array.from({ length: rowsCount }).map(() => valuesTpl).join(', ')}`,
    };
  }

  return {
    perRowValuesTpl: valuesTpl,
    buildSql: (rowsCount) =>
      `INSERT INTO ${qIdent(tableName)} (${names.map(qIdent).join(', ')}) VALUES ${Array.from({ length: rowsCount }).map(() => valuesTpl).join(', ')}`,
  };
}

async function migrateTable({ turso, mysqlConn, tableName, opts }) {
  const cols = await getSqliteColumns(turso, tableName);
  if (cols.length === 0) {
    console.log(`- ${tableName}: ignorada (sem colunas)`);
    return;
  }

  const pkCol = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)[0] || null;
  const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name);
  const hasSinglePk = pkCols.length === 1 && pkCol;
  const pkIsText =
    hasSinglePk && /CHAR|TEXT|CLOB/.test(String(pkCol.type || '').toUpperCase());

  if (pkCols.length === 1 && pkCol) {
    await ensureAutoIncrementIfNeeded(mysqlConn, tableName, pkCol);
  }

  const rows = await readTableRowsFromTurso(turso, tableName, cols);
  const noPrimaryKey = pkCols.length === 0;
  const forceTruncate = opts.truncate || noPrimaryKey;
  const batches = chunkArray(rows, opts.batchSize);
  const sqlBuilder = buildUpsertSql(tableName, cols, pkCols);

  if (opts.dryRun) {
    console.log(
      `- ${tableName}: ${rows.length} linhas | pk=${pkCols.length ? pkCols.join(',') : 'none'} | truncate=${forceTruncate ? 'sim' : 'nao'} | lotes=${batches.length}`
    );
    return;
  }

  await mysqlConn.beginTransaction();
  try {
    if (forceTruncate) {
      await mysqlConn.execute(`DELETE FROM ${qIdent(tableName)}`);
    }

    for (const batch of batches) {
      if (batch.length === 0) continue;
      const flatValues = [];
      for (const row of batch) {
        if (hasSinglePk && pkIsText) {
          const current = row[pkCol.name];
          if (current === null || current === undefined || current === '') {
            row[pkCol.name] = generateTextPk();
          }
        }
        for (const c of cols) {
          flatValues.push(normalizeValue(row[c.name]));
        }
      }
      const sql = sqlBuilder.buildSql(batch.length);
      await mysqlConn.execute(sql, flatValues);
    }

    await mysqlConn.commit();
    console.log(`- ${tableName}: ${rows.length} linhas migradas`);
  } catch (error) {
    await mysqlConn.rollback();
    throw new Error(`[${tableName}] ${String(error?.message || error)}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const tursoUrl = normalizeTursoUrl(process.env.TURSO_URL);
  const tursoToken = process.env.TURSO_TOKEN;
  const mysqlUrl = resolveMysqlUrl();

  if (!tursoUrl || !tursoToken) {
    throw new Error('TURSO_URL/TURSO_TOKEN nao configurados.');
  }
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL (ou MYSQL_PUBLIC_URL) nao configurada.');
  }

  const turso = createClient({ url: tursoUrl, authToken: tursoToken });
  const mysqlConn = await mysql.createConnection(mysqlConfigFromUrl(mysqlUrl));

  try {
    const sqliteTables = await getSqliteTables(turso);
    const availableTables = new Set(sqliteTables);
    const targetTables = opts.includeAll ? sqliteTables : opts.tables;

    console.log(
      `Migracao Turso -> MySQL | dryRun=${opts.dryRun ? 'sim' : 'nao'} | batchSize=${opts.batchSize} | tabelas=${targetTables.length}`
    );

    for (const tableName of targetTables) {
      if (!availableTables.has(tableName)) {
        console.log(`- ${tableName}: ignorada (nao existe no Turso)`);
        continue;
      }

      const mysqlTableExists = await tableExistsInMysql(mysqlConn, tableName);
      if (!mysqlTableExists) {
        console.log(`- ${tableName}: ignorada (nao existe no MySQL)`);
        continue;
      }

      await migrateTable({ turso, mysqlConn, tableName, opts });
    }

    console.log('\nMigracao concluida.');
  } finally {
    await mysqlConn.end();
    turso.close();
  }
}

main().catch((err) => {
  console.error(`Erro na migracao: ${String(err?.message || err)}`);
  process.exit(1);
});
