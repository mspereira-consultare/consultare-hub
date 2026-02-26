import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  deleteQmsAudit,
  getQmsAuditById,
  QmsValidationError,
  updateQmsAudit,
} from '@/lib/qms/audits_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const data = await getQmsAuditById(auth.db, String(id || ''));
    if (!data) {
      return NextResponse.json({ error: 'Auditoria nao encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao buscar auditoria:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar auditoria.' },
      { status }
    );
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const { id } = await context.params;
    const data = await updateQmsAudit(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar auditoria:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar auditoria.' },
      { status }
    );
  }
}

export async function DELETE(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { id } = await context.params;
    await deleteQmsAudit(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir auditoria:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir auditoria.' },
      { status }
    );
  }
}
