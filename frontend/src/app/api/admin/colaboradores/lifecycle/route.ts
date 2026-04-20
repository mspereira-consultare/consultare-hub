import { NextResponse } from 'next/server';
import {
  EmployeeValidationError,
  createEmployeeLifecycleCase,
  listEmployeeLifecycleCases,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await listEmployeeLifecycleCases(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar processos de colaboradores:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar processos.' }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data = await createEmployeeLifecycleCase(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar processo de colaborador:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar processo.' }, { status });
  }
}
