import { NextResponse } from 'next/server';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { ChatValidationError, createDmConversation } from '@/lib/intranet/chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof ChatValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request: Request) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createDmConversation(auth.db, auth.user.id, body?.userId || body?.user_id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar DM do chat:', error);
    return errorResponse(error, 'Erro interno ao criar conversa.');
  }
}
