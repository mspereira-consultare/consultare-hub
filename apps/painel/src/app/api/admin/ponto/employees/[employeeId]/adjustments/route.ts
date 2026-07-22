import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePointDateRange } from '@/lib/point/filters';
import { getPointEmployeeAdjustmentDetail } from '@/lib/point/repository';

type ParamsContext = { params: Promise<{ employeeId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { employeeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await getPointEmployeeAdjustmentDetail(auth.db, {
      employeeId: String(employeeId || ''),
      dateRange: parsePointDateRange(searchParams),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar detalhe de ajustes do ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar ajustes do ponto.' }, { status: Number(error?.status) || 500 });
  }
}
