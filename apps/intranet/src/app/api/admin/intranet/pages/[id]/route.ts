import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { archivePage, getPageById, IntranetValidationError, updatePage } from '@/lib/intranet/repository';

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
    const auth = await requireIntranetPermission('intranet_paginas', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const data = await getPageById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Pagina nao encontrada.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao buscar pagina da intranet:', error);
    return errorResponse(error, 'Erro interno ao buscar pagina.');
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_paginas', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const body = await request.json();
    const data = await updatePage(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar pagina da intranet:', error);
    return errorResponse(error, 'Erro interno ao atualizar pagina.');
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_paginas', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const data = await archivePage(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao arquivar pagina da intranet:', error);
    return errorResponse(error, 'Erro interno ao arquivar pagina.');
  }
}
