import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// --- LISTAR USUÁRIOS (GET) ---
export async function GET() {
  try {
    const db = getDbConnection();
    
    // query(sql) -> retorna array de linhas
    const result = await db.query(`
        SELECT id, name, email, role, department, status, last_access 
        FROM users 
        ORDER BY name ASC
    `);

    // Seu db.ts já normaliza o retorno para array (res.rows no Turso ou .all() no Local)
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Erro GET Users:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// --- CRIAR OU EDITAR USUÁRIO (POST) ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, password, role, department, status } = body;
    const db = getDbConnection();

    if (id) {
      // --- EDIÇÃO (UPDATE) ---
      
      if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        // CORREÇÃO: Passando (sql, params) separados
        await db.execute(
            `UPDATE users SET name = ?, email = ?, password = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [name, email, hash, role, department, status, id]
        );
      } else {
        // CORREÇÃO: Passando (sql, params) separados
        await db.execute(
            `UPDATE users SET name = ?, email = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [name, email, role, department, status, id]
        );
      }
      
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      // --- CRIAÇÃO (INSERT) ---
      if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
      
      const hash = await bcrypt.hash(password, 10);
      const newId = crypto.randomUUID(); // UUID para Turso

      // CORREÇÃO: Passando (sql, params) separados
      await db.execute(
        `INSERT INTO users (id, name, email, password, role, department, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [newId, name, email, hash, role, department, status]
      );
      
      return NextResponse.json({ success: true, id: newId });
    }

  } catch (error: any) {
    console.error("Erro POST Users:", error);
    // Tratamento para email duplicado
    if (error.message?.includes('UNIQUE constraint failed') || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
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
    
    // CORREÇÃO: Passando (sql, params) separados
    await db.execute(
        "DELETE FROM users WHERE id = ?",
        [id]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE User:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}