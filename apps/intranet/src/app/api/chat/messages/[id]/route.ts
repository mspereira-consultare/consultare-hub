import { NextResponse } from 'next/server';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { ChatValidationError, deleteChatMessage, updateChatMessage } from '@/lib/intranet/chat';

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

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await updateChatMessage(auth.db, auth.user, id, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao editar mensagem do chat:', error);
    return errorResponse(error, 'Erro interno ao editar mensagem.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deleteChatMessage(auth.db, auth.user, id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao apagar mensagem do chat:', error);
    return errorResponse(error, 'Erro interno ao apagar mensagem.');
  }
}
