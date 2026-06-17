import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { PAGE_DEFS, PERMISSION_MODULES } from '@/lib/permissions';
import { requirePagePermission } from '@/lib/authz';
import {
  listAccessProfiles,
  loadUserPermissionResolution,
  saveUserPermissionMatrix,
  saveUserPermissionResolution,
} from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro interno';

export async function GET(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'view');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 });
    }

    const db = auth.db;
    const userRows = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }

    const resolution = await loadUserPermissionResolution(db, String(user.id), String(user.role || 'OPERADOR'));
    const profiles = await listAccessProfiles(db);
    return NextResponse.json({
      status: 'success',
      userId: String(user.id),
      role: String(user.role || 'OPERADOR'),
      pages: PAGE_DEFS,
      modules: PERMISSION_MODULES,
      accessProfiles: profiles,
      assignedProfileKey: resolution.assignedProfileKey,
      effectiveProfileKey: resolution.effectiveProfileKey,
      profile: resolution.profile,
      inheritedPermissions: resolution.inheritedMatrix,
      userOverrides: resolution.userOverrides,
      overrideCount: resolution.overrideCount,
      permissions: resolution.effectiveMatrix,
    });
  } catch (error: unknown) {
    console.error('Erro GET User Permissions:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'edit');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const permissions = body?.permissions;
    const profileKey = clean(body?.profileKey ?? body?.accessProfileKey);

    if (!userId || !permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'Payload invalido' }, { status: 400 });
    }

    const db = auth.db;
    const userRows = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    }

    if (profileKey) {
      await saveUserPermissionResolution(db, String(user.id), String(user.role || 'OPERADOR'), {
        profileKey,
        permissions,
        actorUserId: auth.userId,
      });
    } else {
      await saveUserPermissionMatrix(db, String(user.id), String(user.role || 'OPERADOR'), permissions);
    }

    invalidateCache('admin:');
    return NextResponse.json({ status: 'success' });
  } catch (error: unknown) {
    console.error('Erro POST User Permissions:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
