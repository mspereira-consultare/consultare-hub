import { NextResponse } from 'next/server';
import { updateUnansweredQuestion } from '@consultare/core/intranet/chatbot';
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
      status?: string;
      answerDraft?: string | null;
      answerReviewed?: string | null;
      reviewNotes?: string | null;
      assignedToUserId?: string | null;
      approvedByUserId?: string | null;
    };
    const data = await updateUnansweredQuestion(auth.db, id, {
      status: body?.status as any,
      answerDraft: body?.answerDraft ?? undefined,
      answerReviewed: body?.answerReviewed ?? undefined,
      reviewNotes: body?.reviewNotes ?? undefined,
      assignedToUserId: body?.assignedToUserId ?? undefined,
      answeredByUserId: auth.userId,
      approvedByUserId: body?.approvedByUserId ? auth.userId : undefined,
    });
    if (!data) return NextResponse.json({ error: 'Pergunta nao encontrada.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar pergunta sem resposta:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar pergunta.' }, { status: Number(error?.status) || 500 });
  }
}

