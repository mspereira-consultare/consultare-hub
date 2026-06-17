import { NextResponse } from 'next/server';
import { ensureUserAccountColumns } from '@consultare/core/user-accounts';
import { requirePagePermission } from '@/lib/authz';
import { listAccessProfiles } from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
type DbRow = Record<string, unknown>;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro interno';
const isMysql =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const userEmployeeJoinClause = isMysql
  ? "e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci"
  : 'e.id = u.employee_id';
const departmentUnionSql = isMysql
  ? `
        SELECT DISTINCT TRIM(value) AS value
        FROM (
          SELECT department COLLATE utf8mb4_unicode_ci AS value FROM users
          UNION ALL
          SELECT department COLLATE utf8mb4_unicode_ci AS value FROM employees
        ) departments
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value ASC
      `
  : `
        SELECT DISTINCT TRIM(value) AS value
        FROM (
          SELECT department AS value FROM users
          UNION ALL
          SELECT department AS value FROM employees
        ) departments
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value ASC
      `;

export async function GET() {
  try {
    const auth = await requirePagePermission('users', 'view');
    if (!auth.ok) return auth.response;

    const db = auth.db;
    await ensureUserAccountColumns(db);

    const [employeeRows, userRows, accessProfiles] = await Promise.all([
      db.query(
        `
        SELECT
          e.id,
          e.full_name,
          e.department,
          e.job_title,
          e.status,
          u.id AS linked_user_id
        FROM employees e
        LEFT JOIN users u ON ${userEmployeeJoinClause}
        ORDER BY e.full_name ASC
        `
      ),
      db.query(
        departmentUnionSql
      ),
      listAccessProfiles(db),
    ]);

    const employees = employeeRows.map((row: DbRow) => ({
      id: clean(row.id),
      fullName: clean(row.full_name),
      department: clean(row.department) || null,
      jobTitle: clean(row.job_title) || null,
      status: clean(row.status) || 'ATIVO',
      linkedUserId: clean(row.linked_user_id) || null,
    }));

    const departments = Array.from(
      new Set(
        userRows
          .map((row: DbRow) => clean(row.value))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return NextResponse.json({
      status: 'success',
      data: {
        employees,
        departments,
        accessProfiles: accessProfiles.map((profile) => ({
          profileKey: profile.profileKey,
          label: profile.label,
          description: profile.description,
          isSystem: profile.isSystem,
          isActive: profile.isActive,
          sortOrder: profile.sortOrder,
          permissions: profile.permissions,
        })),
      },
    });
  } catch (error: unknown) {
    console.error('Erro GET user options:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
