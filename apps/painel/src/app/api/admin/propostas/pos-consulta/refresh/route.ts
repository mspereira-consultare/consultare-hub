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
    return { serviceName, requested: false, active: true };
  }

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

  return { serviceName, requested: true, active: false };
};

export async function POST() {
  try {
    const auth = await requirePropostasPosConsultaPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const details = 'Solicitado via painel de pós-consulta';
    const refreshResults = await Promise.all([
      requestServiceRefresh(auth.db, 'faturamento', details),
      requestServiceRefresh(auth.db, 'comercial', details),
    ]);

    const requestedServices = refreshResults.filter((item) => item.requested).map((item) => item.serviceName);
    const activeServices = refreshResults.filter((item) => item.active).map((item) => item.serviceName);

    const messageParts: string[] = [];
    if (requestedServices.length > 0) {
      messageParts.push(`Atualização solicitada para: ${requestedServices.join(', ')}.`);
    }
    if (activeServices.length > 0) {
      messageParts.push(`Já estavam em processamento: ${activeServices.join(', ')}.`);
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
