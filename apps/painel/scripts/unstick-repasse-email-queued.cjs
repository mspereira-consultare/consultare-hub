#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Destrava destinatarios de e-mail de repasse presos em send_status='QUEUED'.
 *
 * Contexto: uma vez em QUEUED, nenhum caminho da UI (Reenviar / Enviar
 * selecionados) reabilita o registro -- apenas o worker Python o processa.
 * Quando um re-enfileiramento fica orfao (o worker nunca conclui o envio),
 * o registro congela em "Na fila". Este script reseta esses registros para
 * FAILED, para que voltem a ser reenviaveis pelo painel, e neutraliza jobs
 * PENDING orfaos do lote para nao dispararem em duplicidade.
 *
 * Uso:
 *   # pre-visualizar (nao altera nada) por competencia:
 *   node apps/painel/scripts/unstick-repasse-email-queued.cjs --period=2026-06
 *   # ou por lote especifico:
 *   node apps/painel/scripts/unstick-repasse-email-queued.cjs --batch=<batchId>
 *   # aplicar de fato:
 *   node apps/painel/scripts/unstick-repasse-email-queued.cjs --period=2026-06 --apply
 */
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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

function parseArgs(argv) {
  const out = { apply: false, period: '', batch: '', staleRunningMinutes: 30 };
  for (const arg of argv) {
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--period=')) out.period = arg.slice('--period='.length).trim();
    else if (arg.startsWith('--batch=')) out.batch = arg.slice('--batch='.length).trim();
    else if (arg.startsWith('--stale-running-minutes=')) {
      out.staleRunningMinutes = Number(arg.slice('--stale-running-minutes='.length).trim()) || 30;
    }
  }
  return out;
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function recomputeBatchCounters(conn, batchId, now) {
  const [rows] = await conn.execute(
    `
    SELECT
      COUNT(*) AS total_recipients,
      COALESCE(SUM(CASE WHEN send_status = 'READY' THEN 1 ELSE 0 END), 0) AS ready_count,
      COALESCE(SUM(CASE WHEN validation_status = 'WARNING' THEN 1 ELSE 0 END), 0) AS warning_count,
      COALESCE(SUM(CASE WHEN validation_status = 'ERROR' THEN 1 ELSE 0 END), 0) AS error_count,
      COALESCE(SUM(CASE WHEN send_status = 'ACCEPTED_PROVIDER' THEN 1 ELSE 0 END), 0) AS accepted_count,
      COALESCE(SUM(CASE WHEN send_status = 'DELIVERED' THEN 1 ELSE 0 END), 0) AS delivered_count,
      COALESCE(SUM(CASE WHEN send_status IN ('FAILED','SOFT_BOUNCE','HARD_BOUNCE','SPAM_COMPLAINT','UNSUBSCRIBED') THEN 1 ELSE 0 END), 0) AS failed_count
    FROM repasse_email_recipients
    WHERE batch_id = ?
    `,
    [batchId]
  );
  const c = rows[0] || {};
  await conn.execute(
    `
    UPDATE repasse_email_batches
    SET total_recipients = ?, ready_count = ?, warning_count = ?, error_count = ?,
        accepted_count = ?, delivered_count = ?, failed_count = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      Number(c.total_recipients || 0),
      Number(c.ready_count || 0),
      Number(c.warning_count || 0),
      Number(c.error_count || 0),
      Number(c.accepted_count || 0),
      Number(c.delivered_count || 0),
      Number(c.failed_count || 0),
      now,
      batchId,
    ]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.period && !args.batch) {
    throw new Error('Informe --period=YYYY-MM ou --batch=<batchId>.');
  }
  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) throw new Error('MYSQL_URL/MYSQL_PUBLIC_URL nao configurada.');

  const conn = await mysql.createConnection({
    uri: mysqlUrl,
    ssl: ['0', 'false', 'no'].includes(String(process.env.MYSQL_FORCE_SSL || '').toLowerCase())
      ? undefined
      : { rejectUnauthorized: false },
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 30000),
  });

  try {
    // 1) Descobre lotes-alvo
    const batchWhere = args.batch ? 'id = ?' : 'period_ref = ?';
    const batchParam = args.batch || args.period;
    const [batches] = await conn.execute(
      `SELECT id, period_ref, due_date_nf, status, total_recipients FROM repasse_email_batches WHERE ${batchWhere} ORDER BY created_at DESC`,
      [batchParam]
    );
    if (!batches.length) {
      console.log('Nenhum lote encontrado para o filtro informado.');
      return;
    }

    const now = nowSql();
    let totalReset = 0;
    let totalJobsCancelled = 0;

    for (const batch of batches) {
      const [queued] = await conn.execute(
        `SELECT id, professional_name, recipient_email, last_event_type
         FROM repasse_email_recipients
         WHERE batch_id = ? AND send_status = 'QUEUED'
         ORDER BY professional_name ASC`,
        [batch.id]
      );

      // Jobs orfaos: PENDING (nunca iniciados) ou RUNNING parados ha mais de N minutos
      // (worker morto no meio -- o worker so retoma jobs PENDING, nunca um RUNNING).
      const staleBefore = new Date(Date.now() - args.staleRunningMinutes * 60000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
      const [orphanJobs] = await conn.execute(
        `SELECT id, status, started_at FROM repasse_email_jobs
         WHERE batch_id = ?
           AND (status = 'PENDING' OR (status = 'RUNNING' AND (started_at IS NULL OR started_at < ?)))`,
        [batch.id, staleBefore]
      );

      console.log(
        `\nLote ${batch.id} | ${batch.period_ref} | NF ${batch.due_date_nf} | ${batch.status} | ` +
          `${queued.length} destinatario(s) em QUEUED | ${orphanJobs.length} job(s) orfao(s) (PENDING ou RUNNING parado > ${args.staleRunningMinutes}min)`
      );
      for (const j of orphanJobs) console.log(`   job orfao: ${j.id} status=${j.status} started=${j.started_at || '-'}`);
      for (const r of queued.slice(0, 5)) {
        console.log(`   - ${r.professional_name} <${r.recipient_email}> (last_event=${r.last_event_type || '-'})`);
      }
      if (queued.length > 5) console.log(`   ... e mais ${queued.length - 5}`);

      if (!queued.length) continue;

      if (!args.apply) {
        console.log('   [dry-run] Nada alterado. Use --apply para executar.');
        totalReset += queued.length;
        continue;
      }

      // 2) Neutraliza jobs orfaos: PENDING sempre; RUNNING apenas se parado ha > N min.
      const staleBeforeApply = new Date(Date.now() - args.staleRunningMinutes * 60000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
      const [cancelled] = await conn.execute(
        `UPDATE repasse_email_jobs
         SET status = 'FAILED',
             error = 'Cancelado manualmente ao destravar destinatarios presos em QUEUED.',
             finished_at = ?, updated_at = ?
         WHERE batch_id = ?
           AND (status = 'PENDING' OR (status = 'RUNNING' AND (started_at IS NULL OR started_at < ?)))`,
        [now, now, batch.id, staleBeforeApply]
      );
      totalJobsCancelled += cancelled.affectedRows || 0;

      // 3) Reseta QUEUED -> FAILED (reabilita Reenviar / Enviar selecionados)
      const [updated] = await conn.execute(
        `UPDATE repasse_email_recipients
         SET send_status = 'FAILED', updated_at = ?
         WHERE batch_id = ? AND send_status = 'QUEUED'`,
        [now, batch.id]
      );
      totalReset += updated.affectedRows || 0;

      // 4) Recalcula contadores do lote
      await recomputeBatchCounters(conn, batch.id, now);
      console.log(
        `   [aplicado] ${updated.affectedRows} destinatario(s) QUEUED -> FAILED, ` +
          `${cancelled.affectedRows} job(s) orfao(s) cancelado(s), contadores recalculados.`
      );
    }

    console.log(
      `\nResumo: ${totalReset} destinatario(s) ${args.apply ? 'resetado(s)' : 'a resetar (dry-run)'}, ` +
        `${totalJobsCancelled} job(s) orfao(s) cancelado(s).`
    );
    if (!args.apply) console.log('Reexecute com --apply para efetivar.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Falha:', err && err.message ? err.message : err);
  process.exit(1);
});
