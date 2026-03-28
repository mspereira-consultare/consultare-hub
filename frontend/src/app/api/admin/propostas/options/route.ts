import { NextResponse } from 'next/server';
import { requirePropostasPermission } from '@/lib/proposals/auth';
import { listProposalFilterOptions, normalizeProposalFilters } from '@/lib/proposals/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const filters = normalizeProposalFilters(searchParams);
    const options = await listProposalFilterOptions(filters, auth.db);
    const statusResult = await auth.db.query(`
      SELECT status, last_run, details
      FROM system_status
      WHERE service_name = 'comercial'
    `);
    const heartbeat = statusResult[0] || { status: 'UNKNOWN', last_run: null, details: '' };

    return NextResponse.json({
      status: 'success',
      data: {
        ...options,
        heartbeat,
        canRefresh: Boolean(auth.permissions?.propostas?.refresh || auth.permissions?.propostas_gerencial?.refresh),
      },
    });
  } catch (error: any) {
    console.error('Erro API Propostas opções:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar filtros de propostas.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
