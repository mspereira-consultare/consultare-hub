import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import {
  getEmployeePortalOverview,
  listEmployeePortalProductionEntries,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const employeeId = String(id || '').trim();
    const [overview, entries] = await Promise.all([
      getEmployeePortalOverview(auth.db, employeeId),
      listEmployeePortalProductionEntries(auth.db, employeeId, { limit: 200 }),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        employeeId,
        employeeName: overview.employee.fullName,
        production: overview.production,
        entries,
      },
    });
  } catch (error: any) {
    console.error('Erro ao carregar lançamentos de produção do colaborador:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar lançamentos.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
