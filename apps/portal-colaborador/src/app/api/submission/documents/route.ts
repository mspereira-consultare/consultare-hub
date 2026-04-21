import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { getStorageProvider } from '@consultare/core/storage';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  checksumBuffer,
  createPortalSubmissionDocument,
  getOrCreateEmployeePortalSubmission,
  validatePortalDocumentType,
} from '@consultare/core/employee-portal/repository';
import {
  buildPortalStorageKey,
  validatePortalUploadFile,
} from '@consultare/core/employee-portal/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let uploaded: { bucket: string | null; key: string } | null = null;
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado.' }, { status: 400 });
    }

    const docType = validatePortalDocumentType(String(formData.get('docType') || ''));
    const { originalName, mimeType, sizeBytes } = validatePortalUploadFile(filePart);
    const submission = await getOrCreateEmployeePortalSubmission(db, session.employeeId, session.inviteId);
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());
    const checksum = checksumBuffer(bodyBuffer);
    const key = buildPortalStorageKey(session.employeeId, submission.id, docType, originalName);
    const provider = getStorageProvider();

    const upload = await provider.uploadFile({
      key,
      body: bodyBuffer,
      contentType: mimeType,
      metadata: {
        employeeId: session.employeeId,
        submissionId: submission.id,
        docType,
        source: 'employee-portal',
      },
    });
    uploaded = { bucket: upload.bucket, key: upload.key };

    const data = await createPortalSubmissionDocument(
      db,
      session.employeeId,
      session.inviteId,
      {
        docType,
        originalName,
        mimeType,
        sizeBytes,
        checksum,
        issueDate: String(formData.get('issueDate') || '').trim() || null,
        expiresAt: String(formData.get('expiresAt') || '').trim() || null,
        notes: String(formData.get('notes') || '').trim() || null,
        storageProvider: upload.provider,
        storageBucket: upload.bucket,
        storageKey: upload.key,
      }
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    if (uploaded?.key) {
      try {
        await getStorageProvider().deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
      } catch (cleanupError) {
        console.error('Falha ao limpar upload do portal apos erro:', cleanupError);
      }
    }

    console.error('Erro no upload do portal do colaborador:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno no upload.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
