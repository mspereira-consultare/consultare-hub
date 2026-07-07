import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { getPointOptions } from '@/lib/point/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requirePayrollPermission('view', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await getPointOptions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar opções de ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar opções.' }, { status: Number(error?.status) || 500 });
  }
}
