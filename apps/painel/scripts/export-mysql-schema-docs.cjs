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
        return publicUrl;
      }
    } catch {
      // fallback below
    }
  }

  return internal || publicUrl;
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

async function main() {
  const outPath = path.resolve(process.cwd(), process.argv[2] || 'docs/database/mysql-schema-live.json');
  const mysqlUrl = resolveMysqlUrl();

  if (!mysqlUrl) {
    throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');
  }

  const conn = await mysql.createConnection(mysqlConfigFromUrl(mysqlUrl));

  try {
    const [dbRows] = await conn.query('SELECT DATABASE() AS database_name, VERSION() AS mysql_version');
    const databaseName = dbRows[0]?.database_name;
    const mysqlVersion = dbRows[0]?.mysql_version;

    const [tables] = await conn.query(`
      SELECT
        table_name,
        table_type,
        engine,
        table_rows,
        create_time,
        update_time,
        table_collation,
        table_comment
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      ORDER BY table_name
    `);

    const [columns] = await conn.query(`
      SELECT
        table_name,
        ordinal_position,
        column_name,
        column_type,
        data_type,
        is_nullable,
        column_default,
        extra,
        column_key,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision,
        column_comment
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
      ORDER BY table_name, ordinal_position
    `);

    const [constraints] = await conn.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        kcu.ordinal_position,
        kcu.referenced_table_name,
        kcu.referenced_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.table_name = kcu.table_name
       AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_schema = DATABASE()
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    `);

    const [indexes] = await conn.query(`
      SELECT
        table_name,
        index_name,
        non_unique,
        seq_in_index,
        column_name,
        index_type
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
      ORDER BY table_name, index_name, seq_in_index
    `);

    const normalizeRow = (row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[String(key).toLowerCase()] = value;
      }
      return normalized;
    };

    const tableRows = tables.map(normalizeRow);
    const columnRows = columns.map(normalizeRow);
    const constraintRows = constraints.map(normalizeRow);
    const indexRows = indexes.map(normalizeRow);

    const byTable = new Map();

    for (const table of tableRows) {
      byTable.set(table.table_name, {
        name: table.table_name,
        type: table.table_type,
        engine: table.engine,
        estimated_rows: table.table_rows,
        create_time: table.create_time,
        update_time: table.update_time,
        collation: table.table_collation,
        comment: table.table_comment,
        columns: [],
        constraints: [],
        indexes: [],
      });
    }

    for (const column of columnRows) {
      const table = byTable.get(column.table_name);
      if (!table) continue;
      table.columns.push({
        name: column.column_name,
        ordinal_position: column.ordinal_position,
        column_type: column.column_type,
        data_type: column.data_type,
        is_nullable: column.is_nullable === 'YES',
        default: column.column_default,
        extra: column.extra,
        column_key: column.column_key,
        character_maximum_length: column.character_maximum_length,
        numeric_precision: column.numeric_precision,
        numeric_scale: column.numeric_scale,
        datetime_precision: column.datetime_precision,
        comment: column.column_comment,
      });
    }

    for (const constraint of constraintRows) {
      const table = byTable.get(constraint.table_name);
      if (!table) continue;
      table.constraints.push({
        name: constraint.constraint_name,
        type: constraint.constraint_type,
        column_name: constraint.column_name,
        ordinal_position: constraint.ordinal_position,
        referenced_table_name: constraint.referenced_table_name,
        referenced_column_name: constraint.referenced_column_name,
      });
    }

    for (const index of indexRows) {
      const table = byTable.get(index.table_name);
      if (!table) continue;
      table.indexes.push({
        name: index.index_name,
        non_unique: Boolean(index.non_unique),
        seq_in_index: index.seq_in_index,
        column_name: index.column_name,
        index_type: index.index_type,
      });
    }

    const payload = {
      extracted_at: new Date().toISOString(),
      database_name: databaseName,
      mysql_version: mysqlVersion,
      table_count: byTable.size,
      tables: Array.from(byTable.values()),
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Schema exportado em ${outPath}`);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`Erro ao exportar schema MySQL: ${String(error?.stack || error)}`);
  process.exit(1);
});
