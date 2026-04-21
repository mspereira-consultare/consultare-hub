import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import {
  EMPLOYEE_PORTAL_COOKIE_NAME,
  EMPLOYEE_PORTAL_SESSION_TTL_HOURS,
} from '@consultare/core/employee-portal/constants';
import { getPortalRequestContext } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import { authenticateEmployeePortal } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDbConnection();
    const result = await authenticateEmployeePortal(
      db,
      {
        token: String(body?.token || ''),
        cpf: String(body?.cpf || ''),
        birthDate: String(body?.birthDate || ''),
      },
      getPortalRequestContext(request)
    );

    const response = NextResponse.json({
      status: 'success',
      data: {
        expiresAt: result.session.expiresAt,
      },
    });

    response.cookies.set(EMPLOYEE_PORTAL_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: EMPLOYEE_PORTAL_SESSION_TTL_HOURS * 60 * 60,
    });

    return response;
  } catch (error: unknown) {
    console.error('Erro no login do portal do colaborador:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao validar acesso.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
