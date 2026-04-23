import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { createNewsPost, IntranetValidationError, listNewsPosts } from '@/lib/intranet/repository';

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
    const auth = await requireIntranetPermission('intranet_noticias', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listNewsPosts(auth.db, {
      status: String(searchParams.get('status') || 'all'),
      postType: String(searchParams.get('postType') || 'all'),
      search: String(searchParams.get('search') || ''),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar noticias da intranet:', error);
    return errorResponse(error, 'Erro interno ao listar noticias.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_noticias', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createNewsPost(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar noticia da intranet:', error);
    return errorResponse(error, 'Erro interno ao criar noticia.');
  }
}
