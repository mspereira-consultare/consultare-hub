import { NextResponse } from 'next/server';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { ChatValidationError, listChatUsers } from '@/lib/intranet/chat';

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

export async function GET() {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listChatUsers(auth.db, auth.user.id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar usuários do chat:', error);
    return errorResponse(error, 'Erro interno ao listar usuários.');
  }
}
