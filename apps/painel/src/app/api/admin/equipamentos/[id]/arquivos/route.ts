import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { createEquipmentFileRecord, listEquipmentFiles } from '@/lib/equipamentos/repository';
import type { EquipmentFileType } from '@/lib/equipamentos/constants';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (equipmentId: string, fileType: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'equipamentos/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${equipmentId}/${fileType}/${stamp}-${fileName}`;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await listEquipmentFiles(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar arquivos do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar arquivos.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const equipmentId = String(id || '').trim();
    if (!equipmentId) {
      return NextResponse.json({ error: 'ID do equipamento inválido.' }, { status: 400 });
    }

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    const fileType = String(formData.get('fileType') || '').trim().toUpperCase();
    const notes = String(formData.get('notes') || '').trim() || null;
    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    const key = buildStorageKey(equipmentId, fileType, originalName);
    const provider = getStorageProvider();
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { equipmentId, fileType },
      });

      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };

      const data = await createEquipmentFileRecord(auth.db, equipmentId, {
        fileType: fileType as EquipmentFileType,
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
          console.error('Falha ao limpar arquivo após erro de persistência:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Erro ao enviar arquivo do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno no upload.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
