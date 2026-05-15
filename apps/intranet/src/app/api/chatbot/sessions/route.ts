import { NextResponse } from 'next/server';
import {
  createChatbotSession,
  ensureIntranetChatbotTables,
  listChatbotSessions,
} from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotSession } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureIntranetChatbotTables(auth.db);
    const data = await listChatbotSessions(auth.db, auth.user.id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar sessões do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar sessões.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    await ensureIntranetChatbotTables(auth.db);
    const data = await createChatbotSession(auth.db, auth.user.id, String(body?.title || '').trim() || null);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar sessão do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar sessão.' }, { status: Number(error?.status) || 500 });
  }
}

