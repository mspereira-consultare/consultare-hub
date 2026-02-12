#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const API_URL = 'https://api.feegow.com/v1/api/appoints/search';

function parseArgs(argv) {
  const argMap = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.split('=');
    argMap[k] = v === undefined ? true : v;
  }
  return {
    start: String(argMap['--start'] || '2022-01-01'),
    end: String(argMap['--end'] || '2025-12-31'),
    chunk: Math.max(1, Number(argMap['--chunk'] || process.env.FEEGOW_BACKFILL_DB_CHUNK || 50)),
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
      const isInternal = host.endsWith('.railway.internal');
      if (isInternal && !isRailwayRuntime && publicUrl) {
        console.log('Host MySQL interno detectado fora do Railway. Usando MYSQL_PUBLIC_URL.');
        return publicUrl;
      }
    } catch {
      // ignore
    }
  }
  return internal || publicUrl;
}

function isConnectionError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('lost connection') ||
    msg.includes('server has gone away') ||
    msg.includes('connection was killed') ||
    err?.code === 'PROTOCOL_CONNECTION_LOST'
  );
}

async function withRetry(name, fn, retries = 6) {
  let lastErr;
  for (let i = 1; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err) || i >= retries) throw err;
      const waitMs = Math.min(30000, i * 2000);
      console.log(`[WARN] ${name} falhou (${i}/${retries}): ${err?.message || err}. Retry em ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function createConn(mysqlUrl, useSsl) {
  return mysql.createConnection({
    uri: mysqlUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 30000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function nextMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function fmtIso(date) {
  return date.toISOString().slice(0, 10);
}

function fmtBr(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = String(date.getUTCFullYear());
  return `${d}-${m}-${y}`;
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m1 = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m2) return s;
  return '';
}

function cleanCurrency(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace('R$', '').replaceAll(' ', '').replaceAll('.', '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseApiRows(content) {
  const validStatus = new Set([1, 2, 3, 4, 6, 7, 11, 15, 16, 22]);
  const now = new Date();
  const nowSql = `${fmtIso(now)} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const out = [];
  for (const r of content || []) {
    const appId = Number(r.agendamento_id || r.id || 0);
    if (!Number.isFinite(appId) || appId <= 0) continue;
    const statusId = Number(r.status_id ?? r.status ?? 0);
    if (!validStatus.has(statusId)) continue;
    const dt = normalizeDate(r.data || r.data_agendamento);
    if (!dt) continue;

    out.push([
      appId,
      dt,
      statusId,
      cleanCurrency(r.valor || r.valor_total_agendamento),
      String(r.especialidade || r.nome_especialidade || 'Geral'),
      String(r.nome_profissional || r.profissional || 'Desconhecido'),
      String(r.procedure_group || r.nome_grupo || r.grupo_procedimento || 'Geral'),
      String(r.agendado_por || r.scheduled_by || 'Sis'),
      String(r.nome_fantasia || r.unidade_nome || r.unidade || 'Matriz'),
      String(r.agendado_em || r.scheduled_at || ''),
      nowSql,
    ]);
  }
  return out;
}

async function fetchMonth(token, startDate, endDate) {
  const payload = {
    data_start: fmtBr(startDate),
    data_end: fmtBr(endDate),
    list_procedures: 0,
  };
  return withRetry(`api ${payload.data_start}..${payload.data_end}`, async () => {
    const res = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'x-access-token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status} ${txt.slice(0, 220)}`);
    }
    const body = await res.json();
    if (!body?.success) {
      throw new Error(`API success=false: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return Array.isArray(body.content) ? body.content : [];
  }, 5);
}

async function main() {
  const args = parseArgs(process.argv);
  const start = new Date(`${args.start}T00:00:00Z`);
  const end = new Date(`${args.end}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Datas invalidas.');
  if (end < start) throw new Error('Data final menor que data inicial.');

  const token = String(process.env.FEEGOW_ACCESS_TOKEN || '').trim();
  if (!token) throw new Error('FEEGOW_ACCESS_TOKEN nao configurado.');

  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');

  let useSsl = !['0', 'false', 'no'].includes(String(process.env.MYSQL_FORCE_SSL || '').toLowerCase());
  console.log(`[INFO] Backfill feegow_appointments ${args.start} -> ${args.end} | chunk=${args.chunk}`);
  console.log(`[INFO] mysql ssl=${useSsl ? 'on' : 'off'}`);

  const ensureSql = [
    `
    CREATE TABLE IF NOT EXISTS feegow_appointments (
      appointment_id BIGINT PRIMARY KEY,
      date DATE NULL,
      status_id INT NULL,
      value DECIMAL(14,2) NULL,
      specialty VARCHAR(191) NULL,
      professional_name VARCHAR(191) NULL,
      procedure_group VARCHAR(191) NULL,
      scheduled_by VARCHAR(191) NULL,
      unit_name VARCHAR(191) NULL,
      scheduled_at VARCHAR(50) NULL,
      updated_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
    CREATE TABLE IF NOT EXISTS feegow_appointments_backfill_checkpoint (
      year INT NOT NULL,
      month INT NOT NULL,
      from_date DATE NULL,
      to_date DATE NULL,
      rows_saved INT NULL,
      completed_at DATETIME NULL,
      PRIMARY KEY (year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  ];

  const upsertSql = `
    INSERT INTO feegow_appointments (
      appointment_id, date, status_id, value,
      specialty, professional_name, procedure_group,
      scheduled_by, unit_name, scheduled_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      date = VALUES(date),
      status_id = VALUES(status_id),
      value = VALUES(value),
      specialty = VALUES(specialty),
      professional_name = VALUES(professional_name),
      procedure_group = VALUES(procedure_group),
      scheduled_by = VALUES(scheduled_by),
      unit_name = VALUES(unit_name),
      scheduled_at = VALUES(scheduled_at),
      updated_at = VALUES(updated_at)
  `;

  async function runDb(name, cb, retries = 6) {
    return withRetry(name, async () => {
      let conn;
      try {
        conn = await createConn(mysqlUrl, useSsl);
        const out = await cb(conn);
        return out;
      } catch (err) {
        if (isConnectionError(err) && useSsl) {
          console.log('[WARN] Falha com SSL. Tentando SSL off...');
          useSsl = false;
        }
        throw err;
      } finally {
        try { if (conn) await conn.end(); } catch { /* no-op */ }
      }
    }, retries);
  }

  await runDb('ensure tables', async (conn) => {
    for (const q of ensureSql) await conn.query(q);
  });

  const [rangeRows] = await runDb('get range', (conn) =>
    conn.query('SELECT MIN(date) AS min_date, MAX(date) AS max_date, COUNT(1) AS total FROM feegow_appointments')
  );
  const rg = rangeRows?.[0] || {};
  console.log(`[INFO] Faixa atual: min=${rg.min_date || '-'} max=${rg.max_date || '-'} total=${rg.total || 0}`);

  const [ckRows] = await runDb('get checkpoint', (conn) =>
    conn.query('SELECT year, month FROM feegow_appointments_backfill_checkpoint')
  );
  const completed = new Set((ckRows || []).map((r) => `${Number(r.year)}-${Number(r.month)}`));

  let cursor = monthStart(start);
  let totalSaved = 0;
  while (cursor <= end) {
    const ms = monthStart(cursor);
    const me = monthEnd(cursor) < end ? monthEnd(cursor) : end;
    const key = `${ms.getUTCFullYear()}-${ms.getUTCMonth() + 1}`;
    const label = `${String(ms.getUTCMonth() + 1).padStart(2, '0')}/${ms.getUTCFullYear()}`;

    if (completed.has(key)) {
      console.log(`[SKIP] ${label} ja concluido.`);
      cursor = nextMonth(cursor);
      continue;
    }

    console.log(`\n[MONTH] ${label}: ${fmtIso(ms)} -> ${fmtIso(me)}`);
    const apiRows = await fetchMonth(token, ms, me);
    const rows = parseApiRows(apiRows);
    console.log(`[API] linhas=${apiRows.length} validas=${rows.length}`);

    for (let i = 0; i < rows.length; i += args.chunk) {
      const chunk = rows.slice(i, i + args.chunk);
      try {
        await runDb(`insert chunk ${Math.floor(i / args.chunk) + 1}`, (conn) => conn.query(upsertSql, [chunk]));
      } catch (e) {
        console.log(`[WARN] batch falhou: ${e?.message || e}. Fallback linha a linha.`);
        for (const row of chunk) {
          await runDb('insert row', (conn) => conn.query(upsertSql, [row]));
        }
      }
    }

    await runDb('mark checkpoint', (conn) =>
      conn.query(
        `
          INSERT INTO feegow_appointments_backfill_checkpoint
          (year, month, from_date, to_date, rows_saved, completed_at)
          VALUES (?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            from_date = VALUES(from_date),
            to_date = VALUES(to_date),
            rows_saved = VALUES(rows_saved),
            completed_at = VALUES(completed_at)
        `,
        [ms.getUTCFullYear(), ms.getUTCMonth() + 1, fmtIso(ms), fmtIso(me), rows.length]
      )
    );

    totalSaved += rows.length;
    console.log(`[OK] ${label} concluido.`);
    cursor = nextMonth(cursor);
  }

  console.log(`\n[DONE] Backfill concluido. Registros salvos: ${totalSaved}`);
}

main().catch((err) => {
  console.error('\n[ERROR]', err?.stack || err?.message || err);
  process.exit(1);
});

