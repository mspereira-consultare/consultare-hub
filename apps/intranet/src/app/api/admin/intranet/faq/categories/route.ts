import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { createFaqCategory, IntranetValidationError, listFaqCategories } from '@/lib/intranet/repository';

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

export async function GET() {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listFaqCategories(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar categorias de FAQ:', error);
    return errorResponse(error, 'Erro interno ao listar categorias de FAQ.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createFaqCategory(auth.db, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar categoria de FAQ:', error);
    return errorResponse(error, 'Erro interno ao criar categoria de FAQ.');
  }
}
