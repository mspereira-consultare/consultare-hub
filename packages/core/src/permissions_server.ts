import { randomUUID } from 'crypto';
import { runInTransaction, type DbInterface } from './db';
import {
  PAGE_DEFS,
  PAGE_KEYS,
  createEmptyMatrix,
  type PageKey,
  type PagePermission,
  type PermissionMatrix,
  type UserRole,
  getDefaultMatrixByRole,
  sanitizeMatrix,
} from './permissions';

const SYSTEM_ACCESS_PROFILE_ROLES: UserRole[] = ['ADMIN', 'GESTOR', 'OPERADOR', 'INTRANET'];
const SYSTEM_ACCESS_PROFILE_META: Record<UserRole, { label: string; description: string; sortOrder: number }> = {
  ADMIN: {
    label: 'Administrador',
    description: 'Perfil de sistema com acesso completo ao painel, Intranet e administracao.',
    sortOrder: 10,
  },
  GESTOR: {
    label: 'Gestor',
    description: 'Perfil de sistema para liderancas com acesso gerencial amplo.',
    sortOrder: 20,
  },
  OPERADOR: {
    label: 'Operador',
    description: 'Perfil de sistema para operacao diaria com acessos restritos.',
    sortOrder: 30,
  },
  INTRANET: {
    label: 'Colaborador Intranet',
    description: 'Perfil de sistema para colaboradores com portal, tarefas e pacote operacional minimo.',
    sortOrder: 40,
  },
};

export type AccessProfile = {
  profileKey: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  permissions: PermissionMatrix;
};

export type AccessProfileAssignment = {
  userId: string;
  profileKey: string;
  assignedAt: string | null;
  assignedBy: string | null;
};

export type PermissionDecision = {
  allowed: boolean;
  pageKey: PageKey;
  action: keyof PagePermission;
  profileKey: string;
  source: 'profile' | 'user_override';
};

export type UserPermissionResolution = {
  userId: string;
  role: string;
  assignedProfileKey: string | null;
  effectiveProfileKey: string;
  profile: AccessProfile | null;
  inheritedMatrix: PermissionMatrix;
  effectiveMatrix: PermissionMatrix;
  userOverrides: Partial<Record<PageKey, PagePermission>>;
  overrideCount: number;
};

const toDbFlag = (value: boolean) => (value ? 1 : 0);
const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '').trim() === '1';
};
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();

let permissionsTableEnsured = false;
let accessProfileTablesEnsured = false;
let accessProfileTablesReadable: boolean | null = null;

const cloneMatrix = (matrix: PermissionMatrix): PermissionMatrix => {
  const next = {} as PermissionMatrix;
  for (const key of PAGE_KEYS) {
    next[key] = { ...matrix[key] };
  }
  return next;
};

const permissionsEqual = (a: PagePermission, b: PagePermission) =>
  Boolean(a.view) === Boolean(b.view) &&
  Boolean(a.edit) === Boolean(b.edit) &&
  Boolean(a.refresh) === Boolean(b.refresh);

const mapProfileRow = (row: any, permissions: PermissionMatrix): AccessProfile => ({
  profileKey: clean(row.profile_key),
  label: clean(row.label),
  description: clean(row.description) || null,
  isSystem: toBool(row.is_system),
  isActive: toBool(row.is_active),
  sortOrder: Number(row.sort_order || 0),
  permissions,
});

const buildSystemAccessProfile = (role: UserRole): AccessProfile => {
  const meta = SYSTEM_ACCESS_PROFILE_META[role];
  return {
    profileKey: role,
    label: meta.label,
    description: meta.description,
    isSystem: true,
    isActive: true,
    sortOrder: meta.sortOrder,
    permissions: getDefaultMatrixByRole(role),
  };
};

export const getDefaultAccessProfileKeyForRole = (roleRaw: string) => {
  const role = upper(roleRaw || 'OPERADOR');
  return SYSTEM_ACCESS_PROFILE_ROLES.includes(role as UserRole) ? role : 'OPERADOR';
};

const getFallbackAccessProfile = (profileKeyRaw: string, fallbackRoleRaw: string) => {
  const profileKey = upper(profileKeyRaw);
  const role = SYSTEM_ACCESS_PROFILE_ROLES.includes(profileKey as UserRole)
    ? profileKey
    : getDefaultAccessProfileKeyForRole(fallbackRoleRaw);
  return buildSystemAccessProfile(role as UserRole);
};

const canReadAccessProfileTables = async (db: DbInterface) => {
  if (accessProfileTablesReadable !== null) return accessProfileTablesReadable;
  try {
    await db.query('SELECT profile_key FROM access_profiles LIMIT 1');
    await db.query('SELECT profile_key FROM access_profile_permissions LIMIT 1');
    await db.query('SELECT user_id FROM user_access_profile_assignments LIMIT 1');
    accessProfileTablesReadable = true;
    return true;
  } catch {
    accessProfileTablesReadable = false;
    return false;
  }
};

export const areAccessProfileTablesAvailable = async (db: DbInterface) => canReadAccessProfileTables(db);

export const ensurePermissionTable = async (db: DbInterface) => {
  if (permissionsTableEnsured) return;
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
  permissionsTableEnsured = true;
};

export const ensureAccessProfileTables = async (db: DbInterface) => {
  if (accessProfileTablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS access_profiles (
      profile_key VARCHAR(80) PRIMARY KEY,
      label VARCHAR(160) NOT NULL,
      description TEXT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NULL,
      updated_at TEXT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS access_profile_permissions (
      profile_key VARCHAR(80) NOT NULL,
      page_key VARCHAR(64) NOT NULL,
      can_view INTEGER NOT NULL,
      can_edit INTEGER NOT NULL,
      can_refresh INTEGER NOT NULL,
      updated_at TEXT NULL,
      PRIMARY KEY (profile_key, page_key)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_access_profile_assignments (
      user_id VARCHAR(64) PRIMARY KEY,
      profile_key VARCHAR(80) NOT NULL,
      assigned_at TEXT NULL,
      assigned_by VARCHAR(64) NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS access_permission_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      actor_user_id VARCHAR(64) NULL,
      target_user_id VARCHAR(64) NULL,
      event_type VARCHAR(80) NOT NULL,
      payload_json LONGTEXT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await seedSystemAccessProfiles(db);
  accessProfileTablesEnsured = true;
  accessProfileTablesReadable = true;
};

const insertAccessAuditLog = async (
  db: DbInterface,
  eventType: string,
  payload: Record<string, unknown>,
  actorUserId?: string | null,
  targetUserId?: string | null
) => {
  await db.execute(
    `
    INSERT INTO access_permission_audit_log
      (id, actor_user_id, target_user_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    `,
    [
      randomUUID(),
      actorUserId || null,
      targetUserId || null,
      eventType,
      JSON.stringify(payload),
    ]
  );
};

export const seedSystemAccessProfiles = async (db: DbInterface) => {
  await ensurePermissionTable(db);

  for (const role of SYSTEM_ACCESS_PROFILE_ROLES) {
    const meta = SYSTEM_ACCESS_PROFILE_META[role];
    await db.execute(
      `
      INSERT OR IGNORE INTO access_profiles
        (profile_key, label, description, is_system, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, datetime('now'), datetime('now'))
      `,
      [role, meta.label, meta.description, meta.sortOrder]
    );

    await db.execute(
      `
      UPDATE access_profiles
      SET label = ?, description = ?, is_system = 1, is_active = 1, sort_order = ?, updated_at = datetime('now')
      WHERE profile_key = ?
      `,
      [meta.label, meta.description, meta.sortOrder, role]
    );

    const matrix = getDefaultMatrixByRole(role);
    for (const page of PAGE_DEFS) {
      const permission = matrix[page.key];
      await db.execute(
        `
        INSERT INTO access_profile_permissions
          (profile_key, page_key, can_view, can_edit, can_refresh, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(profile_key, page_key) DO UPDATE SET
          can_view = excluded.can_view,
          can_edit = excluded.can_edit,
          can_refresh = excluded.can_refresh,
          updated_at = excluded.updated_at
        `,
        [
          role,
          page.key,
          toDbFlag(permission.view),
          toDbFlag(permission.edit),
          toDbFlag(permission.refresh),
        ]
      );
    }
  }
};

export const seedPermissionDefaults = async (db: DbInterface, userId: string, roleRaw: string) => {
  await ensurePermissionTable(db);
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

export const loadAccessProfileMatrix = async (
  db: DbInterface,
  profileKeyRaw: string,
  fallbackRoleRaw = 'OPERADOR'
): Promise<PermissionMatrix> => {
  const profileKey = clean(profileKeyRaw) || getDefaultAccessProfileKeyForRole(fallbackRoleRaw);
  if (!(await canReadAccessProfileTables(db))) {
    return getFallbackAccessProfile(profileKey, fallbackRoleRaw).permissions;
  }

  const rows = await db.query(
    `
    SELECT page_key, can_view, can_edit, can_refresh
    FROM access_profile_permissions
    WHERE profile_key = ?
    `,
    [profileKey]
  );

  const matrix = rows.length ? createEmptyMatrix() : getDefaultMatrixByRole(fallbackRoleRaw);
  for (const row of rows) {
    const key = clean(row.page_key) as PageKey;
    if (!PAGE_KEYS.includes(key)) continue;
    matrix[key] = {
      view: toBool(row.can_view),
      edit: toBool(row.can_edit),
      refresh: toBool(row.can_refresh),
    };
  }
  return matrix;
};

export const listAccessProfiles = async (db: DbInterface): Promise<AccessProfile[]> => {
  if (!(await canReadAccessProfileTables(db))) {
    return SYSTEM_ACCESS_PROFILE_ROLES.map(buildSystemAccessProfile);
  }

  const rows = await db.query(
    `
    SELECT profile_key, label, description, is_system, is_active, sort_order
    FROM access_profiles
    WHERE COALESCE(is_active, 1) = 1
    ORDER BY is_system DESC, sort_order ASC, label ASC
    `
  );

  const profiles: AccessProfile[] = [];
  for (const row of rows) {
    const profileKey = clean(row.profile_key);
    profiles.push(mapProfileRow(row, await loadAccessProfileMatrix(db, profileKey, profileKey)));
  }
  return profiles.length ? profiles : SYSTEM_ACCESS_PROFILE_ROLES.map(buildSystemAccessProfile);
};

export const getAccessProfile = async (
  db: DbInterface,
  profileKeyRaw: string,
  fallbackRoleRaw = 'OPERADOR'
): Promise<AccessProfile | null> => {
  const profileKey = clean(profileKeyRaw);
  if (!profileKey) return null;
  if (!(await canReadAccessProfileTables(db))) {
    return getFallbackAccessProfile(profileKey, fallbackRoleRaw);
  }

  const rows = await db.query(
    `
    SELECT profile_key, label, description, is_system, is_active, sort_order
    FROM access_profiles
    WHERE profile_key = ? AND COALESCE(is_active, 1) = 1
    LIMIT 1
    `,
    [profileKey]
  );
  if (!rows[0]) return null;
  return mapProfileRow(rows[0], await loadAccessProfileMatrix(db, profileKey, fallbackRoleRaw));
};

export const getAssignedAccessProfileKey = async (db: DbInterface, userId: string) => {
  if (!(await canReadAccessProfileTables(db))) return null;

  const rows = await db.query(
    `
    SELECT profile_key
    FROM user_access_profile_assignments
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );
  return clean(rows[0]?.profile_key) || null;
};

export const assignUserAccessProfile = async (
  db: DbInterface,
  userId: string,
  profileKeyRaw: string,
  assignedBy?: string | null
) => {
  await ensureAccessProfileTables(db);
  const profileKey = clean(profileKeyRaw);
  if (!profileKey) throw new Error('Perfil de acesso obrigatorio.');
  const profile = await getAccessProfile(db, profileKey, profileKey);
  if (!profile) throw new Error('Perfil de acesso nao encontrado.');

  await db.execute(
    `
    INSERT INTO user_access_profile_assignments
      (user_id, profile_key, assigned_at, assigned_by)
    VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_key = excluded.profile_key,
      assigned_at = excluded.assigned_at,
      assigned_by = excluded.assigned_by
    `,
    [userId, profileKey, assignedBy || null]
  );
};

export const deleteUserAccessProfileAssignmentIfPresent = async (
  db: DbInterface,
  userId: string
) => {
  if (!(await canReadAccessProfileTables(db))) return false;

  await db.execute('DELETE FROM user_access_profile_assignments WHERE user_id = ?', [userId]);
  return true;
};

const loadInheritedPermissionMatrix = async (
  db: DbInterface,
  userId: string,
  roleRaw: string
) => {
  const assignedProfileKey = await getAssignedAccessProfileKey(db, userId);
  const fallbackProfileKey = getDefaultAccessProfileKeyForRole(roleRaw);
  const effectiveProfileKey = assignedProfileKey || fallbackProfileKey;
  const profile = await getAccessProfile(db, effectiveProfileKey, roleRaw);
  const inheritedMatrix = profile
    ? cloneMatrix(profile.permissions)
    : getDefaultMatrixByRole(roleRaw);

  return {
    assignedProfileKey,
    effectiveProfileKey,
    profile,
    inheritedMatrix,
  };
};

export const loadUserPermissionResolution = async (
  db: DbInterface,
  userId: string,
  roleRaw: string
): Promise<UserPermissionResolution> => {
  await ensurePermissionTable(db);
  const inherited = await loadInheritedPermissionMatrix(db, userId, roleRaw);

  const rows = await db.query(
    `
    SELECT page_key, can_view, can_edit, can_refresh
    FROM user_page_permissions
    WHERE user_id = ?
    `,
    [userId]
  );

  const effectiveMatrix = cloneMatrix(inherited.inheritedMatrix);
  const userOverrides: Partial<Record<PageKey, PagePermission>> = {};

  for (const row of rows) {
    const key = clean(row.page_key) as PageKey;
    if (!PAGE_KEYS.includes(key)) continue;
    const permission = {
      view: toBool(row.can_view),
      edit: toBool(row.can_edit),
      refresh: toBool(row.can_refresh),
    };
    userOverrides[key] = permission;
    effectiveMatrix[key] = permission;
  }

  return {
    userId,
    role: clean(roleRaw || 'OPERADOR'),
    assignedProfileKey: inherited.assignedProfileKey,
    effectiveProfileKey: inherited.effectiveProfileKey,
    profile: inherited.profile,
    inheritedMatrix: inherited.inheritedMatrix,
    effectiveMatrix,
    userOverrides,
    overrideCount: Object.keys(userOverrides).length,
  };
};

export const countUserPermissionOverrides = async (db: DbInterface, userId: string) => {
  await ensurePermissionTable(db);
  const rows = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM user_page_permissions
    WHERE user_id = ?
    `,
    [userId]
  );
  return Number(rows[0]?.total || 0);
};

export const loadUserPermissionMatrix = async (
  db: DbInterface,
  userId: string,
  roleRaw: string
): Promise<PermissionMatrix> => {
  const resolution = await loadUserPermissionResolution(db, userId, roleRaw);
  return resolution.effectiveMatrix;
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

const mergeMatrixWithRawInput = (base: PermissionMatrix, matrixRaw: unknown): PermissionMatrix => {
  const next = cloneMatrix(base);
  if (!matrixRaw || typeof matrixRaw !== 'object') return next;
  const src = matrixRaw as Record<string, unknown>;

  for (const key of PAGE_KEYS) {
    const raw = src[key];
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    next[key] = {
      view: toBool(item.view),
      edit: toBool(item.edit),
      refresh: toBool(item.refresh),
    };
  }

  return next;
};

export const saveUserPermissionResolution = async (
  db: DbInterface,
  userId: string,
  roleRaw: string,
  options: {
    profileKey?: string | null;
    permissions: unknown;
    actorUserId?: string | null;
  }
) => {
  await ensurePermissionTable(db);
  const requestedProfileKey = clean(options.profileKey);
  const defaultProfileKey = getDefaultAccessProfileKeyForRole(roleRaw);
  const canPersistProfileAssignment =
    Boolean(requestedProfileKey) &&
    (requestedProfileKey !== defaultProfileKey || (await canReadAccessProfileTables(db)));

  if (canPersistProfileAssignment) {
    await ensureAccessProfileTables(db);
  }

  await runInTransaction(db, async (txDb) => {
    if (requestedProfileKey && canPersistProfileAssignment) {
      await assignUserAccessProfile(txDb, userId, requestedProfileKey, options.actorUserId || null);
    }

    const inherited = await loadInheritedPermissionMatrix(txDb, userId, roleRaw);
    const effectiveMatrix = mergeMatrixWithRawInput(inherited.inheritedMatrix, options.permissions);
    let overrideCount = 0;

    for (const key of PAGE_KEYS) {
      const effective = effectiveMatrix[key];
      const inheritedPermission = inherited.inheritedMatrix[key];
      if (permissionsEqual(effective, inheritedPermission)) {
        await txDb.execute(
          `
          DELETE FROM user_page_permissions
          WHERE user_id = ? AND page_key = ?
          `,
          [userId, key]
        );
        continue;
      }

      overrideCount += 1;
      await txDb.execute(
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
        [
          userId,
          key,
          toDbFlag(effective.view),
          toDbFlag(effective.edit),
          toDbFlag(effective.refresh),
        ]
      );
    }

    if (canPersistProfileAssignment) {
      await insertAccessAuditLog(
        txDb,
        'user_permissions_saved',
        {
          profileKey: inherited.effectiveProfileKey,
          overrideCount,
        },
        options.actorUserId || null,
        userId
      );
    }
  });

  return loadUserPermissionResolution(db, userId, roleRaw);
};
