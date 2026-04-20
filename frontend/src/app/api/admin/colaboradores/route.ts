import { NextResponse } from 'next/server';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/colaboradores/repository';
import {
  createEmployee,
  listEmployees,
  EmployeeValidationError,
} from '@/lib/colaboradores/repository';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';

export const dynamic = 'force-dynamic';

const parsePositiveInt = (value: string | null, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
};

export async function GET(request: Request) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE));

    const result = await listEmployees(auth.db, {
      search: String(searchParams.get('search') || '').trim(),
      status: (String(searchParams.get('status') || 'ATIVO').trim().toUpperCase() as any) === 'PRE_ADMISSAO'
        ? 'PRE_ADMISSAO'
        : (String(searchParams.get('status') || 'ATIVO').trim().toUpperCase() as any) === 'ATIVO'
        ? 'ATIVO'
        : (String(searchParams.get('status') || 'ATIVO').trim().toUpperCase() as any) === 'DESLIGADO'
          ? 'DESLIGADO'
          : 'all',
      regime: (String(searchParams.get('regime') || 'all').trim().toUpperCase() as any) === 'CLT'
        ? 'CLT'
        : (String(searchParams.get('regime') || 'all').trim().toUpperCase() as any) === 'PJ'
          ? 'PJ'
          : (String(searchParams.get('regime') || 'all').trim().toUpperCase() as any) === 'ESTAGIO'
            ? 'ESTAGIO'
            : 'all',
      unit: String(searchParams.get('unit') || 'all').trim(),
      asoStatus: ['PENDENTE', 'OK', 'VENCENDO', 'VENCIDO'].includes(String(searchParams.get('asoStatus') || '').trim().toUpperCase())
        ? (String(searchParams.get('asoStatus')).trim().toUpperCase() as any)
        : 'all',
      pendencyStatus: ['pending', 'complete'].includes(String(searchParams.get('pendencyStatus') || '').trim().toLowerCase())
        ? (String(searchParams.get('pendencyStatus')).trim().toLowerCase() as any)
        : 'all',
      page,
      pageSize,
    });

    return NextResponse.json({
      status: 'success',
      data: result.items,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      },
    });
  } catch (error: any) {
    console.error('Erro ao listar colaboradores:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar colaboradores.' }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const created = await createEmployee(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data: created });
  } catch (error: any) {
    console.error('Erro ao criar colaborador:', error);
    const status = error instanceof EmployeeValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar colaborador.' }, { status });
  }
}
