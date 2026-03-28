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

    return NextResponse.json({
      status: 'success',
      data: options,
    });
  } catch (error: any) {
    console.error('Erro API Propostas opções:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar filtros de propostas.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
