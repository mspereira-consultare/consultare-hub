import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// --- AUTO-CORREÇÃO DE SCHEMA ---
function ensureUserSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'OPERADOR', -- ADMIN, GESTOR, OPERADOR
      department TEXT,
      status TEXT DEFAULT 'ATIVO',
      last_access TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Cria um admin padrão se a tabela estiver vazia (Senha: 123456)
  const count = db.prepare('SELECT count(*) as c FROM users').get();
  if (count.c === 0) {
    const hash = bcrypt.hashSync('123456', 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, department, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Admin Inicial', 'admin@consultare.com.br', hash, 'ADMIN', 'TI', 'ATIVO');
    console.log('✅ Usuário Admin padrão criado (admin@consultare.com.br / 123456)');
  }
}

// --- LISTAR USUÁRIOS (GET) ---
export async function GET() {
  try {
    const db = getDbConnection();
    ensureUserSchema(db);

    // Trazemos tudo EXCETO o hash da senha por segurança
    const users = db.prepare(`
      SELECT id, name, email, role, department, status, last_access 
      FROM users 
      ORDER BY name ASC
    `).all();

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- CRIAR / EDITAR USUÁRIO (POST) ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, password, role, department, status } = body;
    const db = getDbConnection();
    ensureUserSchema(db);

    if (id) {
      // --- EDIÇÃO ---
      // Se a senha vier vazia, não atualiza a senha. Se vier preenchida, faz novo hash.
      if (password && password.trim() !== '') {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare(`
          UPDATE users SET name=?, email=?, password_hash=?, role=?, department=?, status=?
          WHERE id=?
        `).run(name, email, hash, role, department, status, id);
      } else {
        db.prepare(`
          UPDATE users SET name=?, email=?, role=?, department=?, status=?
          WHERE id=?
        `).run(name, email, role, department, status, id);
      }
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      // --- CRIAÇÃO ---
      if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
      
      const hash = bcrypt.hashSync(password, 10);
      const stmt = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, department, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(name, email, hash, role, department, status);
      
      return NextResponse.json({ success: true, id: info.lastInsertRowid });
    }

  } catch (error: any) {
    // Erro comum: Email duplicado
    if (error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- DELETAR USUÁRIO (DELETE) ---
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = getDbConnection();
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}