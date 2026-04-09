import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { deactivateProfessionalDocument } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { documentId } = await context.params;
    const data = await deactivateProfessionalDocument(auth.db, String(documentId || ''), auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao desativar documento do profissional:', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao desativar documento.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
