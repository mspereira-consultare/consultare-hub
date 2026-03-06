import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { getRepassePdfArtifactById } from '@/lib/repasses/repository';
import { getStorageProviderByName } from '@/lib/storage';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ artifactId: string }>;
};

const withDisposition = (value: string | null) =>
  String(value || 'attachment').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment';

export async function GET(request: Request, context: ParamsContext) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { artifactId } = await context.params;
    const artifact = await getRepassePdfArtifactById(auth.db, String(artifactId || '').trim());
    if (!artifact) {
      return NextResponse.json({ error: 'Arquivo nao encontrado.' }, { status: 404 });
    }

    const provider = getStorageProviderByName(artifact.storageProvider);
    const stream = await provider.getFileStream({
      bucket: artifact.storageBucket,
      key: artifact.storageKey,
    });
    const webStream = Readable.toWeb(stream) as ReadableStream;

    const { searchParams } = new URL(request.url);
    const disposition = withDisposition(searchParams.get('disposition'));

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(
          artifact.fileName
        )}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Erro no download de artefato PDF de repasse:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no download do PDF de repasse.' },
      { status }
    );
  }
}
