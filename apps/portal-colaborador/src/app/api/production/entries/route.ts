import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import { createPortalProductionEntry } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const body = await request.json();
    const data = await createPortalProductionEntry(db, session.employeeId, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar lançamento de produção no portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao criar lançamento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
