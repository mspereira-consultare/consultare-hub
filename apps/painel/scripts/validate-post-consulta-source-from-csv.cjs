#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

function clean(value) {
  return String(value ?? '').trim();
}

function parseCsv(content, delimiter = ';') {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentValue);
      if (currentRow.some((item) => clean(item) !== '')) rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += ch;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((item) => clean(item) !== '')) rows.push(currentRow);
  }

  return rows;
}

function resolveMysqlUrl() {
  const internal = String(process.env.MYSQL_URL || '').trim();
  const publicUrl = String(process.env.MYSQL_PUBLIC_URL || '').trim();
  if (!internal && !publicUrl) return '';
  const isRailwayRuntime = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  if (internal) {
    try {
      const host = new URL(internal).hostname.toLowerCase();
      if (host.endsWith('.railway.internal') && !isRailwayRuntime && publicUrl) return publicUrl;
    } catch {
      return internal || publicUrl;
    }
  }
  return internal || publicUrl;
}

function normalizeComparableText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildGroupedConsultations(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (normalizeComparableText(row['Tipo do Procedimento']) !== 'consulta') continue;
    const consultDate = clean(row['Data do Pagamento']);
    if (!consultDate) continue;
    const patientId = Number(clean(row['Prontuário']) || '0');
    const patientName = clean(row.Paciente) || 'Não informado';
    const consultUnit = clean(row.Unidade) || 'Sem unidade';
    const consultProcedure = clean(row.Procedimento) || 'Consulta';
    const attendantResponsible = clean(row['Usuário da conta']) || 'Não informado';
    const patientGroupKey =
      patientId > 0 ? `id:${Math.trunc(patientId)}` : `name:${normalizeComparableText(patientName) || patientName.toLowerCase()}`;
    const groupKey = [
      patientGroupKey,
      consultDate,
      normalizeComparableText(consultUnit),
      normalizeComparableText(consultProcedure),
      normalizeComparableText(attendantResponsible),
    ].join('|');
    const current = grouped.get(groupKey);
    if (current) {
      current.billingSourceRowCount += 1;
      continue;
    }
    grouped.set(groupKey, {
      key: groupKey,
      patientId: patientId > 0 ? Math.trunc(patientId) : null,
      patientName,
      consultDate,
      consultUnit,
      consultProcedure,
      attendantResponsible,
      billingSourceRowCount: 1,
    });
  }
  return Array.from(grouped.values());
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error('Uso: node apps/painel/scripts/validate-post-consulta-source-from-csv.cjs "/caminho/arquivo.csv"');
  }

  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');
  }

  let content = fs.readFileSync(path.resolve(csvPath), 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const csvRows = parseCsv(content, ';');
  if (csvRows.length <= 1) {
    throw new Error('CSV sem dados suficientes para validação.');
  }

  const [header, ...dataRows] = csvRows;
  const records = dataRows.map((dataRow) => Object.fromEntries(header.map((name, index) => [clean(name), dataRow[index] ?? ''])));
  const dates = Array.from(new Set(records.map((row) => clean(row['Data do Pagamento'])).filter(Boolean))).sort();
  if (!dates.length) {
    throw new Error('CSV sem Data do Pagamento válida.');
  }
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const csvGrouped = buildGroupedConsultations(records);

  const conn = await mysql.createConnection({
    uri: mysqlUrl,
    ssl: ['0', 'false', 'no'].includes(String(process.env.MYSQL_FORCE_SSL || '').toLowerCase())
      ? undefined
      : { rejectUnauthorized: false },
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 30000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  try {
    const [dbConsultRows] = await conn.query(
      `
      SELECT
        (
          CASE
            WHEN INSTR(data_do_pagamento, '/') > 0
              THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2))
            ELSE data_do_pagamento
          END
        ) AS consult_date,
        CAST(COALESCE(\`prontuário\`, 0) AS UNSIGNED) AS patient_id,
        TRIM(COALESCE(paciente, '')) AS patient_name,
        TRIM(COALESCE(unidade, '')) AS consult_unit,
        TRIM(COALESCE(procedimento, '')) AS consult_procedure,
        TRIM(COALESCE(usuario_da_conta, '')) AS attendant_responsible
      FROM faturamento_analitico
      WHERE UPPER(TRIM(COALESCE(tipo_do_procedimento, ''))) = 'CONSULTA'
        AND (
          CASE
            WHEN INSTR(data_do_pagamento, '/') > 0
              THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2))
            ELSE data_do_pagamento
          END
        ) BETWEEN ? AND ?
      `,
      [startDate, endDate]
    );

    const dbGrouped = buildGroupedConsultations(
      dbConsultRows.map((row) => ({
        'Data do Pagamento': row.consult_date,
        'Tipo do Procedimento': 'Consulta',
        Prontuário: row.patient_id,
        Paciente: row.patient_name,
        Unidade: row.consult_unit,
        Procedimento: row.consult_procedure,
        'Usuário da conta': row.attendant_responsible,
      }))
    );

    const dbPatientIds = Array.from(new Set(dbGrouped.map((item) => item.patientId).filter((value) => Number(value) > 0)));
    const proposalKeys = new Set();
    for (let index = 0; index < dbPatientIds.length; index += 500) {
      const chunk = dbPatientIds.slice(index, index + 500);
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => '?').join(', ');
      const [proposalRows] = await conn.query(
        `SELECT patient_id, date FROM feegow_proposals WHERE date BETWEEN ? AND ? AND patient_id IN (${placeholders})`,
        [startDate, endDate, ...chunk]
      );
      for (const row of proposalRows) {
        proposalKeys.add(`${clean(row.date)}|${Number(row.patient_id)}`);
      }
    }

    const csvEligibleKeys = new Set(
      csvGrouped
        .filter((item) => item.patientId && proposalKeys.has(`${item.consultDate}|${item.patientId}`))
        .map((item) => item.key)
    );
    const dbEligibleKeys = new Set(
      dbGrouped
        .filter((item) => item.patientId && proposalKeys.has(`${item.consultDate}|${item.patientId}`))
        .map((item) => item.key)
    );

    const missingInDb = Array.from(csvEligibleKeys).filter((key) => !dbEligibleKeys.has(key));
    const extraInDb = Array.from(dbEligibleKeys).filter((key) => !csvEligibleKeys.has(key));
    const valid = missingInDb.length === 0 && extraInDb.length === 0;

    console.log(
      JSON.stringify(
        {
          file: path.resolve(csvPath),
          range: { startDate, endDate },
          csvConsultGroups: csvGrouped.length,
          dbConsultGroups: dbGrouped.length,
          csvEligibleGroups: csvEligibleKeys.size,
          dbEligibleGroups: dbEligibleKeys.size,
          missingInDbCount: missingInDb.length,
          extraInDbCount: extraInDb.length,
          missingInDbSample: missingInDb.slice(0, 10),
          extraInDbSample: extraInDb.slice(0, 10),
          valid,
        },
        null,
        2
      )
    );

    if (!valid) {
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha na validação do pós-consulta por CSV:', error?.message || error);
  process.exit(1);
});
