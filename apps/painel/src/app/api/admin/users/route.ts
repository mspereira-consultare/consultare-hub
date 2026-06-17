import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';
import bcrypt from 'bcryptjs';
import { ensureUserAccountColumns } from '@consultare/core/user-accounts';
import { listExecutiveProfilePreview } from '@/lib/dashboard_executive/repository';
import { requirePagePermission } from '@/lib/authz';
import {
  assignUserAccessProfile,
  areAccessProfileTablesAvailable,
  deleteUserAccessProfileAssignmentIfPresent,
  getDefaultAccessProfileKeyForRole,
  loadUserPermissionResolution,
} from '@/lib/permissions_server';

const clean = (value: unknown) => String(value ?? '').trim();
type DbRow = Record<string, unknown>;
class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro interno';
const errorStatus = (error: unknown) =>
  error instanceof HttpError
    ? error.status
    : typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status || 500)
      : 500;
const isMysql =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const userEmployeeJoinClause = isMysql
  ? "e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci"
  : 'e.id = u.employee_id';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;
const USERS_CACHE_VERSION = 'v4';

const isActiveAdmin = (role: unknown, status: unknown) =>
  clean(role).toUpperCase() === 'ADMIN' && clean(status || 'ATIVO').toUpperCase() === 'ATIVO';

const ensureCanChangeAdminState = async (
  db: ReturnType<typeof getDbConnection>,
  userId: string,
  nextRole?: unknown,
  nextStatus?: unknown
) => {
  const rows = await db.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [userId]);
  const current = rows[0];
  if (!current) return;

  const wasActiveAdmin = isActiveAdmin(current.role, current.status);
  const willBeActiveAdmin = isActiveAdmin(nextRole ?? current.role, nextStatus ?? current.status);
  if (!wasActiveAdmin || willBeActiveAdmin) return;

  const countRows = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM users
    WHERE UPPER(TRIM(COALESCE(role, ''))) = 'ADMIN'
      AND UPPER(TRIM(COALESCE(status, 'ATIVO'))) = 'ATIVO'
    `
  );
  if (Number(countRows[0]?.total || 0) <= 1) {
    throw new HttpError('Nao e possivel remover, rebaixar ou inativar o ultimo administrador ativo.', 400);
  }
};

const shouldPersistAccessProfileAssignment = async (
  db: ReturnType<typeof getDbConnection>,
  roleRaw: string,
  profileKeyRaw: string | null
) => {
  const profileKey = clean(profileKeyRaw);
  if (!profileKey) return false;

  const defaultProfileKey = getDefaultAccessProfileKeyForRole(roleRaw);
  if (profileKey !== defaultProfileKey) return true;

  return areAccessProfileTablesAvailable(db);
};

// --- LISTAR USUÁRIOS (GET) ---
export async function GET(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'view');
    if (!auth.ok) return auth.response;

    const cacheKey = buildCacheKey(`admin:users:${USERS_CACHE_VERSION}`, request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const db = auth.db;
      await ensureUserAccountColumns(db);
    
      const result = await db.query(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.username,
            u.role,
            u.department,
            u.status,
            u.last_access,
            u.employee_id,
            e.full_name AS employee_name
          FROM users u
          LEFT JOIN employees e ON ${userEmployeeJoinClause}
          ORDER BY u.name ASC
      `);

      const preview = await listExecutiveProfilePreview(db);
      const previewMap = new Map(preview.map((item) => [item.userId, item]));

      return Promise.all(result.map(async (row: DbRow) => {
        const executive = previewMap.get(clean(row.id));
        const resolution = await loadUserPermissionResolution(db, clean(row.id), clean(row.role) || 'OPERADOR');
        return {
          ...row,
          access_profile_key: resolution.effectiveProfileKey,
          access_profile_assigned_key: resolution.assignedProfileKey,
          access_profile_label: resolution.profile?.label || resolution.effectiveProfileKey,
          permission_override_count: resolution.overrideCount,
          executive_group_label: executive?.executiveGroupLabel || null,
          executive_profile_label: executive?.profileLabel || null,
          executive_issue: executive?.configurationIssue || null,
        };
      }));
    });

    return NextResponse.json(cached);
  } catch (error: unknown) {
    console.error("Erro GET Users:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}

// --- CRIAR OU EDITAR USUÁRIO (POST) ---
export async function POST(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'edit');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, name, email, username, password, role, department, status, employeeId, accessProfileKey } = body;
    const db = auth.db;
    await ensureUserAccountColumns(db);
    const cleanedName = clean(name);
    const cleanedEmail = clean(email);
    const cleanedUsername = clean(username);
    const cleanedEmployeeId = clean(employeeId) || null;
    const cleanedRole = clean(role) || 'OPERADOR';
    const cleanedStatus = clean(status) || 'ATIVO';
    const cleanedAccessProfileKey = clean(accessProfileKey) || null;

    if (!cleanedName || !cleanedUsername) {
      return NextResponse.json({ error: 'Nome e usuário são obrigatórios.' }, { status: 400 });
    }

    if (cleanedEmployeeId) {
      const employeeRows = await db.query('SELECT id FROM employees WHERE id = ? LIMIT 1', [cleanedEmployeeId]);
      if (!employeeRows[0]) {
        return NextResponse.json({ error: 'Colaborador vinculado não encontrado.' }, { status: 400 });
      }

      const employeeLinkRows = await db.query(
        'SELECT id, name FROM users WHERE employee_id = ? AND (? IS NULL OR id <> ?) LIMIT 1',
        [cleanedEmployeeId, id || null, id || null]
      );
      if (employeeLinkRows[0]) {
        return NextResponse.json(
          { error: `Este colaborador já está vinculado ao usuário ${clean(employeeLinkRows[0].name) || 'existente'}.` },
          { status: 409 }
        );
      }
    }

    if (id) {
      await ensureCanChangeAdminState(db, clean(id), cleanedRole, cleanedStatus);

      if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, employee_id = ?, password = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, hash, cleanedRole, department, cleanedStatus, id]
        );
      } else {
        await db.execute(
            `UPDATE users SET name = ?, email = ?, username = ?, employee_id = ?, role = ?, department = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
            [cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, cleanedRole, department, cleanedStatus, id]
        );
      }

      if (cleanedAccessProfileKey && (await shouldPersistAccessProfileAssignment(db, cleanedRole, cleanedAccessProfileKey))) {
        await assignUserAccessProfile(db, clean(id), cleanedAccessProfileKey, auth.userId);
      }
      
      invalidateCache('admin:');
      return NextResponse.json({ success: true, action: 'updated' });

    } else {
      if (!password) return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 });
      
      const hash = await bcrypt.hash(password, 10);
      const newId = crypto.randomUUID();

      await db.execute(
        `INSERT INTO users (id, name, email, username, employee_id, password, role, department, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [newId, cleanedName, cleanedEmail, cleanedUsername, cleanedEmployeeId, hash, cleanedRole, department, cleanedStatus]
      );

      const profileKeyToAssign = cleanedAccessProfileKey || getDefaultAccessProfileKeyForRole(cleanedRole);
      if (await shouldPersistAccessProfileAssignment(db, cleanedRole, profileKeyToAssign)) {
        await assignUserAccessProfile(db, newId, profileKeyToAssign, auth.userId);
      }
      
      invalidateCache('admin:');
      return NextResponse.json({ success: true, id: newId });
    }

  } catch (error: unknown) {
    console.error("Erro POST Users:", error);
    const message = errorMessage(error);
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (
      message.includes('UNIQUE constraint failed') ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'ER_DUP_ENTRY'
    ) {
      return NextResponse.json({ error: 'Este usuário já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

// --- DELETAR USUÁRIO (DELETE) ---
export async function DELETE(request: Request) {
  try {
    const auth = await requirePagePermission('users', 'edit');
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const db = auth.db;
    await ensureUserAccountColumns(db);
    await ensureCanChangeAdminState(db, id, 'DELETED', 'INATIVO');

    await db.execute('DELETE FROM user_page_permissions WHERE user_id = ?', [id]);
    await deleteUserAccessProfileAssignmentIfPresent(db, id);
    
    await db.execute(
        "DELETE FROM users WHERE id = ?",
        [id]
    );

    invalidateCache('admin:');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Erro DELETE User:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}
