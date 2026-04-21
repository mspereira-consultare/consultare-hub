import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  createQmsTrainingFileRecord,
  listQmsTrainingFiles,
  QmsValidationError,
} from '@/lib/qms/trainings_repository';
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

const buildStorageKey = (trainingId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'qms/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/trainings/${trainingId}/${stamp}-${fileName}`;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { id } = await context.params;
    const data = await listQmsTrainingFiles(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar arquivos de realizacao:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar arquivos.' },
      { status }
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const trainingId = String(id || '').trim();
    if (!trainingId) {
      return NextResponse.json({ error: 'Treinamento invalido.' }, { status: 400 });
    }

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }
    const fileType = String(formData.get('fileType') || 'other').trim().toLowerCase();
    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    const provider = getStorageProvider();
    const key = buildStorageKey(trainingId, originalName);
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: {
          module: 'qms_trainings',
          trainingId,
          fileType,
        },
      });

      uploaded = { bucket: upload.bucket, key: upload.key };
      const data = await createQmsTrainingFileRecord(
        auth.db,
        trainingId,
        {
          fileType: fileType as any,
          storageProvider: upload.provider,
          storageBucket: upload.bucket,
          storageKey: upload.key,
          filename: originalName,
          mimeType,
          sizeBytes,
        },
        auth.userId
      );
      return NextResponse.json({ status: 'success', data });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupErr) {
          console.error('Falha ao remover arquivo de treinamento apos erro:', cleanupErr);
        }
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Erro no upload de realizacao:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no upload.' },
      { status }
    );
  }
}
