#!/usr/bin/env node

require('dotenv').config({ path: '.env' });

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function clean(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function normalizeToken(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function normalizeName(value) {
  return normalizeToken(value);
}

const IGNORED_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const SIMPLE_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function buildUsernameBaseParts(fullName) {
  const rawTokens = clean(fullName).split(/\s+/).map(normalizeToken).filter(Boolean);
  const significant = rawTokens.filter((token) => !IGNORED_PARTICLES.has(token));
  const tokens = significant.length > 0 ? significant : rawTokens;
  const first = tokens[0] || 'user';
  const last = tokens[tokens.length - 1] || first;
  const penultimate = tokens.length >= 2 ? tokens[tokens.length - 2] : first;
  return { first, last, penultimate };
}

function buildUsernameCandidate(fullName, penultimateLength) {
  const { first, last, penultimate } = buildUsernameBaseParts(fullName);
  return `${first.slice(0, 1)}${penultimate.slice(0, Math.max(1, penultimateLength))}${last}`.slice(0, 80);
}

function generateMemorablePassword(length = 6) {
  let next = '';
  for (let index = 0; index < length; index += 1) {
    next += SIMPLE_PASSWORD_ALPHABET[Math.floor(Math.random() * SIMPLE_PASSWORD_ALPHABET.length)];
  }
  return next;
}

async function ensureUsersColumns(connection) {
  const [columns] = await connection.query(`
    SELECT COLUMN_NAME as name
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users'
  `);
  const existing = new Set(columns.map((row) => clean(row.name).toLowerCase()));
  if (!existing.has('username')) {
    await connection.execute(`ALTER TABLE users ADD COLUMN username VARCHAR(120) NULL`);
  }
  if (!existing.has('employee_id')) {
    await connection.execute(`ALTER TABLE users ADD COLUMN employee_id VARCHAR(64) NULL`);
  }
  try {
    await connection.execute(`CREATE UNIQUE INDEX uq_users_username ON users (username)`);
  } catch (_) {}
  try {
    await connection.execute(`CREATE UNIQUE INDEX uq_users_employee_id ON users (employee_id)`);
  } catch (_) {}
}

async function resolveUniqueUsername(connection, fullName, ignoredUserId) {
  const parts = buildUsernameBaseParts(fullName);
  const maxLength = Math.max(2, parts.penultimate.length || 2);
  for (let length = 2; length <= maxLength; length += 1) {
    const candidate = buildUsernameCandidate(fullName, length);
    const [rows] = await connection.execute(
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

  const base = buildUsernameCandidate(fullName, maxLength);
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base}${suffix}`;
    const [rows] = await connection.execute(
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
  throw new Error(`Nao foi possivel gerar username para ${fullName}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const createMissingActive = process.argv.includes('--create-missing-active');
  const mysqlUrl = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;
  if (!mysqlUrl) {
    throw new Error('MYSQL_PUBLIC_URL ou MYSQL_URL não configurada.');
  }

  const url = new URL(mysqlUrl);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await ensureUsersColumns(connection);

    const [employees] = await connection.query(`
      SELECT id, full_name, email, department, units_json, status
      FROM employees
      ORDER BY full_name ASC
    `);
    const [users] = await connection.query(`
      SELECT id, name, email, username, employee_id, role, department
      FROM users
      ORDER BY name ASC
    `);

    const unlinkedUsers = users.filter((user) => !clean(user.employee_id));
    const migrated = [];
    const created = [];
    const skipped = [];

    for (const employee of employees) {
      const employeeNameNormalized = normalizeName(employee.full_name);
      const employeeEmail = lower(employee.email);
      let match = null;

      if (employeeEmail) {
        match = unlinkedUsers.find((user) => lower(user.email) === employeeEmail) || null;
      }
      if (!match) {
        match = unlinkedUsers.find((user) => normalizeName(user.name) === employeeNameNormalized) || null;
      }
      if (!match) {
        if (createMissingActive && clean(employee.status).toUpperCase() === 'ATIVO') {
          const username = await resolveUniqueUsername(connection, employee.full_name, null);
          const password = generateMemorablePassword(6);
          const passwordHash = await bcrypt.hash(password, 10);
          const userId = crypto.randomUUID();
          const email = clean(employee.email) || `${username}@usuarios.consultare.local`;
          const department = clean(employee.department) || 'Geral';

          created.push({
            employeeId: employee.id,
            employeeName: employee.full_name,
            userId,
            username,
            temporaryPassword: password,
            department,
          });

          if (!dryRun) {
            await connection.execute(
              `
              INSERT INTO users (
                id, name, email, username, employee_id, password, role, department, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'INTRANET', ?, 'ATIVO', NOW(), NOW())
              `,
              [userId, employee.full_name, email, username, employee.id, passwordHash, department]
            );
          }
          continue;
        }
        skipped.push({ employeeId: employee.id, fullName: employee.full_name, reason: 'no_matching_user' });
        continue;
      }

      const username = await resolveUniqueUsername(connection, employee.full_name, match.id);
      const department = clean(employee.department) || 'Geral';

      migrated.push({
        employeeId: employee.id,
        employeeName: employee.full_name,
        userId: match.id,
        previousEmail: match.email,
        username,
        department,
      });

      if (!dryRun) {
        await connection.execute(
          `
          UPDATE users
          SET employee_id = ?, username = ?, name = ?, department = ?, updated_at = NOW()
          WHERE id = ?
          `,
          [employee.id, username, employee.full_name, department, match.id]
        );
      }

      const index = unlinkedUsers.findIndex((user) => user.id === match.id);
      if (index >= 0) {
        unlinkedUsers.splice(index, 1);
      }
    }

    console.log(JSON.stringify({
      dryRun,
      createMissingActive,
      migratedCount: migrated.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      migrated,
      created,
      skipped,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
