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
      const res = await client!.execute({ sql, args: params });
      return (res.rows ?? []) as any[];
    },
    execute: async (sql: string, params: any[] = []) => {
      return client!.execute({ sql, args: params });
    },
  };
}
