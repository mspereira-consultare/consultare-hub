import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import { getEquipmentWorkOrderFileById } from '@/lib/equipamentos/work_orders';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ fileId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { fileId } = await context.params;
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const file = await getEquipmentWorkOrderFileById(auth.db, String(fileId || ''));
    if (!file) return NextResponse.json({ error: 'Arquivo da OS não encontrado.' }, { status: 404 });

    const provider = getStorageProviderByName(file.storageProvider);
    const stream = await provider.getFileStream({ bucket: file.storageBucket, key: file.storageKey });
    const fileName = file.originalName || `os-${file.id}`;

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar arquivo da OS:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao baixar arquivo da OS.') }, { status: errorStatus(error) });
  }
}
