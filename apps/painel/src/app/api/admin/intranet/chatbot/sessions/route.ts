import { NextResponse } from 'next/server';
import { listChatbotMessagesAudit, listChatbotSessionsAudit } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const sessionId = String(searchParams.get('sessionId') || '').trim();
    if (sessionId) {
      const data = await listChatbotMessagesAudit(auth.db, sessionId);
      return NextResponse.json({ status: 'success', data });
    }
    const data = await listChatbotSessionsAudit(auth.db, 60);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar auditoria do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar auditoria.' }, { status: Number(error?.status) || 500 });
  }
}

