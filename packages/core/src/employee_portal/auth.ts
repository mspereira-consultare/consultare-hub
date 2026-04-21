import 'server-only';

import type { DbInterface } from '../db';
import { EMPLOYEE_PORTAL_COOKIE_NAME } from './constants';
import {
  EmployeePortalError,
  getEmployeePortalSessionByToken,
} from './repository';
import type { EmployeePortalSession } from './types';

const parseCookies = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>();
  for (const part of String(cookieHeader || '').split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join('=') || ''));
  }
  return cookies;
};

export const getPortalSessionTokenFromRequest = (request: Request) =>
  parseCookies(request.headers.get('cookie')).get(EMPLOYEE_PORTAL_COOKIE_NAME) || '';

export const requireEmployeePortalSession = async (
  db: DbInterface,
  request: Request
): Promise<EmployeePortalSession> => {
  const token = getPortalSessionTokenFromRequest(request);
  const session = await getEmployeePortalSessionByToken(db, token);
  if (!session) {
    throw new EmployeePortalError('Sessão expirada. Acesse novamente pelo link do portal.', 401);
  }
  return session;
};

export const getPortalRequestContext = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0]?.trim() : null;
  return {
    ipAddress,
    userAgent: request.headers.get('user-agent'),
  };
};
