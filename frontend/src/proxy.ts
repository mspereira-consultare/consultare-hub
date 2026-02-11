import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

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
    const fallback = firstAllowedPage((token as any).permissions, String((token as any).role || 'OPERADOR'));
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  if (pathname === '/api/admin/refresh') {
    const canRefreshSomething = hasAnyRefresh((token as any).permissions, String((token as any).role || 'OPERADOR'));
    if (!canRefreshSomething) {
      return denyApi(403, 'Forbidden');
    }
    return NextResponse.next();
  }

  const pageKey = getPageFromPath(pathname);
  if (!pageKey) {
    return NextResponse.next();
  }

  const action = isApiPath(pathname) ? getApiAction(request.method) : ('view' as const);
  const allowed = hasPermission((token as any).permissions, pageKey, action, String((token as any).role || 'OPERADOR'));

  if (allowed) {
    return NextResponse.next();
  }

  if (isApiPath(pathname)) {
    return denyApi(403, 'Forbidden');
  }

  const fallback = firstAllowedPage((token as any).permissions, String((token as any).role || 'OPERADOR'));
  return NextResponse.redirect(new URL(fallback, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-color.png).*)'],
};
