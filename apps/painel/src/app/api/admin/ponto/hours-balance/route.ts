import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters, parsePayrollPointDateRange } from '@/lib/payroll/filters';
import { listPayrollHoursBalanceRowsByDateRange } from '@/lib/payroll/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listPayrollHoursBalanceRowsByDateRange(
      auth.db,
      parsePayrollPointDateRange(searchParams),
      parsePayrollLineFilters(searchParams),
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar banco de horas por data:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar banco de horas.' }, { status: Number(error?.status) || 500 });
  }
}
