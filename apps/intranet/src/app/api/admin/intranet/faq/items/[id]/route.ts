import { NextResponse } from 'next/server';
import { buildFaqEditorialRefs, requireEditorialScope, requireIntranetPermission } from '@/lib/intranet/auth';
import { deleteFaqItem, getFaqItemById, IntranetValidationError, updateFaqItem } from '@/lib/intranet/repository';

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

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getFaqItemById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Item de FAQ nao encontrado.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao buscar item de FAQ:', error);
    return errorResponse(error, 'Erro interno ao buscar item de FAQ.');
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const current = await getFaqItemById(auth.db, String(id || ''));
    const scope = await requireEditorialScope(auth, 'faq', buildFaqEditorialRefs(current?.categoryId, body?.categoryId));
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await updateFaqItem(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar item de FAQ:', error);
    return errorResponse(error, 'Erro interno ao atualizar item de FAQ.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const current = await getFaqItemById(auth.db, String(id || ''));
    const scope = await requireEditorialScope(auth, 'faq', buildFaqEditorialRefs(current?.categoryId));
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await deleteFaqItem(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao excluir item de FAQ:', error);
    return errorResponse(error, 'Erro interno ao excluir item de FAQ.');
  }
}
