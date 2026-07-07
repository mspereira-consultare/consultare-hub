import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePointDateRange, parsePointFilters } from '@/lib/point/filters';
import { listPointDailyControlRowsByDateRange } from '@/lib/point/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listPointDailyControlRowsByDateRange(
      auth.db,
      parsePointDateRange(searchParams),
      parsePointFilters(searchParams),
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar controle diário por data:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar controle diário.' }, { status: Number(error?.status) || 500 });
  }
}
