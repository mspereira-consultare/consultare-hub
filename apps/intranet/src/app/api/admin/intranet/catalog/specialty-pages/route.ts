import { NextResponse } from 'next/server';
import { listIntranetSpecialtyPages } from '@consultare/core/intranet/catalog';
import { requireIntranetPermission } from '@/lib/intranet/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorResponse = (error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET() {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listIntranetSpecialtyPages(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar páginas de especialidades:', error);
    return errorResponse(error, 'Erro interno ao listar páginas de especialidades.');
  }
}
