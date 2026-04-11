import { NextResponse } from 'next/server';
import {
  EmployeeValidationError,
  deactivateEmployee,
  getEmployeeById,
  updateEmployee,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

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
    const employee = await getEmployeeById(auth.db, String(id || ''));
    if (!employee) {
      return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data: employee });
  } catch (error: any) {
    console.error('Erro ao buscar colaborador:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao buscar colaborador.' }, { status });
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = await request.json();
    const updated = await updateEmployee(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data: updated });
  } catch (error: any) {
    console.error('Erro ao atualizar colaborador:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar colaborador.' }, { status });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const updated = await deactivateEmployee(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success', data: updated });
  } catch (error: any) {
    console.error('Erro ao inativar colaborador:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao inativar colaborador.' }, { status });
  }
}
