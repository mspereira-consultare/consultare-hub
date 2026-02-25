import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import {
  getProfessionalProcedureRates,
  ProfessionalValidationError,
  replaceProfessionalProcedureRates,
} from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const data = await getProfessionalProcedureRates(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar procedimentos do profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar procedimentos do profissional.' },
      { status }
    );
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const procedures = Array.isArray(body?.procedures) ? body.procedures : [];

    const data = await replaceProfessionalProcedureRates(
      auth.db,
      String(id || ''),
      procedures,
      auth.userId
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao salvar procedimentos do profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar procedimentos do profissional.' },
      { status }
    );
  }
}

