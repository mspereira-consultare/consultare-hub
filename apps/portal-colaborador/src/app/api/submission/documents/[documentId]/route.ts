import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  removePortalSubmissionDocument,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

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
