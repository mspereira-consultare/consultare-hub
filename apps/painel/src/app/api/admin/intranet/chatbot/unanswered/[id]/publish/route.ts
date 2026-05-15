import { NextResponse } from 'next/server';
import { publishUnansweredQuestionToKnowledge } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';
import { reindexKnowledgeSources } from '@/lib/intranet/chatbot-indexer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  id: string;
};

export async function POST(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const published = await publishUnansweredQuestionToKnowledge(auth.db, id, auth.userId);
    if (!published) return NextResponse.json({ error: 'Pergunta nao encontrada.' }, { status: 404 });
    await reindexKnowledgeSources(auth.db, [published.source.id]);
    return NextResponse.json({ status: 'success', data: published });
  } catch (error: any) {
    console.error('Erro ao publicar pergunta na base de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao publicar pergunta.' }, { status: Number(error?.status) || 500 });
  }
}

