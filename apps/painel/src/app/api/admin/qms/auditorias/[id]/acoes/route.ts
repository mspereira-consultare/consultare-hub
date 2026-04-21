import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  createQmsAuditAction,
  getQmsAuditById,
  QmsValidationError,
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
    const detail = await getQmsAuditById(auth.db, String(id || ''));
    if (!detail) {
      return NextResponse.json({ error: 'Auditoria nao encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data: detail.actions });
  } catch (error: any) {
    console.error('Erro ao listar acoes da auditoria:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar acoes da auditoria.' },
      { status }
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const { id } = await context.params;
    const data = await createQmsAuditAction(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar acao corretiva:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar acao corretiva.' },
      { status }
    );
  }
}
