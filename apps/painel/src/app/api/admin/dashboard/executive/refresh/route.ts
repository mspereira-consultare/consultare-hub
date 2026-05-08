import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requireDashboardPermission } from '@/lib/dashboard_executive/auth';
import { createExecutiveSnapshot } from '@/lib/dashboard_executive/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVICE_NAME = 'dashboard_executive';

export async function POST() {
  try {
    const auth = await requireDashboardPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await auth.db.execute(
      `
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES (?, 'RUNNING', datetime('now'), 'Gerando snapshot executivo')
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'RUNNING',
        details = 'Gerando snapshot executivo',
        last_run = datetime('now')
      `,
      [SERVICE_NAME]
    );

    const snapshot = await createExecutiveSnapshot(auth.db, auth.userId, auth.userId);

    await auth.db.execute(
      `
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES (?, 'COMPLETED', datetime('now'), 'Snapshot executivo atualizado')
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'COMPLETED',
        details = 'Snapshot executivo atualizado',
        last_run = datetime('now')
      `,
      [SERVICE_NAME]
    );

    invalidateCache('admin:');
    return NextResponse.json({ status: 'success', data: snapshot });
  } catch (error: any) {
    console.error('Erro ao atualizar dashboard executivo:', error);
    try {
      const auth = await requireDashboardPermission('refresh');
      if (auth.ok) {
        await auth.db.execute(
          `
          INSERT INTO system_status (service_name, status, last_run, details)
          VALUES (?, 'ERROR', datetime('now'), ?)
          ON CONFLICT(service_name) DO UPDATE SET
            status = 'ERROR',
            details = excluded.details,
            last_run = excluded.last_run
          `,
          [SERVICE_NAME, error?.message || 'Falha ao gerar snapshot executivo']
        );
      }
    } catch {}

    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar dashboard executivo.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
