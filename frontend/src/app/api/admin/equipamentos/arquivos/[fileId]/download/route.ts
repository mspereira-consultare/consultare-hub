import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { getEquipmentFileById } from '@/lib/equipamentos/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ fileId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { fileId } = await context.params;
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const file = await getEquipmentFileById(auth.db, String(fileId || ''));
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
    console.error('Erro ao baixar arquivo do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao baixar arquivo.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
