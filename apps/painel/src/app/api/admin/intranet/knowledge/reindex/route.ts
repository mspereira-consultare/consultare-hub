import { NextResponse } from 'next/server';
import { queueKnowledgeJob } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';
import { reindexKnowledgeSources } from '@/lib/intranet/chatbot-indexer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => ({}))) as { sourceIds?: string[] };
    await queueKnowledgeJob(auth.db, {
      knowledgeSourceId: null,
      jobType: 'reindex',
      requestedBy: auth.userId,
    });
    const data = await reindexKnowledgeSources(auth.db, Array.isArray(body?.sourceIds) ? body.sourceIds : undefined);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao reindexar base de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao reindexar base de conhecimento.' }, { status: Number(error?.status) || 500 });
  }
}

