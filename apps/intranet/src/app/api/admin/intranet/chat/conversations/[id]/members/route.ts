import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { ChatValidationError, replaceAdminConversationMembers } from '@/lib/intranet/chat';

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
    const auth = await requireIntranetPermission('intranet_chat', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await replaceAdminConversationMembers(auth.db, id, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar membros do chat:', error);
    return errorResponse(error, 'Erro interno ao atualizar membros.');
  }
}

export async function DELETE(request: Request, context: ParamsContext) {
  return POST(request, context);
}
