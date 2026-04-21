import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { getPayrollOptions } from '@/lib/payroll/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await getPayrollOptions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar opções da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar opções.' }, { status: Number(error?.status) || 500 });
  }
}
