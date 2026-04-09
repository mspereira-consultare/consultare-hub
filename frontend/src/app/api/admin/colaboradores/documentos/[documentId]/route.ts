import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import { deactivateEmployeeDocument } from '@/lib/colaboradores/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { documentId } = await context.params;
    const data = await deactivateEmployeeDocument(auth.db, String(documentId || ''), auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao desativar documento do colaborador:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao desativar documento.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
