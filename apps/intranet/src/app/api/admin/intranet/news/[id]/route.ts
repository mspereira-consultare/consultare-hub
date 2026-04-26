import { NextResponse } from 'next/server';
import { buildNewsEditorialRefs, requireEditorialScope, requireIntranetPermission } from '@/lib/intranet/auth';
import { archiveNewsPost, getNewsPostById, IntranetValidationError, updateNewsPost } from '@/lib/intranet/repository';

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
    const auth = await requireIntranetPermission('intranet_noticias', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getNewsPostById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Noticia/aviso nao encontrado.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao buscar noticia da intranet:', error);
    return errorResponse(error, 'Erro interno ao buscar noticia.');
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_noticias', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const current = await getNewsPostById(auth.db, String(id || ''));
    const scope = await requireEditorialScope(
      auth,
      'news',
      buildNewsEditorialRefs(
        { category: current?.category, postType: current?.postType },
        { category: body?.category, postType: body?.postType }
      )
    );
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await updateNewsPost(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar noticia da intranet:', error);
    return errorResponse(error, 'Erro interno ao atualizar noticia.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_noticias', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const current = await getNewsPostById(auth.db, String(id || ''));
    const scope = await requireEditorialScope(auth, 'news', buildNewsEditorialRefs({ category: current?.category, postType: current?.postType }));
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await archiveNewsPost(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao arquivar noticia da intranet:', error);
    return errorResponse(error, 'Erro interno ao arquivar noticia.');
  }
}
