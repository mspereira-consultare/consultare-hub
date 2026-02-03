import { createClient } from '@libsql/client';

export interface DbInterface {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  execute: (sql: string, params?: any[]) => Promise<any>;
}

let client: ReturnType<typeof createClient> | null = null;

export function getDbConnection(): DbInterface {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      'TURSO_URL/TURSO_TOKEN não configurados. Configure as variáveis no Railway (service do frontend).'
    );
  }

  if (!client) {
    client = createClient({ url, authToken });
  }

  return {
    query: async (sql: string, params: any[] = []) => {
      try {
        const res = await client!.execute({ sql, args: params });
        return (res.rows ?? []) as any[];
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('reads are blocked') || msg.includes('Operation was blocked') || msg.includes('BLOCKED')) {
          const e = new Error('Turso read operations are blocked: upgrade your plan or contact support');
          // attach status for API handlers
          (e as any).status = 503;
          throw e;
        }
        throw err;
      }
    },
    execute: async (sql: string, params: any[] = []) => {
      try {
        return await client!.execute({ sql, args: params });
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
