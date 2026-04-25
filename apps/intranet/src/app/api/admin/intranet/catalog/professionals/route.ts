import { NextResponse } from 'next/server';
import {
  listIntranetProfessionalProfiles,
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
    const data = await listIntranetProfessionalProfiles(auth.db, {
      search: String(searchParams.get('search') || ''),
      limit: Number(searchParams.get('limit') || 80),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar profissionais da intranet:', error);
    return errorResponse(error, 'Erro interno ao listar profissionais.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await request.json().catch(() => null);
    return NextResponse.json({ error: 'Dados cadastrais de profissionais devem ser alterados no painel.' }, { status: 405 });
  } catch (error: unknown) {
    console.error('Erro ao bloquear edição de profissional na intranet:', error);
    return errorResponse(error, 'Erro interno ao processar profissional.');
  }
}
