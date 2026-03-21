import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import {
  createEmployeeDocumentRecord,
  listEmployeeDocuments,
} from '@/lib/colaboradores/repository';
import type { EmployeeDocumentTypeCode } from '@/lib/colaboradores/constants';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (employeeId: string, docType: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'colaboradores/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${employeeId}/${docType}/${stamp}-${fileName}`;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await listEmployeeDocuments(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar documentos do colaborador:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar documentos.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const employeeId = String(id || '').trim();
    if (!employeeId) {
      return NextResponse.json({ error: 'ID do colaborador invalido.' }, { status: 400 });
    }

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }

    const docType = String(formData.get('docType') || '').trim().toUpperCase();
    const issueDate = String(formData.get('issueDate') || '').trim() || null;
    const expiresAt = String(formData.get('expiresAt') || '').trim() || null;
    const notes = String(formData.get('notes') || '').trim() || null;

    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'arquivo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    const key = buildStorageKey(employeeId, docType, originalName);
    const provider = getStorageProvider();
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());

    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;
    try {
      const upload = await provider.uploadFile({
        key,
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { employeeId, docType },
      });

      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };

      const record = await createEmployeeDocumentRecord(
        auth.db,
        employeeId,
        {
          docType: docType as EmployeeDocumentTypeCode,
          originalName,
          mimeType,
          sizeBytes,
          issueDate,
          expiresAt,
          notes,
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
  } catch (error: any) {
    console.error('Erro no upload de documento do colaborador:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no upload.' }, { status: Number(error?.status) || 500 });
  }
}
