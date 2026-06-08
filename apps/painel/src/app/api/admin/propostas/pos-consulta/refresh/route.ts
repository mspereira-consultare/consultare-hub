import { NextResponse } from 'next/server';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function POST() {
  try {
    const auth = await requirePropostasPosConsultaPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await auth.db.execute(`
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES ('comercial', 'PENDING', datetime('now'), 'Solicitado via painel de pós-consulta')
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'PENDING',
        details = 'Solicitado via painel de pós-consulta',
        last_run = datetime('now')
    `);

    return NextResponse.json({ status: 'success', message: 'Atualização solicitada.' });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta refresh:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao solicitar atualização do pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
