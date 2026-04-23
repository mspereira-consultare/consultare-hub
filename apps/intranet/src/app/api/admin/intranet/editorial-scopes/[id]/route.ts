import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { deleteEditorialScope, IntranetValidationError, updateEditorialScope } from '@/lib/intranet/repository';

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
    const auth = await requireIntranetPermission('intranet_escopos', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await updateEditorialScope(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar escopo editorial:', error);
    return errorResponse(error, 'Erro interno ao atualizar escopo editorial.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_escopos', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await deleteEditorialScope(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao excluir escopo editorial:', error);
    return errorResponse(error, 'Erro interno ao excluir escopo editorial.');
  }
}
