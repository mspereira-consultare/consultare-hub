import { NextResponse } from 'next/server';
import {
  getIntranetSpecialtyPage,
  saveIntranetSpecialtyPage,
} from '@consultare/core/intranet/catalog';
import { requireIntranetPermission } from '@/lib/intranet/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ slug: string }>;
};

const errorResponse = (error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { slug } = await context.params;
    const data = await getIntranetSpecialtyPage(auth.db, slug);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao buscar página de especialidade:', error);
    return errorResponse(error, 'Erro interno ao buscar página de especialidade.');
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { slug } = await context.params;
    const body = await request.json();
    const data = await saveIntranetSpecialtyPage(auth.db, { ...body, specialtySlug: slug }, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao salvar página de especialidade:', error);
    return errorResponse(error, 'Erro interno ao salvar página de especialidade.');
  }
}
