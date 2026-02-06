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
      // Fallback para regras abaixo
    }
  }

  return internal || publicUrl;
}

function qIdent(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function mapSqliteTypeToMysql(typeRaw, isKeyColumn = false, hasDefault = false, mappedDefault = null) {
  const t = String(typeRaw || '').toUpperCase();
  const preferVarchar = isKeyColumn || hasDefault;
  if (mappedDefault === 'CURRENT_TIMESTAMP') return 'DATETIME';
  if (mappedDefault === 'CURRENT_DATE') return 'DATE';
  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE';
  if (t.includes('NUMERIC') || t.includes('DECIMAL')) return 'DECIMAL(18,6)';
  if (t.includes('BLOB')) return 'LONGBLOB';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return preferVarchar ? 'VARCHAR(191)' : 'TEXT';
  if (t.includes('DATE') || t.includes('TIME')) return preferVarchar ? 'VARCHAR(64)' : 'TEXT';
  return hasDefault ? 'VARCHAR(191)' : 'TEXT';
}

function mapDefaultValueForMysql(rawDefault) {
  if (rawDefault === null || rawDefault === undefined) return null;
  const s = String(rawDefault).trim();
  if (!s) return null;
  if (/^CURRENT_TIMESTAMP$/i.test(s)) return 'CURRENT_TIMESTAMP';
  if (/^datetime\('now'\)$/i.test(s)) return 'CURRENT_TIMESTAMP';
  if (/^date\('now'\)$/i.test(s)) return 'CURRENT_DATE';
  if (/^null$/i.test(s)) return null;
  return s;
}

async function tableExists(conn, tableName) {
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

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      LIMIT 1
    `,
    [tableName, indexName]
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
  return (rs.rows || []).map((r) => ({
    cid: Number(r.cid),
    name: String(r.name),
    type: String(r.type || ''),
    notnull: Number(r.notnull || 0) === 1,
    dflt_value: r.dflt_value,
    pk: Number(r.pk || 0),
  }));
}

async function getSqliteIndexes(turso, tableName) {
  const listRs = await turso.execute(`PRAGMA index_list(${qIdent(tableName)})`);
  const list = (listRs.rows || []).map((r) => ({
    name: String(r.name),
    unique: Number(r.unique || 0) === 1,
    origin: String(r.origin || ''),
  }));

  const result = [];
  for (const idx of list) {
    if (idx.origin === 'pk') continue;
    if (idx.name.startsWith('sqlite_autoindex_')) continue;
    const infoRs = await turso.execute(`PRAGMA index_info(${qIdent(idx.name)})`);
    const cols = (infoRs.rows || [])
      .sort((a, b) => Number(a.seqno || 0) - Number(b.seqno || 0))
      .map((r) => String(r.name));
    if (cols.length === 0) continue;
    result.push({ ...idx, columns: cols });
  }
  return result;
}

function buildCreateTableSql(tableName, columns, indexedColumns = new Set()) {
  const pkCols = columns
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);

  const keyCols = new Set([...pkCols, ...Array.from(indexedColumns)]);

  const colDefs = columns.map((c) => {
    const mappedDefault = mapDefaultValueForMysql(c.dflt_value);
    const hasDefault = mappedDefault !== null;
    const parts = [qIdent(c.name), mapSqliteTypeToMysql(c.type, keyCols.has(c.name), hasDefault, mappedDefault)];
    if (c.notnull || c.pk > 0) {
      parts.push('NOT NULL');
    }
    if (mappedDefault !== null) {
      if (/^(CURRENT_TIMESTAMP|CURRENT_DATE)$/i.test(mappedDefault)) {
        parts.push(`DEFAULT ${mappedDefault}`);
      } else if (/^-?\d+(\.\d+)?$/.test(mappedDefault)) {
        parts.push(`DEFAULT ${mappedDefault}`);
      } else {
        const unquoted = mappedDefault.replace(/^['"]|['"]$/g, '');
        parts.push(`DEFAULT '${unquoted.replace(/'/g, "''")}'`);
      }
    }
    return parts.join(' ');
  });

  if (pkCols.length > 0) {
    colDefs.push(`PRIMARY KEY (${pkCols.map(qIdent).join(', ')})`);
  }

  return `
    CREATE TABLE ${qIdent(tableName)} (
      ${colDefs.join(',\n      ')}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

async function main() {
  const tursoUrl = normalizeTursoUrl(process.env.TURSO_URL);
  const tursoToken = process.env.TURSO_TOKEN;
  const mysqlUrl = resolveMysqlUrl();
  const dryRun = process.argv.includes('--dry-run');

  if (!tursoUrl || !tursoToken) {
    throw new Error('TURSO_URL/TURSO_TOKEN nao configurados.');
  }
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL (ou MYSQL_PUBLIC_URL) nao configurada.');
  }

  const turso = createClient({ url: tursoUrl, authToken: tursoToken });
  const mysqlConn = await mysql.createConnection(mysqlConfigFromUrl(mysqlUrl));

  try {
    const tables = await getSqliteTables(turso);
    console.log(`Tabelas detectadas no Turso: ${tables.length}`);

    for (const tableName of tables) {
      const cols = await getSqliteColumns(turso, tableName);
      if (cols.length === 0) {
        console.log(`- ${tableName}: ignorada (sem colunas)`);
        continue;
      }

      const indexes = await getSqliteIndexes(turso, tableName);
      const indexedColumns = new Set();
      for (const idx of indexes) {
        for (const c of idx.columns) indexedColumns.add(c);
      }

      const createSql = buildCreateTableSql(tableName, cols, indexedColumns);
      if (dryRun) {
        console.log(`\n--- ${tableName} ---\n${createSql}\n`);
      } else {
        const exists = await tableExists(mysqlConn, tableName);
        if (!exists) {
          await mysqlConn.execute(createSql);
          console.log(`- ${tableName}: criada`);
        } else {
          console.log(`- ${tableName}: ja existe (nao recriada)`);
        }
      }

      for (const idx of indexes) {
        const indexSql = `${idx.unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX'} ${qIdent(idx.name)} ON ${qIdent(tableName)} (${idx.columns.map(qIdent).join(', ')})`;
        if (dryRun) {
          console.log(indexSql);
        } else {
          const idxExists = await indexExists(mysqlConn, tableName, idx.name);
          if (!idxExists) {
            await mysqlConn.execute(indexSql);
            console.log(`  - index ${idx.name}: criado`);
          }
        }
      }
    }

    console.log('\nBootstrap de schema concluido.');
  } finally {
    await mysqlConn.end();
    turso.close();
  }
}

main().catch((err) => {
  console.error(`Erro no bootstrap: ${String(err?.message || err)}`);
  process.exit(1);
});
