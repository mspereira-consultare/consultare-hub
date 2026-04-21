import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  getEmployeePortalOverview,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const data = await getEmployeePortalOverview(db, session.employeeId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao carregar portal do colaborador:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao carregar portal.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
