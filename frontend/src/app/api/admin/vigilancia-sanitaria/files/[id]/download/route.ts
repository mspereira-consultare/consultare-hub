import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { getSurveillanceFileById } from '@/lib/vigilancia_sanitaria/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const file = await getSurveillanceFileById(auth.db, String(id || ''));
    if (!file) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(file.storageProvider);
    const stream = await provider.getFileStream({ bucket: file.storageBucket, key: file.storageKey });
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const fileName = file.originalName || `arquivo-${file.id}`;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Erro ao baixar arquivo de Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao baixar arquivo.' }, { status: Number(error?.status) || 500 });
  }
}
