import { getDbConnection } from '@/lib/db';
import type { UserRole } from '@/lib/permissions';
import {
  ensurePermissionTable,
  ensureAccessProfileTables,
  loadUserPermissionMatrix,
  loadUserPermissionResolution,
  saveUserPermissionMatrix,
  saveUserPermissionResolution,
  seedPermissionDefaults,
  listAccessProfiles,
  getAccessProfile,
  assignUserAccessProfile,
  areAccessProfileTablesAvailable,
  countUserPermissionOverrides,
  deleteUserAccessProfileAssignmentIfPresent,
  getDefaultAccessProfileKeyForRole,
} from '@consultare/core/permissions-server';

export {
  ensurePermissionTable,
  ensureAccessProfileTables,
  loadUserPermissionMatrix,
  loadUserPermissionResolution,
  saveUserPermissionMatrix,
  saveUserPermissionResolution,
  seedPermissionDefaults,
  listAccessProfiles,
  getAccessProfile,
  assignUserAccessProfile,
  areAccessProfileTablesAvailable,
  countUserPermissionOverrides,
  deleteUserAccessProfileAssignmentIfPresent,
  getDefaultAccessProfileKeyForRole,
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
