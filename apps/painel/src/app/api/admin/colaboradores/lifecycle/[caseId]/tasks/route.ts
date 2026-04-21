import { NextResponse } from 'next/server';
import {
  EmployeeValidationError,
  updateEmployeeLifecycleTask,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ caseId: string }>;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { caseId } = await context.params;
    const body = await request.json();
    const data = await updateEmployeeLifecycleTask(auth.db, String(caseId || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar tarefa do processo:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar tarefa.' }, { status });
  }
}
