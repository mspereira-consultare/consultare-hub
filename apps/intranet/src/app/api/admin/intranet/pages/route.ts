import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { createPage, IntranetValidationError, listPages } from '@/lib/intranet/repository';

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
    const auth = await requireIntranetPermission('intranet_paginas', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const data = await listPages(auth.db, {
      status: String(searchParams.get('status') || 'all'),
      search: String(searchParams.get('search') || ''),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar paginas da intranet:', error);
    return errorResponse(error, 'Erro interno ao listar paginas.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_paginas', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const data = await createPage(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar pagina da intranet:', error);
    return errorResponse(error, 'Erro interno ao criar pagina.');
  }
}
