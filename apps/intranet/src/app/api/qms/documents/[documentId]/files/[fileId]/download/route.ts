import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { getStorageProviderByName } from '@consultare/core/storage';
import { ensureIntranetCatalogTables } from '@consultare/core/intranet/catalog';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string; fileId: string }>;
};

type FileRow = {
  storage_provider?: string;
  storage_bucket?: string | null;
  storage_key?: string;
  filename?: string;
  mime_type?: string;
};

const disposition = (value: string | null) =>
  String(value || 'attachment').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment';

export async function GET(request: Request, context: ParamsContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { documentId, fileId } = await context.params;
    const db = getDbConnection();
    await ensureIntranetCatalogTables(db);
    const visibleRows = await db.query(
      `SELECT document_id FROM intranet_qms_document_settings WHERE document_id = ? AND is_visible = 1 LIMIT 1`,
      [documentId]
    );
    if (!visibleRows.length) {
      return NextResponse.json({ error: 'Arquivo não encontrado ou não publicado na intranet.' }, { status: 404 });
    }

    const rows = await db.query(
      `
      SELECT f.storage_provider, f.storage_bucket, f.storage_key, f.filename, f.mime_type
      FROM qms_document_files f
      INNER JOIN qms_document_versions v ON v.id = f.document_version_id
      WHERE v.document_id = ? AND f.id = ? AND COALESCE(f.is_active, 1) = 1
      LIMIT 1
      `,
      [documentId, fileId]
    );
    const file = rows[0] as FileRow | undefined;
    if (!file?.storage_key) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(String(file.storage_provider || 's3'));
    const stream = await provider.getFileStream({
      bucket: file.storage_bucket || null,
      key: String(file.storage_key),
    });
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const { searchParams } = new URL(request.url);

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': String(file.mime_type || 'application/octet-stream'),
        'Content-Disposition': `${disposition(searchParams.get('disposition'))}; filename*=UTF-8''${encodeURIComponent(String(file.filename || 'arquivo'))}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar arquivo QMS pela intranet:', error);
    const status = Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao baixar arquivo.';
    return NextResponse.json({ error: message }, { status });
  }
}
