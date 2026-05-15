import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createKnowledgeAssetSource } from '@consultare/core/intranet/chatbot';
import type { DbInterface } from '@consultare/core/db';
import { getStorageProvider } from '@consultare/core/storage';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';

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

const buildStorageKey = (originalName: string) => {
  const prefix = String(process.env.INTRANET_S3_PREFIX || 'intranet/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'arquivo';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/knowledge/${stamp}-${fileName}`;
};

const createAssetRecord = async (
  db: DbInterface,
  input: {
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  },
  actorUserId: string
) => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_assets (
      id VARCHAR(64) PRIMARY KEY,
      entity_type VARCHAR(80),
      entity_id VARCHAR(64),
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(160),
      storage_key VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      size_bytes BIGINT NOT NULL,
      uploaded_by VARCHAR(64),
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(
    `
    INSERT INTO intranet_assets (
      id, entity_type, entity_id, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, 'knowledge_document', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.storageProvider,
      input.storageBucket,
      input.storageKey,
      input.originalName,
      input.mimeType,
      input.sizeBytes,
      actorUserId,
      createdAt,
    ]
  );
  return { id };
};

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetChatbotAdminAccess('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }

    const title = String(formData.get('title') || filePart.name || '').trim() || 'Documento manual';
    const mimeType = String(filePart.type || 'application/octet-stream');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Arquivo invalido ou acima de 25MB.' }, { status: 400 });
    }

    const provider = getStorageProvider();
    const body = Buffer.from(await filePart.arrayBuffer());
    const upload = await provider.uploadFile({
      key: buildStorageKey(filePart.name),
      body,
      contentType: mimeType,
      metadata: {
        domain: 'intranet',
        entityType: 'knowledge_document',
      },
    });

    const asset = await createAssetRecord(
      auth.db,
      {
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
        originalName: filePart.name,
        mimeType,
        sizeBytes,
      },
      auth.userId
    );

    const data = await createKnowledgeAssetSource(auth.db, {
      assetId: asset.id,
      title,
      originalName: filePart.name,
      storageProvider: upload.provider,
      storageBucket: upload.bucket,
      storageKey: upload.key,
      mimeType,
      audienceGroupIds: String(formData.get('audienceGroupIds') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });

    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao enviar documento da base de conhecimento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao enviar documento.' }, { status: Number(error?.status) || 500 });
  }
}
