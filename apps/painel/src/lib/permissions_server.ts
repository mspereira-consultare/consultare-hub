import { getDbConnection } from '@/lib/db';
import type { UserRole } from '@/lib/permissions';
import {
  ensurePermissionTable,
  loadUserPermissionMatrix,
  saveUserPermissionMatrix,
  seedPermissionDefaults,
} from '@consultare/core/permissions-server';

export {
  ensurePermissionTable,
  loadUserPermissionMatrix,
  saveUserPermissionMatrix,
  seedPermissionDefaults,
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
