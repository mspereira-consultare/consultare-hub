import { NextResponse } from 'next/server';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';
import type { DbInterface } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const ACTIVE_STATUSES = new Set(['RUNNING', 'QUEUED', 'PENDING']);
const RERUN_ALIAS_BY_SERVICE: Record<string, string> = {
  faturamento: 'worker_faturamento_scraping',
  comercial: 'propostas',
};

const requestStatusRow = async (db: DbInterface, serviceName: string, details: string) => {
  await db.execute(
    `
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES (?, 'PENDING', datetime('now'), ?)
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'PENDING',
        details = excluded.details,
        last_run = excluded.last_run
    `,
    [serviceName, details],
  );
};

const requestServiceRefresh = async (db: DbInterface, serviceName: string, details: string) => {
  const currentRows = await db.query(
    `
      SELECT status
      FROM system_status
      WHERE service_name = ?
      LIMIT 1
    `,
    [serviceName],
  );

  const currentStatus = String((currentRows[0] as { status?: unknown } | undefined)?.status || '')
    .trim()
    .toUpperCase();

  if (ACTIVE_STATUSES.has(currentStatus)) {
    const rerunAlias = RERUN_ALIAS_BY_SERVICE[serviceName];
    if (!rerunAlias) {
      return { serviceName, requested: false, active: true, queuedAfterCurrentRun: false };
    }

    const aliasRows = await db.query(
      `
        SELECT status
        FROM system_status
        WHERE service_name = ?
        LIMIT 1
      `,
      [rerunAlias],
    );
    const aliasStatus = String((aliasRows[0] as { status?: unknown } | undefined)?.status || '')
      .trim()
      .toUpperCase();

    if (ACTIVE_STATUSES.has(aliasStatus)) {
      return { serviceName, requested: false, active: true, queuedAfterCurrentRun: true };
    }

    await requestStatusRow(db, rerunAlias, `${details} | nova rodada após ciclo em andamento`);
    return { serviceName, requested: false, active: true, queuedAfterCurrentRun: true };
  }

  await requestStatusRow(db, serviceName, details);

  return { serviceName, requested: true, active: false, queuedAfterCurrentRun: false };
};

export async function POST() {
  try {
    const auth = await requirePropostasPosConsultaPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const details = 'Solicitado via painel de pós-consulta';
    const runInTransaction = auth.db.withTransaction
      ? auth.db.withTransaction.bind(auth.db)
      : async <T>(work: (db: DbInterface) => Promise<T>) => work(auth.db);

    const refreshResults = await runInTransaction(async (db) => {
      const results = [];
      results.push(await requestServiceRefresh(db, 'faturamento', details));
      results.push(await requestServiceRefresh(db, 'comercial', details));
      return results;
    });

    const requestedServices = refreshResults.filter((item) => item.requested).map((item) => item.serviceName);
    const activeServices = refreshResults.filter((item) => item.active).map((item) => item.serviceName);
    const queuedAfterCurrentRunServices = refreshResults.filter((item) => item.queuedAfterCurrentRun).map((item) => item.serviceName);

    const messageParts: string[] = [];
    if (requestedServices.length > 0) {
      messageParts.push(`Atualização solicitada para: ${requestedServices.join(', ')}.`);
    }
    if (activeServices.length > 0) {
      messageParts.push(`Já estavam em processamento: ${activeServices.join(', ')}.`);
    }
    if (queuedAfterCurrentRunServices.length > 0) {
      messageParts.push(`Nova rodada agendada após o ciclo atual para: ${queuedAfterCurrentRunServices.join(', ')}.`);
    }

    return NextResponse.json({
      status: 'success',
      message: messageParts.join(' ') || 'Atualização já estava em processamento.',
    });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta refresh:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao solicitar atualização do pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
