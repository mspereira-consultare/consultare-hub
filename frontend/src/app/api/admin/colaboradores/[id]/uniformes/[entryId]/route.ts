import { NextResponse } from 'next/server';
import {
  deleteEmployeeUniformItem,
  EmployeeValidationError,
  saveEmployeeUniformItem,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ id: string; entryId: string }>;
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id, entryId } = await context.params;
    const body = await request.json();
    const data = await saveEmployeeUniformItem(auth.db, String(id || ''), body, auth.userId, String(entryId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar uniforme:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar uniforme.' }, { status });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id, entryId } = await context.params;
    const data = await deleteEmployeeUniformItem(auth.db, String(id || ''), String(entryId || ''), auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao excluir uniforme:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir uniforme.' }, { status });
  }
}
