import { getDbConnection, type DbInterface } from '@/lib/db';
import {
  PAGE_DEFS,
  PAGE_KEYS,
  type PageKey,
  type PermissionMatrix,
  type UserRole,
  getDefaultMatrixByRole,
  sanitizeMatrix,
} from '@/lib/permissions';

const toDbFlag = (value: boolean) => (value ? 1 : 0);
const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '').trim() === '1';
};

export const ensurePermissionTable = async (db: DbInterface) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_page_permissions (
      user_id VARCHAR(64) NOT NULL,
      page_key VARCHAR(64) NOT NULL,
      can_view INTEGER NOT NULL,
      can_edit INTEGER NOT NULL,
      can_refresh INTEGER NOT NULL,
      updated_at TEXT,
      PRIMARY KEY (user_id, page_key)
    )
  `);
};

export const seedPermissionDefaults = async (db: DbInterface, userId: string, roleRaw: string) => {
  const defaults = getDefaultMatrixByRole(roleRaw);
  for (const page of PAGE_DEFS) {
    const row = defaults[page.key];
    await db.execute(
      `
      INSERT OR IGNORE INTO user_page_permissions
      (user_id, page_key, can_view, can_edit, can_refresh, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      `,
      [userId, page.key, toDbFlag(row.view), toDbFlag(row.edit), toDbFlag(row.refresh)]
    );
  }
};

export const loadUserPermissionMatrix = async (
  db: DbInterface,
  userId: string,
  roleRaw: string
): Promise<PermissionMatrix> => {
  await ensurePermissionTable(db);
  await seedPermissionDefaults(db, userId, roleRaw);

  const rows = await db.query(
    `
    SELECT page_key, can_view, can_edit, can_refresh
    FROM user_page_permissions
    WHERE user_id = ?
    `,
    [userId]
  );

  const matrix = getDefaultMatrixByRole(roleRaw);
  for (const row of rows) {
    const key = String(row.page_key || '') as PageKey;
    if (!PAGE_KEYS.includes(key)) continue;
    matrix[key] = {
      view: toBool(row.can_view),
      edit: toBool(row.can_edit),
      refresh: toBool(row.can_refresh),
    };
  }
  return matrix;
};

export const saveUserPermissionMatrix = async (
  db: DbInterface,
  userId: string,
  roleRaw: string,
  matrixRaw: unknown
) => {
  await ensurePermissionTable(db);
  const matrix = sanitizeMatrix(matrixRaw, roleRaw);

  for (const key of PAGE_KEYS) {
    const item = matrix[key];
    await db.execute(
      `
      INSERT INTO user_page_permissions
      (user_id, page_key, can_view, can_edit, can_refresh, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, page_key) DO UPDATE SET
        can_view = excluded.can_view,
        can_edit = excluded.can_edit,
        can_refresh = excluded.can_refresh,
        updated_at = excluded.updated_at
      `,
      [userId, key, toDbFlag(item.view), toDbFlag(item.edit), toDbFlag(item.refresh)]
    );
  }
};

export const getPermissionDb = () => getDbConnection();

export const getUserPermissions = async (userId: string, roleRaw: string) => {
  const db = getPermissionDb();
  return loadUserPermissionMatrix(db, userId, roleRaw);
};

export const updateUserPermissions = async (userId: string, roleRaw: UserRole | string, matrixRaw: unknown) => {
  const db = getPermissionDb();
  await saveUserPermissionMatrix(db, userId, roleRaw, matrixRaw);
};

