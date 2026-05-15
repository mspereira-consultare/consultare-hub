import { NextResponse } from 'next/server';
import { listUnansweredQuestions } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetChatbotAdminAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listUnansweredQuestions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar perguntas sem resposta:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar perguntas.' }, { status: Number(error?.status) || 500 });
  }
}

