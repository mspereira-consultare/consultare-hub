import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { getSurveillanceSummary, normalizeSummaryFilters } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const filters = normalizeSummaryFilters(searchParams);
    const data = await getSurveillanceSummary(auth.db, filters);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar resumo de Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno.' }, { status: Number(error?.status) || 500 });
  }
}
