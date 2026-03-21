import { NextResponse } from 'next/server';
import {
  EmployeeValidationError,
  listEmployeeRecessPeriods,
  saveEmployeeRecessPeriod,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await listEmployeeRecessPeriods(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar recessos:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar recessos.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await saveEmployeeRecessPeriod(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar recesso:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar recesso.' }, { status });
  }
}
