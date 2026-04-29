import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import { acknowledgePortalIntranetAccess } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const body = await request.json();
    const credentialId = String(body?.credentialId || '').trim();
    if (!credentialId) {
      return NextResponse.json({ error: 'credentialId é obrigatório.' }, { status: 400 });
    }
    const data = await acknowledgePortalIntranetAccess(db, session.employeeId, credentialId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao confirmar credencial da intranet no portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao confirmar credencial da intranet.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
