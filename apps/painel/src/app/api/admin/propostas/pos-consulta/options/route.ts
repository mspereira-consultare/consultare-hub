import { NextResponse } from 'next/server';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';
import { listPostConsultOptions, normalizePostConsultFilters } from '@/lib/post_consulta/repository';

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
    const options = await listPostConsultOptions(filters, auth.db);

    return NextResponse.json({
      status: 'success',
      data: {
        ...options,
        canEdit: Boolean(auth.permissions?.propostas_pos_consulta?.edit),
        canRefresh: Boolean(auth.permissions?.propostas_pos_consulta?.refresh),
      },
    });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta opções:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao carregar opções do pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
