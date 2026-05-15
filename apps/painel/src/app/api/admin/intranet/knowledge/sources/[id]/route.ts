import { NextResponse } from 'next/server';
import { updateKnowledgeSource } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  id: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string | null;
      status?: string | null;
      audienceGroupIds?: string[];
    };
    const data = await updateKnowledgeSource(auth.db, id, {
      title: body?.title ?? undefined,
      status: body?.status as any,
      audienceGroupIds: Array.isArray(body?.audienceGroupIds) ? body.audienceGroupIds : undefined,
    });
    if (!data) return NextResponse.json({ error: 'Fonte nao encontrada.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar fonte de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar fonte.' }, { status: Number(error?.status) || 500 });
  }
}

