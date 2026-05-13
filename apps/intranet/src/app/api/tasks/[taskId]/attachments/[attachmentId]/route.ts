import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getTaskById } from '@consultare/core/tasks/repository';
import { getStorageProviderByName } from '@consultare/core/storage';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string; attachmentId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId, attachmentId } = await context.params;
    const task = await getTaskById(auth.db, String(taskId || ''), auth.viewer);
    const attachment = task.attachments.find((item) => item.id === String(attachmentId || ''));
    if (!attachment) return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(attachment.storageProvider);
    const stream = await provider.getFileStream({
      bucket: attachment.storageBucket || null,
      key: attachment.storageKey,
    });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName || 'arquivo')}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: any) {
    console.error('Erro ao baixar anexo da tarefa:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao baixar anexo.' }, { status: Number(error?.status) || 500 });
  }
}
