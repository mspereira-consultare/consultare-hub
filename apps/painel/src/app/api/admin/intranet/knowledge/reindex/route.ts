import { NextResponse } from 'next/server';
import { queueKnowledgeJob, syncPublishedKnowledgeSources } from '@consultare/core/intranet/chatbot';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => ({}))) as { sourceIds?: string[] };
    const sourceIds = Array.isArray(body?.sourceIds)
      ? body.sourceIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    await syncPublishedKnowledgeSources(auth.db);

    const queuedJobs = [];
    const now = new Date().toISOString();

    if (sourceIds.length > 0) {
      await auth.db.execute(
        `
        UPDATE intranet_knowledge_sources
        SET status = CASE WHEN status = 'archived' THEN status ELSE 'stale' END,
            updated_at = CASE WHEN status = 'archived' THEN updated_at ELSE ? END
        WHERE id IN (${sourceIds.map(() => '?').join(', ')})
        `,
        [now, ...sourceIds]
      );

      for (const sourceId of sourceIds) {
        queuedJobs.push(
          await queueKnowledgeJob(auth.db, {
            knowledgeSourceId: sourceId,
            jobType: 'reindex',
            requestedBy: auth.userId,
          })
        );
      }
    } else {
      await auth.db.execute(
        `
        UPDATE intranet_knowledge_sources
        SET status = CASE WHEN status = 'archived' THEN status ELSE 'stale' END,
            updated_at = CASE WHEN status = 'archived' THEN updated_at ELSE ? END
        `,
        [now]
      );

      queuedJobs.push(
        await queueKnowledgeJob(auth.db, {
          knowledgeSourceId: null,
          jobType: 'reindex',
          requestedBy: auth.userId,
        })
      );
    }

    return NextResponse.json({
      status: 'success',
      data: {
        queued: true,
        queuedJobs,
      },
    });
  } catch (error: any) {
    console.error('Erro ao reindexar base de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao reindexar base de conhecimento.' }, { status: Number(error?.status) || 500 });
  }
}
