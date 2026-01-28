import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { token, chave } = await request.json(); // chave pode ser 'cookie_recepcao'

    if (!token || !chave) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const db = getDbConnection();

    // Upsert (Inserir ou Atualizar)
    const stmt = db.prepare(`
      INSERT INTO config (chave, valor, dt_atualizacao) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(chave) DO UPDATE SET 
        valor = excluded.valor,
        dt_atualizacao = excluded.dt_atualizacao
    `);

    stmt.run(chave, token);

    return NextResponse.json({ message: 'Token atualizado com sucesso' });

  } catch (error) {
    return NextResponse.json({ error: 'Erro ao salvar token' }, { status: 500 });
  }
}