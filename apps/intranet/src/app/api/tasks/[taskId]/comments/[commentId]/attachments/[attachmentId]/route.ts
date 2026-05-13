import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getTaskById } from '@consultare/core/tasks/repository';
import { getStorageProviderByName } from '@consultare/core/storage';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string; commentId: string; attachmentId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId, commentId, attachmentId } = await context.params;
    const task = await getTaskById(auth.db, String(taskId || ''), auth.viewer);
    const comment = task.comments.find((item) => item.id === String(commentId || ''));
    const target = comment?.attachments.find((item) => item.id === String(attachmentId || ''));
    if (!target) return NextResponse.json({ error: 'Anexo do comentário não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(target.storageProvider);
    const stream = await provider.getFileStream({
      bucket: target.storageBucket || null,
      key: target.storageKey,
    });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': target.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(target.originalName || 'arquivo')}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: any) {
    console.error('Erro ao baixar anexo do comentário:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao baixar anexo do comentário.' }, { status: Number(error?.status) || 500 });
  }
}
