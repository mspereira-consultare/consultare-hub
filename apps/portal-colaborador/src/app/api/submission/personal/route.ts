import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  savePortalPersonalDraft,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request: Request) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const body = await request.json();
    const data = await savePortalPersonalDraft(db, session.employeeId, session.inviteId, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao salvar dados pessoais do portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao salvar dados pessoais.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
