import { getDbConnection } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { chave, valor } = await req.json();
    if (!chave) return NextResponse.json({ error: 'chave obrigatória' }, { status: 400 });

    const db = getDbConnection();

    await db.execute(
      `
      INSERT INTO config (chave, valor, dt_atualizacao)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(chave) DO UPDATE SET
        valor = excluded.valor,
        dt_atualizacao = excluded.dt_atualizacao
      `,
      [chave, valor ?? '']
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[TOKEN] Erro:', error);
    return NextResponse.json({ error: 'Erro ao salvar token' }, { status: (error as any)?.status || 500 });
  }
}
