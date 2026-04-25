import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { getStorageProviderByName } from '@consultare/core/storage';
import { ensureIntranetTables } from '@/lib/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ assetId: string }>;
};

type AssetRow = {
  storage_provider?: string;
  storage_bucket?: string | null;
  storage_key?: string;
  original_name?: string;
  mime_type?: string;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { assetId } = await context.params;
    const db = getDbConnection();
    await ensureIntranetTables(db);
    const rows = await db.query(
      `
      SELECT storage_provider, storage_bucket, storage_key, original_name, mime_type
      FROM intranet_assets
      WHERE id = ?
      LIMIT 1
      `,
      [assetId],
    );
    const asset = rows[0] as AssetRow | undefined;
    if (!asset?.storage_key) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(String(asset.storage_provider || 's3'));
    const stream = await provider.getFileStream({
      bucket: asset.storage_bucket || null,
      key: String(asset.storage_key),
    });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': String(asset.mime_type || 'application/octet-stream'),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(String(asset.original_name || 'arquivo'))}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar asset da intranet:', error);
    const status = Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao baixar arquivo.';
    return NextResponse.json({ error: message }, { status });
  }
}
