import { NextResponse } from 'next/server';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type CertidaoStatus,
} from '@/lib/profissionais/constants';
import {
  createProfessional,
  listProfessionals,
  ProfessionalValidationError,
} from '@/lib/profissionais/repository';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';

export const dynamic = 'force-dynamic';

const parsePositiveInt = (value: string | null, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
};

export async function GET(request: Request) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
    );
    const search = String(searchParams.get('search') || '').trim();
    const statusRaw = String(searchParams.get('status') || 'all').trim().toLowerCase();
    const certRaw = String(searchParams.get('certidaoStatus') || 'all').trim().toUpperCase();

    const status =
      statusRaw === 'active' || statusRaw === 'inactive' || statusRaw === 'pending'
        ? statusRaw
        : 'all';

    const certidaoStatus: 'all' | CertidaoStatus =
      certRaw === 'OK' || certRaw === 'VENCENDO' || certRaw === 'VENCIDA' || certRaw === 'PENDENTE'
        ? (certRaw as CertidaoStatus)
        : 'all';

    const result = await listProfessionals(auth.db, {
      search,
      status,
      certidaoStatus,
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
    console.error('Erro ao listar profissionais:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar profissionais.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const created = await createProfessional(auth.db, body, auth.userId);

    return NextResponse.json({
      status: 'success',
      data: created,
    });
  } catch (error: any) {
    console.error('Erro ao criar profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar profissional.' },
      { status }
    );
  }
}

