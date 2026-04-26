import { NextResponse } from 'next/server';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { ChatValidationError, listChatMessages, sendChatMessage } from '@/lib/intranet/chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof ChatValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listChatMessages(auth.db, auth.user, id, {
      before: String(searchParams.get('before') || ''),
      after: String(searchParams.get('after') || ''),
      limit: Number(searchParams.get('limit') || 40),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar mensagens da conversa:', error);
    return errorResponse(error, 'Erro interno ao listar mensagens.');
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await sendChatMessage(auth.db, auth.user, id, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao enviar mensagem do chat:', error);
    return errorResponse(error, 'Erro interno ao enviar mensagem.');
  }
}
