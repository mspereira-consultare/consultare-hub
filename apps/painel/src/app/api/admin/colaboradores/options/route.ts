import { NextResponse } from 'next/server';
import { createEmployeeCatalogOption, getEmployeesOptions } from '@/lib/colaboradores/repository';
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

export async function POST(request: Request) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || '').trim();
    const value = String(body?.value || '').trim();

    if (type !== 'department' && type !== 'jobTitle') {
      return NextResponse.json({ error: 'Tipo inválido. Use department ou jobTitle.' }, { status: 400 });
    }

    const savedValue = await createEmployeeCatalogOption(auth.db, type, value);
    const options = await getEmployeesOptions(auth.db);

    return NextResponse.json({
      status: 'success',
      data: {
        type,
        value: savedValue,
        options,
      },
    });
  } catch (error: any) {
    console.error('Erro ao cadastrar opção de colaboradores:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao cadastrar opção.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
