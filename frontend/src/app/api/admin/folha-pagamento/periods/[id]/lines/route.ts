import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { listPayrollLines } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listPayrollLines(auth.db, String(id || ''), parsePayrollLineFilters(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar linhas da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar linhas.' }, { status: Number(error?.status) || 500 });
  }
}
