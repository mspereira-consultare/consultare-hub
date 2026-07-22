import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { applyPointOverrideBulk } from '@/lib/point/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requirePayrollPermission('edit', 'ponto');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const data = await applyPointOverrideBulk(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao aplicar overrides em lote no ponto:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao aplicar overrides em lote.' }, { status: Number(error?.status) || 500 });
  }
}
