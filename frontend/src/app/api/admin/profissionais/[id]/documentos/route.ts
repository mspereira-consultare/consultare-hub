import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import {
  createProfessionalDocumentRecord,
  listProfessionalDocuments,
} from '@/lib/profissionais/repository';
import type { DocumentTypeCode } from '@/lib/profissionais/constants';
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

const buildStorageKey = (professionalId: string, docType: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'profissionais/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${professionalId}/${docType}/${stamp}-${fileName}`;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { id } = await context.params;
    const data = await listProfessionalDocuments(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar documentos:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const professionalId = String(id || '').trim();
    if (!professionalId) {
      return NextResponse.json({ error: 'ID do profissional invalido.' }, { status: 400 });
    }

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }

    const docType = String(formData.get('docType') || '').trim().toUpperCase();
    const expiresAtRaw = String(formData.get('expiresAt') || '').trim();
    const expiresAt = expiresAtRaw || null;

    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    const key = buildStorageKey(professionalId, docType, originalName);
    const provider = getStorageProvider();
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: {
          professionalId,
          docType,
        },
      });

      uploaded = {
        provider: upload.provider,
        bucket: upload.bucket,
        key: upload.key,
      };

      const record = await createProfessionalDocumentRecord(
        auth.db,
        professionalId,
        {
          docType: docType as DocumentTypeCode,
          originalName,
          mimeType,
          sizeBytes,
          expiresAt,
          storageProvider: upload.provider,
          storageBucket: upload.bucket,
          storageKey: upload.key,
          uploadedBy: auth.userId,
        },
        auth.userId
      );

      return NextResponse.json({ status: 'success', data: record });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupErr) {
          console.error('Falha ao limpar arquivo apos erro de persistencia:', cleanupErr);
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error('Erro no upload de documento:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
