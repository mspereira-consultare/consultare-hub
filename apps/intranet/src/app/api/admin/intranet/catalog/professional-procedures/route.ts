import { NextResponse } from 'next/server';
import {
  listIntranetProfessionalProcedures,
  saveIntranetProfessionalProcedure,
} from '@consultare/core/intranet/catalog';
import { requireIntranetPermission } from '@/lib/intranet/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorResponse = (error: unknown, fallback: string) => {
  const status = Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listIntranetProfessionalProcedures(auth.db, String(searchParams.get('professionalId') || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar vínculos de catálogo da intranet:', error);
    return errorResponse(error, 'Erro interno ao listar vínculos de catálogo.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await saveIntranetProfessionalProcedure(auth.db, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao salvar vínculo de catálogo da intranet:', error);
    return errorResponse(error, 'Erro interno ao salvar vínculo de catálogo.');
  }
}
