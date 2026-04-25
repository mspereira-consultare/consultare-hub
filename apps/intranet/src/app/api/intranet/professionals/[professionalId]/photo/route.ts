import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { getProfessionalPhotoDocument } from '@consultare/core/intranet/catalog';
import { getStorageProviderByName } from '@consultare/core/storage';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ professionalId: string }>;
};

type DocumentRow = {
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

    const { professionalId } = await context.params;
    const db = getDbConnection();
    const document = await getProfessionalPhotoDocument(db, professionalId) as DocumentRow | null;
    if (!document?.storage_key) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });

    const provider = getStorageProviderByName(String(document.storage_provider || 's3'));
    const stream = await provider.getFileStream({
      bucket: document.storage_bucket || null,
      key: String(document.storage_key),
    });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': String(document.mime_type || 'application/octet-stream'),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(String(document.original_name || 'foto'))}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar foto do profissional:', error);
    const status = Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao baixar foto.';
    return NextResponse.json({ error: message }, { status });
  }
}
