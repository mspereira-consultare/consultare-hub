import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { EMPLOYEE_PORTAL_COOKIE_NAME } from '@consultare/core/employee-portal/constants';
import { getPortalSessionTokenFromRequest } from '@consultare/core/employee-portal/auth';
import { revokeEmployeePortalSession } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const db = getDbConnection();
  const token = getPortalSessionTokenFromRequest(request);
  if (token) {
    await revokeEmployeePortalSession(db, token);
  }

  const response = NextResponse.json({ status: 'success' });
  response.cookies.set(EMPLOYEE_PORTAL_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

