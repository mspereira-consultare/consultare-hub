import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { IntranetValidationError, listFaqCategories, listFaqItems } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_faq', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const [categories, items] = await Promise.all([
      listFaqCategories(auth.db),
      listFaqItems(auth.db, {
        categoryId: String(searchParams.get('categoryId') || ''),
        active: String(searchParams.get('active') || ''),
      }),
    ]);
    return NextResponse.json({ status: 'success', data: { categories, items } });
  } catch (error: unknown) {
    console.error('Erro ao listar FAQ da intranet:', error);
    const status =
      error instanceof IntranetValidationError
        ? error.status
        : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao listar FAQ.';
    return NextResponse.json({ error: message }, { status });
  }
}
