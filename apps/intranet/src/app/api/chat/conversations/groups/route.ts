import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { ChatValidationError, createChatGroupConversation } from '@/lib/intranet/chat';

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
    const auth = await requireIntranetPermission('intranet_chat', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const id = await createChatGroupConversation(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data: { id } });
  } catch (error: unknown) {
    console.error('Erro ao criar grupo do chat:', error);
    return errorResponse(error, 'Erro interno ao criar grupo.');
  }
}
