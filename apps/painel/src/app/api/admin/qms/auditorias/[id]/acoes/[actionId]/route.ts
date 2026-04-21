import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import { QmsValidationError, updateQmsAuditAction } from '@/lib/qms/audits_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string; actionId: string }>;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const { id, actionId } = await context.params;
    const data = await updateQmsAuditAction(
      auth.db,
      String(id || ''),
      String(actionId || ''),
      body,
      auth.userId
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar acao corretiva:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar acao corretiva.' },
      { status }
    );
  }
}
