import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { deleteNavigationNode, IntranetValidationError, updateNavigationNode } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_navegacao', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await updateNavigationNode(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar navegacao da intranet:', error);
    return errorResponse(error, 'Erro interno ao atualizar navegacao.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_navegacao', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deleteNavigationNode(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao excluir navegacao da intranet:', error);
    return errorResponse(error, 'Erro interno ao excluir navegacao.');
  }
}
