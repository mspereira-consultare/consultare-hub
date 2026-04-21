import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  deleteQmsTraining,
  getQmsTrainingById,
  QmsValidationError,
  updateQmsTraining,
} from '@/lib/qms/trainings_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const data = await getQmsTrainingById(auth.db, String(id || ''));
    if (!data) {
      return NextResponse.json({ error: 'Treinamento nao encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao buscar realizacao:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar realizacao.' },
      { status }
    );
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const { id } = await context.params;
    const data = await updateQmsTraining(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar realizacao:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar realizacao.' },
      { status }
    );
  }
}

export async function DELETE(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { id } = await context.params;
    await deleteQmsTraining(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir realizacao:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir realizacao.' },
      { status }
    );
  }
}
