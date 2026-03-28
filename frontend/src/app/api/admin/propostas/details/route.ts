import { NextResponse } from 'next/server';
import { listProposalDetails, normalizeProposalDetailFilters, normalizeProposalFilters } from '@/lib/proposals/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseFilters = normalizeProposalFilters(searchParams);
    const filters = normalizeProposalDetailFilters(searchParams, baseFilters);
    const details = await listProposalDetails(filters);

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
