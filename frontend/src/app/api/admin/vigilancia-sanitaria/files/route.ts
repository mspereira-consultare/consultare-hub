import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { createSurveillanceFileRecord } from '@/lib/vigilancia_sanitaria/repository';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (entityType: string, entityId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'vigilancia-sanitaria/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${entityType}/${entityId}/${stamp}-${fileName}`;
};

export async function POST(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const formData = await request.formData();
    const entityTypeRaw = String(formData.get('entityType') || '').trim().toLowerCase();
    const entityType = entityTypeRaw === 'document' ? 'document' : entityTypeRaw === 'license' ? 'license' : null;
    const entityId = String(formData.get('entityId') || '').trim();
    const filePart = formData.get('file');

    if (!entityType) return NextResponse.json({ error: 'Tipo de vínculo inválido.' }, { status: 400 });
    if (!entityId) return NextResponse.json({ error: 'ID do vínculo não informado.' }, { status: 400 });
    if (!(filePart instanceof File)) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    const originalName = String(filePart.name || 'arquivo.bin');
    const mimeType = String(filePart.type || 'application/octet-stream');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });

    const provider = getStorageProvider();
    const key = buildStorageKey(entityType, entityId, originalName);
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { entityType, entityId },
      });
      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };
      const data = await createSurveillanceFileRecord(auth.db, {
        entityType,
        entityId,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        originalName,
        mimeType,
        sizeBytes,
        uploadedBy: auth.userId,
      });
      return NextResponse.json({ status: 'success', data }, { status: 201 });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupError) {
          console.error('Falha ao limpar arquivo de Vigilância Sanitária:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Erro no upload de Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no upload.' }, { status: Number(error?.status) || 500 });
  }
}
