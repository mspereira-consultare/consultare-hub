import { NextResponse } from 'next/server';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { ChatValidationError, markConversationRead } from '@/lib/intranet/chat';

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

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await markConversationRead(auth.db, auth.user, id, body?.messageId || body?.message_id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao marcar conversa como lida:', error);
    return errorResponse(error, 'Erro interno ao marcar leitura.');
  }
}
