import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomUUID, randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import type { DbInterface } from './db';
import type { Employee } from './colaboradores/types';

const NOW = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const lower = (value: unknown) => clean(value).toLowerCase();

const USERNAME_IGNORED_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const SIMPLE_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

let userColumnsEnsured = false;
let credentialTablesEnsured = false;

export type LinkedUserRecord = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  department: string;
  status: string;
  employeeId: string | null;
  passwordHash: string;
};

export type EmployeePortalAccessCredential = {
  id: string;
  employeeId: string;
  userId: string;
  usernameSnapshot: string;
  temporaryPassword: string | null;
  status: 'PENDING_VIEW' | 'VIEWED' | 'SUPERSEDED' | 'REVOKED';
  generatedBy: string | null;
  generatedAt: string;
  shownAt: string | null;
  supersededAt: string | null;
};

export type EnsureEmployeeUserOptions = {
  actorUserId?: string | null;
  createInitialCredential?: boolean;
  preserveRole?: boolean;
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists/i.test(msg) || /Duplicate key name/i.test(msg)) return;
    throw error;
  }
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

const normalizeToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();

const usernameSecret = () =>
  clean(process.env.EMPLOYEE_PORTAL_SECRET) ||
  clean(process.env.NEXTAUTH_SECRET) ||
  'consultare-user-accounts-development-secret';

const usernameEncryptionKey = () => createHash('sha256').update(usernameSecret()).digest();

const encryptTemporaryPassword = (password: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', usernameEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
};

const decryptTemporaryPassword = (value: unknown): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const [version, ivRaw, tagRaw, encryptedRaw] = raw.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      usernameEncryptionKey(),
      Buffer.from(ivRaw, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

const mapLinkedUserRecord = (row: any): LinkedUserRecord => ({
  id: clean(row.id),
  name: clean(row.name),
  email: clean(row.email),
  username: clean(row.username),
  role: clean(row.role) || 'INTRANET',
  department: clean(row.department) || 'Geral',
  status: upper(row.status || 'ATIVO'),
  employeeId: clean(row.employee_id) || null,
  passwordHash: clean(row.password || row.password_hash),
});

const mapAccessCredential = (row: any): EmployeePortalAccessCredential => ({
  id: clean(row.id),
  employeeId: clean(row.employee_id),
  userId: clean(row.user_id),
  usernameSnapshot: clean(row.username_snapshot),
  temporaryPassword: decryptTemporaryPassword(row.password_encrypted),
  status: upper(row.status || 'PENDING_VIEW') as EmployeePortalAccessCredential['status'],
  generatedBy: clean(row.generated_by) || null,
  generatedAt: clean(row.generated_at),
  shownAt: clean(row.shown_at) || null,
  supersededAt: clean(row.superseded_at) || null,
});

const isRealEmail = (value: string | null | undefined) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));

const getPlaceholderEmail = (username: string) => `${username}@usuarios.consultare.local`;

const getDisplayDepartment = (employee: Pick<Employee, 'department' | 'units'>) =>
  clean(employee.department) || clean(employee.units?.[0]) || 'Geral';

const splitNameTokens = (fullName: string) =>
  fullName
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

const buildSignificantTokens = (fullName: string) => {
  const baseTokens = splitNameTokens(fullName);
  const significant = baseTokens.filter((token) => !USERNAME_IGNORED_PARTICLES.has(token));
  return significant.length > 0 ? significant : baseTokens;
};

export const normalizeUsernameSearch = (value: string) => normalizeToken(value);

export const buildUsernameBaseParts = (fullName: string) => {
  const tokens = buildSignificantTokens(fullName);
  const first = tokens[0] || 'user';
  const last = tokens[tokens.length - 1] || first;
  const penultimate = tokens.length >= 2 ? tokens[tokens.length - 2] : first;
  return {
    first,
    last,
    penultimate,
  };
};

export const buildUsernameCandidate = (fullName: string, penultimateLength: number) => {
  const { first, last, penultimate } = buildUsernameBaseParts(fullName);
  const middle = penultimate.slice(0, Math.max(1, penultimateLength));
  return `${first.slice(0, 1)}${middle}${last}`.slice(0, 80);
};

export const generateMemorablePassword = (length = 6) => {
  let next = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = randomBytes(1)[0] % SIMPLE_PASSWORD_ALPHABET.length;
    next += SIMPLE_PASSWORD_ALPHABET[randomIndex];
  }
  return next;
};

export const ensureUserAccountColumns = async (db: DbInterface) => {
  if (userColumnsEnsured) return;
  await safeAddColumn(db, `ALTER TABLE users ADD COLUMN username VARCHAR(120) NULL`);
  await safeAddColumn(db, `ALTER TABLE users ADD COLUMN employee_id VARCHAR(64) NULL`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_users_username ON users (username)`);
  await safeCreateIndex(db, `CREATE UNIQUE INDEX uq_users_employee_id ON users (employee_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_users_role ON users (role)`);
  userColumnsEnsured = true;
};

export const ensureUserAccountTables = async (db: DbInterface) => {
  await ensureUserAccountColumns(db);
  if (credentialTablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS employee_portal_access_credentials (
      id VARCHAR(64) PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      username_snapshot VARCHAR(120) NOT NULL,
      password_encrypted TEXT NOT NULL,
      status VARCHAR(30) NOT NULL,
      generated_by VARCHAR(64) NULL,
      generated_at TEXT NOT NULL,
      shown_at TEXT NULL,
      superseded_at TEXT NULL
    )
  `);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_access_credentials_employee ON employee_portal_access_credentials (employee_id, generated_at)`);
  await safeCreateIndex(db, `CREATE INDEX idx_employee_portal_access_credentials_user ON employee_portal_access_credentials (user_id, generated_at)`);
  credentialTablesEnsured = true;
};

export const listUsersWithoutLinkedEmployee = async (db: DbInterface) => {
  await ensureUserAccountColumns(db);
  const rows = await db.query(
    `
    SELECT id, name, email, username, role, department, status, employee_id, password
    FROM users
    WHERE employee_id IS NULL OR TRIM(COALESCE(employee_id, '')) = ''
    ORDER BY name ASC
    `
  );
  return rows.map(mapLinkedUserRecord);
};

export const getLinkedUserByEmployeeId = async (db: DbInterface, employeeId: string) => {
  await ensureUserAccountColumns(db);
  const rows = await db.query(
    `
    SELECT id, name, email, username, role, department, status, employee_id, password
    FROM users
    WHERE employee_id = ?
    LIMIT 1
    `,
    [employeeId]
  );
  return rows[0] ? mapLinkedUserRecord(rows[0]) : null;
};

export const resolveUniqueUsername = async (
  db: DbInterface,
  fullName: string,
  ignoredUserId?: string | null
) => {
  await ensureUserAccountColumns(db);
  const parts = buildUsernameBaseParts(fullName);
  const maxPenultimateLength = Math.max(2, parts.penultimate.length || 2);

  for (let length = 2; length <= maxPenultimateLength; length += 1) {
    const candidate = buildUsernameCandidate(fullName, length);
    const rows = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(COALESCE(username, '')) = ?
        AND (? IS NULL OR id <> ?)
      LIMIT 1
      `,
      [candidate.toLowerCase(), ignoredUserId || null, ignoredUserId || null]
    );
    if (!rows[0]) return candidate;
  }

  const base = buildUsernameCandidate(fullName, maxPenultimateLength);
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base}${suffix}`;
    const rows = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(COALESCE(username, '')) = ?
        AND (? IS NULL OR id <> ?)
      LIMIT 1
      `,
      [candidate.toLowerCase(), ignoredUserId || null, ignoredUserId || null]
    );
    if (!rows[0]) return candidate;
  }

  throw new Error(`Nao foi possivel gerar username unico para ${fullName}.`);
};

const findExistingUserForEmployee = async (db: DbInterface, employee: Employee) => {
  const linked = await getLinkedUserByEmployeeId(db, employee.id);
  if (linked) return linked;

  const email = lower(employee.email);
  if (email) {
    const emailRows = await db.query(
      `
      SELECT id, name, email, username, role, department, status, employee_id, password
      FROM users
      WHERE LOWER(COALESCE(email, '')) = ?
        AND (employee_id IS NULL OR TRIM(COALESCE(employee_id, '')) = '')
      ORDER BY id ASC
      LIMIT 1
      `,
      [email]
    );
    if (emailRows[0]) return mapLinkedUserRecord(emailRows[0]);
  }

  const normalizedName = normalizeUsernameSearch(employee.fullName);
  if (!normalizedName) return null;
  const rows = await db.query(
    `
    SELECT id, name, email, username, role, department, status, employee_id, password
    FROM users
    WHERE (employee_id IS NULL OR TRIM(COALESCE(employee_id, '')) = '')
    ORDER BY name ASC
    `
  );
  return rows
    .map(mapLinkedUserRecord)
    .find((user) => normalizeUsernameSearch(user.name) === normalizedName) || null;
};

export const createOrRotatePortalCredential = async (
  db: DbInterface,
  employeeId: string,
  userId: string,
  username: string,
  actorUserId?: string | null
) => {
  await ensureUserAccountTables(db);
  const plainPassword = generateMemorablePassword(6);
  const passwordHash = await hash(plainPassword, 10);
  const now = NOW();

  await db.execute(
    `
    UPDATE employee_portal_access_credentials
    SET status = 'SUPERSEDED', superseded_at = ?
    WHERE employee_id = ?
      AND status = 'PENDING_VIEW'
    `,
    [now, employeeId]
  );

  await db.execute(
    `
    UPDATE users
    SET password = ?, updated_at = ?
    WHERE id = ?
    `,
    [passwordHash, now, userId]
  );

  const credentialId = randomUUID();
  await db.execute(
    `
    INSERT INTO employee_portal_access_credentials (
      id, employee_id, user_id, username_snapshot, password_encrypted,
      status, generated_by, generated_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING_VIEW', ?, ?)
    `,
    [
      credentialId,
      employeeId,
      userId,
      username,
      encryptTemporaryPassword(plainPassword),
      actorUserId || null,
      now,
    ]
  );

  return {
    id: credentialId,
    temporaryPassword: plainPassword,
    generatedAt: now,
  };
};

export const markPortalCredentialAsViewed = async (
  db: DbInterface,
  credentialId: string,
  employeeId: string
) => {
  await ensureUserAccountTables(db);
  const now = NOW();
  await db.execute(
    `
    UPDATE employee_portal_access_credentials
    SET status = 'VIEWED', shown_at = COALESCE(shown_at, ?)
    WHERE id = ? AND employee_id = ? AND status = 'PENDING_VIEW'
    `,
    [now, credentialId, employeeId]
  );
};

export const getLatestPortalCredential = async (db: DbInterface, employeeId: string) => {
  await ensureUserAccountTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM employee_portal_access_credentials
    WHERE employee_id = ?
    ORDER BY generated_at DESC
    LIMIT 1
    `,
    [employeeId]
  );
  return rows[0] ? mapAccessCredential(rows[0]) : null;
};

export const ensureEmployeeUserAccount = async (
  db: DbInterface,
  employee: Employee,
  options: EnsureEmployeeUserOptions = {}
) => {
  await ensureUserAccountColumns(db);
  const desiredStatus = employee.status === 'ATIVO' ? 'ATIVO' : 'INATIVO';
  const existing = await findExistingUserForEmployee(db, employee);
  const username = await resolveUniqueUsername(db, employee.fullName, existing?.id || null);
  const department = getDisplayDepartment(employee);
  const now = NOW();

  if (!existing) {
    if (desiredStatus !== 'ATIVO') {
      return { action: 'skipped_inactive_without_user' as const, user: null, createdCredential: null };
    }

    const userId = randomUUID();
    const role = 'INTRANET';
    const placeholderEmail = isRealEmail(employee.email) ? lower(employee.email) : getPlaceholderEmail(username);
    const shouldCreateInitialCredential = options.createInitialCredential !== false;
    const createdCredential = shouldCreateInitialCredential
      ? { temporaryPassword: generateMemorablePassword(6) }
      : null;
    const passwordHash = await hash(createdCredential?.temporaryPassword || generateMemorablePassword(10), 10);

    await db.execute(
      `
      INSERT INTO users (
        id, name, email, username, employee_id, password, role, department, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        employee.fullName,
        placeholderEmail,
        username,
        employee.id,
        passwordHash,
        role,
        department,
        desiredStatus,
        now,
        now,
      ]
    );

    if (createdCredential) {
      await ensureUserAccountTables(db);
      await db.execute(
        `
        INSERT INTO employee_portal_access_credentials (
          id, employee_id, user_id, username_snapshot, password_encrypted,
          status, generated_by, generated_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING_VIEW', ?, ?)
        `,
        [
          randomUUID(),
          employee.id,
          userId,
          username,
          encryptTemporaryPassword(createdCredential.temporaryPassword),
          options.actorUserId || null,
          now,
        ]
      );
    }

    return {
      action: 'created' as const,
      user: {
        id: userId,
        name: employee.fullName,
        email: placeholderEmail,
        username,
        role,
        department,
        status: desiredStatus,
        employeeId: employee.id,
        passwordHash,
      },
      createdCredential,
    };
  }

  const nextEmail = isRealEmail(employee.email)
    ? lower(employee.email)
    : (isRealEmail(existing.email) ? existing.email : getPlaceholderEmail(username));
  const nextRole = options.preserveRole === false ? 'INTRANET' : (existing.role || 'INTRANET');

  await db.execute(
    `
    UPDATE users
    SET name = ?, email = ?, username = ?, employee_id = ?, department = ?, role = ?, status = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      employee.fullName,
      nextEmail,
      username,
      employee.id,
      department,
      nextRole,
      desiredStatus,
      now,
      existing.id,
    ]
  );

  return {
    action: desiredStatus === 'ATIVO' ? ('updated' as const) : ('deactivated' as const),
    user: {
      ...existing,
      name: employee.fullName,
      email: nextEmail,
      username,
      department,
      role: nextRole,
      status: desiredStatus,
      employeeId: employee.id,
    },
    createdCredential: null,
  };
};

export const migrateExistingEmployeeUsers = async (
  db: DbInterface,
  employees: Employee[]
) => {
  await ensureUserAccountColumns(db);
  const migrated: Array<{ employeeId: string; userId: string; username: string }> = [];
  const skipped: Array<{ employeeId: string; fullName: string; reason: string }> = [];

  for (const employee of employees) {
    const existing = await findExistingUserForEmployee(db, employee);
    if (!existing) {
      skipped.push({ employeeId: employee.id, fullName: employee.fullName, reason: 'no_matching_user' });
      continue;
    }

    const username = await resolveUniqueUsername(db, employee.fullName, existing.id);
    await db.execute(
      `
      UPDATE users
      SET employee_id = ?, username = ?, name = ?, department = ?, updated_at = ?
      WHERE id = ?
      `,
      [employee.id, username, employee.fullName, getDisplayDepartment(employee), NOW(), existing.id]
    );
    migrated.push({ employeeId: employee.id, userId: existing.id, username });
  }

  return { migrated, skipped };
};
