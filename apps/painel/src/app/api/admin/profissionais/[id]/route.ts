import { NextResponse } from 'next/server';
import {
  deleteProfessional,
  getProfessionalById,
  ProfessionalValidationError,
  updateProfessional,
} from '@/lib/profissionais/repository';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';

export const dynamic = 'force-dynamic';

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
    const professional = await getProfessionalById(auth.db, String(id || ''));

    if (!professional) {
      return NextResponse.json({ error: 'Profissional nao encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data: professional });
  } catch (error: any) {
    console.error('Erro ao buscar profissional:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar profissional.' },
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
    const body = await request.json();
    const updated = await updateProfessional(auth.db, String(id || ''), body, auth.userId);

    return NextResponse.json({ status: 'success', data: updated });
  } catch (error: any) {
    console.error('Erro ao atualizar profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar profissional.' },
      { status }
    );
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const deleted = await deleteProfessional(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success', data: deleted });
  } catch (error: any) {
    console.error('Erro ao excluir profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir profissional.' },
      { status }
    );
  }
}
