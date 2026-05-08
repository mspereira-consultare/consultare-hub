import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { ensureUserAccountColumns } from '@consultare/core/user-accounts';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const isMysql =
  String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' || !!process.env.MYSQL_URL || !!process.env.MYSQL_PUBLIC_URL;
const userEmployeeJoinClause = isMysql
  ? "e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci"
  : 'e.id = u.employee_id';

export async function GET() {
  try {
    const db = getDbConnection();
    await ensureUserAccountColumns(db);

    const [employeeRows, userRows] = await Promise.all([
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
        `
        SELECT DISTINCT TRIM(value) AS value
        FROM (
          SELECT department AS value FROM users
          UNION ALL
          SELECT department AS value FROM employees
        ) departments
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value ASC
        `
      ),
    ]);

    const employees = employeeRows.map((row: any) => ({
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
          .map((row: any) => clean(row.value))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return NextResponse.json({
      status: 'success',
      data: {
        employees,
        departments,
      },
    });
  } catch (error: any) {
    console.error('Erro GET user options:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
