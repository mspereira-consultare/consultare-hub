import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import {
  getProfessionalDocumentById,
  registerDocumentDownloadAudit,
} from '@/lib/profissionais/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { documentId } = await context.params;
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const document = await getProfessionalDocumentById(auth.db, String(documentId || ''));
    if (!document) {
      return NextResponse.json({ error: 'Documento nao encontrado.' }, { status: 404 });
    }

    const provider = getStorageProviderByName(document.storageProvider);
    const stream = await provider.getFileStream({
      bucket: document.storageBucket,
      key: document.storageKey,
    });

    await registerDocumentDownloadAudit(
      auth.db,
      document.professionalId,
      document.id,
      auth.userId
    );

    const webStream = Readable.toWeb(stream) as ReadableStream;
    const fileName = document.originalName || `documento-${document.id}`;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar documento:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
