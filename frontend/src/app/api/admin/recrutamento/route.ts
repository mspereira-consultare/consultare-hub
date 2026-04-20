import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { listRecruitmentDashboard } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireRecrutamentoPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const data = await listRecruitmentDashboard(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao carregar recrutamento:', error);
    return NextResponse.json({ error: details?.message || 'Erro interno ao carregar recrutamento.' }, { status: Number(details?.status) || 500 });
  }
}
