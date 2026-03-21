import { NextResponse } from 'next/server';
import { getEmployeesOptions } from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getEmployeesOptions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar opções de colaboradores:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar opções.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
