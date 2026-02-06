import { createClient } from '@libsql/client';
import { createPool, type Pool } from 'mysql2/promise';

export interface DbInterface {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  execute: (sql: string, params?: any[]) => Promise<any>;
}

let tursoClient: ReturnType<typeof createClient> | null = null;
let mysqlPool: Pool | null = null;

function resolveProvider(): 'turso' | 'mysql' {
  const raw = String(process.env.DB_PROVIDER || '').toLowerCase().trim();
  if (raw === 'mysql' || raw === 'turso') return raw;
  if (process.env.MYSQL_URL) return 'mysql';
  return 'turso';
}

function parseMysqlConfig(url: string) {
  const parsed = new URL(url);
  const sslMode = String(parsed.searchParams.get('sslmode') || '').toLowerCase();
  const disableSslByUrl = sslMode === 'disable' || sslMode === 'false';
  const forceSslEnv = String(process.env.MYSQL_FORCE_SSL || '').toLowerCase();
  const disableSslByEnv = forceSslEnv === '0' || forceSslEnv === 'false' || forceSslEnv === 'no';
  const shouldUseSsl = !(disableSslByUrl || disableSslByEnv);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || '3306'),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent((parsed.pathname || '').replace(/^\//, '')),
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function parsePragmaTableInfo(sql: string): string | null {
  const match = sql.trim().match(/^PRAGMA\s+table_info\((.+)\)\s*;?$/i);
  if (!match) return null;
  const raw = String(match[1] || '').trim();
  return raw.replace(/^["'`]/, '').replace(/["'`]$/, '');
}

function translateOnConflictForMysql(sql: string): string {
  if (!/ON\s+CONFLICT\s*\(/i.test(sql)) return sql;
  return sql
    .replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE')
    .replace(/\bexcluded\.([A-Za-z0-9_]+)/gi, 'VALUES($1)');
}

function adaptSqlForMysql(sql: string, params: any[] = []): { sql: string; params: any[] } {
  const pragmaTable = parsePragmaTableInfo(sql);
  if (pragmaTable) {
    return {
      sql: `
        SELECT COLUMN_NAME as name
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ORDINAL_POSITION
      `,
      params: [pragmaTable],
    };
  }

  if (/FROM\s+sqlite_master/i.test(sql)) {
    return {
      sql: `
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?
      `,
      params: [params[params.length - 1]],
    };
  }

  let nextSql = sql;
  nextSql = nextSql.replace(/datetime\('now'\)/gi, 'NOW()');
  nextSql = nextSql.replace(/date\('now'\)/gi, 'CURDATE()');
  nextSql = nextSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');
  nextSql = nextSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO');
  nextSql = translateOnConflictForMysql(nextSql);
  return { sql: nextSql, params };
}

function getMysqlDbConnection(): DbInterface {
  const mysqlUrl = process.env.MYSQL_URL;
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL nao configurada.');
  }

  if (!mysqlPool) {
    mysqlPool = createPool({
      ...parseMysqlConfig(mysqlUrl),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL_SIZE || '10'),
      queueLimit: 0,
    });
  }

  return {
    query: async (sql: string, params: any[] = []) => {
      const adapted = adaptSqlForMysql(sql, params);
      const [rows] = await mysqlPool!.query(adapted.sql, adapted.params);
      return (rows ?? []) as any[];
    },
    execute: async (sql: string, params: any[] = []) => {
      const adapted = adaptSqlForMysql(sql, params);
      const [result] = await mysqlPool!.execute(adapted.sql, adapted.params);
      return result;
    },
  };
}

function getTursoDbConnection(): DbInterface {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_TOKEN;
  if (!url || !authToken) {
    throw new Error('TURSO_URL/TURSO_TOKEN nao configurados.');
  }

  if (!tursoClient) {
    tursoClient = createClient({ url, authToken });
  }

  return {
    query: async (sql: string, params: any[] = []) => {
      try {
        const res = await tursoClient!.execute({ sql, args: params });
        return (res.rows ?? []) as any[];
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('reads are blocked') || msg.includes('Operation was blocked') || msg.includes('BLOCKED')) {
          const e = new Error('Turso read operations are blocked: upgrade your plan or contact support');
          (e as any).status = 503;
          throw e;
        }
        throw err;
      }
    },
    execute: async (sql: string, params: any[] = []) => {
      try {
        return await tursoClient!.execute({ sql, args: params });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('reads are blocked') || msg.includes('Operation was blocked') || msg.includes('BLOCKED')) {
          const e = new Error('Turso read operations are blocked: upgrade your plan or contact support');
          (e as any).status = 503;
          throw e;
        }
        throw err;
      }
    },
  };
}

export function getDbConnection(): DbInterface {
  const provider = resolveProvider();
  if (provider === 'mysql') return getMysqlDbConnection();
  return getTursoDbConnection();
}
