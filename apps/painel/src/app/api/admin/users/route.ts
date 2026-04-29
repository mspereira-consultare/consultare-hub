import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';
import bcrypt from 'bcryptjs';
import { ensureUserAccountTables } from '@consultare/core/user-accounts';

const clean = (value: unknown) => String(value ?? '').trim();

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

// --- LISTAR USUÁRIOS (GET) ---
export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      await ensureUserAccountTables(db);
    
      const result = await db.query(`
          SELECT id, name, email, username, role, department, status, last_access 
          FROM users 
          ORDER BY name ASC
      `);

      return result;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error("Erro GET Users:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// --- CRIAR OU EDITAR USUÁRIO (POST) ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, username, password, role, department, status } = body;
    const db = getDbConnection();
    await ensureUserAccountTables(db);
    const cleanedName = clean(name);
    const cleanedEmail = clean(email);
    const cleanedUsername = clean(username);

    if (!cleanedName || !cleanedUsername) {
      return NextResponse.json({ error: 'Nome e usuário são obrigatórios.' }, { status: 400 });
    }

    if (id) {
      if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, password = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, hash, role, department, status, id]
        );
      } else {
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, role, department, status, id]
        );
      }
      
      invalidateCache('admin:');
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
      
      const hash = await bcrypt.hash(password, 10);
      const newId = crypto.randomUUID();

      await db.execute(
        `INSERT INTO users (id, name, email, username, password, role, department, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [newId, cleanedName, cleanedEmail, cleanedUsername, hash, role, department, status]
      );
      
      invalidateCache('admin:');
      return NextResponse.json({ success: true, id: newId });
    }

  } catch (error: any) {
    console.error("Erro POST Users:", error);
    if (
      error.message?.includes('UNIQUE constraint failed') ||
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error.code === 'ER_DUP_ENTRY'
    ) {
      return NextResponse.json({ error: 'Este usuário já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// --- DELETAR USUÁRIO (DELETE) ---
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    await ensureUserAccountTables(db);
    
    await db.execute(
        "DELETE FROM users WHERE id = ?",
        [id]
    );

    invalidateCache('admin:');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE User:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
