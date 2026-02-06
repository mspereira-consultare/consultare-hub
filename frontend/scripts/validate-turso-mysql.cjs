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

const ORDER_CANDIDATES = [
  'updated_at',
  'created_at',
  'last_run',
  'date',
  'data',
  'month_ref',
  'id',
];

function parseArgs(argv) {
  const argMap = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.split('=');
      argMap[k] = v === undefined ? true : v;
    }
  }

  const includeAll = Boolean(argMap['--all-tables']);
  const tablesFromArg = String(argMap['--tables'] || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const sampleSize = Math.max(0, Number(argMap['--sample-size'] || 5));
  const deepCompareLimit = Math.max(0, Number(argMap['--deep-compare-limit'] || 5000));

  const tables = includeAll ? [] : (tablesFromArg.length ? tablesFromArg : DEFAULT_TABLES);
  return { includeAll, tables, sampleSize, deepCompareLimit };
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
  if (value === undefined || value === null) return null;
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
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

async function getSqliteColumns(turso, tableName) {
  const rs = await turso.execute(`PRAGMA table_info(${qIdent(tableName)})`);
  return (rs.rows || [])
    .map((r) => ({
      name: String(r.name),
      pk: Number(r.pk || 0),
    }))
    .sort((a, b) => a.pk - b.pk);
}

function pickOrderColumns(columns, pkCols) {
  if (pkCols.length > 0) return pkCols;
  for (const candidate of ORDER_CANDIDATES) {
    if (columns.some((c) => c.name === candidate)) return [candidate];
  }
  return [columns[0].name];
}

async function getCountFromTurso(turso, tableName) {
  const rs = await turso.execute(`SELECT COUNT(*) as count FROM ${qIdent(tableName)}`);
  return Number(rs.rows?.[0]?.count || 0);
}

async function getCountFromMysql(conn, tableName) {
  const [rows] = await conn.query(`SELECT COUNT(*) as count FROM ${qIdent(tableName)}`);
  return Number(Array.isArray(rows) && rows[0] ? rows[0].count : 0);
}

async function fetchRowsFromTurso(turso, tableName, columns, orderCols, limit) {
  const selectCols = columns.map((c) => qIdent(c.name)).join(', ');
  const orderBy = orderCols.map(qIdent).join(', ');
  const limitClause = typeof limit === 'number' ? ` LIMIT ${limit}` : '';
  const rs = await turso.execute(
    `SELECT ${selectCols} FROM ${qIdent(tableName)} ORDER BY ${orderBy}${limitClause}`
  );
  return rs.rows || [];
}

async function fetchRowsFromMysql(conn, tableName, columns, orderCols, limit) {
  const selectCols = columns.map((c) => qIdent(c.name)).join(', ');
  const orderBy = orderCols.map(qIdent).join(', ');
  const limitClause = typeof limit === 'number' ? ` LIMIT ${limit}` : '';
  const [rows] = await conn.query(
    `SELECT ${selectCols} FROM ${qIdent(tableName)} ORDER BY ${orderBy}${limitClause}`
  );
  return Array.isArray(rows) ? rows : [];
}

function buildHash(rows, columns) {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    const values = columns.map((c) => normalizeValue(row[c.name]));
    hash.update(JSON.stringify(values));
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function validateTable({ turso, mysqlConn, tableName, opts }) {
  const columns = await getSqliteColumns(turso, tableName);
  if (columns.length === 0) {
    console.log(`- ${tableName}: ignorada (sem colunas)`);
    return { ok: true, countMatch: true };
  }

  const pkCols = columns.filter((c) => c.pk > 0).map((c) => c.name);
  const orderCols = pickOrderColumns(columns, pkCols);

  const [countTurso, countMysql] = await Promise.all([
    getCountFromTurso(turso, tableName),
    getCountFromMysql(mysqlConn, tableName),
  ]);

  const countMatch = countTurso === countMysql;
  console.log(`- ${tableName}: Turso=${countTurso} | MySQL=${countMysql}${countMatch ? '' : ' | DIFERENTE'}`);

  if (opts.sampleSize > 0) {
    const [sampleT, sampleM] = await Promise.all([
      fetchRowsFromTurso(turso, tableName, columns, orderCols, opts.sampleSize),
      fetchRowsFromMysql(mysqlConn, tableName, columns, orderCols, opts.sampleSize),
    ]);
    const hashT = buildHash(sampleT, columns);
    const hashM = buildHash(sampleM, columns);
    const sampleMatch = hashT === hashM;
    console.log(`  amostra(${opts.sampleSize}) hash: ${sampleMatch ? 'OK' : 'DIFERENTE'}`);
  }

  if (countTurso <= opts.deepCompareLimit) {
    const [rowsT, rowsM] = await Promise.all([
      fetchRowsFromTurso(turso, tableName, columns, orderCols),
      fetchRowsFromMysql(mysqlConn, tableName, columns, orderCols),
    ]);
    const hashT = buildHash(rowsT, columns);
    const hashM = buildHash(rowsM, columns);
    const deepMatch = hashT === hashM;
    console.log(`  checksum completo: ${deepMatch ? 'OK' : 'DIFERENTE'}`);
    return { ok: deepMatch && countMatch, countMatch };
  }

  return { ok: countMatch, countMatch };
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
    let anyMismatch = false;

    console.log(
      `Validacao Turso vs MySQL | tabelas=${targetTables.length} | amostra=${opts.sampleSize} | limite_checksum=${opts.deepCompareLimit}`
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
      const result = await validateTable({ turso, mysqlConn, tableName, opts });
      if (!result.ok) anyMismatch = true;
    }

    console.log(`\nValidacao concluida. Status: ${anyMismatch ? 'DIVERGENCIAS' : 'OK'}`);
    process.exit(anyMismatch ? 2 : 0);
  } finally {
    await mysqlConn.end();
    turso.close();
  }
}

main().catch((err) => {
  console.error(`Erro na validacao: ${String(err?.message || err)}`);
  process.exit(1);
});
