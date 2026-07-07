import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePointDateRange } from '@/lib/point/filters';
import { getPointOverview } from '@/lib/point/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await getPointOverview(auth.db, parsePointDateRange(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar overview de ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar overview de ponto.' }, { status: Number(error?.status) || 500 });
  }
}
