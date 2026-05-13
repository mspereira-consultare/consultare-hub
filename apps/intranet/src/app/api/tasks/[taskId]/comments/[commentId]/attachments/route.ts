import { NextResponse } from 'next/server';
import { addTaskCommentAttachment, getTaskById } from '@consultare/core/tasks/repository';
import { getStorageProvider } from '@consultare/core/storage';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ taskId: string; commentId: string }>;
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (taskId: string, commentId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'tasks/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${taskId}/comments/${commentId}/${stamp}-${fileName}`;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId, commentId } = await context.params;
    const cleanTaskId = String(taskId || '').trim();
    const cleanCommentId = String(commentId || '').trim();
    if (!cleanTaskId || !cleanCommentId) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    await getTaskById(auth.db, cleanTaskId, auth.viewer);

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });

    const provider = getStorageProvider();
    const key = buildStorageKey(cleanTaskId, cleanCommentId, originalName);
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { taskId: cleanTaskId, commentId: cleanCommentId },
      });
      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };
      const data = await addTaskCommentAttachment(auth.db, cleanCommentId, {
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        originalName,
        mimeType,
        sizeBytes,
      }, auth.userId);
      return NextResponse.json({ status: 'success', data }, { status: 201 });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupError) {
          console.error('Falha ao limpar anexo de comentário após erro:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Erro ao anexar arquivo ao comentário:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no upload do comentário.' }, { status: Number(error?.status) || 500 });
  }
}
