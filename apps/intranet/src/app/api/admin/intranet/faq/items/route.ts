import { NextResponse } from 'next/server';
import { buildFaqEditorialRefs, requireEditorialScope, requireIntranetPermission } from '@/lib/intranet/auth';
import { createFaqItem, IntranetValidationError, listFaqItems } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listFaqItems(auth.db, {
      categoryId: String(searchParams.get('categoryId') || ''),
      active: String(searchParams.get('active') || ''),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar itens de FAQ:', error);
    return errorResponse(error, 'Erro interno ao listar itens de FAQ.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const scope = await requireEditorialScope(auth, 'faq', buildFaqEditorialRefs(body?.categoryId));
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await createFaqItem(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar item de FAQ:', error);
    return errorResponse(error, 'Erro interno ao criar item de FAQ.');
  }
}
