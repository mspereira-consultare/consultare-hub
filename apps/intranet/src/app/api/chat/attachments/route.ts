import { NextResponse } from 'next/server';
import { getStorageProvider } from '@consultare/core/storage';
import { requireChatSession } from '@/lib/intranet/chat-auth';
import { createAssetRecord, IntranetValidationError } from '@/lib/intranet/repository';
import { ChatValidationError } from '@/lib/intranet/chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (originalName: string) => {
  const prefix = String(process.env.INTRANET_S3_PREFIX || 'intranet/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/chat/${stamp}-${fileName}`;
};

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError || error instanceof ChatValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request: Request) {
  try {
    const auth = await requireChatSession();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    const originalName = String(filePart.name || 'arquivo');
    const mimeType = String(filePart.type || 'application/octet-stream');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Arquivo inválido ou acima de 10MB.' }, { status: 400 });
    }

    const body = Buffer.from(await filePart.arrayBuffer());
    const provider = getStorageProvider();
    const upload = await provider.uploadFile({
      key: buildStorageKey(originalName),
      body,
      contentType: mimeType,
      metadata: { domain: 'intranet', entityType: 'chat' },
    });

    const data = await createAssetRecord(
      auth.db,
      {
        entityType: 'chat',
        entityId: String(formData.get('conversationId') || '').trim() || null,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        originalName,
        mimeType,
        sizeBytes,
      },
      auth.user.id
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao enviar anexo do chat:', error);
    return errorResponse(error, 'Erro interno ao enviar anexo.');
  }
}
