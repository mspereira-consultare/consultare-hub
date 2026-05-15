import { NextResponse } from 'next/server';
import { listKnowledgeSources, syncPublishedKnowledgeSources } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await syncPublishedKnowledgeSources(auth.db);
    const { searchParams } = new URL(request.url);
    const data = await listKnowledgeSources(auth.db, {
      search: String(searchParams.get('search') || '').trim() || undefined,
      statuses: String(searchParams.get('statuses') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean) as any,
      sourceTypes: String(searchParams.get('sourceTypes') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean) as any,
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar fontes de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar fontes.' }, { status: Number(error?.status) || 500 });
  }
}

