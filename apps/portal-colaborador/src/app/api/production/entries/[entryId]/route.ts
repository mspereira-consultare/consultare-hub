import { NextResponse } from 'next/server';
import { getDbConnection } from '@consultare/core/db';
import { requireEmployeePortalSession } from '@consultare/core/employee-portal/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  deletePortalProductionEntry,
  updatePortalProductionEntry,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ entryId: string }>;
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const body = await request.json();
    const { entryId } = await context.params;
    const data = await updatePortalProductionEntry(db, session.employeeId, String(entryId || ''), body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar lançamento de produção no portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao atualizar lançamento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}

export async function DELETE(request: Request, context: ParamsContext) {
  try {
    const db = getDbConnection();
    const session = await requireEmployeePortalSession(db, request);
    const { entryId } = await context.params;
    const data = await deletePortalProductionEntry(db, session.employeeId, String(entryId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao excluir lançamento de produção no portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao excluir lançamento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
