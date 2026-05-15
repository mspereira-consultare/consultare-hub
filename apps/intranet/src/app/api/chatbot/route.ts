import { NextResponse } from 'next/server';
import {
  appendChatbotMessage,
  createChatbotSession,
  createUnansweredQuestion,
  ensureIntranetChatbotTables,
  listChatbotSessions,
  listKnowledgeChunksForUser,
  rankKnowledgeChunks,
  syncPublishedKnowledgeSources,
} from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotSession } from '@/lib/intranet/chatbot-auth';
import { answerWithCitations, embedText } from '@/lib/chatbot/openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureIntranetChatbotTables(auth.db);
    const data = await listChatbotSessions(auth.db, auth.user.id);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar sessoes do chatbot:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar sessoes.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetChatbotSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json()) as {
      sessionId?: string;
      question?: string;
    };
    const question = String(body?.question || '').trim();
    if (question.length < 3) {
      return NextResponse.json({ error: 'Digite uma pergunta mais completa.' }, { status: 400 });
    }

    await ensureIntranetChatbotTables(auth.db);
    await syncPublishedKnowledgeSources(auth.db);

    const session =
      body?.sessionId && String(body.sessionId).trim()
        ? { id: String(body.sessionId).trim() }
        : await createChatbotSession(auth.db, auth.user.id, question.slice(0, 120));

    await appendChatbotMessage(auth.db, session.id, auth.user.id, {
      role: 'user',
      content: question,
    });

    const { embedding } = await embedText(question);
    const ranked = await rankKnowledgeChunks(auth.db, auth.user, embedding, 6);

    if (!ranked.length) {
      const unanswered = await createUnansweredQuestion(auth.db, {
        question,
        askedByUserId: auth.user.id,
        sessionId: session.id,
      });
      const assistantMessage = await appendChatbotMessage(auth.db, session.id, auth.user.id, {
        role: 'assistant',
        content:
          'Nao encontrei uma resposta confiavel na base oficial neste momento. Sua pergunta foi registrada para revisao da equipe responsavel.',
        sourcesJson: [],
      });
      return NextResponse.json({
        status: 'success',
        data: {
          sessionId: session.id,
          message: assistantMessage,
          unansweredQuestionId: unanswered.id,
          knowledgeSourceCount: (await listKnowledgeChunksForUser(auth.db, auth.user)).length,
        },
      });
    }

    const answer = await answerWithCitations({
      question,
      context: ranked.map((item) => ({
        sourceId: item.knowledgeSourceId,
        sourceTitle: item.sourceTitle,
        canonicalUrl: item.canonicalUrl,
        chunkText: item.chunkText,
      })),
    });

    const citations =
      answer.citations.length > 0
        ? answer.citations
        : ranked.map((item) => ({
            sourceId: item.knowledgeSourceId,
            title: item.sourceTitle,
            url: item.canonicalUrl,
          }));

    if (answer.confidence === 'low' || answer.shouldEscalate) {
      await createUnansweredQuestion(auth.db, {
        question,
        askedByUserId: auth.user.id,
        sessionId: session.id,
      });
    }

    const assistantMessage = await appendChatbotMessage(auth.db, session.id, auth.user.id, {
      role: 'assistant',
      content: answer.answer,
      sourcesJson: citations,
    });

    return NextResponse.json({
      status: 'success',
      data: {
        sessionId: session.id,
        message: assistantMessage,
      },
    });
  } catch (error: any) {
    console.error('Erro ao conversar com o chatbot da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao responder pergunta.' }, { status: Number(error?.status) || 500 });
  }
}
