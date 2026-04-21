import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  getPortalSubmissionDocumentById,
  removePortalSubmissionDocument,
} from '@consultare/core/employee-portal/repository';
import { getStorageProviderByName } from '@consultare/core/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const { documentId } = await context.params;
    const document = await getPortalSubmissionDocumentById(db, String(documentId || ''));

    if (!document || document.employeeId !== session.employeeId) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    }

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
        'Cache-Control': 'private, max-age=300',
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

export async function DELETE(request: Request, context: ParamsContext) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const { documentId } = await context.params;
    const data = await removePortalSubmissionDocument(db, session.employeeId, String(documentId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao remover documento do portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao remover documento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
