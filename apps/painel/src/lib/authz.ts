import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PageKey, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

type SessionUser = {
  id?: string;
  role?: string;
};

export type PagePermissionAuth = {
  ok: true;
  db: ReturnType<typeof getDbConnection>;
  userId: string;
  role: string;
  permissions: unknown;
};

export type PagePermissionDenied = {
  ok: false;
  status: 401 | 403;
  error: string;
  response: NextResponse;
};

export const denyJson = (status: 401 | 403, error: string) =>
  NextResponse.json({ error }, { status });

export const requirePagePermission = async (
  pageKey: PageKey,
  action: PermissionAction,
  options?: {
    error?: string;
  }
): Promise<PagePermissionAuth | PagePermissionDenied> => {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser | undefined;
  if (!sessionUser?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Nao autenticado',
      response: denyJson(401, 'Nao autenticado'),
    };
  }

  const db = getDbConnection();
  const userId = String(sessionUser.id);
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, pageKey, action, role);

  if (!allowed) {
    const error = options?.error || 'Sem permissao';
    return {
      ok: false,
      status: 403,
      error,
      response: denyJson(403, error),
    };
  }

  return {
    ok: true,
    db,
    userId,
    role,
    permissions,
  };
};

export const requireAnyPagePermission = async (
  checks: Array<{ pageKey: PageKey; action: PermissionAction }>,
  options?: {
    error?: string;
  }
): Promise<PagePermissionAuth | PagePermissionDenied> => {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser | undefined;
  if (!sessionUser?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Nao autenticado',
      response: denyJson(401, 'Nao autenticado'),
    };
  }

  const db = getDbConnection();
  const userId = String(sessionUser.id);
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = checks.some((check) => hasPermission(permissions, check.pageKey, check.action, role));

  if (!allowed) {
    const error = options?.error || 'Sem permissao';
    return {
      ok: false,
      status: 403,
      error,
      response: denyJson(403, error),
    };
  }

  return {
    ok: true,
    db,
    userId,
    role,
    permissions,
  };
};
