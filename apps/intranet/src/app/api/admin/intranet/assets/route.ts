import { NextResponse } from 'next/server';
import { getStorageProvider } from '@consultare/core/storage';
import { requireAnyIntranetPermission } from '@/lib/intranet/auth';
import { createAssetRecord, IntranetValidationError, listAssets } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (entityType: string, originalName: string) => {
  const prefix = String(process.env.INTRANET_S3_PREFIX || 'intranet/').replace(/^\/+|\/+$/g, '');
  const domain = sanitizePart(entityType) || 'assets';
  const fileName = sanitizePart(originalName) || 'arquivo';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${domain}/${stamp}-${fileName}`;
};

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const auth = await requireAnyIntranetPermission(['intranet_paginas', 'intranet_noticias'], 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listAssets(auth.db, {
      entityType: String(searchParams.get('entityType') || ''),
      entityId: String(searchParams.get('entityId') || ''),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar assets da intranet:', error);
    return errorResponse(error, 'Erro interno ao listar assets.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAnyIntranetPermission(['intranet_paginas', 'intranet_noticias'], 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }

    const originalName = String(filePart.name || 'arquivo');
    const mimeType = String(filePart.type || 'application/octet-stream');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Arquivo invalido ou acima de 25MB.' }, { status: 400 });
    }

    const entityType = String(formData.get('entityType') || 'cms').trim();
    const entityId = String(formData.get('entityId') || '').trim() || null;
    const body = Buffer.from(await filePart.arrayBuffer());
    const provider = getStorageProvider();
    const upload = await provider.uploadFile({
      key: buildStorageKey(entityType, originalName),
      body,
      contentType: mimeType,
      metadata: {
        domain: 'intranet',
        entityType: entityType || 'cms',
      },
    });

    const data = await createAssetRecord(
      auth.db,
      {
        entityType,
        entityId,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        originalName,
        mimeType,
        sizeBytes,
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao enviar asset da intranet:', error);
    return errorResponse(error, 'Erro interno ao enviar asset.');
  }
}
