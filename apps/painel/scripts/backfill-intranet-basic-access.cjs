#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASIC_GRANTS = [
  ['intranet_portal', 1, 0, 0],
  ['intranet_tarefas', 1, 1, 0],
  ['propostas_pos_consulta', 1, 1, 1],
  ['propostas', 1, 1, 1],
  ['metas_dashboard', 1, 0, 1],
];

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

async function main() {
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
    const [users] = await conn.query(
      `
      SELECT id
      FROM users
      WHERE role = 'INTRANET'
        AND employee_id IS NOT NULL
      `
    );

    const targetUsers = Array.isArray(users) ? users : [];
    console.log(`[INFO] Usuarios alvo: ${targetUsers.length}`);

    if (!targetUsers.length) {
      console.log('[INFO] Nenhum usuario INTRANET vinculado a colaborador encontrado.');
      return;
    }

    let affectedRows = 0;
    for (const user of targetUsers) {
      const userId = String(user.id || '').trim();
      if (!userId) continue;

      for (const [pageKey, canView, canEdit, canRefresh] of BASIC_GRANTS) {
        const [result] = await conn.query(
          `
          INSERT INTO user_page_permissions
            (user_id, page_key, can_view, can_edit, can_refresh, updated_at)
          VALUES (?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            can_view = GREATEST(can_view, VALUES(can_view)),
            can_edit = GREATEST(can_edit, VALUES(can_edit)),
            can_refresh = GREATEST(can_refresh, VALUES(can_refresh)),
            updated_at = NOW()
          `,
          [userId, pageKey, canView, canEdit, canRefresh]
        );
        affectedRows += Number(result?.affectedRows || 0);
      }
    }

    console.log(`[OK] Backfill concluido. Linhas afetadas: ${affectedRows}`);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha no backfill de acesso basico INTRANET:', error?.message || error);
  process.exit(1);
});
