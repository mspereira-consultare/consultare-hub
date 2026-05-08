import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';
import bcrypt from 'bcryptjs';
import { ensureUserAccountColumns } from '@consultare/core/user-accounts';

const clean = (value: unknown) => String(value ?? '').trim();
const isMysql =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const userEmployeeJoinClause = isMysql
  ? "e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci"
  : 'e.id = u.employee_id';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

// --- LISTAR USUÁRIOS (GET) ---
export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      await ensureUserAccountColumns(db);
    
      const result = await db.query(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.username,
            u.role,
            u.department,
            u.status,
            u.last_access,
            u.employee_id,
            e.full_name AS employee_name
          FROM users u
          LEFT JOIN employees e ON ${userEmployeeJoinClause}
          ORDER BY u.name ASC
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
    const { id, name, email, username, password, role, department, status, employeeId } = body;
    const db = getDbConnection();
    await ensureUserAccountColumns(db);
    const cleanedName = clean(name);
    const cleanedEmail = clean(email);
    const cleanedUsername = clean(username);
    const cleanedEmployeeId = clean(employeeId) || null;

    if (!cleanedName || !cleanedUsername) {
      return NextResponse.json({ error: 'Nome e usuário são obrigatórios.' }, { status: 400 });
    }

    if (cleanedEmployeeId) {
      const employeeRows = await db.query('SELECT id FROM employees WHERE id = ? LIMIT 1', [cleanedEmployeeId]);
      if (!employeeRows[0]) {
        return NextResponse.json({ error: 'Colaborador vinculado não encontrado.' }, { status: 400 });
      }

      const employeeLinkRows = await db.query(
        'SELECT id, name FROM users WHERE employee_id = ? AND (? IS NULL OR id <> ?) LIMIT 1',
        [cleanedEmployeeId, id || null, id || null]
      );
      if (employeeLinkRows[0]) {
        return NextResponse.json(
          { error: `Este colaborador já está vinculado ao usuário ${clean(employeeLinkRows[0].name) || 'existente'}.` },
          { status: 409 }
        );
      }
    }

    if (id) {
      if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, employee_id = ?, password = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, hash, role, department, status, id]
        );
      } else {
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, employee_id = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, role, department, status, id]
        );
      }
      
      invalidateCache('admin:');
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
      
      const hash = await bcrypt.hash(password, 10);
      const newId = crypto.randomUUID();

      await db.execute(
        `INSERT INTO users (id, name, email, username, employee_id, password, role, department, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [newId, cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, hash, role, department, status]
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
    await ensureUserAccountColumns(db);
    
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
