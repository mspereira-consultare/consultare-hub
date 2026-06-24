import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requireDashboardPermission } from '@/lib/dashboard_executive/auth';
import { createExecutiveSnapshot } from '@/lib/dashboard_executive/repository';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SERVICE_NAME = 'dashboard_executive';

export async function POST() {
  try {
    const auth = await requireDashboardPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await upsertSystemStatus(auth.db, {
      serviceName: SERVICE_NAME,
      status: 'RUNNING',
      details: 'Gerando snapshot executivo',
    });

    const snapshot = await createExecutiveSnapshot(auth.db, auth.userId, auth.userId);

    await upsertSystemStatus(auth.db, {
      serviceName: SERVICE_NAME,
      status: 'COMPLETED',
      details: 'Snapshot executivo atualizado',
    });

    invalidateCache('admin:');
    return NextResponse.json({ status: 'success', data: snapshot });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno ao atualizar dashboard executivo.';
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
    console.error('Erro ao atualizar dashboard executivo:', error);
    try {
      const auth = await requireDashboardPermission('refresh');
      if (auth.ok) {
        await upsertSystemStatus(auth.db, {
          serviceName: SERVICE_NAME,
          status: 'ERROR',
          details: message || 'Falha ao gerar snapshot executivo',
        });
      }
    } catch {}

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
