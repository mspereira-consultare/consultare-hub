import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import { getStorageProviderByName } from '@/lib/storage';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  getPortalSubmissionDocumentById,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { documentId } = await context.params;
    const document = await getPortalSubmissionDocumentById(auth.db, String(documentId || ''));
    if (!document) return NextResponse.json({ error: 'Documento nao encontrado.' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const provider = getStorageProviderByName(document.storageProvider);
    const stream = await provider.getFileStream({
      bucket: document.storageBucket,
      key: document.storageKey,
    });
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
    console.error('Erro ao baixar documento do portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao baixar documento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
