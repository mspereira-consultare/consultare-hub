import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import { getEmployeePortalProductionDashboard } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const url = new URL(request.url);
    const data = await getEmployeePortalProductionDashboard(db, session.employeeId, {
      serviceDate: url.searchParams.get('serviceDate') || undefined,
      entryType: url.searchParams.get('entryType') || undefined,
      matchStatus: url.searchParams.get('matchStatus') || undefined,
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao carregar dashboard de produção do portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao carregar produção.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
