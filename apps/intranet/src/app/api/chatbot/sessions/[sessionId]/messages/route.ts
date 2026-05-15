import { NextResponse } from 'next/server';
import {
  ensureIntranetChatbotTables,
  listChatbotMessages,
} from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotSession } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  sessionId: string;
};

export async function GET(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { sessionId } = await params;
    await ensureIntranetChatbotTables(auth.db);
    const data = await listChatbotMessages(auth.db, sessionId, auth.user.id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar mensagens do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar mensagens.' }, { status: Number(error?.status) || 500 });
  }
}

