import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Verifica se tem credenciais Turso configuradas
const useTurso = process.env.TURSO_URL && process.env.TURSO_TOKEN;

export interface DbInterface {
    query: (sql: string, params?: any[]) => Promise<any[]>;
    execute: (sql: string, params?: any[]) => Promise<void>;
}

export const getDbConnection = (): DbInterface => {
  if (useTurso) {
    // --- MODO NUVEM (TURSO) ---
    // Conecta via HTTP, funciona em qualquer lugar
    const client = createClient({
      url: process.env.TURSO_URL!,
      authToken: process.env.TURSO_TOKEN!,
    });
    
    return {
        query: async (sql: string, params: any[] = []) => {
            const res = await client.execute({ sql, args: params });
            return res.rows;
        },
        execute: async (sql: string, params: any[] = []) => {
            await client.execute({ sql, args: params });
        }
    };
  } else {
    // --- MODO LOCAL (SQLITE) ---
    // Fallback caso não tenha internet ou chaves
    const dbPath = path.resolve(process.cwd(), 'data/dados_clinica.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    
    return {
        query: async (sql: string, params: any[] = []) => {
            return db.prepare(sql).all(...params);
        },
        execute: async (sql: string, params: any[] = []) => {
            db.prepare(sql).run(...params);
        }
    };
  }
};