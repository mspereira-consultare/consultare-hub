import { NextResponse } from 'next/server';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';
import { listPostConsultDetails, normalizePostConsultFilters } from '@/lib/post_consulta/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasPosConsultaPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const filters = normalizePostConsultFilters(searchParams);
    const details = await listPostConsultDetails(filters, auth.db, auth.userName);

    return NextResponse.json({
      status: 'success',
      data: details,
    });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta detalhes:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao carregar a base de pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
