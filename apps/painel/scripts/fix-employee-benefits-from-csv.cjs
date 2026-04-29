#!/usr/bin/env node

require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeCpf(value) {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
}

function parseMoney(value) {
  const raw = clean(value);
  if (!raw) return null;

  let normalized = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');

  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value) {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw.replace('%', '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(csv) {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentValue);
      if (currentRow.some((item) => clean(item) !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += ch;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((item) => clean(item) !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function buildRecords(csvPath) {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csvContent);
  if (rows.length <= 1) {
    throw new Error('CSV sem dados suficientes para reconciliar benefícios.');
  }

  const [header, ...dataRows] = rows;
  const byName = new Map(header.map((name, index) => [clean(name), index]));

  const requiredColumns = [
    'CPF',
    'Insalubridade (%)',
    'Vale-transporte (R$/dia)',
    'Vale-transporte mensal (R$)',
    'Vale-refeição (R$/dia)',
    'Desconto Totalpass (R$)',
  ];

  for (const column of requiredColumns) {
    if (!byName.has(column)) {
      throw new Error(`Coluna obrigatória ausente no CSV: ${column}`);
    }
  }

  const records = new Map();

  for (const row of dataRows) {
    const cpf = normalizeCpf(row[byName.get('CPF')]);
    if (!cpf) continue;

    records.set(cpf, {
      cpf,
      insalubrityPercent: parsePercent(row[byName.get('Insalubridade (%)')]),
      transportVoucherPerDay: parseMoney(row[byName.get('Vale-transporte (R$/dia)')]),
      transportVoucherMonthlyFixed: parseMoney(row[byName.get('Vale-transporte mensal (R$)')]),
      mealVoucherPerDay: parseMoney(row[byName.get('Vale-refeição (R$/dia)')]),
      totalpassDiscountFixed: parseMoney(row[byName.get('Desconto Totalpass (R$)')]),
    });
  }

  return records;
}

function numbersDiffer(a, b) {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return Math.abs(Number(a) - Number(b)) >= 0.001;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error('Uso: node apps/painel/scripts/fix-employee-benefits-from-csv.cjs "/caminho/arquivo.csv"');
  }

  if (!process.env.MYSQL_PUBLIC_URL) {
    throw new Error('MYSQL_PUBLIC_URL não configurada.');
  }

  const records = buildRecords(path.resolve(csvPath));
  const url = new URL(process.env.MYSQL_PUBLIC_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
    ssl: { rejectUnauthorized: false },
  });

  const [employees] = await connection.query(
    `
    SELECT id, full_name, cpf, insalubrity_percent, transport_voucher_per_day,
           transport_voucher_monthly_fixed, meal_voucher_per_day, totalpass_discount_fixed
    FROM employees
    `
  );

  let matched = 0;
  let updated = 0;
  const touched = [];

  for (const employee of employees) {
    const cpf = normalizeCpf(employee.cpf);
    if (!cpf) continue;

    const source = records.get(cpf);
    if (!source) continue;
    matched += 1;

    const current = {
      insalubrityPercent: employee.insalubrity_percent === null ? null : Number(employee.insalubrity_percent),
      transportVoucherPerDay: employee.transport_voucher_per_day === null ? null : Number(employee.transport_voucher_per_day),
      transportVoucherMonthlyFixed:
        employee.transport_voucher_monthly_fixed === null ? null : Number(employee.transport_voucher_monthly_fixed),
      mealVoucherPerDay: employee.meal_voucher_per_day === null ? null : Number(employee.meal_voucher_per_day),
      totalpassDiscountFixed: employee.totalpass_discount_fixed === null ? null : Number(employee.totalpass_discount_fixed),
    };

    const hasChanges =
      numbersDiffer(current.insalubrityPercent, source.insalubrityPercent) ||
      numbersDiffer(current.transportVoucherPerDay, source.transportVoucherPerDay) ||
      numbersDiffer(current.transportVoucherMonthlyFixed, source.transportVoucherMonthlyFixed) ||
      numbersDiffer(current.mealVoucherPerDay, source.mealVoucherPerDay) ||
      numbersDiffer(current.totalpassDiscountFixed, source.totalpassDiscountFixed);

    if (!hasChanges) continue;

    await connection.execute(
      `
      UPDATE employees
      SET insalubrity_percent = ?,
          transport_voucher_per_day = ?,
          transport_voucher_monthly_fixed = ?,
          meal_voucher_per_day = ?,
          totalpass_discount_fixed = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [
        source.insalubrityPercent,
        source.transportVoucherPerDay,
        source.transportVoucherMonthlyFixed,
        source.mealVoucherPerDay,
        source.totalpassDiscountFixed,
        employee.id,
      ]
    );

    updated += 1;
    touched.push({
      fullName: employee.full_name,
      cpf,
      beforeMealVoucher: current.mealVoucherPerDay,
      afterMealVoucher: source.mealVoucherPerDay,
    });
  }

  await connection.end();

  console.log(
    JSON.stringify(
      {
        csvRecords: records.size,
        matchedEmployees: matched,
        updatedEmployees: updated,
        touched,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
