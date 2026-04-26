import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { ChatValidationError, createChatGroupConversation, listAdminChatConversations } from '@/lib/intranet/chat';

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
    const auth = await requireIntranetPermission('intranet_chat', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listAdminChatConversations(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar conversas administrativas do chat:', error);
    return errorResponse(error, 'Erro interno ao listar conversas.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_chat', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const id = await createChatGroupConversation(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data: { id } });
  } catch (error: unknown) {
    console.error('Erro ao criar conversa administrativa do chat:', error);
    return errorResponse(error, 'Erro interno ao criar conversa.');
  }
}
