import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { approvePayrollPeriodLines } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const payload = await request.json().catch(() => ({} as { lineIds?: string[] }));
    const data = await approvePayrollPeriodLines(auth.db, String(id || ''), Array.isArray(payload?.lineIds) ? payload.lineIds : []);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao aprovar linhas da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao aprovar linhas.' }, { status: Number(error?.status) || 500 });
  }
}
