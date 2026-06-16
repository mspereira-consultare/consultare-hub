import { NextResponse } from 'next/server';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import { createEquipmentWorkOrderFileRecord } from '@/lib/equipamentos/work_orders';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ osId: string }>;
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (workOrderId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'equipamentos/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/os/${workOrderId}/${stamp}-${fileName}`;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { osId } = await context.params;
    const workOrderId = String(osId || '').trim();
    if (!workOrderId) {
      return NextResponse.json({ error: 'ID da OS inválido.' }, { status: 400 });
    }

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    const notes = String(formData.get('notes') || '').trim() || null;
    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });

    const key = buildStorageKey(workOrderId, originalName);
    const provider = getStorageProvider();
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { workOrderId },
      });

      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };

      const data = await createEquipmentWorkOrderFileRecord(auth.db, workOrderId, {
        originalName,
        mimeType,
        sizeBytes,
        notes,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        uploadedBy: auth.userId,
      });

      return NextResponse.json({ status: 'success', data }, { status: 201 });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupError) {
          console.error('Falha ao limpar arquivo da OS após erro de persistência:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error('Erro ao enviar arquivo da OS:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno no upload da OS.') }, { status: errorStatus(error) });
  }
}
