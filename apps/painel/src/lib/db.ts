import { createClient } from '@libsql/client';
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';

export interface DbInterface {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  execute: (sql: string, params?: any[]) => Promise<any>;
  withTransaction?: <T>(work: (db: DbInterface) => Promise<T>) => Promise<T>;
}

let tursoClient: ReturnType<typeof createClient> | null = null;
let mysqlPool: Pool | null = null;
let envBootstrapped = false;

function ensureServerEnv() {
  if (envBootstrapped) return;
  envBootstrapped = true;

  if (
    process.env.DB_PROVIDER ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PUBLIC_URL ||
    process.env.TURSO_URL ||
    process.env.TURSO_TOKEN
  ) {
    return;
  }

  try {
    // Fallback local: quando o Next é iniciado dentro de `apps/painel/`,
    // o `.env` na raiz do repositório não é carregado automaticamente.
    // Tentamos alguns caminhos para manter o painel consistente no ambiente local.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv') as typeof import('dotenv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');

    const candidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../.env'),
      path.resolve(process.cwd(), '../../.env'),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      dotenv.config({ path: candidate, override: false });

      if (
        process.env.DB_PROVIDER ||
        process.env.MYSQL_URL ||
        process.env.MYSQL_PUBLIC_URL ||
        process.env.TURSO_URL ||
        process.env.TURSO_TOKEN
      ) {
        break;
      }
    }
  } catch {
    // Em produção o Next já injeta as envs. Se o fallback falhar,
    // seguimos para o comportamento normal de resolução abaixo.
  }
}

function resolveMysqlUrl() {
  ensureServerEnv();
  const internal = String(process.env.MYSQL_URL || '').trim();
  const publicUrl = String(process.env.MYSQL_PUBLIC_URL || '').trim();

  if (!internal && publicUrl) return publicUrl;
  if (!internal) return internal;

  try {
    const parsed = new URL(internal);
    const host = String(parsed.hostname || '').toLowerCase();
    const isInternalHost = host.endsWith('.railway.internal');
    const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
    if (isInternalHost && !isRailwayRuntime && publicUrl) {
      return publicUrl;
    }
  } catch {
    // fallback to the configured internal URL below
  }

  return internal;
}

function resolveProvider(): 'turso' | 'mysql' {
  ensureServerEnv();
  const raw = String(process.env.DB_PROVIDER || '').toLowerCase().trim();
  if (raw === 'mysql' || raw === 'turso') return raw;
  if (process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL) return 'mysql';
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

function createMysqlConnectionDb(connection: PoolConnection): DbInterface {
  const transactionDb: DbInterface = {
    query: async (sql: string, params: any[] = []) => {
      const adapted = adaptSqlForMysql(sql, params);
      const [rows] = await connection.query(adapted.sql, adapted.params);
      return (rows ?? []) as any[];
    },
    execute: async (sql: string, params: any[] = []) => {
      const adapted = adaptSqlForMysql(sql, params);
      const [result] = await connection.execute(adapted.sql, adapted.params);
      return result;
    },
    withTransaction: async <T>(work: (db: DbInterface) => Promise<T>) => work(transactionDb),
  };
  return transactionDb;
}

function getMysqlDbConnection(): DbInterface {
  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL ou MYSQL_PUBLIC_URL nao configurada.');
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
    withTransaction: async <T>(work: (db: DbInterface) => Promise<T>) => {
      const connection = await mysqlPool!.getConnection();
      const transactionDb = createMysqlConnectionDb(connection);
      try {
        await connection.beginTransaction();
        const result = await work(transactionDb);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
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
    withTransaction: async <T>(work: (db: DbInterface) => Promise<T>) => work(getTursoDbConnection()),
  };
}

export function getDbConnection(): DbInterface {
  const provider = resolveProvider();
  if (provider === 'mysql') return getMysqlDbConnection();
  return getTursoDbConnection();
}

export const runInTransaction = async <T>(db: DbInterface, work: (txDb: DbInterface) => Promise<T>) => {
  if (typeof db.withTransaction === 'function') {
    return db.withTransaction(work);
  }
  return work(db);
};
