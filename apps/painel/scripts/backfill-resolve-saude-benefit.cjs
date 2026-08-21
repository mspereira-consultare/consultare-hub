#!/usr/bin/env node

/**
 * Cria a coluna `employees.resolve_saude_opted_in` e garante que todos os
 * colaboradores fiquem cadastrados como optantes do Resolvesaúde.
 *
 * O ALTER TABLE já nasce com DEFAULT 1, então as linhas existentes viram
 * optantes automaticamente. O backfill explícito cobre o caso de a coluna
 * ter sido criada antes por outra rota (runtime do painel, por exemplo).
 *
 * Uso:
 *   node apps/painel/scripts/backfill-resolve-saude-benefit.cjs --dry-run
 *   node apps/painel/scripts/backfill-resolve-saude-benefit.cjs
 */

require('dotenv').config({ path: '.env' });

const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [table, column],
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.MYSQL_PUBLIC_URL) {
    throw new Error('MYSQL_PUBLIC_URL não configurada.');
  }

  const url = new URL(process.env.MYSQL_PUBLIC_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const hasEmployeeColumn = await columnExists(connection, 'employees', 'resolve_saude_opted_in');
    const hasLineColumn = await columnExists(connection, 'payroll_lines', 'resolve_saude_discount');

    console.log(`Coluna employees.resolve_saude_opted_in: ${hasEmployeeColumn ? 'já existe' : 'ausente'}`);
    console.log(`Coluna payroll_lines.resolve_saude_discount: ${hasLineColumn ? 'já existe' : 'ausente'}`);

    if (!hasEmployeeColumn) {
      if (DRY_RUN) {
        console.log('[dry-run] ALTER TABLE employees ADD COLUMN resolve_saude_opted_in INTEGER NOT NULL DEFAULT 1');
      } else {
        await connection.execute('ALTER TABLE employees ADD COLUMN resolve_saude_opted_in INTEGER NOT NULL DEFAULT 1');
        console.log('Coluna employees.resolve_saude_opted_in criada.');
      }
    }

    if (!hasLineColumn) {
      if (DRY_RUN) {
        console.log('[dry-run] ALTER TABLE payroll_lines ADD COLUMN resolve_saude_discount DECIMAL(12,2) NOT NULL DEFAULT 0');
      } else {
        await connection.execute('ALTER TABLE payroll_lines ADD COLUMN resolve_saude_discount DECIMAL(12,2) NOT NULL DEFAULT 0');
        console.log('Coluna payroll_lines.resolve_saude_discount criada.');
      }
    }

    if (DRY_RUN && !hasEmployeeColumn) {
      console.log('[dry-run] Backfill não simulado: a coluna ainda não existe no banco.');
      return;
    }

    const [pendingRows] = await connection.query(
      `
      SELECT COUNT(*) AS total
      FROM employees
      WHERE resolve_saude_opted_in IS NULL OR resolve_saude_opted_in <> 1
      `,
    );
    const pending = Number(pendingRows[0]?.total || 0);
    console.log(`Colaboradores fora do benefício antes do backfill: ${pending}`);

    if (pending > 0) {
      if (DRY_RUN) {
        console.log(`[dry-run] UPDATE employees SET resolve_saude_opted_in = 1 (${pending} linha(s))`);
      } else {
        const [result] = await connection.execute(
          `
          UPDATE employees
          SET resolve_saude_opted_in = 1
          WHERE resolve_saude_opted_in IS NULL OR resolve_saude_opted_in <> 1
          `,
        );
        console.log(`Backfill aplicado em ${result.affectedRows} colaborador(es).`);
      }
    }

    const [summary] = await connection.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN resolve_saude_opted_in = 1 THEN 1 ELSE 0 END) AS optantes,
        SUM(CASE WHEN status = 'ATIVO' THEN 1 ELSE 0 END) AS ativos,
        SUM(CASE WHEN status = 'ATIVO' AND resolve_saude_opted_in = 1 THEN 1 ELSE 0 END) AS ativos_optantes
      FROM employees
      `,
    );
    const row = summary[0] || {};
    console.log(
      `Resultado: ${Number(row.optantes || 0)}/${Number(row.total || 0)} colaboradores optantes | ` +
        `${Number(row.ativos_optantes || 0)}/${Number(row.ativos || 0)} ativos optantes.`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
