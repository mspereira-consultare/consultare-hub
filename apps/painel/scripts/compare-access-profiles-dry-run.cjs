#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SYSTEM_PROFILE_KEYS = new Set(['ADMIN', 'GESTOR', 'OPERADOR', 'INTRANET']);

function clean(value) {
  return String(value ?? '').trim();
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

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    LIMIT 1
    `,
    [tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function rowKey(row) {
  return clean(row.page_key);
}

function permissionTuple(row) {
  return [
    Number(row.can_view || 0) ? 1 : 0,
    Number(row.can_edit || 0) ? 1 : 0,
    Number(row.can_refresh || 0) ? 1 : 0,
  ].join(':');
}

async function loadProfilePermissions(conn, profileKey) {
  const [rows] = await conn.query(
    `
    SELECT page_key, can_view, can_edit, can_refresh
    FROM access_profile_permissions
    WHERE profile_key = ?
    `,
    [profileKey]
  );
  const map = new Map();
  for (const row of rows || []) map.set(rowKey(row), permissionTuple(row));
  return map;
}

async function main() {
  if (process.argv.includes('--apply')) {
    throw new Error('Este script e somente dry-run. Nenhuma escrita sera executada.');
  }

  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');
  }

  const conn = await mysql.createConnection({
    uri: mysqlUrl,
    ssl: ['0', 'false', 'no'].includes(String(process.env.MYSQL_FORCE_SSL || '').toLowerCase())
      ? undefined
      : { rejectUnauthorized: false },
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 30000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  try {
    for (const tableName of ['access_profiles', 'access_profile_permissions', 'user_access_profile_assignments']) {
      if (!(await tableExists(conn, tableName))) {
        console.log(`[INFO] Tabela ${tableName} ainda nao existe.`);
        console.log('[INFO] O app continuara usando fallback por role enquanto os perfis v1 nao forem inicializados.');
        console.log('[INFO] Nenhuma alteracao foi aplicada.');
        return;
      }
    }

    const [users] = await conn.query(
      `
      SELECT u.id, u.name, u.role, a.profile_key
      FROM users u
      LEFT JOIN user_access_profile_assignments a ON a.user_id = u.id
      ORDER BY u.name ASC
      `
    );

    const profileCache = new Map();
    let totalExplicitRows = 0;
    let matchingRows = 0;
    let divergentRows = 0;
    let usersWithOverrides = 0;

    for (const user of users || []) {
      const role = clean(user.role).toUpperCase();
      const fallbackProfileKey = SYSTEM_PROFILE_KEYS.has(role) ? role : 'OPERADOR';
      const profileKey = clean(user.profile_key) || fallbackProfileKey;

      if (!profileCache.has(profileKey)) {
        profileCache.set(profileKey, await loadProfilePermissions(conn, profileKey));
      }
      const profilePermissions = profileCache.get(profileKey);

      const [permissionRows] = await conn.query(
        `
        SELECT page_key, can_view, can_edit, can_refresh
        FROM user_page_permissions
        WHERE user_id = ?
        `,
        [user.id]
      );

      const explicitRows = Array.isArray(permissionRows) ? permissionRows : [];
      if (explicitRows.length) usersWithOverrides += 1;
      totalExplicitRows += explicitRows.length;

      let userMatching = 0;
      let userDivergent = 0;
      for (const row of explicitRows) {
        const inherited = profilePermissions.get(rowKey(row));
        if (inherited && inherited === permissionTuple(row)) {
          userMatching += 1;
          matchingRows += 1;
        } else {
          userDivergent += 1;
          divergentRows += 1;
        }
      }

      if (userMatching || userDivergent) {
        console.log(
          `[DRY] ${clean(user.name) || user.id} (${profileKey}): ${userMatching} iguais ao perfil, ${userDivergent} overrides reais`
        );
      }
    }

    console.log('[RESUMO]');
    console.log(`Usuarios avaliados: ${(users || []).length}`);
    console.log(`Usuarios com linhas explicitas: ${usersWithOverrides}`);
    console.log(`Linhas explicitas totais: ${totalExplicitRows}`);
    console.log(`Linhas iguais ao perfil herdado: ${matchingRows}`);
    console.log(`Linhas divergentes preservaveis como override: ${divergentRows}`);
    console.log('Nenhuma alteracao foi aplicada.');
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha no dry-run de perfis de acesso:', error?.message || error);
  process.exit(1);
});
