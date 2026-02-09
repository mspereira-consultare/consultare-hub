#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const START_ID = 35;
const END_ID = 50;

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  return { dryRun };
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
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function getMysqlColumns(conn, tableName) {
  const [rows] = await conn.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
      ORDER BY ORDINAL_POSITION
    `,
    [tableName]
  );
  return (rows || []).map((r) => String(r.COLUMN_NAME));
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
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
    const rs = await turso.execute({
      sql: 'SELECT * FROM goals_config WHERE id BETWEEN ? AND ? ORDER BY id',
      args: [START_ID, END_ID],
    });
    const rows = rs.rows || [];
    if (!rows.length) {
      console.log(`Nenhuma meta encontrada no Turso para IDs ${START_ID}..${END_ID}.`);
      return;
    }

    const mysqlColumns = await getMysqlColumns(mysqlConn, 'goals_config');
    if (!mysqlColumns.length) {
      throw new Error('Tabela goals_config nao encontrada no MySQL.');
    }

    const sourceCols = new Set();
    for (const row of rows) {
      Object.keys(row).forEach((k) => sourceCols.add(k));
    }
    sourceCols.add('periodicity');

    const targetColumns = mysqlColumns.filter((c) => sourceCols.has(c));
    if (!targetColumns.includes('id')) {
      throw new Error('Coluna id nao encontrada em goals_config no MySQL.');
    }

    const prepared = rows.map((r) => {
      const item = { ...r, periodicity: 'weekly' };
      return item;
    });

    console.log(
      `Migracao metas semanais | ids=${START_ID}..${END_ID} | encontradas=${prepared.length} | dryRun=${dryRun ? 'sim' : 'nao'}`
    );
    console.log(`IDs: ${prepared.map((r) => r.id).join(', ')}`);

    if (dryRun) return;

    const updateColumns = targetColumns.filter((c) => c !== 'id');
    const sql = `
      INSERT INTO goals_config (${targetColumns.map(qIdent).join(', ')})
      VALUES (${targetColumns.map(() => '?').join(', ')})
      ON DUPLICATE KEY UPDATE
      ${updateColumns.map((c) => `${qIdent(c)} = VALUES(${qIdent(c)})`).join(', ')}
    `;

    await mysqlConn.beginTransaction();
    try {
      for (const row of prepared) {
        const values = targetColumns.map((c) => normalizeValue(row[c]));
        await mysqlConn.execute(sql, values);
      }
      await mysqlConn.commit();
    } catch (error) {
      await mysqlConn.rollback();
      throw error;
    }

    console.log(`Concluido. ${prepared.length} metas sincronizadas com periodicidade semanal.`);
  } finally {
    await mysqlConn.end();
    turso.close();
  }
}

main().catch((err) => {
  console.error(`Erro na migracao semanal: ${String(err?.message || err)}`);
  process.exit(1);
});

