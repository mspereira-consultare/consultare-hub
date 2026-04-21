import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { listPayrollBenefitRows } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listPayrollBenefitRows(auth.db, String(id || ''), parsePayrollLineFilters(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno ao listar benefícios da folha.';
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    console.error('Erro ao listar benefícios da folha:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
