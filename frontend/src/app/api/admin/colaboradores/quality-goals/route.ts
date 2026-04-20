import { NextResponse } from 'next/server';
import { getEmployeeQualityGoals } from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import type { EmployeeStatus, EmploymentRegime } from '@/lib/colaboradores/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const data = await getEmployeeQualityGoals(auth.db, {
      status: String(searchParams.get('status') || 'all') as EmployeeStatus | 'all',
      regime: String(searchParams.get('regime') || 'all') as EmploymentRegime | 'all',
      unit: String(searchParams.get('unit') || 'all'),
      department: String(searchParams.get('department') || 'all'),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar qualidade e metas dos colaboradores:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar qualidade e metas.' },
      { status },
    );
  }
}
