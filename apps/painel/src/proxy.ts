import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SHARED_NEXTAUTH_SESSION_COOKIE_NAME } from '@consultare/core/auth';
import { PAGE_DEFS, getPageFromPath, hasAnyRefresh, hasPermission } from '@/lib/permissions';

const isApiPath = (pathname: string) => pathname.startsWith('/api/');

const getApiAction = (method: string) => {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'view' as const;
  return 'edit' as const;
};

const denyApi = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

const firstAllowedPage = (permissions: unknown, roleRaw: string) => {
  for (const page of PAGE_DEFS) {
    if (hasPermission(permissions, page.key, 'view', roleRaw)) return page.path;
  }
  return '/dashboard';
};

type PermissionToken = {
  permissions?: unknown;
  role?: string;
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: SHARED_NEXTAUTH_SESSION_COOKIE_NAME,
  });
  const tokenData = token as PermissionToken | null;

  if (!token) {
    if (isApiPath(pathname)) {
      return denyApi(401, 'Unauthenticated');
    }
    if (!isLoginPage) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (isLoginPage) {
    const fallback = firstAllowedPage(tokenData?.permissions, String(tokenData?.role || 'OPERADOR'));
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  if (pathname === '/api/admin/refresh') {
    const canRefreshSomething = hasAnyRefresh(tokenData?.permissions, String(tokenData?.role || 'OPERADOR'));
    if (!canRefreshSomething) {
      return denyApi(403, 'Forbidden');
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/admin/goals/dashboard')) {
    const role = String(tokenData?.role || 'OPERADOR');
    const permissions = tokenData?.permissions;
    const allowed =
      hasPermission(permissions, 'metas_dashboard', 'view', role) ||
      hasPermission(permissions, 'metas', 'view', role);

    if (allowed) {
      return NextResponse.next();
    }

    return denyApi(403, 'Forbidden');
  }

  const pageKey = getPageFromPath(pathname);
  if (!pageKey) {
    return NextResponse.next();
  }

  const action = isApiPath(pathname) ? getApiAction(request.method) : ('view' as const);
  const allowed = hasPermission(tokenData?.permissions, pageKey, action, String(tokenData?.role || 'OPERADOR'));

  if (allowed) {
    return NextResponse.next();
  }

  if (isApiPath(pathname)) {
    return denyApi(403, 'Forbidden');
  }

  const fallback = firstAllowedPage(tokenData?.permissions, String(tokenData?.role || 'OPERADOR'));
  return NextResponse.redirect(new URL(fallback, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-color.png).*)'],
};
