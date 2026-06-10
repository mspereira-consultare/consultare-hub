import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import {
  attachRepasseEmailBatchFiles,
  RepasseValidationError,
  type RepasseEmailAttachmentUploadInput,
} from '@/lib/repasses/repository';
import { getStorageProvider } from '@/lib/storage';

type ParamsContext = { params: Promise<{ batchId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const clean = (value: unknown) => String(value ?? '').trim();

const sanitizeStoragePart = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

const buildStorageKey = (batchId: string, originalName: string) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = sanitizeStoragePart(originalName) || 'repasse.pdf';
  return `repasses/email-fechamento/${sanitizeStoragePart(batchId)}/attachments/${stamp}-${fileName}`;
};

const isPdfName = (name: string) => name.toLowerCase().endsWith('.pdf');

const uploadPdf = async (params: {
  batchId: string;
  fileName: string;
  buffer: Buffer;
  recipientId?: string;
  source: 'bulk' | 'individual';
}): Promise<RepasseEmailAttachmentUploadInput> => {
  const provider = getStorageProvider();
  const upload = await provider.uploadFile({
    key: buildStorageKey(params.batchId, params.fileName),
    body: params.buffer,
    contentType: 'application/pdf',
    metadata: {
      batchId: params.batchId,
      source: params.source,
      recipientId: params.recipientId || '',
    },
  });
  return {
    recipientId: params.recipientId || null,
    fileName: params.fileName,
    storageProvider: upload.provider,
    storageBucket: upload.bucket,
    storageKey: upload.key,
    sizeBytes: params.buffer.length,
    contentType: 'application/pdf',
    source: params.source,
  };
};

const collectUploads = async (batchId: string, formData: FormData) => {
  const recipientId = clean(formData.get('recipientId'));
  const parts = formData.getAll('files').concat(formData.getAll('file'));
  const uploads: RepasseEmailAttachmentUploadInput[] = [];

  for (const part of parts) {
    if (!(part instanceof File)) continue;
    const fileName = clean(part.name);
    const buffer = Buffer.from(await part.arrayBuffer());
    if (isPdfName(fileName)) {
      uploads.push(await uploadPdf({
        batchId,
        fileName,
        buffer,
        recipientId,
        source: recipientId ? 'individual' : 'bulk',
      }));
      continue;
    }

    if (fileName.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(buffer);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !isPdfName(entry.name)) continue;
        const pdfBuffer = Buffer.from(await entry.async('uint8array'));
        uploads.push(await uploadPdf({
          batchId,
          fileName: entry.name.split('/').pop() || entry.name,
          buffer: pdfBuffer,
          recipientId,
          source: recipientId ? 'individual' : 'bulk',
        }));
      }
    }
  }

  return uploads;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Módulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('refresh');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { batchId } = await context.params;
    const formData = await request.formData();
    const uploads = await collectUploads(batchId, formData);
    const data = await attachRepasseEmailBatchFiles(auth.db, batchId, uploads, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao enviar anexos de e-mail de repasse:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao enviar anexos de e-mail de repasse.',
      },
      { status }
    );
  }
}
