import { NextResponse } from 'next/server';
import {
  appendChatbotMessage,
  createChatbotSession,
  createUnansweredQuestion,
  ensureIntranetChatbotTables,
  listChatbotSessions,
  rankKnowledgeChunks,
  syncPublishedKnowledgeSources,
} from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotSession } from '@/lib/intranet/chatbot-auth';
import { embedText, streamAnswer } from '@/lib/chatbot/openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StreamEventName = 'session' | 'user_message' | 'status' | 'delta' | 'sources' | 'done' | 'error';

const createEvent = (encoder: TextEncoder, event: StreamEventName, payload: Record<string, unknown>) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: StreamEventName, payload: Record<string, unknown>) => {
          controller.enqueue(createEvent(encoder, event, payload));
        };

        const closeWithError = (message: string) => {
          send('error', { message });
          controller.close();
        };

        void (async () => {
          try {
            const session =
              body?.sessionId && String(body.sessionId).trim()
                ? { id: String(body.sessionId).trim() }
                : await createChatbotSession(auth.db, auth.user.id, question.slice(0, 120));

            send('session', { sessionId: session.id });

            const userMessage = await appendChatbotMessage(auth.db, session.id, auth.user.id, {
              role: 'user',
              content: question,
            });
            send('user_message', { message: userMessage });

            send('status', { code: 'buscando_fontes', label: 'Buscando fontes oficiais...' });
            await syncPublishedKnowledgeSources(auth.db);

            const { embedding } = await embedText(question);
            const ranked = await rankKnowledgeChunks(auth.db, auth.user, embedding, 6);

            if (!ranked.length) {
              await createUnansweredQuestion(auth.db, {
                question,
                askedByUserId: auth.user.id,
                sessionId: session.id,
              });

              const fallbackAnswer =
                'Nao encontrei uma resposta confiavel na base oficial neste momento. Sua pergunta foi registrada para revisao da equipe responsavel.';

              send('status', { code: 'pensando', label: 'Pensando...' });
              send('status', { code: 'gerando_resposta', label: 'Montando uma resposta segura...' });
              send('delta', { content: fallbackAnswer });

              const assistantMessage = await appendChatbotMessage(auth.db, session.id, auth.user.id, {
                role: 'assistant',
                content: fallbackAnswer,
                sourcesJson: [],
              });

              send('sources', { sources: [] });
              send('done', { sessionId: session.id, message: assistantMessage });
              controller.close();
              return;
            }

            send('status', { code: 'pensando', label: 'Pensando...' });
            send('status', { code: 'gerando_resposta', label: 'Escrevendo a resposta...' });

            const answer = await streamAnswer({
              question,
              context: ranked.map((item) => ({
                sourceId: item.knowledgeSourceId,
                sourceTitle: item.sourceTitle,
                canonicalUrl: item.canonicalUrl,
                chunkText: item.chunkText,
              })),
              onDelta: async (delta) => {
                send('delta', { content: delta });
              },
            });

            const normalizedAnswer = String(answer.answer || '').trim();
            const fallbackTriggered =
              normalizedAnswer.length < 12 ||
              /nao encontrei uma resposta confiavel|na base oficial nao|informacao confiavel suficiente/i.test(normalizedAnswer);

            if (fallbackTriggered) {
              await createUnansweredQuestion(auth.db, {
                question,
                askedByUserId: auth.user.id,
                sessionId: session.id,
              });
            }

            const seenSources = new Set<string>();
            const citations = ranked
              .map((item) => ({
                sourceId: item.knowledgeSourceId,
                title: item.sourceTitle,
                url: item.canonicalUrl,
              }))
              .filter((item) => {
                const key = `${item.sourceId}:${item.title}:${item.url || ''}`;
                if (seenSources.has(key)) return false;
                seenSources.add(key);
                return true;
              });

            const assistantMessage = await appendChatbotMessage(auth.db, session.id, auth.user.id, {
              role: 'assistant',
              content: normalizedAnswer || 'Nao encontrei uma resposta confiavel na base oficial neste momento.',
              sourcesJson: citations,
            });

            send('sources', { sources: citations });
            send('done', { sessionId: session.id, message: assistantMessage });
            controller.close();
          } catch (error: any) {
            console.error('Erro ao conversar com o chatbot da intranet:', error);
            closeWithError(error?.message || 'Erro interno ao responder pergunta.');
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Erro ao iniciar streaming do chatbot da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao responder pergunta.' }, { status: Number(error?.status) || 500 });
  }
}
