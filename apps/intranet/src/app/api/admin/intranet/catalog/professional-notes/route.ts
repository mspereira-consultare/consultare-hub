import { NextResponse } from 'next/server';
import {
  listIntranetProfessionalNotes,
  saveIntranetProfessionalNote,
} from '@consultare/core/intranet/catalog';
import { buildCatalogEditorialRefs, requireEditorialScope, requireIntranetPermission } from '@/lib/intranet/auth';

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
    const data = await listIntranetProfessionalNotes(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar observações de profissionais:', error);
    return errorResponse(error, 'Erro interno ao listar observações de profissionais.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_catalogo', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const scope = await requireEditorialScope(
      auth,
      'catalog',
      buildCatalogEditorialRefs({ professionalId: body?.professionalId || body?.professional_id })
    );
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const data = await saveIntranetProfessionalNote(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao salvar observação de profissional:', error);
    return errorResponse(error, 'Erro interno ao salvar observação de profissional.');
  }
}
