import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireQmsPermission } from '@/lib/qms/auth';
import { getQmsTrainingFileById } from '@/lib/qms/trainings_repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string; fileId: string }>;
};

const withDisposition = (value: string | null) =>
  String(value || 'attachment').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment';

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, fileId } = await context.params;
    const file = await getQmsTrainingFileById(auth.db, String(id || ''), String(fileId || ''));
    if (!file) {
      return NextResponse.json({ error: 'Arquivo nao encontrado.' }, { status: 404 });
    }

    const provider = getStorageProviderByName(file.storageProvider);
    const stream = await provider.getFileStream({
      bucket: file.storageBucket,
      key: file.storageKey,
    });
    const webStream = Readable.toWeb(stream) as ReadableStream;

    const { searchParams } = new URL(request.url);
    const disposition = withDisposition(searchParams.get('disposition'));

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Erro ao baixar arquivo de treinamento:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao baixar arquivo.' },
      { status }
    );
  }
}
