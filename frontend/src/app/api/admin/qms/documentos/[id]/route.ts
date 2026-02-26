import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  deleteQmsDocument,
  getQmsDocumentById,
  QmsValidationError,
  updateQmsDocument,
} from '@/lib/qms/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const data = await getQmsDocumentById(auth.db, String(id || ''));
    if (!data) {
      return NextResponse.json({ error: 'Documento nao encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao buscar documento QMS:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar documento.' },
      { status }
    );
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = await request.json();
    const data = await updateQmsDocument(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar documento QMS:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar documento.' },
      { status }
    );
  }
}

export async function DELETE(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    await deleteQmsDocument(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir documento QMS:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir documento.' },
      { status }
    );
  }
}
