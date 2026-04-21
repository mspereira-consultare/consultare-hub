import { NextResponse } from 'next/server';
import { listProposalDetails, normalizeProposalDetailFilters, normalizeProposalFilters } from '@/lib/proposals/repository';
import { requirePropostasPermission } from '@/lib/proposals/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const baseFilters = normalizeProposalFilters(searchParams);
    const filters = normalizeProposalDetailFilters(searchParams, baseFilters);
    const details = await listProposalDetails(filters, auth.db);

    return NextResponse.json({
      status: 'success',
      data: details,
    });
  } catch (error: any) {
    console.error('Erro API Propostas detalhes:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar base detalhada de propostas.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
