import { notFound } from 'next/navigation';
import { getDbConnection } from '@/lib/db';
import { ensureTaskTables } from '@consultare/core/tasks/repository';
import { ExecutiveTasksClient } from './tasks-admin-client';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

const clean = (value: unknown) => String(value ?? '').trim();

export default async function ExecutiveTasksPage() {
  const auth = await requireTaskGovernanceAccess('view');
  if (!auth.ok) notFound();

  const db = getDbConnection();
  await ensureTaskTables(db);
  const [userRows, taskDepartmentRows, userDepartmentRows] = await Promise.all([
    db.query(
      `
      SELECT id, name, email, role, department
      FROM users
      WHERE UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO'
      ORDER BY name ASC
      `
    ),
    db.query(
      `
      SELECT DISTINCT TRIM(department) AS value
      FROM tasks
      WHERE department IS NOT NULL AND TRIM(department) <> ''
      ORDER BY value ASC
      `
    ),
    db.query(
      `
      SELECT DISTINCT TRIM(department) AS value
      FROM users
      WHERE department IS NOT NULL AND TRIM(department) <> ''
      ORDER BY value ASC
      `
    ),
  ]);

  const users: UserOption[] = (userRows as Array<Record<string, unknown>>).map((row) => ({
    id: clean(row.id),
    name: clean(row.name) || clean(row.email) || 'Usuário',
    email: clean(row.email),
    role: clean(row.role) || 'OPERADOR',
    department: clean(row.department),
  }));

  const departments = Array.from(
    new Set(
      [...taskDepartmentRows, ...userDepartmentRows]
        .map((row: any) => clean(row.value))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return <ExecutiveTasksClient users={users} departments={departments} canEdit={auth.role === 'ADMIN' || auth.scope?.profileKey === 'diretoria_gerencia_adm'} />;
}
